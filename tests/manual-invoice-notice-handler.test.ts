import { beforeEach, describe, expect, it, vi } from "vitest";
import { createManualInvoiceNoticeHandler, noticeEmail, parseNoticeClaim,
  type ClaimedNotice, type NoticeGateway, type NoticeOutcome } from "../supabase/functions/truckcontrol-manual-invoice-notices/handler";
const now = Date.parse("2026-11-08T12:00:00Z");
const worker = "synthetic-service-authorization-not-a-real-key";
const apiKey = "re_" + "synthetic".repeat(5);
const id = "fb910000-0000-4000-8000-000000000001";
const task = "fb920000-0000-4000-8000-000000000001";
const lease = "fb930000-0000-4000-8000-000000000001";
const providerId = "fb940000-0000-4000-8000-000000000001";
const notice: ClaimedNotice = { id,task_id:task,lease_token:lease,row_version:2,attempt:1,
  first_attempt_at:new Date(now).toISOString(),lease_until:new Date(now+60000).toISOString(),
  mode:"live",template_version:1 };
const claim = () => ({ contract:"manual-invoice-notice-claim-v1",notice:{...notice} });
let gateway: NoticeGateway;
let send: ReturnType<typeof vi.fn>;
function request(body: string="{}", headers: Record<string,string>={}) {
  return new Request("https://example.invalid/notices", { method:"POST",
    headers:{ Authorization:"Bearer "+worker,"Content-Type":"application/json",...headers }, body });
}
function handler() {
  return createManualInvoiceNoticeHandler(gateway,worker,send as unknown as typeof fetch,()=>now);
}
beforeEach(()=>{
  send=vi.fn(async()=>Response.json({id:providerId}));
  gateway={
    config:vi.fn(async()=>({enabled:true,providerEnabled:true,apiKey})),
    claim:vi.fn(async()=>claim()),
    finish:vi.fn(async(n:ClaimedNotice,outcome:NoticeOutcome)=>({
      contract:"manual-invoice-notice-finish-v1",id:n.id,
      status:outcome==="retry_rate"||outcome==="retry_busy"?"retry_wait":outcome,replayed:false,
    })),
  };
});
describe("avisos fiscales: worker cerrado y sin datos de cliente",()=>{
  it("rechaza métodos y navegadores antes de consultar configuración",async()=>{
    expect((await handler()(new Request("https://example.invalid"))).status).toBe(405);
    expect((await handler()(request("{}",{Origin:"https://truckcontrolai.com"}))).status).toBe(403);
    expect(gateway.config).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("requiere exactamente la credencial backend, no un claim administrativo",async()=>{
    const r=await handler()(request("{}",{Authorization:"Bearer fake-admin-jwt"}));
    expect(r.status).toBe(401);expect(gateway.config).not.toHaveBeenCalled();
    const weak=createManualInvoiceNoticeHandler(gateway,"short",send as unknown as typeof fetch,()=>now);
    expect((await weak(request("{}",{Authorization:"Bearer short"}))).status).toBe(401);
  });
  it.each(['{"to":"cliente@example.invalid"}','{"task_id":"other"}','[]','null','x'.repeat(300)])(
    "rechaza parámetros de envío o cuerpo no válido (%s)",async(body)=>{
      expect((await handler()(request(body))).status).toBe(400);
      expect(gateway.config).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
    });
  it("mantiene flag apagado sin reclamar ni llamar Resend",async()=>{
    gateway.config=vi.fn(async()=>({enabled:false,providerEnabled:true,apiKey}));
    expect((await handler()(request())).status).toBe(503);
    expect(gateway.claim).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
  });
  it.each([{enabled:true,providerEnabled:false,apiKey},{enabled:true,providerEnabled:true,apiKey:"pending"}])(
    "requiere proveedor configurado sin crear credenciales",async(config)=>{
      gateway.config=vi.fn(async()=>config);
      expect((await handler()(request())).status).toBe(503);expect(gateway.claim).not.toHaveBeenCalled();
    });
  it("sin tarea no llama al proveedor",async()=>{
    gateway.claim=vi.fn(async()=>null);
    expect(await (await handler()(request())).json()).toEqual({processed:0,provider_calls:0});
    expect(send).not.toHaveBeenCalled();expect(gateway.finish).not.toHaveBeenCalled();
  });
  it.each([{...notice,mode:"test"},{...notice,buyer_tax_id:"NEVER-MAIL-THIS"},
    {...notice,lease_until:new Date(now-1).toISOString()},
    {...notice,first_attempt_at:new Date(now-24*3600000).toISOString()}])(
    "no envía un lease inválido, modo prueba o DTO con PII",async(n)=>{
      gateway.claim=vi.fn(async()=>({contract:"manual-invoice-notice-claim-v1",notice:n}));
      expect((await handler()(request())).status).toBe(503);expect(send).not.toHaveBeenCalled();
    });
  it("aceptación no equivale a entrega y el payload solo contiene referencia interna",async()=>{
    const response=await handler()(request());
    expect(await response.json()).toEqual({processed:1,outcome:"accepted",delivery_verified:false});
    expect(send).toHaveBeenCalledTimes(1);
    const [url,options]=send.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe("https://api.resend.com/emails");expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const headers=options.headers as Record<string,string>;
    expect(headers["Idempotency-Key"]).toBe("truckcontrol-manual-invoice-notice-v1/"+id);
    const mail=JSON.parse(String(options.body));
    expect(mail).toEqual(noticeEmail(notice));expect(mail.to).toEqual(["pedidos@smartscaneuskadi.com"]);
    expect(mail.text).toContain("https://truckcontrolai.com");
    expect(mail.text).toContain("Administración → Facturas del servicio");
    expect(mail.text).toContain(task);
    expect(Object.keys(mail).sort()).toEqual(["from","subject","text","to"]);
    expect(gateway.finish).toHaveBeenCalledWith(notice,"accepted",providerId);
  });
  it.each([[429,"rate_limit_exceeded","retry_rate"],[409,"concurrent_idempotent_requests","retry_busy"]] as const)(
    "solo reintenta un rechazo seguro %s/%s",async(status,name,outcome)=>{
      send=vi.fn(async()=>Response.json({name,message:"raw error must not escape"},{status}));
      expect(await (await handler()(request())).json()).toEqual({processed:1,outcome:"retry_wait",delivery_verified:false});
      expect(gateway.finish).toHaveBeenCalledWith(notice,outcome,null);
    });
  it.each([400,401,403,404,422])("rechazo permanente %s cierra el aviso",async(status)=>{
    send=vi.fn(async()=>Response.json({message:"secret raw provider error"},{status}));
    const response=await handler()(request());expect((await response.text())).not.toContain("secret");
    expect(gateway.finish).toHaveBeenCalledWith(notice,"failed",null);
  });
  it.each([[503,{message:"unknown failure"}],[409,{name:"invalid_idempotent_request"}],
    [429,{name:"unknown_error"}],[200,{id:"not-a-provider-uuid"}]])(
    "respuesta ambigua %s termina incierta sin bucle de reenvío",async(status,data)=>{
      send=vi.fn(async()=>Response.json(data,{status}));
      expect(await (await handler()(request())).json()).toEqual({processed:1,outcome:"uncertain",delivery_verified:false});
      expect(send).toHaveBeenCalledTimes(1);expect(gateway.finish).toHaveBeenCalledWith(notice,"uncertain",null);
    });
  it("timeout o caída de red no provoca un segundo envío",async()=>{
    send=vi.fn(async()=>{throw Error("network included "+apiKey)});
    const r=await handler()(request());expect((await r.text())).not.toContain(apiKey);
    expect(send).toHaveBeenCalledTimes(1);expect(gateway.finish).toHaveBeenCalledWith(notice,"uncertain",null);
  });
  it("no vuelve a enviar si se pierde el ACK después de aceptación",async()=>{
    gateway.finish=vi.fn(async()=>{throw Error("DB credentials must not escape")});
    const r=await handler()(request());expect(r.status).toBe(503);
    expect(await r.json()).toEqual({error:"notice_result_unconfirmed"});
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("rechaza un ACK que inventa aceptación tras incertidumbre",async()=>{
    send=vi.fn(async()=>{throw Error("timeout")});
    gateway.finish=vi.fn(async()=>({contract:"manual-invoice-notice-finish-v1",id,status:"accepted",replayed:false}));
    expect((await handler()(request())).status).toBe(503);
  });
  it("acota la respuesta del proveedor y no devuelve su cuerpo",async()=>{
    send=vi.fn(async()=>new Response("x".repeat(5000),{status:200}));
    expect((await handler()(request())).status).toBe(200);
    expect(gateway.finish).toHaveBeenCalledWith(notice,"uncertain",null);
  });
  it("mantiene idénticos cuerpo y clave de idempotencia entre intentos permitidos",async()=>{
    send=vi.fn().mockResolvedValueOnce(Response.json({name:"rate_limit_exceeded"},{status:429}))
      .mockResolvedValueOnce(Response.json({id:providerId}));
    await handler()(request());
    gateway.claim=vi.fn(async()=>({contract:"manual-invoice-notice-claim-v1",
      notice:{...notice,attempt:2,row_version:4,lease_token:"fb930000-0000-4000-8000-000000000002"}}));
    await handler()(request());
    const one=send.mock.calls[0][1] as RequestInit,two=send.mock.calls[1][1] as RequestInit;
    expect(one.body).toBe(two.body);
    expect((one.headers as Record<string,string>)["Idempotency-Key"])
      .toBe((two.headers as Record<string,string>)["Idempotency-Key"]);
  });
  it("validador no acepta versiones fuera de rango seguro",()=>{
    expect(()=>parseNoticeClaim({contract:"manual-invoice-notice-claim-v1",notice:{...notice,row_version:2**54}},now)).toThrow();
  });
});

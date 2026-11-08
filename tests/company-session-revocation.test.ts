import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite;let sequence=0;
interface Fixture { user:string;org:string;sid:string;truck:string;record:string;n:number }
async function claims<T>(user:string|null,sid:string|null,run:()=>Promise<T>,service=false) {
  await db.exec(service?"set role service_role":"set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??""]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({
    role:service?"service_role":"authenticated",...(user?{sub:user}:{}),...(sid?{session_id:sid}:{}),
  })]);
  try{return await run();}
  finally{
    await db.exec("reset role");
    await db.exec("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)");
  }
}
const payload=(n:number)=>({name:"Cliente ficticio "+n,taxId:"TEST-"+n,
  email:"customer-"+n+"@example.invalid",phone:"",address:"Calle de pruebas 123",notes:""});
async function fixture():Promise<Fixture> {
  const n=++sequence,suffix=String(n).padStart(12,"0");
  const user="ca110000-0000-4000-8000-"+suffix;
  const sid="ca220000-0000-4000-8000-"+suffix;
  const truck="ca330000-0000-4000-8000-"+suffix;
  const record="ca440000-0000-4000-8000-"+suffix;
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)",[
    user,"session-"+n+"@example.invalid",JSON.stringify({truckcontrol_registration:{
      contact_name:"Operador de prueba",company_name:"Empresa aislada "+n,tax_id:"SYNTH-"+n,
      address:"Dirección ficticia 123",phone:"+1202555"+String(2000+n),requested_plan:"full",
    }}),
  ]);
  await db.query("update private.tc_customers set trial_plan_id='full' where user_id=$1",[user]);
  const org=(await db.query<{id:string}>("select id from public.organizations where owner_id=$1",[user])).rows[0].id;
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)",[sid,user]);
  await claims(user,sid,async()=>{
    await db.query(`insert into public.trucks(
      id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on
    ) values($1,$2,$3,'MAN','Synthetic',2025,1000,'available','2027-01-01')`,[truck,org,"AUDIT-"+n]);
    await db.query("select public.tc_save_record($1,$2,'customers',$3::jsonb,null)",[org,record,JSON.stringify(payload(n))]);
    await db.query(`insert into public.finance_entries(
      organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km
    ) values($1,$2,'income','Ingreso ficticio de prueba',current_date,10000,'transport','pending',0)`,[org,truck]);
  });
  return {user,org,sid,truck,record,n};
}
async function rows(f:Fixture,sid:string|null=f.sid) {
  return claims(f.user,sid,async()=>({
    trucks:(await db.query("select id from public.trucks where organization_id=$1",[f.org])).rows.length,
    income:(await db.query("select id from public.finance_entries where organization_id=$1",[f.org])).rows.length,
    organizations:(await db.query("select id from public.organizations where id=$1",[f.org])).rows.length,
  }));
}
async function access(f:Fixture,personal=false) {
  try{
    return await claims(f.user,f.sid,async()=>(
      await db.query<{value:Record<string,unknown>}>(personal?
        "select public.tc_my_access() value":"select public.tc_organization_access($1) value",personal?[]:[f.org])
    ).rows[0].value);
  }catch{return {active:false,profile:null};}
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;
    create role service_role nologin bypassrls;create schema auth;
    create table auth.users(
      id uuid primary key,email text,phone text,email_confirmed_at timestamptz,
      phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,
      raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}'
    );
    create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),
      not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $uid$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $uid$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  for(const file of readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort())
    await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
  await db.exec("update private.tc_settings set enforce_access=true,sms_ready=false where id=true");
},30000);
afterAll(async()=>{await db?.close();});
describe("company JWT session revocation: real-session isolated regression",()=>{
  it("permits fresh owner rows, profile and typed records without weakening tenant isolation",async()=>{
    const a=await fixture(),b=await fixture();
    expect(await rows(a)).toEqual({trucks:1,income:1,organizations:1});
    expect(await access(a)).toMatchObject({active:true,company_role:"owner"});
    const foreign=await claims(a.user,a.sid,()=>db.query("select id from public.trucks where organization_id=$1",[b.org]));
    expect(foreign.rows).toEqual([]);
  });
  it("denies raw organization/truck/income rows after the session is removed",async()=>{
    const f=await fixture();
    await db.query("delete from auth.sessions where id=$1",[f.sid]);
    expect(await rows(f)).toEqual({trucks:0,income:0,organizations:0});
  });
  it("denies a stale JWT record-list RPC after logout",async()=>{
    const f=await fixture();
    await db.query("delete from auth.sessions where id=$1",[f.sid]);
    await expect(claims(f.user,f.sid,()=>db.query("select public.tc_list_records($1,null)",[f.org])))
      .rejects.toThrow();
  });
  it("cannot update an existing truck using the same revoked JWT",async()=>{
    const f=await fixture();
    const fresh=await claims(f.user,f.sid,()=>db.query("update public.trucks set odometer_km=1010 where id=$1 returning id",[f.truck]));
    expect(fresh.rows).toHaveLength(1);
    await db.query("delete from auth.sessions where id=$1",[f.sid]);
    let updated=false;
    try{
      const result=await claims(f.user,f.sid,()=>db.query("update public.trucks set odometer_km=1020 where id=$1 returning id",[f.truck]));
      updated=result.rows.length>0;
    }catch{/* permission denial is acceptable; a committed update is not */}
    expect(updated).toBe(false);
  });
  it("denies typed record creation with a revoked JWT",async()=>{
    const f=await fixture();await db.query("delete from auth.sessions where id=$1",[f.sid]);
    await expect(claims(f.user,f.sid,()=>db.query(
      "select public.tc_save_record($1,$2,'customers',$3::jsonb,null)",
      [f.org,"ca550000-0000-4000-8000-"+String(f.n).padStart(12,"0"),JSON.stringify(payload(f.n+100))],
    ))).rejects.toThrow();
  });
  it("does not expose company or personal profile after logout",async()=>{
    const f=await fixture();await db.query("delete from auth.sessions where id=$1",[f.sid]);
    for(const personal of [false,true]){
      const result=await access(f,personal);
      expect(result.active).not.toBe(true);
      expect(result.profile??null).toBeNull();
    }
  });
  it.each(["banned_until","deleted_at"])("denies rows/profile when the user has %s set",async field=>{
    const f=await fixture();
    if(field==="banned_until")await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[f.user]);
    else await db.query("update auth.users set deleted_at=now() where id=$1",[f.user]);
    expect(await rows(f)).toEqual({trucks:0,income:0,organizations:0});
    expect((await access(f)).active).not.toBe(true);
  });
  it("never accepts a different user's live session id for the JWT subject",async()=>{
    const a=await fixture(),b=await fixture();
    expect(await rows(a,b.sid)).toEqual({trucks:0,income:0,organizations:0});
  });
  it("does not treat an authenticated JWT without session_id as a trusted legacy session",async()=>{
    const f=await fixture();
    expect(await rows(f,null)).toEqual({trucks:0,income:0,organizations:0});
  });
  it("rechecks membership revocation while the user's own session remains live",async()=>{
    const owner=await fixture(),member=await fixture();
    await db.query(`insert into private.tc_memberships(
      organization_id,user_id,role,status,invited_by) values($1,$2,'operator','active',$3)`,
      [owner.org,member.user,owner.user]);
    const query=()=>db.query("select id from public.trucks where organization_id=$1",[owner.org]);
    expect((await claims(member.user,member.sid,query)).rows).toHaveLength(1);
    await db.query("update private.tc_memberships set status='revoked' where organization_id=$1 and user_id=$2",[owner.org,member.user]);
    expect((await claims(member.user,member.sid,query)).rows).toEqual([]);
  });
  it("keeps explicit background access without a human session but denies a banned actor",async()=>{
    const f=await fixture();
    const server=()=>claims(null,null,async()=>(
      await db.query<{value:Record<string,unknown>}>("select public.tc_company_server_access($1,$2) value",[f.user,f.org])
    ).rows[0].value,true);
    expect((await server()).active).toBe(true);
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[f.user]);
    expect((await server()).active).not.toBe(true);
  });
});

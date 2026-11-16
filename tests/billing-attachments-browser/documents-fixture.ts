import type { BrowserContext, Request } from "@playwright/test";
import type { CompanyDocument } from "../../src/integrations/supabase/database.types";
import { exampleCatalog } from "../../src/domain/subscriptions";
import { actor, org, other } from "../mfa-browser/fixture";
import type { NativeAuth } from "./fixture";

export const truckA = "71000000-0000-4000-8000-000000000001";
export const truckB = "71000000-0000-4000-8000-000000000002";
export const driverA = "72000000-0000-4000-8000-000000000001";
export const driverB = "72000000-0000-4000-8000-000000000002";
export const incomeA = "73000000-0000-4000-8000-000000000001";
export const expenseA = "73000000-0000-4000-8000-000000000002";
export const foreignOrg = "74000000-0000-4000-8000-000000000001";
export const originalPdf = (text: string) =>
  Buffer.from(`%PDF-1.7\nDocumento ficticio: ${text}\n%%EOF`);

function claims(request: Request) {
  try {
    return JSON.parse(
      Buffer.from(
        (request.headers().authorization ?? "").split(".")[1],
        "base64url",
      ).toString(),
    ) as { sub?: string; aal?: string; session_id?: string };
  } catch {
    return {};
  }
}

/** Overlay only the new document transport and seeded fleet, never Auth itself. */
export async function documentsFixture(
  context: BrowserContext,
  auth: NativeAuth,
) {
  const day = new Date().toISOString().slice(0, 10);
  const trucks = [truckA, truckB].map((id, i) => ({
    id,
    organization_id: org,
    plate: i ? "DEMO-2002" : "DEMO-1001",
    brand: i ? "MAN" : "Scania",
    model: "Camión ficticio",
    year: 2024,
    odometer_km: 120_000 + i * 1_000,
    status: "available",
    driver_id: null,
    co_driver_id: null,
    inspection_due_on: "2099-12-31",
    route: "",
    row_version: 1,
  }));
  const drivers = [driverA, driverB].map((id, i) => ({
    id,
    organization_id: org,
    name: i ? "Conductor ficticio B" : "Conductor ficticio A",
    email: `ficticio${i}@example.com`,
    phone: "",
    license: "C+E",
    license_expires_on: "2099-12-31",
    status: "active",
    row_version: 1,
  }));
  const entries = [incomeA, expenseA].map((id, i) => ({
    id,
    organization_id: org,
    truck_id: truckA,
    kind: i ? "expense" : "income",
    concept: i ? "Gasto ficticio enlazado" : "Ingreso ficticio enlazado",
    date: day,
    amount_cents: i ? 10_010 : 50_025,
    category: i ? "other" : "transport",
    payment_status: "paid",
    distance_km: i ? 0 : 100,
    document_type: i ? "ticket" : "invoice",
    row_version: 1,
  }));
  const documents: CompanyDocument[] = [];
  const originals = new Map<string, Buffer>();
  const observed: {
    path: string;
    method: string;
    authorization: string | null;
    actor: string | null;
    sid: string | null;
    body: Record<string, unknown> | null;
    upsert: string | null;
  }[] = [];
  const controls = {
    holdUpload: false,
    uploadPending: false,
    releaseUpload: () => {},
    holdDownload: false,
    downloadPending: false,
    releaseDownload: () => {},
    failUploadAt: 0,
    uncertainUploadAt: 0,
    failRegister: false,
    conflictMetadata: false,
    foreignDocumentResponse: false,
    blockedFinance: null as "income" | "expenses" | null,
    holdDocumentPages: false,
    documentPagesHeld: 0,
    releaseDocumentPage: () => {},
    releaseAllDocumentPages: () => {},
  };
  const pendingDocumentPages: (() => void)[] = [];
  controls.releaseDocumentPage = () => pendingDocumentPages.shift()?.();
  controls.releaseAllDocumentPages = () => {
    for (const release of pendingDocumentPages.splice(0)) release();
  };
  const mayRead = (doc: CompanyDocument) => {
    const reference = doc.tracking?.finance_entry_id;
    if (!reference) return true;
    const entry = entries.find((row) => row.id === reference);
    return Boolean(
      entry &&
      (entry.kind === "income" ? "income" : "expenses") !==
        controls.blockedFinance,
    );
  };
  let uploads = 0;
  auth.controls.manualFullEnabled = true;
  await context.route("http://127.0.0.1:9999/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname;
    const handled =
      ["trucks", "drivers", "finance_entries"].some(
        (name) => path === "/rest/v1/" + name,
      ) ||
      [
        "tc_document_page_v2",
        "tc_register_document_v2",
        "tc_update_document_metadata_v2",
      ].some((name) => path === "/rest/v1/rpc/" + name) ||
      (path === "/rest/v1/rpc/tc_organization_access" &&
        controls.blockedFinance !== null) ||
      path.startsWith("/storage/v1/object/");
    if (!handled || request.method() === "OPTIONS") return route.fallback();
    const identity = claims(request);
    let body: Record<string, unknown> | null = null;
    if (path.startsWith("/rest/v1/rpc/"))
      body = request.postDataJSON() as Record<string, unknown>;
    observed.push({
      path,
      method: request.method(),
      authorization: request.headers().authorization ?? null,
      actor: identity.sub ?? null,
      sid: identity.session_id ?? null,
      body,
      upsert: request.headers()["x-upsert"] ?? null,
    });
    const headers = {
      "Access-Control-Allow-Origin": request.headers().origin ?? "*",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info,x-upsert,prefer,range,range-unit",
      "Access-Control-Expose-Headers": "content-range",
      "Content-Type": "application/json",
    };
    const json = (data: unknown, status = 200) =>
      route.fulfill({ headers, status, body: JSON.stringify(data) });
    const enrolled = auth.controls.factors
      .get(identity.sub ?? "")
      ?.some((factor) => factor.status === "verified");
    if (
      ![actor, other].includes(identity.sub ?? "") ||
      auth.controls.manualFullEnabled === false ||
      (enrolled &&
        (identity.aal !== "aal2" ||
          !auth.controls.boundFactor.has(identity.sub!))) ||
      (body?.p_org && body.p_org !== org)
    )
      return json(
        { code: "42501", message: "Synthetic permission denied" },
        403,
      );
    if (path === "/rest/v1/rpc/tc_organization_access") {
      const now = new Date().toISOString();
      return json({
        is_admin: false,
        active: true,
        features: {
          ...exampleCatalog.plans.find((plan) => plan.id === "full")!.modules,
          [controls.blockedFinance!]: false,
        },
        profile: {
          user_id: identity.sub,
          email: auth.user(identity.sub!).email,
          contact_name: "Persona ficticia",
          company_name: "Empresa MFA ficticia",
          tax_id: "DEMO-MFA",
          address: "Calle ficticia 1",
          phone: "+34600000001",
          requested_plan: "limited",
          trial_plan_id: "limited",
          paid_plan: null,
          status: "trial",
          trial_started_at: now,
          trial_ends_at: new Date(Date.now() + 864000000).toISOString(),
          paid_until: null,
          ai_allowed: false,
          ai_opt_in: false,
          module_overrides: {},
          created_at: now,
          updated_at: now,
        },
        plan: "full",
        max_trucks: 50,
        organization_id: org,
        user_id: identity.sub,
        company_role: "owner",
        can_write: true,
        can_manage: true,
        requires_phone_verification: false,
        sms_ready: false,
        prices_are_examples: true,
        payments_enabled: false,
        manual_full: {
          schema_version: 1,
          configured: true,
          enabled: true,
          status: "active",
          expires_at: null,
          revision: 1,
          updated_at: now,
        },
        observed_at: now,
      });
    }
    if (request.method() === "GET" && path === "/rest/v1/trucks")
      return json(trucks);
    if (request.method() === "GET" && path === "/rest/v1/drivers")
      return json(drivers);
    if (request.method() === "GET" && path === "/rest/v1/finance_entries")
      return json(
        entries.filter(
          (entry) =>
            (entry.kind === "income" ? "income" : "expenses") !==
            controls.blockedFinance,
        ),
      );
    if (path === "/rest/v1/rpc/tc_document_page_v2") {
      const rows = documents
        .filter((doc) => !body?.p_after || doc.id > String(body.p_after))
        .filter(mayRead)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (controls.holdDocumentPages) {
        controls.documentPagesHeld++;
        await new Promise<void>((resolve) => {
          pendingDocumentPages.push(resolve);
        });
      }
      return json(
        controls.foreignDocumentResponse
          ? rows.map((doc) => ({
              ...doc,
              organization_id: foreignOrg,
              object_path: doc.object_path.replace(org + "/", foreignOrg + "/"),
            }))
          : rows,
      );
    }
    const storagePrefix = "/storage/v1/object/";
    if (path.startsWith(storagePrefix)) {
      const suffix = path
        .slice(storagePrefix.length)
        .replace(/^authenticated\//, "");
      const objectPath = suffix.replace(/^truckcontrol-documents\//, "");
      if (
        !suffix.startsWith("truckcontrol-documents/") ||
        !objectPath.startsWith(org + "/")
      )
        return json(
          { code: "42501", message: "Synthetic foreign object" },
          403,
        );
      if (request.method() === "POST") {
        uploads++;
        if (uploads === controls.failUploadAt)
          return json(
            {
              statusCode: "403",
              error: "Forbidden",
              message: "Synthetic rejected upload",
            },
            403,
          );
        if (originals.has(objectPath))
          return json(
            {
              statusCode: "409",
              error: "Duplicate",
              message: "Original already exists",
            },
            409,
          );
        const raw = request.postDataBuffer()!;
        let bytes = raw;
        if (
          request.headers()["content-type"]?.startsWith("multipart/form-data")
        ) {
          const decoded = new globalThis.Request(request.url(), {
            method: "POST",
            headers: { "content-type": request.headers()["content-type"] },
            body: new Uint8Array(raw),
          });
          const form = await decoded.formData();
          const file = [...form.values()].find(
            (value) => typeof value !== "string",
          );
          if (!file || typeof file === "string")
            throw Error("Missing multipart original");
          bytes = Buffer.from(await file.arrayBuffer());
        }
        originals.set(objectPath, bytes);
        if (controls.holdUpload) {
          controls.uploadPending = true;
          await new Promise<void>((resolve) => {
            controls.releaseUpload = resolve;
          });
        }
        if (uploads === controls.uncertainUploadAt)
          return json(
            {
              statusCode: "503",
              error: "Unavailable",
              message: "Synthetic uncertain acknowledgment",
            },
            503,
          );
        return json({ Key: suffix, Id: objectPath.split("/")[1] });
      }
      if (request.method() === "GET") {
        if (
          !documents.some(
            (doc) => doc.object_path === objectPath && mayRead(doc),
          )
        )
          return json({ code: "42501" }, 403);
        if (controls.holdDownload) {
          controls.downloadPending = true;
          await new Promise<void>((resolve) => {
            controls.releaseDownload = resolve;
          });
        }
        const bytes = originals.get(objectPath);
        if (!bytes) return json({ code: "404" }, 404);
        return route.fulfill({
          headers: { ...headers, "Content-Type": "application/pdf" },
          body: bytes,
        });
      }
      throw Error(`Unexpected document storage method: ${request.method()}`);
    }
    if (path === "/rest/v1/rpc/tc_register_document_v2") {
      if (controls.failRegister)
        return json(
          { code: "40001", message: "Synthetic registration uncertain" },
          409,
        );
      const record = body?.p_document as Omit<
        CompanyDocument,
        "organization_id" | "created_at" | "tracking"
      >;
      if (!originals.has(record.object_path))
        return json({ code: "42501" }, 403);
      const document: CompanyDocument = {
        ...record,
        organization_id: org,
        created_at: new Date().toISOString(),
        tracking: {
          ...(body!.p_tracking as NonNullable<CompanyDocument["tracking"]>),
          row_version: 1,
          updated_at: new Date().toISOString(),
        },
      };
      if (!mayRead(document)) return json({ code: "42501" }, 403);
      documents.push(document);
      return json(record.id);
    }
    if (path === "/rest/v1/rpc/tc_update_document_metadata_v2") {
      const document = documents.find((doc) => doc.id === body?.p_document);
      if (!document || !mayRead(document)) return json({ code: "42501" }, 403);
      if (
        controls.conflictMetadata ||
        document.tracking?.row_version !== body?.p_expected
      )
        return json({ code: "40001", message: "La ficha ha cambiado" }, 409);
      document.tracking = {
        ...document.tracking,
        ...(body!.p_data as NonNullable<CompanyDocument["tracking"]>),
        row_version: document.tracking.row_version + 1,
        updated_at: new Date().toISOString(),
      };
      return json(document.tracking);
    }
    throw Error(`Unexpected synthetic document request: ${path}`);
  });
  return { controls, documents, originals, observed, trucks, drivers, entries };
}

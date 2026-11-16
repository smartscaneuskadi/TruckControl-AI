import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";
import {
  DocumentUploadError,
  downloadCompanyDocument,
  loadCompanyDocuments,
  updateCompanyDocument,
  uploadCompanyDocument,
} from "../src/integrations/supabase/documents";
import { defaultDocumentInput } from "../src/domain/documents";

const org = "21000000-0000-4000-8000-000000000001";
const actor = "11000000-0000-4000-8000-000000000001";
const other = "11000000-0000-4000-8000-000000000002";
const truck = "31000000-0000-4000-8000-000000000001";
const entry = "41000000-0000-4000-8000-000000000001";
const original = new TextEncoder().encode(
  "%PDF-1.7\nOriginal ficticio sin datos reales.\n%%EOF",
);
const nativeSession = (user = actor, sid = "document-session-a"): Session =>
  ({
    user: { id: user },
    access_token:
      "e30." +
      btoa(JSON.stringify({ sub: user, session_id: sid, aal: "aal1" })) +
      ".fixture",
    refresh_token: "test-only-refresh-not-a-real-credential",
    token_type: "bearer",
    expires_in: 3600,
  }) as Session;
type RequestInfo = {
  path: string;
  method: string;
  headers: Headers;
  body: RequestInit["body"];
};
function setup() {
  let session: Session | null = nativeSession();
  const subscriptions = new Set<
    (event: AuthChangeEvent, value: Session | null) => void
  >();
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange(
        callback: (event: AuthChangeEvent, value: Session | null) => void,
      ) {
        subscriptions.add(callback);
        return {
          data: {
            subscription: { unsubscribe: () => subscriptions.delete(callback) },
          },
        };
      },
    },
  } as unknown as SupabaseClient<Database>;
  const requests: RequestInfo[] = [];
  let handle: (request: RequestInfo) => Promise<Response> = async (request) => {
    if (
      request.path.startsWith("/storage/v1/object/") &&
      request.method === "POST"
    )
      return Response.json({ Id: crypto.randomUUID(), Key: request.path });
    if (
      request.path.endsWith("/tc_register_document_v2") ||
      request.path.endsWith("/tc_update_document_metadata_v2")
    )
      return Response.json({ ok: true });
    throw Error("Unexpected fictitious document request: " + request.path);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = {
        path: new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        ).pathname,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body,
      };
      requests.push(request);
      return handle(request);
    }),
  );
  return {
    client,
    requests,
    initial: session,
    setSession(next: Session | null) {
      session = next;
      for (const callback of subscriptions)
        callback(next ? "SIGNED_IN" : "SIGNED_OUT", next);
    },
    handle(next: typeof handle) {
      handle = next;
    },
    activeSubscriptions: () => subscriptions.size,
  };
}
const file = (name = "original-ficticio.pdf") =>
  new File([original], name, { type: "application/pdf" });
const body = (request: RequestInfo) => JSON.parse(String(request.body));
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://kkkemaycedexymrpaqtp.supabase.co");
  vi.stubEnv(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_DOCUMENT_FIXTURE_NOT_REAL",
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("private document client: real pinned SDK, synthetic transport", () => {
  it("keeps repeated names as separate UUID objects, original bytes and independent metadata", async () => {
    const fixture = setup();
    await uploadCompanyDocument(
      fixture.client,
      org,
      file(),
      truck,
      "",
      {
        ...defaultDocumentInput,
        category: "technical_card",
        label: "Ficha técnica ficticia",
      },
      () => true,
      actor,
    );
    await uploadCompanyDocument(
      fixture.client,
      org,
      file(),
      truck,
      "",
      {
        ...defaultDocumentInput,
        category: "other",
        label: "Otra documentación",
      },
      () => true,
      actor,
    );
    const uploads = fixture.requests.filter((request) =>
      request.path.startsWith("/storage/"),
    );
    const registrations = fixture.requests
      .filter((request) => request.path.endsWith("/tc_register_document_v2"))
      .map(body);
    expect(uploads).toHaveLength(2);
    expect(uploads[0].path).not.toBe(uploads[1].path);
    for (const request of uploads) {
      expect(request.headers.get("x-upsert")).toBe("false");
      const stored = [...(request.body as FormData).values()].find(
        (value) => value instanceof Blob,
      ) as Blob;
      expect(new Uint8Array(await stored.arrayBuffer())).toEqual(original);
    }
    expect(registrations.map((row) => row.p_document.name)).toEqual([
      "original-ficticio.pdf",
      "original-ficticio.pdf",
    ]);
    expect(registrations.map((row) => row.p_tracking.label)).toEqual([
      "Ficha técnica ficticia",
      "Otra documentación",
    ]);
    expect(registrations.map((row) => row.p_tracking.category)).toEqual([
      "technical_card",
      "other",
    ]);
    expect(
      registrations.every(
        (row) =>
          row.p_document.truck_id === truck &&
          row.p_document.driver_id === null,
      ),
    ).toBe(true);
    expect(
      fixture.requests.every(
        (request) =>
          request.headers.get("Authorization") ===
          "Bearer " + fixture.initial.access_token,
      ),
    ).toBe(true);
    expect(fixture.activeSubscriptions()).toBe(0);
  });
  it("links a finance attachment explicitly without inferring a vehicle or personal identity", async () => {
    const fixture = setup();
    await uploadCompanyDocument(
      fixture.client,
      org,
      file(),
      "",
      "",
      { ...defaultDocumentInput, category: "ticket", finance_entry_id: entry },
      () => true,
      actor,
    );
    const record = body(
      fixture.requests.find((request) =>
        request.path.endsWith("/tc_register_document_v2"),
      )!,
    );
    expect(record.p_document.truck_id).toBeNull();
    expect(record.p_document.driver_id).toBeNull();
    expect(record.p_tracking.finance_entry_id).toBe(entry);
    expect(record.p_tracking).not.toHaveProperty("label");
  });
  it.each([
    new File(["not a PDF"], "pretend.pdf", { type: "application/pdf" }),
    new File([], "empty.pdf"),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf"),
  ])(
    "rejects invalid originals before any Storage/RPC effect",
    async (invalid) => {
      const fixture = setup();
      await expect(
        uploadCompanyDocument(
          fixture.client,
          org,
          invalid,
          truck,
          "",
          defaultDocumentInput,
          () => true,
          actor,
        ),
      ).rejects.toMatchObject({ outcome: "not_saved" });
      expect(fixture.requests).toHaveLength(0);
      expect(fixture.activeSubscriptions()).toBe(0);
    },
  );
  it("does not trust a MIME label over the actual PDF signature", async () => {
    const fixture = setup();
    await uploadCompanyDocument(
      fixture.client,
      org,
      new File([original], "original.bin", { type: "text/plain" }),
      truck,
      "",
      defaultDocumentInput,
      () => true,
      actor,
    );
    const record = body(
      fixture.requests.find((request) =>
        request.path.endsWith("/tc_register_document_v2"),
      )!,
    );
    expect(record.p_document.content_type).toBe("application/pdf");
    expect(record.p_document.object_path).toMatch(/\/document\.pdf$/);
  });
  it("stops a changed parent while sniffing, before upload", async () => {
    const fixture = setup(),
      held = deferred(),
      selected = file();
    let current = true;
    const sniff = vi.spyOn(selected, "slice").mockReturnValue({
      arrayBuffer: async () => {
        await held.promise;
        return original.slice().buffer;
      },
    } as Blob);
    const pending = uploadCompanyDocument(
      fixture.client,
      org,
      selected,
      truck,
      "",
      defaultDocumentInput,
      () => current,
      actor,
    );
    const rejected =
      expect(pending).rejects.toBeInstanceOf(DocumentUploadError);
    await vi.waitFor(() => expect(sniff).toHaveBeenCalled());
    current = false;
    held.release();
    await rejected;
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.activeSubscriptions()).toBe(0);
  });
  it.each(["other-actor", "new-sid", "logout", "other-parent"])(
    "never registers a Storage response after %s",
    async (change) => {
      const fixture = setup(),
        held = deferred();
      let current = true;
      fixture.handle(async (request) => {
        expect(request.path.startsWith("/storage/")).toBe(true);
        await held.promise;
        return Response.json({ Id: crypto.randomUUID() });
      });
      const pending = uploadCompanyDocument(
        fixture.client,
        org,
        file(),
        truck,
        "",
        defaultDocumentInput,
        () => current,
        actor,
      );
      const rejected =
        expect(pending).rejects.toBeInstanceOf(DocumentUploadError);
      await vi.waitFor(() => expect(fixture.requests).toHaveLength(1));
      if (change === "other-parent") current = false;
      else
        fixture.setSession(
          change === "logout"
            ? null
            : nativeSession(
                change === "other-actor" ? other : actor,
                "new-session",
              ),
        );
      held.release();
      await rejected;
      expect(fixture.requests).toHaveLength(1);
      expect(fixture.requests[0].headers.get("Authorization")).toBe(
        "Bearer " + fixture.initial.access_token,
      );
      expect(fixture.activeSubscriptions()).toBe(0);
    },
  );
  it("treats a lost registration response as uncertain and performs no automatic retry or deletion", async () => {
    const fixture = setup();
    fixture.handle(async (request) =>
      request.path.startsWith("/storage/")
        ? Response.json({ Id: crypto.randomUUID() })
        : new Response("connection lost", { status: 502 }),
    );
    await expect(
      uploadCompanyDocument(
        fixture.client,
        org,
        file(),
        truck,
        "",
        defaultDocumentInput,
        () => true,
        actor,
      ),
    ).rejects.toMatchObject({ outcome: "uncertain" });
    expect(fixture.requests.map((request) => request.method)).toEqual([
      "POST",
      "POST",
    ]);
    expect(
      fixture.requests.filter((request) =>
        request.path.endsWith("/tc_register_document_v2"),
      ),
    ).toHaveLength(1);
    expect(fixture.activeSubscriptions()).toBe(0);
  });
  it("distinguishes a definite Storage rejection from an unknown transport outcome", async () => {
    const fixture = setup();
    fixture.handle(async () =>
      Response.json({ message: "denied", statusCode: "403" }, { status: 403 }),
    );
    await expect(
      uploadCompanyDocument(
        fixture.client,
        org,
        file(),
        truck,
        "",
        defaultDocumentInput,
        () => true,
        actor,
      ),
    ).rejects.toMatchObject({ outcome: "not_saved" });
    expect(fixture.requests).toHaveLength(1);
    fixture.handle(async () => {
      throw new TypeError("Synthetic network loss");
    });
    await expect(
      uploadCompanyDocument(
        fixture.client,
        org,
        file(),
        truck,
        "",
        defaultDocumentInput,
        () => true,
        actor,
      ),
    ).rejects.toMatchObject({ outcome: "uncertain" });
    expect(fixture.requests).toHaveLength(2);
  });
  it("keeps CAS metadata failures explicit, without replacing originals or dropping the finance link", async () => {
    const fixture = setup();
    fixture.handle(async () =>
      Response.json(
        { code: "40001", message: "stale revision" },
        { status: 409 },
      ),
    );
    await expect(
      updateCompanyDocument(
        fixture.client,
        org,
        crypto.randomUUID(),
        { ...defaultDocumentInput, label: "", finance_entry_id: entry },
        8,
        () => true,
        actor,
      ),
    ).rejects.toThrow("La ficha ha cambiado");
    expect(fixture.requests).toHaveLength(1);
    expect(body(fixture.requests[0])).toMatchObject({
      p_expected: 8,
      p_data: { label: "", finance_entry_id: entry },
    });
    expect(fixture.requests[0].path).toBe(
      "/rest/v1/rpc/tc_update_document_metadata_v2",
    );
  });
  it("rejects foreign document rows rather than rendering another company", async () => {
    const fixture = setup(),
      id = crypto.randomUUID(),
      foreign = crypto.randomUUID();
    fixture.handle(async () =>
      Response.json([
        {
          id,
          organization_id: foreign,
          name: "Original ajeno ficticio.pdf",
          object_path: `${foreign}/${id}/document.pdf`,
          content_type: "application/pdf",
          size_bytes: original.length,
          truck_id: null,
          driver_id: null,
          created_at: new Date().toISOString(),
        },
      ]),
    );
    await expect(
      loadCompanyDocuments(fixture.client, org, () => true, actor),
    ).rejects.toThrow("no corresponde a esta empresa");
    expect(fixture.requests).toHaveLength(1);
  });
  it("does not create a download or object URL from a late response after another actor signs in", async () => {
    const fixture = setup(),
      held = deferred(),
      create = vi.spyOn(URL, "createObjectURL");
    fixture.handle(async () => {
      await held.promise;
      return new Response(original, {
        headers: { "Content-Type": "application/pdf" },
      });
    });
    const pending = downloadCompanyDocument(
      fixture.client,
      `${org}/${crypto.randomUUID()}/document.pdf`,
      "original.pdf",
      () => true,
      actor,
    );
    const rejected = expect(pending).rejects.toMatchObject({
      outcome: "cancelled",
    });
    await vi.waitFor(() => expect(fixture.requests).toHaveLength(1));
    fixture.setSession(nativeSession(other, "other-account"));
    held.release();
    await rejected;
    expect(create).not.toHaveBeenCalled();
    expect(fixture.activeSubscriptions()).toBe(0);
    expect(fixture.requests[0].headers.get("Authorization")).toBe(
      "Bearer " + fixture.initial.access_token,
    );
  });
  it("downloads the authenticated original byte for byte and revokes its local URL", async () => {
    vi.useFakeTimers();
    const fixture = setup(),
      link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:document-fixture");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    vi.stubGlobal("document", {
      createElement: () => link,
      body: { appendChild: vi.fn() },
    });
    fixture.handle(
      async () =>
        new Response(original, {
          headers: { "Content-Type": "application/pdf" },
        }),
    );
    await downloadCompanyDocument(
      fixture.client,
      `${org}/${crypto.randomUUID()}/document.pdf`,
      "original-ficticio.pdf",
      () => true,
      actor,
    );
    expect(
      new Uint8Array(await (create.mock.calls[0][0] as Blob).arrayBuffer()),
    ).toEqual(original);
    expect(link.download).toBe("original-ficticio.pdf");
    expect(link.click).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith("blob:document-fixture");
  });
});

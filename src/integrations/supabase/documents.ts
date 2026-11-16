import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { backupDocumentSchema } from "../../data/company-backup";
import {
  documentTrackingInput,
  defaultDocumentInput,
} from "../../domain/documents";
import type { DocumentTrackingInput } from "../../domain/documents";
import { nativeSessionHint } from "./mfa";

/** Token hints only deny stale work; native RLS/RPC/Storage authorize every request. */
async function withDocumentSession<T>(
  client: SupabaseClient<Database>,
  current: DocumentOperationGuard | undefined,
  actorId: string | undefined,
  operation: (
    scoped: SupabaseClient<Database>,
    verify: () => Promise<void>,
  ) => Promise<T>,
) {
  checkDocumentScope(current);
  const before = await client.auth.getSession();
  checkDocumentScope(current);
  const session = before.data.session;
  if (before.error || !session || (actorId && session.user.id !== actorId))
    throw new DocumentUploadError(
      "La sesión documental ha cambiado. Vuelve a abrir la ficha.",
      "cancelled",
    );
  const userId = session.user.id,
    token = session.access_token,
    hint = nativeSessionHint(session);
  let valid = true;
  const sameSession = (next: typeof session | null) =>
    Boolean(
      next &&
      next.user.id === userId &&
      (hint?.sessionId
        ? nativeSessionHint(next)?.sessionId === hint.sessionId
        : next.access_token === token) &&
      nativeSessionHint(next)?.aal === hint?.aal,
    );
  const isCurrent = () => valid && (!current || current());
  const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
    if (!sameSession(next)) valid = false;
  });
  const verify = async () => {
    checkDocumentScope(isCurrent);
    const now = await client.auth.getSession();
    if (now.error || !sameSession(now.data.session)) valid = false;
    checkDocumentScope(isCurrent);
  };
  try {
    await verify();
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
      string | undefined;
    if (!url || !key || !key.startsWith("sb_publishable_"))
      throw Error("La conexión documental de la empresa no está disponible.");
    const endpoint = new URL(url);
    const loopback =
      ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) &&
      (typeof window === "undefined" ||
        ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname));
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.pathname !== "/" ||
      (endpoint.origin !== "https://kkkemaycedexymrpaqtp.supabase.co" &&
        !(loopback && endpoint.protocol === "http:"))
    )
      throw Error(
        "La conexión documental no corresponde al proyecto autorizado de TruckControl.",
      );
    // A per-operation client cannot pick up another account's token while the
    // SDK awaits getAccessToken. Its final fetch also checks the live scope.
    const transport = globalThis.fetch.bind(globalThis);
    const scoped = createClient<Database>(url, key, {
      accessToken: async () => {
        checkDocumentScope(isCurrent);
        return token;
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => {
          checkDocumentScope(isCurrent);
          return transport(input, init);
        },
      },
    });
    return await operation(scoped, verify);
  } finally {
    valid = false;
    listener.subscription.unsubscribe();
  }
}

export async function loadCompanyDocuments(
  client: SupabaseClient<Database>,
  organizationId: string,
  current?: DocumentOperationGuard,
  actorId?: string,
) {
  return withDocumentSession(
    client,
    current,
    actorId,
    async (scoped, verify) => {
      const rows: import("./database.types").CompanyDocument[] = [];
      let after: string | null = null;
      for (let page = 0; page < 51; page++) {
        await verify();
        const { data, error } = await scoped.rpc("tc_document_page_v2", {
          p_org: organizationId,
          p_after: after,
        });
        if (error || !Array.isArray(data))
          throw Error("No se han podido cargar los documentos autorizados.");
        if (data.length > 200 || rows.length + data.length > 10000)
          throw Error(
            "El archivo supera 10.000 documentos; consulta con soporte para ampliar la capacidad.",
          );
        for (const raw of data) {
          const doc = backupDocumentSchema.parse(raw);
          if (
            doc.organization_id !== organizationId ||
            (after !== null && doc.id <= after)
          )
            throw Error(
              "La respuesta documental no corresponde a esta empresa.",
            );
          rows.push(doc);
          after = doc.id;
        }
        await verify();
        if (data.length < 200) return rows;
      }
      throw Error("No se ha podido cargar el archivo completo.");
    },
  );
}
export async function updateCompanyDocument(
  client: SupabaseClient<Database>,
  organizationId: string,
  id: string,
  tracking: DocumentTrackingInput,
  version: number,
  current?: DocumentOperationGuard,
  actorId?: string,
) {
  return withDocumentSession(
    client,
    current,
    actorId,
    async (scoped, verify) => {
      await verify();
      const { error } = await scoped
        .rpc("tc_update_document_metadata_v2", {
          p_org: organizationId,
          p_document: id,
          p_data: documentTrackingInput.parse(tracking),
          p_expected: version,
        })
        .retry(false);
      if (error)
        throw Error(
          error.code === "40001"
            ? "La ficha ha cambiado. Pulsa Actualizar antes de volver a editarla."
            : "No se ha podido actualizar la ficha documental. Revisa tus permisos y la conexión.",
        );
      await verify();
    },
  );
}

export const DOCUMENT_BUCKET = "truckcontrol-documents";
export type DocumentOperationGuard = () => boolean;

/** An uncertain upload is never retried automatically or offered as a safe retry. */
export class DocumentUploadError extends Error {
  constructor(
    message: string,
    readonly outcome: "not_saved" | "uncertain" | "cancelled",
  ) {
    super(message);
    this.name = "DocumentUploadError";
  }
}
function checkDocumentScope(current?: DocumentOperationGuard) {
  if (current && !current())
    throw new DocumentUploadError(
      "La cuenta o la empresa ha cambiado. La operación documental se ha detenido.",
      "cancelled",
    );
}
const extensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
import { detectDocumentType } from "../../../supabase/functions/_shared/invoice.ts";
export async function uploadCompanyDocument(
  client: SupabaseClient<Database>,
  organizationId: string,
  file: File,
  truckId: string,
  driverId: string,
  tracking: DocumentTrackingInput = defaultDocumentInput,
  current?: DocumentOperationGuard,
  actorId?: string,
) {
  return withDocumentSession(
    client,
    current,
    actorId,
    async (scoped, verify) => {
      checkDocumentScope(current);
      await verify();
      const metadata = documentTrackingInput.parse(tracking);
      if (file.size < 1 || file.size > 10 * 1024 * 1024)
        throw new DocumentUploadError(
          "El documento debe tener entre 1 byte y 10 MB.",
          "not_saved",
        );
      const type = detectDocumentType(
        new Uint8Array(await file.slice(0, 16).arrayBuffer()),
      );
      if (!type)
        throw new DocumentUploadError(
          "Selecciona un PDF o una imagen JPG, PNG o WebP válida.",
          "not_saved",
        );
      checkDocumentScope(current);
      await verify();
      const id = crypto.randomUUID();
      const path = `${organizationId}/${id}/document.${extensions[type]}`;
      let storageError: unknown;
      try {
        const { error } = await scoped.storage
          .from(DOCUMENT_BUCKET)
          .upload(path, file, { contentType: type, upsert: false });
        storageError = error;
      } catch {
        throw new DocumentUploadError(
          "No se ha podido confirmar si se guardó el archivo. Actualiza el archivo documental antes de consultar con soporte. No vuelvas a subirlo.",
          "uncertain",
        );
      }
      if (storageError) {
        const code = Number(
          (storageError as { statusCode?: unknown }).statusCode,
        );
        const definitelyRejected = [400, 401, 403, 404, 413, 415, 422].includes(
          code,
        );
        throw new DocumentUploadError(
          definitelyRejected
            ? "No se ha podido guardar el archivo en tu empresa. Revisa tus permisos y vuelve a intentarlo."
            : "No se ha podido confirmar si se guardó el archivo. Actualiza el archivo documental y consulta con soporte. No vuelvas a subirlo.",
          definitelyRejected ? "not_saved" : "uncertain",
        );
      }
      checkDocumentScope(current);
      await verify();
      let failed = false;
      try {
        const result = await scoped
          .rpc("tc_register_document_v2", {
            p_org: organizationId,
            p_tracking: metadata,
            p_document: {
              id,
              name: file.name.slice(0, 160),
              object_path: path,
              content_type: type,
              size_bytes: file.size,
              truck_id: truckId || null,
              driver_id: driverId || null,
            },
          })
          .retry(false);
        failed = Boolean(result.error);
      } catch {
        failed = true;
      }
      if (failed)
        throw new DocumentUploadError(
          "El archivo se ha guardado, pero no se ha podido registrar su ficha. No vuelvas a subirlo: consulta con soporte.",
          "uncertain",
        );
      checkDocumentScope(current);
      await verify();
      return { id, objectPath: path };
    },
  );
}

export async function downloadCompanyDocument(
  client: SupabaseClient<Database>,
  path: string,
  name: string,
  current?: DocumentOperationGuard,
  actorId?: string,
) {
  return withDocumentSession(
    client,
    current,
    actorId,
    async (scoped, verify) => {
      checkDocumentScope(current);
      // Authenticated download avoids exposing a reusable signed/public URL.
      const { data, error } = await scoped.storage
        .from(DOCUMENT_BUCKET)
        .download(path);
      if (error || !data)
        throw new Error(
          "No tienes acceso al documento o no se puede descargar.",
        );
      checkDocumentScope(current);
      await verify();
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  );
}

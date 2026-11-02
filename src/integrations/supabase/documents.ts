import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { backupDocumentSchema } from "../../data/company-backup";
import {
  documentTrackingInput,
  defaultDocumentInput,
} from "../../domain/documents";
import type { DocumentTrackingInput } from "../../domain/documents";

export async function loadCompanyDocuments(
  client: SupabaseClient<Database>,
  organizationId: string,
) {
  const rows: import("./database.types").CompanyDocument[] = [];
  let after: string | null = null;
  for (let page = 0; page < 51; page++) {
    const { data, error } = await client.rpc("tc_document_page", {
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
        throw Error("La respuesta documental no corresponde a esta empresa.");
      rows.push(doc);
      after = doc.id;
    }
    if (data.length < 200) return rows;
  }
  throw Error("No se ha podido cargar el archivo completo.");
}
export async function updateCompanyDocument(
  client: SupabaseClient<Database>,
  organizationId: string,
  id: string,
  tracking: DocumentTrackingInput,
  version: number,
) {
  const { error } = await client.rpc("tc_update_document_metadata", {
    p_org: organizationId,
    p_document: id,
    p_data: documentTrackingInput.parse(tracking),
    p_expected: version,
  });
  if (error)
    throw Error(
      error.code === "40001"
        ? "La ficha ha cambiado. Pulsa Actualizar antes de volver a editarla."
        : "No se ha podido actualizar la ficha documental. Revisa tus permisos y la conexión.",
    );
}

export const DOCUMENT_BUCKET = "truckcontrol-documents";
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
) {
  const metadata = documentTrackingInput.parse(tracking);
  if (file.size < 1 || file.size > 10 * 1024 * 1024)
    throw new Error("El documento debe tener entre 1 byte y 10 MB.");
  const type = detectDocumentType(
    new Uint8Array(await file.slice(0, 16).arrayBuffer()),
  );
  if (!type)
    throw new Error("Selecciona un PDF o una imagen JPG, PNG o WebP válida.");
  const id = crypto.randomUUID();
  const path = `${organizationId}/${id}/document.${extensions[type]}`;
  const { error } = await client.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, file, { contentType: type, upsert: false });
  if (error)
    throw new Error("No se ha podido guardar el archivo en tu empresa.");
  const result = await client.rpc("tc_register_document", {
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
  });
  if (result.error)
    throw new Error(
      "El archivo se ha guardado, pero no se ha podido registrar su ficha. No vuelvas a subirlo: consulta con soporte.",
    );
}

export async function downloadCompanyDocument(
  client: SupabaseClient<Database>,
  path: string,
  name: string,
) {
  // Authenticated download avoids exposing a reusable signed/public URL.
  const { data, error } = await client.storage
    .from(DOCUMENT_BUCKET)
    .download(path);
  if (error || !data)
    throw new Error("No tienes acceso al documento o no se puede descargar.");
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

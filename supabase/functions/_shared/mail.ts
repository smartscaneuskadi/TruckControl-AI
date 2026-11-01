import PostalMime from "postal-mime";
import { base64, detectDocumentType, hash } from "./invoice.ts";

export const MAX_MAIL_BYTES = 10 * 1024 * 1024;
export const MAX_MAIL_ATTACHMENTS = 5;
export class MailInputError extends Error {}
export interface MailAttachment {
  name: string;
  type: string;
  bytes: Uint8Array;
  contentHash: string;
  attachmentId: string;
}
export interface ParsedMail {
  messageId: string;
  subject: string;
  attachments: MailAttachment[];
  skipped: number;
}
const extensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const documentExtension = (type: string) => extensions[type];
export function cleanMailText(text: string, limit = 160) {
  return text
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .trim()
    .slice(0, limit);
}
function filename(name: string, type: string) {
  let clean =
    cleanMailText(
      name.replace(/\\/g, "/").split("/").pop() ?? "Factura",
      140,
    ) || "Factura";
  const ext = extensions[type];
  if (!clean.toLowerCase().endsWith("." + ext)) clean += "." + ext;
  return clean;
}

/** Parse locally, without rendering HTML, following links, or inferring amounts. */
export async function parseMailFile(
  bytes: Uint8Array,
  name: string,
): Promise<ParsedMail> {
  if (!bytes.length || bytes.length > MAX_MAIL_BYTES)
    throw new MailInputError("El archivo debe tener entre 1 byte y 10 MB.");
  const messageHash = await hash(bytes);
  const directType = detectDocumentType(bytes);
  if (directType)
    return {
      messageId: "file:" + messageHash,
      subject: cleanMailText(name),
      skipped: 0,
      attachments: [
        {
          name: filename(name, directType),
          type: directType,
          bytes,
          contentHash: messageHash,
          attachmentId: "file",
        },
      ],
    };
  if (!name.toLowerCase().endsWith(".eml"))
    throw new MailInputError(
      "Selecciona un correo EML, PDF o imagen JPG, PNG o WebP.",
    );
  let email;
  try {
    email = await PostalMime.parse(bytes, {
      attachmentEncoding: "arraybuffer",
      maxNestingDepth: 12,
      maxHeadersSize: 64 * 1024,
      maxPartCount: 64,
      maxRfc822NestingDepth: 2,
      maxForwardedAddresses: 64,
    });
  } catch {
    throw new MailInputError(
      "El correo no es válido o supera los límites de estructura y cabeceras.",
    );
  }
  const attachments: MailAttachment[] = [];
  const seen = new Set<string>();
  let skipped = 0,
    total = 0;
  for (const part of email.attachments) {
    if (part.rfc822DepthExceeded)
      throw new MailInputError(
        "El correo contiene mensajes anidados sin revisar. Importa el mensaje original por separado.",
      );
    if (part.disposition === "inline" || !part.filename) {
      skipped++;
      continue;
    }
    if (typeof part.content === "string")
      throw new MailInputError("No se puede leer el adjunto de este correo.");
    const content = new Uint8Array(part.content);
    const type = detectDocumentType(content);
    if (!type || !content.length) {
      skipped++;
      continue;
    }
    total += content.length;
    if (total > MAX_MAIL_BYTES || content.length > MAX_MAIL_BYTES)
      throw new MailInputError(
        "Los adjuntos superan el límite conjunto de 10 MB.",
      );
    const contentHash = await hash(content);
    if (seen.has(contentHash)) {
      skipped++;
      continue;
    }
    seen.add(contentHash);
    if (attachments.length >= MAX_MAIL_ATTACHMENTS)
      throw new MailInputError(
        "Importa un máximo de cinco documentos por correo.",
      );
    attachments.push({
      name: filename(part.filename, type),
      type,
      bytes: content,
      contentHash,
      attachmentId: "part:" + contentHash,
    });
  }
  if (!attachments.length)
    throw new MailInputError(
      "No hay facturas PDF o imágenes adjuntas compatibles. El texto y los enlaces del correo no se importan.",
    );
  return {
    messageId: "eml:" + messageHash,
    subject: cleanMailText(email.subject ?? "Correo importado"),
    attachments,
    skipped,
  };
}

/** A fictitious email that can be exercised without opening a real mailbox. */
export function fictitiousEmail() {
  const pdf = new TextEncoder().encode(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  );
  return new TextEncoder().encode(
    [
      "From: Proveedor ficticio <facturas@example.com>",
      "To: Empresa de demostracion <demo@example.com>",
      "Subject: Factura ficticia de mantenimiento",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="truckcontrol-demo-mail"',
      "",
      "--truckcontrol-demo-mail",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Correo ficticio para probar la importacion. No contiene datos empresariales reales.",
      "--truckcontrol-demo-mail",
      "Content-Type: application/pdf",
      'Content-Disposition: attachment; filename="Factura-ficticia.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      base64(pdf),
      "--truckcontrol-demo-mail--",
      "",
    ].join("\r\n"),
  );
}

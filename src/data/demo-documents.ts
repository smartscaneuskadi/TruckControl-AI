import { detectDocumentType } from "../../supabase/functions/_shared/invoice.ts";

export interface DemoDocument {
  id: string;
  organizationId: string;
  name: string;
  truckId: string;
  driverId: string;
  createdAt: string;
  file: Blob;
}
const databaseName = "truckcontrol-demo-documents-v1";
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("files", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(Error("El navegador no permite guardar documentos de prueba."));
  });
}
export async function listDemoDocuments(organizationId: string) {
  const db = await database();
  try {
    return await new Promise<DemoDocument[]>((resolve, reject) => {
      const tx = db.transaction("files", "readonly");
      const read = tx.objectStore("files").getAll();
      tx.oncomplete = () =>
        resolve(
          (read.result as DemoDocument[])
            .filter((d) => d.organizationId === organizationId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? Error("No se pudo leer la biblioteca de prueba."));
    });
  } finally {
    db.close();
  }
}
export async function saveDemoDocument(
  organizationId: string,
  file: File,
  truckId: string,
  driverId: string,
) {
  if (file.size < 1 || file.size > 10 * 1024 * 1024)
    throw Error("El documento debe tener entre 1 byte y 10 MB.");
  const type = detectDocumentType(
    new Uint8Array(await file.slice(0, 16).arrayBuffer()),
  );
  if (!type)
    throw Error("Selecciona un PDF o una imagen JPG, PNG o WebP válida.");
  const value: DemoDocument = {
    id: crypto.randomUUID(),
    organizationId,
    name: file.name.slice(0, 160),
    truckId,
    driverId,
    createdAt: new Date().toISOString(),
    file: new Blob([file], { type }),
  };
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite"),
        store = tx.objectStore("files"),
        read = store.getAll();
      let capacityError = false;
      read.onsuccess = () => {
        if (
          (read.result as DemoDocument[]).reduce(
            (total, d) => total + d.file.size,
            0,
          ) +
            file.size >
          50 * 1024 * 1024
        ) {
          capacityError = true;
          tx.abort();
          return;
        }
        store.add(value);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          Error(
            "No hay espacio disponible para el documento. No se ha guardado.",
          ),
        );
      tx.onabort = () =>
        reject(
          Error(
            capacityError
              ? "La biblioteca de prueba admite hasta 50 MB."
              : "No se ha podido guardar el documento de prueba.",
          ),
        );
    });
  } finally {
    db.close();
  }
}
export async function clearDemoDocuments(organizationId: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite"),
        store = tx.objectStore("files"),
        read = store.getAll();
      read.onsuccess = () =>
        (read.result as DemoDocument[])
          .filter((d) => d.organizationId === organizationId)
          .forEach((d) => store.delete(d.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? Error("No se pudo vaciar la biblioteca de prueba."));
    });
  } finally {
    db.close();
  }
}

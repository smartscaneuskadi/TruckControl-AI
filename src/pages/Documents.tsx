import { useState } from "react";
import type { FormEvent } from "react";
import { FileCheck2, FileUp, ShieldCheck } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useSubscription } from "../app/SubscriptionContext";
import { errorMessage, useFleet } from "../app/FleetProvider";
import { getSupabaseClient } from "../integrations/supabase/client";
import { useDocuments } from "../app/DocumentsProvider";
import {
  DocumentRegister,
  DocumentTrackingFields,
  readDocumentTracking,
} from "../components/DocumentRegister";
import {
  downloadCompanyDocument,
  uploadCompanyDocument,
  updateCompanyDocument,
} from "../integrations/supabase/documents";
import { Badge, Button, PageHeading } from "../components/ui";
import { DemoDocuments } from "../components/DemoDocuments";

export function Documents() {
  const access = useCompany();
  const subscription = useSubscription();
  const writable =
    !subscription.enabled || subscription.access?.can_write !== false;
  const { snapshot, notify } = useFleet();
  const client = getSupabaseClient();
  const cloud = access.mode === "company" && Boolean(client);
  const register = useDocuments();
  const { documents, loading } = register;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [truckId, setTruckId] = useState("");
  const [driverId, setDriverId] = useState("");
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client || !cloud || busy || !writable) return;
    const form = e.currentTarget;
    const values = new FormData(form);
    const file = values.get("document");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError("");
    try {
      await uploadCompanyDocument(
        client,
        snapshot.organization.id,
        file,
        truckId,
        driverId,
        readDocumentTracking(values),
      );
      form.reset();
      setTruckId("");
      setDriverId("");
      await register.refresh();
      notify("Documento guardado en tu empresa.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ARCHIVO DE EMPRESA"
        title="Documentos de tu flota"
        description="Facturas, permisos y documentación vinculada a tus camiones y conductores."
      />
      {!cloud ? (
        <>
          <section className="card integration-card">
            <span className="settings-icon">
              <FileCheck2 size={28} />
            </span>
            <Badge tone="blue">Vista de demostración</Badge>
            <h2>Un archivo propio para cada empresa</h2>
            <p>
              En el modo empresa podrás subir documentos PDF e imágenes de hasta
              10 MB, asignarlos a una ficha y descargarlos con tu cuenta.
            </p>
            <div className="config-fact">
              <ShieldCheck size={18} /> Almacenamiento privado con permisos por
              empresa
            </div>
            <Button onClick={access.openAccount}>Acceso de empresas</Button>
          </section>
          <DemoDocuments />
        </>
      ) : (
        <>
          <form
            className="card integration-card document-upload"
            onSubmit={upload}
          >
            <fieldset className="operation-fieldset" disabled={!writable}>
              <h2>
                <FileUp size={23} /> Añadir documento
              </h2>
              <div className="integration-fields">
                <label>
                  Documento PDF o imagen
                  <input
                    type="file"
                    name="document"
                    required
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    disabled={busy}
                  />
                </label>
                <label>
                  Camión
                  <select
                    value={truckId}
                    onChange={(e) => setTruckId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Sin vincular</option>
                    {snapshot.trucks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.plate}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Conductor
                  <select
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Sin vincular</option>
                    {snapshot.drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <DocumentTrackingFields />
              <small>
                Máximo 10 MB. Los archivos se conservan sin sobrescribir
                documentos anteriores.
              </small>
              <Button type="submit" icon={FileUp} disabled={busy}>
                {busy ? "Guardando…" : "Guardar documento"}
              </Button>
            </fieldset>
          </form>
          {loading ? (
            <p role="status">Cargando documentos…</p>
          ) : (
            <DocumentRegister
              documents={documents}
              cloud
              busy={busy}
              writable={writable}
              onRefresh={register.refresh}
              onDownload={(doc) =>
                downloadCompanyDocument(client!, doc.object_path, doc.name)
              }
              onSave={async (doc, value) => {
                await updateCompanyDocument(
                  client!,
                  snapshot.organization.id,
                  doc.id,
                  value,
                  doc.tracking?.row_version ?? 0,
                );
                await register.refresh();
              }}
            />
          )}
          {register.error && (
            <p className="form-error" role="alert">
              {register.error}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </>
  );
}

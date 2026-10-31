import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FileCheck2, FileUp, Download, ShieldCheck } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useSubscription } from "../app/SubscriptionContext";
import { errorMessage, useFleet } from "../app/FleetProvider";
import { getSupabaseClient } from "../integrations/supabase/client";
import type { CompanyDocument } from "../integrations/supabase/database.types";
import {
  downloadCompanyDocument,
  uploadCompanyDocument,
} from "../integrations/supabase/documents";
import { Badge, Button, Empty, PageHeading } from "../components/ui";
import { DemoDocuments } from "../components/DemoDocuments";

export function Documents() {
  const access = useCompany();
  const subscription = useSubscription();
  const writable =
    !subscription.enabled || subscription.access?.can_write !== false;
  const { snapshot, notify } = useFleet();
  const client = getSupabaseClient();
  const cloud = access.mode === "company" && Boolean(client);
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(cloud);
  const [truckId, setTruckId] = useState("");
  const [driverId, setDriverId] = useState("");
  useEffect(() => {
    if (!cloud || !client) return;
    let active = true;
    setLoading(true);
    void client
      .rpc("list_company_documents", {
        p_organization_id: snapshot.organization.id,
      })
      .then(({ data, error }) => {
        if (!active) return;
        setLoading(false);
        if (error) setError("No se han podido cargar los documentos.");
        else {
          setDocuments(data ?? []);
          setError("");
        }
      });
    return () => {
      active = false;
    };
  }, [cloud, client, snapshot.organization.id, revision]);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client || !cloud || busy || !writable) return;
    const form = e.currentTarget;
    const file = new FormData(form).get("document");
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
      );
      form.reset();
      setRevision((n) => n + 1);
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
          ) : documents.length ? (
            <div className="document-grid">
              {documents.map((doc) => (
                <article className="card document-card" key={doc.id}>
                  <FileCheck2 size={25} />
                  <Badge tone="green">Privado</Badge>
                  <h2>{doc.name}</h2>
                  <p>
                    {(doc.size_bytes / 1024).toFixed(0)} KB ·{" "}
                    {new Date(doc.created_at).toLocaleDateString("es-ES")}
                  </p>
                  <p>
                    {snapshot.trucks.find((t) => t.id === doc.truck_id)
                      ?.plate ?? "Documento de empresa"}
                    {doc.driver_id
                      ? ` · ${snapshot.drivers.find((d) => d.id === doc.driver_id)?.name ?? "Conductor"}`
                      : ""}
                  </p>
                  <Button
                    variant="secondary"
                    icon={Download}
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void downloadCompanyDocument(
                        client!,
                        doc.object_path,
                        doc.name,
                      )
                        .catch((e) => setError(errorMessage(e)))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Descargar
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <section className="card">
              <Empty title="Todavía no hay documentos">
                Sube el primero para empezar el archivo de tu empresa.
              </Empty>
            </section>
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

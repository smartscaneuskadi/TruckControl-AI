import { FileCheck2, ShieldCheck } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { Badge, Button, PageHeading } from "../components/ui";
import { DemoDocuments } from "../components/DemoDocuments";
import { DocumentLibrary } from "../components/EntityDocuments";

export function Documents() {
  const access = useCompany();
  const cloud = access.mode === "company";
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
        <DocumentLibrary />
      )}
    </>
  );
}

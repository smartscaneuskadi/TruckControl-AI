import { legalDocuments, legalVersion, operator } from "../domain/legal";
import type { LegalDocument } from "../domain/legal";
import { Button } from "./ui";
export function LegalLinks() {
  return (
    <nav aria-label="Información legal" className="access-links">
      {(
        [
          ["notice", "Aviso legal"],
          ["privacy", "Privacidad"],
          ["terms", "Condiciones"],
        ] as const
      ).map(([id, title]) => (
        <a key={id} href={`/?legal=${id}`} target="_blank" rel="noreferrer">
          {title}
        </a>
      ))}
    </nav>
  );
}
export function LegalPage({ document }: { document: LegalDocument }) {
  const content = legalDocuments[document];
  return (
    <main className="registration-page">
      <article
        className="card"
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "clamp(20px,4vw,48px)",
        }}
      >
        <p className="eyebrow">TRUCKCONTROL AI · {legalVersion}</p>
        <p>
          {operator.name} · CIF {operator.taxId} · {operator.address}
        </p>
        <h1>{content.title}</h1>
        {content.sections.map((s) => (
          <section key={s.title} style={{ marginTop: 24 }}>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
          </section>
        ))}
        <p>
          <a href={`mailto:${operator.email}`}>{operator.email}</a>
        </p>
        <LegalLinks />
        <Button onClick={() => window.location.assign("/")}>
          Volver a TruckControl AI
        </Button>
      </article>
    </main>
  );
}

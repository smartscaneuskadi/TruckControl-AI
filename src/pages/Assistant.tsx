import {
  ArrowRight,
  Bot,
  CircleCheck,
  Lightbulb,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useFleet } from "../app/FleetProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import { LocalInsightProvider } from "../domain/insights";
import { today } from "../lib/format";
import { Badge, PageHeading, PeriodPicker } from "../components/ui";
import { DocumentAssistant } from "../components/DocumentAssistant";

export function Assistant() {
  const { snapshot } = useFleet();
  const { period, setPeriod } = useWorkspace();
  const provider = new LocalInsightProvider();
  const insights = provider.analyze(snapshot, period, today());
  return (
    <>
      <PageHeading
        eyebrow="COPILOTO DE FLOTA"
        title="Más claridad para decidir"
        description="Avisos explicables que se actualizan con los datos de tu flota."
      >
        <PeriodPicker snapshot={snapshot} value={period} onChange={setPeriod} />
      </PageHeading>
      <div className="assistant-banner">
        <span className="assistant-orb">
          <Sparkles size={32} />
        </span>
        <div>
          <Badge tone="green">Análisis local</Badge>
          <h2>Tu flota tiene cosas que contarte.</h2>
          <p>
            Estas recomendaciones usan reglas de fechas, cobros y rentabilidad.
            No se conecta ningún modelo IA ni se envían datos fuera de este
            dispositivo.
          </p>
        </div>
      </div>
      <div className="analysis-grid">
        {insights.map((insight) => (
          <article
            key={insight.id}
            className={`card analysis-card ${insight.level}`}
          >
            <span className={`analysis-icon ${insight.level}`}>
              {insight.level === "success" ? (
                <CircleCheck size={23} />
              ) : (
                <Lightbulb size={23} />
              )}
            </span>
            <Badge
              tone={
                insight.level === "warning"
                  ? "amber"
                  : insight.level === "success"
                    ? "green"
                    : "blue"
              }
            >
              {insight.level === "warning"
                ? "Requiere atención"
                : insight.level === "success"
                  ? "Buena señal"
                  : "Seguimiento"}
            </Badge>
            <h2>{insight.title}</h2>
            <p>{insight.description}</p>
            <Link to={insight.href} className="link-button">
              Explorar detalle <ArrowRight size={16} />
            </Link>
          </article>
        ))}
      </div>
      <DocumentAssistant />
      <section className="card future-bots">
        <Bot size={30} />
        <div>
          <h2>Asistencia con permisos y revisión</h2>
          <p>
            El análisis local detecta vencimientos y cambios económicos. La
            consulta documental y la lectura de facturas se activan por usuario
            y por empresa. Los modelos no pueden ejecutar acciones ni registrar
            gastos sin revisión.
          </p>
        </div>
        <ShieldCheck size={30} />
      </section>
    </>
  );
}

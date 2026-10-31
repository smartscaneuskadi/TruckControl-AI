import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Gauge,
  MapPin,
  Pencil,
  Truck as TruckIcon,
  UserRound,
} from "lucide-react";
import { useFleet } from "../app/FleetProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import type { Truck } from "../domain/models";
import { truckStatuses } from "../domain/models";
import { filterEntries, summarize } from "../domain/finance";
import {
  date,
  daysUntil,
  money,
  monthLabel,
  number,
  percent,
} from "../lib/format";
import { Badge, Button, Modal } from "./ui";

export function TruckDetail({
  truck,
  onClose,
}: {
  truck: Truck;
  onClose(): void;
}) {
  const { snapshot } = useFleet();
  const { period, edit } = useWorkspace();
  const entries = filterEntries(snapshot.entries, period, truck.id);
  const summary = summarize(entries);
  const driver = snapshot.drivers.find(
    (driver) => driver.id === truck.driverId,
  );
  return (
    <Modal
      title={`Ficha de ${truck.plate}`}
      subtitle={`${truck.brand} ${truck.model} · ${truck.year}`}
      onClose={onClose}
      wide
    >
      <div className="truck-detail-hero">
        <span className="detail-truck-icon">
          <TruckIcon size={48} strokeWidth={1.5} />
        </span>
        <div>
          <span className="eyebrow">VEHÍCULO DE DEMOSTRACIÓN</span>
          <h3>{truck.plate}</h3>
          <Badge
            tone={
              truck.status === "on_route"
                ? "green"
                : truck.status === "maintenance"
                  ? "amber"
                  : "neutral"
            }
          >
            {truckStatuses[truck.status]}
          </Badge>
        </div>
        <Button
          className="push-right"
          variant="secondary"
          icon={Pencil}
          onClick={() => {
            onClose();
            edit({ kind: "truck", value: truck });
          }}
        >
          Editar ficha
        </Button>
      </div>
      <div className="detail-info">
        <div>
          <UserRound size={18} />
          <span>
            Conductor<strong>{driver?.name ?? "Sin asignar"}</strong>
          </span>
        </div>
        <div>
          <Gauge size={18} />
          <span>
            Cuentakilómetros<strong>{number(truck.odometerKm)} km</strong>
          </span>
        </div>
        <div>
          <CalendarDays size={18} />
          <span>
            Próxima ITV
            <strong
              className={
                daysUntil(truck.inspectionDueOn) <= 30 ? "negative" : ""
              }
            >
              {date(truck.inspectionDueOn)}
            </strong>
          </span>
        </div>
        <div>
          <MapPin size={18} />
          <span>
            Ruta actual<strong>{truck.route || "Sin ruta registrada"}</strong>
          </span>
        </div>
      </div>
      <div className="detail-section-heading">
        <h3>Resultado del vehículo</h3>
        <span>{monthLabel(period)}</span>
      </div>
      <div className="detail-metrics">
        <div>
          <span>Ingresos</span>
          <strong>{money(summary.incomeCents, true)}</strong>
        </div>
        <div>
          <span>Gastos</span>
          <strong>{money(summary.expenseCents, true)}</strong>
        </div>
        <div className="detail-profit">
          <span>Beneficio</span>
          <strong className={summary.profitCents < 0 ? "negative" : ""}>
            {money(summary.profitCents, true)}
          </strong>
          <small>Margen {percent(summary.margin)}</small>
        </div>
      </div>
      <div className="detail-section-heading">
        <h3>Últimos movimientos del periodo</h3>
        <span>{entries.length} registros</span>
      </div>
      <div className="detail-transactions">
        {entries
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 5)
          .map((entry) => (
            <div key={entry.id}>
              <span className={`entry-icon ${entry.kind}`}>
                {entry.kind === "income" ? (
                  <ArrowUpRight size={16} />
                ) : (
                  <ArrowDownLeft size={16} />
                )}
              </span>
              <div>
                <strong>{entry.concept}</strong>
                <small>{date(entry.date)}</small>
              </div>
              <strong
                className={`push-right ${entry.kind === "income" ? "positive" : ""}`}
              >
                {entry.kind === "expense" ? "−" : "+"}
                {money(entry.amountCents, true)}
              </strong>
            </div>
          ))}
        {entries.length === 0 && (
          <p className="muted">Sin movimientos en este periodo.</p>
        )}
      </div>
      <div className="modal-actions">
        <span className="muted small-text">
          Importes sin IVA · fecha de devengo
        </span>
        <div className="push-right inline-actions">
          <Button
            variant="secondary"
            icon={ArrowDownLeft}
            onClick={() => {
              onClose();
              edit({ kind: "expense", truckId: truck.id });
            }}
          >
            Registrar gasto
          </Button>
          <Button
            icon={ArrowUpRight}
            onClick={() => {
              onClose();
              edit({ kind: "income", truckId: truck.id });
            }}
          >
            Registrar ingreso
          </Button>
        </div>
      </div>
    </Modal>
  );
}

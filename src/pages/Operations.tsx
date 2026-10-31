import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Check,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { useOperations } from "../app/OperationsProvider";
import { useSubscription } from "../app/SubscriptionContext";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHeading,
  Pagination,
  SearchField,
} from "../components/ui";
import { operationFields, operationFormData } from "../domain/operation-fields";
import type { OperationField } from "../domain/operation-fields";
import {
  fuelConsumption,
  operationLabels,
  operationalAlerts,
  parseOperation,
} from "../domain/operations";
import type { OperationKind, OperationRecord } from "../domain/operations";
import { money, number, today } from "../lib/format";
import { useCurrentDay } from "../lib/use-current-day";
import { exportCsv } from "../lib/export";

const descriptions: Record<OperationKind, string> = {
  trailers: "Capacidad, disponibilidad, seguros e ITV de tus remolques.",
  customers: "Contactos y servicios de tus clientes en un único lugar.",
  trips:
    "Planifica rutas y asigna camión, conductor y remolque sin solapamientos.",
  maintenance:
    "Prevención, averías, talleres y próximas revisiones por fecha o kilometraje.",
  fuel: "Repostajes y consumo real calculado entre depósitos completos.",
  deadlines: "ITV, seguros, permisos y documentos que necesitan seguimiento.",
  alerts: "Los vencimientos de tu flota y los avisos que crea tu equipo.",
};
export function Operations({ kind }: { kind: OperationKind }) {
  const operations = useOperations(),
    fleet = useFleet(),
    subscription = useSubscription();
  const day = useCurrentDay();
  const [alertFilter, setAlertFilter] = useState("all"),
    [alertSearch, setAlertSearch] = useState("");
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [editor, setEditor] = useState<OperationRecord | "new" | null>(null);
  const [confirmation, setConfirmation] = useState<{
      record: OperationRecord;
      action: "delete" | "book";
    } | null>(null),
    [error, setError] = useState("");
  const writable =
    !subscription.enabled || subscription.access?.can_write !== false;
  const rows = operations.rows
    .filter(
      (r) =>
        r.kind === kind &&
        JSON.stringify(r.data).toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      String(
        b.data.date ||
          b.data.startOn ||
          b.data.scheduledOn ||
          b.data.dueOn ||
          "",
      ).localeCompare(
        String(
          a.data.date ||
            a.data.startOn ||
            a.data.scheduledOn ||
            a.data.dueOn ||
            "",
        ),
      ),
    );
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / 12))),
    fields = operationFields[kind]
      .filter((f) => f.key !== "notes")
      .slice(0, kind === "trips" ? 5 : 4);
  function value(row: OperationRecord, f: OperationField): string {
    const v = row.data[f.key];
    if (v === null || v === undefined || v === "") return "—";
    if (f.type === "money") return money(Number(v), true);
    if (f.type === "litres") return `${number(Number(v) / 1000)} l`;
    if (f.type === "truck")
      return fleet.snapshot.trucks.find((t) => t.id === v)?.plate ?? "—";
    if (f.type === "driver")
      return fleet.snapshot.drivers.find((t) => t.id === v)?.name ?? "—";
    if (f.type === "trailer" || f.type === "customer") {
      const linked = operations.rows.find((t) => t.id === v);
      return String(linked?.data.plate || linked?.data.name || "—");
    }
    return f.options?.[String(v)] ?? String(v);
  }
  async function confirm() {
    if (!confirmation) return;
    setError("");
    try {
      if (confirmation.action === "book")
        await operations.book(confirmation.record);
      else
        await operations.execute({
          type: "delete",
          id: confirmation.record.id,
          kind,
          expected: confirmation.record.version,
        });
      setConfirmation(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const alerts =
    kind === "alerts"
      ? operationalAlerts(fleet.snapshot, operations.rows, day).filter(
          (a) => !subscription.enabled || subscription.features[a.source],
        )
      : [];
  const filteredAlerts = alerts.filter(
    (a) =>
      (alertFilter === "all" ||
        (alertFilter === "urgent" ? a.urgent : !a.urgent)) &&
      a.title
        .toLocaleLowerCase("es")
        .includes(alertSearch.toLocaleLowerCase("es")),
  );
  async function acknowledge(alert: (typeof alerts)[number]) {
    try {
      const manual =
        alert.source === "alerts"
          ? operations.rows.find(
              (r) => r.kind === "alerts" && r.id === alert.sourceId,
            )
          : null;
      await operations.execute({
        type: "save",
        expected: manual?.version ?? null,
        value: manual
          ? parseOperation({
              ...manual,
              data: { ...manual.data, status: "acknowledged" },
            })
          : parseOperation({
              id: crypto.randomUUID(),
              kind: "alerts",
              data: {
                title: alert.title,
                dueOn: alert.dueOn,
                truckId: alert.truckId,
                priority: alert.urgent ? "urgent" : "normal",
                status: "acknowledged",
                sourceKey: alert.key,
              },
              version: 1,
              financeEntryId: null,
            }),
      });
      fleet.notify("Aviso marcado como revisado.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="OPERACIONES DE FLOTA"
        title={operationLabels[kind]}
        description={descriptions[kind]}
      >
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={operations.busy}
          onClick={() =>
            void operations.refresh().catch((e) => setError(errorMessage(e)))
          }
        >
          Actualizar
        </Button>
        <Button
          variant="secondary"
          icon={Download}
          disabled={operations.loading || Boolean(operations.error)}
          onClick={() =>
            exportCsv(`truckcontrol-${kind}-${today()}.csv`, [
              operationFields[kind].map((f) => f.label),
              ...rows.map((row) =>
                operationFields[kind].map((f) => value(row, f)),
              ),
            ])
          }
        >
          Exportar
        </Button>
        {writable && (
          <Button
            icon={Plus}
            disabled={operations.loading || Boolean(operations.error)}
            onClick={() => setEditor("new")}
          >
            Añadir registro
          </Button>
        )}
      </PageHeading>
      {(error || operations.error) && (
        <p role="alert" className="form-error">
          {error || operations.error}
        </p>
      )}
      {operations.loading ? (
        <p role="status">Cargando operaciones…</p>
      ) : (
        <>
          {kind === "alerts" && (
            <section
              className="card operations-alerts"
              aria-label="Vencimientos y seguimiento"
            >
              <div className="section-heading">
                <h2>Requieren seguimiento</h2>
                <Badge tone={alerts.length ? "amber" : "green"}>
                  {filteredAlerts.length} de {alerts.length} avisos
                </Badge>
              </div>
              <div className="alert-filters">
                <Field label="Mostrar avisos">
                  <select
                    value={alertFilter}
                    onChange={(e) => setAlertFilter(e.target.value)}
                  >
                    <option value="all">Todos los pendientes</option>
                    <option value="urgent">Urgentes y vencidos</option>
                    <option value="upcoming">Próximos vencimientos</option>
                  </select>
                </Field>
                <SearchField
                  label="Buscar avisos por nombre o matrícula"
                  value={alertSearch}
                  onChange={setAlertSearch}
                />
              </div>
              <p className="muted">
                Calculados con las fichas y operaciones autorizadas. Marcar como
                revisado conserva el historial; no renueva permisos ni completa
                trabajos.
              </p>
              {!alerts.length ? (
                <p>No hay vencimientos próximos pendientes de revisión.</p>
              ) : !filteredAlerts.length ? (
                <p>No hay avisos que coincidan con estos filtros.</p>
              ) : (
                filteredAlerts.map((alert) => (
                  <div className="operation-alert" key={alert.key}>
                    <Bell size={18} />
                    <div>
                      <strong>{alert.title}</strong>
                      <span>
                        {alert.reason === "kilometres"
                          ? `${number(alert.currentKm!)} km · revisión desde ${number(alert.thresholdKm!)} km`
                          : `${alert.dueOn} · ${alert.dueOn < day ? "Vencido" : alert.dueOn === day ? "Vence hoy" : "Próximo vencimiento"}`}
                      </span>
                      <Badge tone={alert.urgent ? "red" : "blue"}>
                        {alert.urgent ? "Urgente" : "Seguimiento"}
                      </Badge>
                      <Link to={`/${alert.source}`}>
                        Ver{" "}
                        {alert.source === "trucks"
                          ? "camiones"
                          : alert.source === "drivers"
                            ? "conductores"
                            : operationLabels[alert.source].toLocaleLowerCase(
                                "es",
                              )}
                      </Link>
                    </div>
                    {writable && (
                      <Button
                        variant="secondary"
                        icon={Check}
                        disabled={operations.busy}
                        onClick={() => void acknowledge(alert)}
                      >
                        Revisado
                      </Button>
                    )}
                  </div>
                ))
              )}
            </section>
          )}
          {kind === "fuel" && (
            <section
              className="card operations-summary"
              aria-label="Consumo por camión"
            >
              <h2>Consumo de combustible</h2>
              {fleet.snapshot.trucks
                .filter((t) =>
                  operations.rows.some(
                    (r) => r.kind === "fuel" && r.data.truckId === t.id,
                  ),
                )
                .map((t) => {
                  const result = fuelConsumption(operations.rows, t.id);
                  return (
                    <p key={t.id}>
                      <strong>{t.plate}</strong> ·{" "}
                      {result
                        ? `${number(result.litresPer100Km)} l/100 km en ${number(result.kilometres)} km`
                        : "Necesita dos repostajes con depósito lleno para calcular el consumo."}
                    </p>
                  );
                })}
              {!rows.length && (
                <p>
                  Registra litros y kilometraje en cada repostaje. Los llenados
                  parciales también se incluyen.
                </p>
              )}
            </section>
          )}
          <section className="card operation-register">
            <div className="table-toolbar">
              <div>
                <h2>
                  {kind === "alerts"
                    ? "Registro de avisos"
                    : operationLabels[kind]}
                </h2>
                <span className="muted">
                  {rows.length} registros ·{" "}
                  {writable ? "Edición habilitada" : "Acceso de consulta"}
                </span>
              </div>
              <SearchField
                label={`Buscar ${operationLabels[kind].toLowerCase()}`}
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
              />
            </div>
            {!rows.length ? (
              <Empty title="Todavía no hay registros">
                Añade datos de esta empresa o ajusta la búsqueda.
              </Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {fields.map((f) => (
                        <th key={f.key} scope="col">
                          {f.label}
                        </th>
                      ))}
                      <th scope="col">Estado</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice((actual - 1) * 12, actual * 12).map((row) => (
                      <tr key={row.id}>
                        {fields.map((f) => (
                          <td key={f.key}>{value(row, f)}</td>
                        ))}
                        <td>
                          <Badge
                            tone={row.financeEntryId ? "green" : "neutral"}
                          >
                            {row.financeEntryId
                              ? "Contabilizado"
                              : String(
                                  operationFields[kind].find(
                                    (f) => f.key === "status",
                                  )?.options?.[String(row.data.status)] ??
                                    "Registrado",
                                )}
                          </Badge>
                        </td>
                        <td>
                          <div className="operation-actions">
                            <Button
                              variant="ghost"
                              icon={Pencil}
                              onClick={() => setEditor(row)}
                            >
                              {writable && !row.financeEntryId
                                ? "Editar"
                                : "Ver ficha"}
                            </Button>
                            {writable &&
                              !row.financeEntryId &&
                              ["trips", "maintenance", "fuel"].includes(kind) &&
                              Number(row.data.amountCents) > 0 &&
                              (kind === "fuel" ||
                                row.data.status === "completed") && (
                                <Button
                                  variant="secondary"
                                  icon={Wallet}
                                  onClick={() =>
                                    setConfirmation({
                                      record: row,
                                      action: "book",
                                    })
                                  }
                                >
                                  Contabilizar
                                </Button>
                              )}
                            {writable && !row.financeEntryId && (
                              <Button
                                variant="ghost"
                                icon={Trash2}
                                aria-label={`Eliminar ${String(row.data.reference || row.data.plate || row.data.name || row.data.title || row.data.description || row.data.station)}`}
                                onClick={() =>
                                  setConfirmation({
                                    record: row,
                                    action: "delete",
                                  })
                                }
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              total={rows.length}
              page={actual}
              pageSize={12}
              onChange={setPage}
            />
          </section>
        </>
      )}
      {editor && (
        <OperationEditor
          kind={kind}
          record={editor === "new" ? null : editor}
          readOnly={
            !writable || (editor !== "new" && Boolean(editor.financeEntryId))
          }
          onClose={() => setEditor(null)}
        />
      )}
      {confirmation && (
        <Modal
          title={
            confirmation.action === "book"
              ? "Registrar en contabilidad"
              : "Eliminar registro"
          }
          onClose={() => !operations.busy && setConfirmation(null)}
        >
          <p>
            {confirmation.action === "book"
              ? `Se registrará ${money(Number(confirmation.record.data.amountCents), true)} sin IVA en ${kind === "trips" ? "ingresos" : "gastos"}. Se conservará el documento original y se evitarán duplicados al reintentar.`
              : "El registro se eliminará si no está vinculado a otros datos. Revisa la selección antes de continuar."}
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={operations.busy}
              onClick={() => setConfirmation(null)}
            >
              Cancelar
            </Button>
            <Button
              variant={confirmation.action === "delete" ? "danger" : "primary"}
              disabled={operations.busy}
              onClick={() => void confirm()}
            >
              {operations.busy ? "Guardando…" : "Confirmar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function OperationEditor({
  kind,
  record,
  readOnly,
  onClose,
}: {
  kind: OperationKind;
  record: OperationRecord | null;
  readOnly: boolean;
  onClose(): void;
}) {
  const operations = useOperations(),
    { snapshot, notify } = useFleet();
  const [error, setError] = useState(""),
    [id] = useState(() => record?.id ?? crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || operations.busy) return;
    setError("");
    try {
      const data = operationFormData(kind, new FormData(event.currentTarget));
      if (record?.data.sourceKey) data.sourceKey = record.data.sourceKey;
      const value = parseOperation({
        id,
        kind,
        data,
        version: record?.version ?? 1,
        financeEntryId: record?.financeEntryId ?? null,
      });
      await operations.execute({
        type: "save",
        value,
        expected: record?.version ?? null,
      });
      notify("Registro guardado.");
      onClose();
    } catch (e) {
      setError(
        e instanceof Error && e.name === "ZodError"
          ? "Revisa los campos, las fechas y los importes del formulario."
          : errorMessage(e),
      );
    }
  }
  return (
    <Modal
      wide
      title={`${record ? "Ficha" : "Nuevo registro"} · ${operationLabels[kind]}`}
      subtitle={
        record?.financeEntryId
          ? "Registro contabilizado · conserva su historial"
          : "Datos del espacio de trabajo seleccionado"
      }
      onClose={() => !operations.busy && onClose()}
    >
      <form onSubmit={submit}>
        <fieldset
          className="operation-fieldset"
          disabled={readOnly || operations.busy}
        >
          <div className="form-grid">
            {operationFields[kind].map((f) => {
              let value =
                record?.data[f.key] ??
                f.default ??
                (f.type === "date" && f.required ? today() : "");
              if (f.type === "money" && value !== "")
                value = Number(value) / 100;
              if (f.type === "litres" && value !== "")
                value = Number(value) / 1000;
              const choices =
                f.options ??
                (f.type === "truck"
                  ? Object.fromEntries(
                      snapshot.trucks.map((t) => [t.id, t.plate]),
                    )
                  : f.type === "driver"
                    ? Object.fromEntries(
                        snapshot.drivers.map((t) => [t.id, t.name]),
                      )
                    : f.type === "trailer" || f.type === "customer"
                      ? Object.fromEntries(
                          operations.rows
                            .filter(
                              (r) =>
                                r.kind ===
                                (f.type === "trailer"
                                  ? "trailers"
                                  : "customers"),
                            )
                            .map((r) => [
                              r.id,
                              String(r.data.plate || r.data.name),
                            ]),
                        )
                      : null);
              return (
                <Field label={f.label} key={f.key} full={f.key === "notes"}>
                  {choices ? (
                    <select
                      name={f.key}
                      required={f.required}
                      defaultValue={String(
                        value ||
                          (Object.keys(choices)[0] &&
                            f.options &&
                            Object.keys(choices)[0]) ||
                          "",
                      )}
                    >
                      {!f.options && (
                        <option value="">
                          {f.required ? "Selecciona una opción" : "Sin asignar"}
                        </option>
                      )}
                      {Object.entries(choices).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      name={f.key}
                      defaultChecked={Boolean(value)}
                    />
                  ) : (
                    <input
                      name={f.key}
                      type={
                        f.type === "money" || f.type === "litres"
                          ? "number"
                          : (f.type ?? "text")
                      }
                      step={
                        f.type === "money"
                          ? "0.01"
                          : f.type === "litres"
                            ? "0.001"
                            : f.type === "number"
                              ? "1"
                              : undefined
                      }
                      min={
                        ["number", "money", "litres"].includes(f.type ?? "")
                          ? 0
                          : undefined
                      }
                      required={f.required}
                      maxLength={f.key === "notes" ? 500 : 254}
                      defaultValue={String(value ?? "")}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button
            variant="secondary"
            disabled={operations.busy}
            onClick={onClose}
          >
            Cerrar
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={operations.busy}>
              {operations.busy ? "Guardando…" : "Guardar registro"}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

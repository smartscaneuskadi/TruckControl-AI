import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  RefreshCw,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
} from "lucide-react";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { useCompany } from "../app/CompanyAccess";
import { useSubscription } from "../app/SubscriptionContext";
import { useOperations } from "../app/OperationsProvider";
import { useOffline } from "../app/OfflineContext";
import { Button, Badge, Field, Metric, Modal } from "./ui";
import type { TripFinance } from "../domain/commercial-records";
import type { OperationRecord } from "../domain/operations";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  tripFinance,
  tripCandidates,
} from "../integrations/supabase/commercial-records";
import { demoTripFinance, demoTripCandidates } from "../data/trip-finance-demo";
import { exportCsv } from "../lib/export";
import { money } from "../lib/format";
type Row = TripFinance["rows"][number];
type Confirmation =
  { action: "link" | "unlink"; row: Row } | { action: "review" };
export function TripFinanceDialog({
  trip,
  close,
}: {
  trip: OperationRecord;
  close(): void;
}) {
  const company = useCompany(),
    fleet = useFleet(),
    operations = useOperations(),
    subscription = useSubscription(),
    offline = useOffline();
  const cloud = company.mode === "company",
    org = fleet.snapshot.organization.id;
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const allowed =
    !(cloud && (!online || offline.offline)) &&
    (!subscription.enabled ||
      (subscription.features.trips &&
        subscription.features.profitability &&
        (subscription.features.income || subscription.features.expenses)));
  const writable =
    allowed &&
    (!subscription.enabled || subscription.access?.can_write === true);
  const key = `${cloud}:${company.user?.id ?? "demo"}:${org}:${trip.id}:${allowed}:${subscription.features.income}:${subscription.features.expenses}`;
  const current = useRef(key);
  current.current = key;
  const latest = useRef({ fleet: fleet.snapshot, rows: operations.rows });
  latest.current = { fleet: fleet.snapshot, rows: operations.rows };
  const sequence = useRef(0),
    locked = useRef(false);
  const [state, setState] = useState({
    key,
    summary: null as TripFinance | null,
    candidates: [] as Row[],
    after: null as string | null,
    loading: true,
    error: "",
  });
  const [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const refresh = useCallback(
    async (after: string | null = null) => {
      const n = ++sequence.current;
      setConfirmation(null);
      setSelected("");
      setState({
        key,
        summary: null,
        candidates: [],
        after,
        loading: allowed,
        error: "",
      });
      if (!allowed) return;
      try {
        const client = getSupabaseClient();
        if (cloud && !client)
          throw Error("La conexión de empresa no está disponible.");
        const [summary, candidates] =
          cloud && client
            ? await Promise.all([
                tripFinance(client, org, trip.id),
                tripCandidates(client, org, trip.id, after),
              ])
            : await Promise.all([
                demoTripFinance(
                  latest.current.fleet,
                  latest.current.rows,
                  trip.id,
                ),
                Promise.resolve(
                  demoTripCandidates(
                    latest.current.fleet,
                    latest.current.rows,
                    trip.id,
                  )
                    .filter((r) => !after || r.id > after)
                    .slice(0, 200),
                ),
              ]);
        if (current.current === key && n === sequence.current)
          setState({
            key,
            summary,
            candidates,
            after,
            loading: false,
            error: "",
          });
      } catch (e) {
        if (current.current === key && n === sequence.current)
          setState({
            key,
            summary: null,
            candidates: [],
            after,
            loading: false,
            error: errorMessage(e),
          });
      }
    },
    [allowed, cloud, org, trip.id, key],
  );
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  const visible =
    state.key === key && allowed
      ? state
      : {
          summary: null,
          candidates: [] as Row[],
          after: null,
          loading: allowed,
          error: "",
        };
  const s = visible.summary;
  async function confirm() {
    if (
      !confirmation ||
      !s ||
      !writable ||
      locked.current ||
      (cloud && !navigator.onLine)
    )
      return;
    const request = confirmation,
      fingerprint = s.fingerprint;
    locked.current = true;
    setBusy(true);
    setConfirmation(null);
    try {
      const client = getSupabaseClient();
      if (cloud && !client)
        throw Error("La conexión de empresa no está disponible.");
      const data =
        request.action === "review"
          ? { expected_fingerprint: fingerprint }
          : {
              entry_id: request.row.id,
              expected_entry_version: request.row.row_version,
            };
      if (cloud && client)
        await tripFinance(client, org, trip.id, request.action, data);
      else
        await demoTripFinance(
          latest.current.fleet,
          latest.current.rows,
          trip.id,
          request.action,
          request.action === "review"
            ? { expected_fingerprint: fingerprint ?? "" }
            : { entry_id: request.row.id },
        );
      if (current.current === key) await refresh();
    } catch (e) {
      if (current.current === key)
        setState({
          key,
          summary: null,
          candidates: [],
          after: null,
          loading: false,
          error: errorMessage(e),
        });
    } finally {
      locked.current = false;
      if (current.current === key) setBusy(false);
    }
  }
  const price = (v: number | null) =>
    v === null ? "Sin permiso" : money(v, true);
  return (
    <Modal
      wide
      title="Rentabilidad del viaje"
      subtitle={String(trip.data.reference)}
      onClose={() => {
        if (!busy) close();
      }}
    >
      <p>
        Se suman únicamente los movimientos vinculados. El presupuesto del viaje
        no se cuenta como ingreso hasta contabilizarlo. Los costes generales,
        impuestos y gastos sin asignar quedan fuera.
      </p>
      {!cloud && (
        <p className="muted">
          Demostración con datos ficticios. Los vínculos y revisiones se
          conservan solo durante esta sesión de la página.
        </p>
      )}
      {!allowed && (
        <p role="status" className="form-error">
          Conecta a internet y comprueba tus permisos para consultar la
          rentabilidad del viaje.
        </p>
      )}
      {visible.error && (
        <p role="alert" className="form-error">
          {visible.error} Actualiza antes de repetir una operación.
        </p>
      )}
      <div className="operation-actions trip-finance-actions">
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={!allowed || busy || visible.loading}
          onClick={() => void refresh()}
        >
          Actualizar rentabilidad
        </Button>
        <Button
          variant="secondary"
          icon={Download}
          disabled={!s || busy || visible.loading}
          onClick={() =>
            s &&
            exportCsv("truckcontrol-rentabilidad-viaje.csv", [
              ["Viaje", String(trip.data.reference)],
              ["Presupuesto sin contabilizar", s.quoted_net_cents / 100],
              [
                "Ingresos vinculados EUR",
                s.income_cents === null ? "Sin permiso" : s.income_cents / 100,
              ],
              [
                "Gastos vinculados EUR",
                s.expense_cents === null
                  ? "Sin permiso"
                  : s.expense_cents / 100,
              ],
              [
                "Margen de movimientos EUR",
                s.recorded_margin_cents === null
                  ? "Sin permiso"
                  : s.recorded_margin_cents / 100,
              ],
              ["Revisión", s.reviewed ? "Revisado" : "Pendiente"],
              [
                "Alcance",
                "Solo apuntes vinculados; no incluye costes generales, impuestos ni gastos sin asignar.",
              ],
              [],
              ["Fecha", "Tipo", "Concepto", "EUR", "Estado", "Origen"],
              ...s.rows.map((r) => [
                r.date,
                r.kind === "income" ? "Ingreso" : "Gasto",
                r.concept,
                r.amount_cents / 100,
                r.payment_status === "paid" ? "Pagado" : "Pendiente",
                r.auto_booked ? "Contabilizado desde viaje" : "Vinculado",
              ]),
              ...(s.rows_partial
                ? [
                    [
                      "Listado parcial: los totales incluyen todos los vínculos; la tabla muestra los primeros 2.000.",
                    ],
                  ]
                : []),
            ])
          }
        >
          Exportar viaje
        </Button>
      </div>
      {visible.loading && (
        <p role="status">Consultando movimientos autorizados…</p>
      )}
      {s && (
        <>
          <div className="tyre-metrics">
            <Metric
              label="Presupuesto del viaje"
              value={money(s.quoted_net_cents, true)}
              subtitle="No equivale a ingreso contabilizado"
              icon={FileText}
            />
            <Metric
              label="Ingresos vinculados"
              value={price(s.income_cents)}
              subtitle="Apuntes registrados, pagados o pendientes"
              icon={ArrowUpRight}
            />
            <Metric
              label="Gastos vinculados"
              value={price(s.expense_cents)}
              subtitle="Apuntes registrados, pagados o pendientes"
              icon={ArrowDownLeft}
            />
            <Metric
              label="Margen de movimientos"
              value={price(s.recorded_margin_cents)}
              subtitle={
                s.reviewed
                  ? "Movimientos revisados por tu equipo"
                  : "Pendiente de revisar costes"
              }
              icon={Wallet}
            />
          </div>
          <p>
            <Badge tone={s.reviewed ? "green" : "amber"}>
              {s.reviewed
                ? "Movimientos revisados por tu equipo"
                : "Pendiente de revisión"}
            </Badge>{" "}
            La revisión deja de estar vigente si cambian el viaje o los apuntes.
            No certifica beneficio neto ni sustituye a tu contabilidad.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Movimiento</th>
                  <th scope="col">Importe</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>
                      {r.kind === "income" ? "Ingreso" : "Gasto"} · {r.concept}
                      <br />
                      <span className="muted">
                        {r.payment_status === "paid"
                          ? "Pagado"
                          : "Pendiente de cobro/pago"}
                      </span>
                    </td>
                    <td>{money(r.amount_cents, true)}</td>
                    <td>
                      {r.auto_booked
                        ? "Contabilizado desde este viaje"
                        : writable && (
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                setConfirmation({ action: "unlink", row: r })
                              }
                            >
                              Desvincular
                            </Button>
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!s.rows.length && (
            <p>Este viaje todavía no tiene movimientos vinculados.</p>
          )}
          {s.rows_partial && (
            <p role="status">
              Mostrando los primeros 2.000 movimientos. Los totales incluyen
              todos los vínculos.
            </p>
          )}
          {writable && (
            <>
              <Field label="Movimiento existente del mismo camión">
                <select
                  value={selected}
                  disabled={busy}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Selecciona un movimiento</option>
                  {visible.candidates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.date} · {r.kind === "income" ? "Ingreso" : "Gasto"} ·{" "}
                      {r.concept} · {money(r.amount_cents, true)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="operation-actions trip-finance-actions">
                <Button
                  disabled={!selected || busy}
                  onClick={() => {
                    const row = visible.candidates.find(
                      (r) => r.id === selected,
                    );
                    if (row) setConfirmation({ action: "link", row });
                  }}
                >
                  Vincular movimiento
                </Button>
                {visible.after && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void refresh()}
                  >
                    Primera página de movimientos
                  </Button>
                )}
                {visible.candidates.length === 200 && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void refresh(visible.candidates.at(-1)!.id)}
                  >
                    Más movimientos disponibles
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={
                    !s.can_review || s.reviewed || !s.fingerprint || busy
                  }
                  onClick={() => setConfirmation({ action: "review" })}
                >
                  Marcar movimientos como revisados
                </Button>
              </div>
            </>
          )}
          {confirmation && (
            <section className="card" aria-label="Confirmación económica">
              <p>
                {confirmation.action === "review"
                  ? "Confirma que has revisado los ingresos y gastos vinculados de este viaje cerrado. Los costes sin asignar seguirán fuera del resultado."
                  : `${confirmation.action === "link" ? "Vincular" : "Desvincular"} «${confirmation.row.concept}», ${money(confirmation.row.amount_cents, true)}. El apunte contable conserva su importe; solo cambia su asociación con el viaje.`}
              </p>
              <div className="operation-actions trip-finance-actions">
                <Button disabled={busy} onClick={() => void confirm()}>
                  Confirmar{" "}
                  {confirmation.action === "review"
                    ? "revisión"
                    : confirmation.action === "link"
                      ? "vínculo"
                      : "desvinculación"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setConfirmation(null)}
                >
                  Cancelar operación
                </Button>
              </div>
            </section>
          )}
        </>
      )}
    </Modal>
  );
}

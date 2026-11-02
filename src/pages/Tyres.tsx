import { useState } from "react";
import type { FormEvent } from "react";
import {
  CircleDot,
  Download,
  History,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { useTyres } from "../app/TyresProvider";
import { useSubscription } from "../app/SubscriptionContext";
import { useCurrentDay } from "../lib/use-current-day";
import {
  Badge,
  Button,
  Empty,
  Field,
  Metric,
  Modal,
  PageHeading,
  Pagination,
  SearchField,
} from "../components/ui";
import {
  tyreDataSchema,
  emptyTyreData,
  tyreStatusLabels,
  tyreWarnings,
} from "../domain/tyres";
import type { TyreData, TyreRecord, TyreHistory } from "../domain/tyres";
import { exportCsv } from "../lib/export";
import { date, number } from "../lib/format";

const scaled = (value: number | null, factor: number) =>
  value === null ? "—" : number(value / factor);
export function Tyres() {
  const register = useTyres(),
    fleet = useFleet(),
    subscription = useSubscription(),
    day = useCurrentDay();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [truck, setTruck] = useState(""),
    [page, setPage] = useState(1);
  const [editor, setEditor] = useState<TyreRecord | "new" | null>(null),
    [history, setHistory] = useState<{
      row: TyreRecord;
      rows: TyreHistory[];
      loading: boolean;
      error: string;
    } | null>(null),
    [historyPage, setHistoryPage] = useState(1);
  const writable =
    (!subscription.enabled || subscription.access?.can_write === true) &&
    !register.onlineRequired;
  const query = search.trim().toLocaleLowerCase("es");
  const rows = register.rows
    .filter(
      (r) =>
        (status === "all" ||
          (status === "warnings"
            ? tyreWarnings(r, day).length > 0
            : r.data.status === status)) &&
        (!truck || r.data.truckId === truck) &&
        `${r.data.code} ${r.data.brand} ${r.data.model} ${r.data.size} ${r.data.position} ${fleet.snapshot.trucks.find((t) => t.id === r.data.truckId)?.plate ?? ""}`
          .toLocaleLowerCase("es")
          .includes(query),
    )
    .sort((a, b) => a.data.code.localeCompare(b.data.code, "es"));
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  const count = (test: (r: TyreRecord) => boolean) =>
    register.loading || register.error || register.onlineRequired
      ? "—"
      : String(register.rows.filter(test).length);
  const plate = (id: string | null) =>
    id
      ? (fleet.snapshot.trucks.find((t) => t.id === id)?.plate ??
        "Camión vinculado")
      : "—";
  function csv(
    values: { data: TyreData; version: number; at: string }[],
    name: string,
  ) {
    exportCsv(name, [
      [
        "Código",
        "Estado",
        "Camión",
        "Posición",
        "Marca",
        "Modelo",
        "Medida",
        "Montaje",
        "Km montaje",
        "Medición",
        "Dibujo mm",
        "Presión bar",
        "Umbral dibujo mm",
        "Presión mínima bar",
        "Presión máxima bar",
        "Próxima revisión",
        "Versión",
        "Fecha registro",
        "Notas",
      ],
      ...values.map(({ data: d, version, at }) => [
        d.code,
        tyreStatusLabels[d.status],
        plate(d.truckId),
        d.position,
        d.brand,
        d.model,
        d.size,
        d.installedOn ?? "",
        d.installedKm ?? "",
        d.measuredOn ?? "",
        d.treadTenthsMm === null ? "" : d.treadTenthsMm / 10,
        d.pressureKpa === null ? "" : d.pressureKpa / 100,
        d.minTreadTenthsMm === null ? "" : d.minTreadTenthsMm / 10,
        d.minPressureKpa === null ? "" : d.minPressureKpa / 100,
        d.maxPressureKpa === null ? "" : d.maxPressureKpa / 100,
        d.nextCheckOn ?? "",
        version,
        at,
        d.notes,
      ]),
    ]);
  }
  async function showHistory(row: TyreRecord) {
    setHistoryPage(1);
    setHistory({ row, rows: [], loading: true, error: "" });
    try {
      const rows = await register.history(row.id);
      setHistory((h) =>
        h?.row.id === row.id ? { row, rows, loading: false, error: "" } : h,
      );
    } catch (e) {
      setHistory((h) =>
        h?.row.id === row.id
          ? { row, rows: [], loading: false, error: errorMessage(e) }
          : h,
      );
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MANTENIMIENTO DE FLOTA"
        title="Neumáticos"
        description="Montajes, almacén y revisiones con las mediciones que registra tu equipo."
      >
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={
            register.busy || register.loading || register.onlineRequired
          }
          onClick={() => void register.refresh()}
        >
          Actualizar neumáticos
        </Button>
        <Button
          variant="secondary"
          icon={Download}
          disabled={register.loading || Boolean(register.error) || !rows.length}
          onClick={() =>
            csv(
              rows.map((r) => ({
                data: r.data,
                version: r.version,
                at: r.updatedAt,
              })),
              "truckcontrol-neumaticos.csv",
            )
          }
        >
          Exportar neumáticos
        </Button>
        {writable && (
          <Button
            icon={Plus}
            disabled={
              register.loading || register.busy || Boolean(register.error)
            }
            onClick={() => setEditor("new")}
          >
            Añadir neumático
          </Button>
        )}
      </PageHeading>
      <p className="muted">
        Presión y dibujo son mediciones manuales con fecha. Los umbrales los
        define tu empresa según el fabricante y su revisión técnica; no son una
        certificación de seguridad ni datos de sensores.
      </p>
      {register.onlineRequired && (
        <p role="status" className="form-error">
          Conecta a internet para consultar o modificar los neumáticos de
          empresa. Este registro no se incluye en la cola offline.
        </p>
      )}
      {register.error && (
        <p role="alert" className="form-error">
          {register.error}
        </p>
      )}
      <div className="tyre-metrics" aria-label="Resumen de neumáticos">
        <Metric
          label="Montados"
          value={count((r) => r.data.status === "mounted")}
          subtitle="Posiciones registradas"
          icon={CircleDot}
        />
        <Metric
          label="En almacén"
          value={count((r) => r.data.status === "stock")}
          subtitle="Cubiertas sin montar"
          icon={CircleDot}
        />
        <Metric
          label="Con avisos configurados"
          value={count((r) => tyreWarnings(r, day).length > 0)}
          subtitle="Según tus registros y umbrales"
          icon={CircleDot}
        />
        <Metric
          label="Retirados"
          value={count((r) => r.data.status === "retired")}
          subtitle="Con historial conservado"
          icon={History}
        />
      </div>
      <section
        className="card tyre-register"
        aria-label="Registro de neumáticos"
      >
        <div className="list-toolbar tyre-toolbar">
          <SearchField
            label="Buscar neumáticos"
            placeholder="Código, matrícula o marca…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <div className="inline-actions">
            <select
              aria-label="Filtrar estado de neumáticos"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todos los estados</option>
              <option value="mounted">Montados</option>
              <option value="stock">En almacén</option>
              <option value="retired">Retirados</option>
              <option value="warnings">Con avisos</option>
            </select>
            <select
              aria-label="Filtrar neumáticos por camión"
              value={truck}
              onChange={(e) => {
                setTruck(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los camiones</option>
              {fleet.snapshot.trucks.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.plate}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="tyre-register-body">
          {register.loading ? (
            <p role="status">Cargando neumáticos…</p>
          ) : !rows.length ? (
            <Empty title="No hay neumáticos en este filtro">
              Registra una cubierta o cambia los filtros para consultar tus
              datos.
            </Empty>
          ) : (
            <div className="document-grid">
              {rows.slice((actual - 1) * 12, actual * 12).map((row) => {
                const d = row.data,
                  warnings = tyreWarnings(row, day);
                return (
                  <article className="card tyre-card" key={row.id}>
                    <Badge
                      tone={
                        d.status === "retired"
                          ? "neutral"
                          : d.status === "stock"
                            ? "blue"
                            : "green"
                      }
                    >
                      {tyreStatusLabels[d.status]}
                    </Badge>
                    <CircleDot size={26} aria-hidden="true" />
                    <h2>{d.code}</h2>
                    <p>
                      {[d.brand, d.model, d.size].filter(Boolean).join(" · ") ||
                        "Sin marca o medida registradas"}
                    </p>
                    <p>
                      <strong>{plate(d.truckId)}</strong>
                      {d.position && ` · ${d.position}`}
                    </p>
                    <dl className="tyre-readings">
                      <div>
                        <dt>Dibujo</dt>
                        <dd>
                          {scaled(d.treadTenthsMm, 10)}
                          {d.treadTenthsMm !== null && " mm"}
                        </dd>
                      </div>
                      <div>
                        <dt>Presión</dt>
                        <dd>
                          {scaled(d.pressureKpa, 100)}
                          {d.pressureKpa !== null && " bar"}
                        </dd>
                      </div>
                      <div>
                        <dt>Medición</dt>
                        <dd>{d.measuredOn ? date(d.measuredOn) : "—"}</dd>
                      </div>
                    </dl>
                    <p>
                      Próxima revisión:{" "}
                      {d.nextCheckOn ? date(d.nextCheckOn) : "Sin programar"}
                    </p>
                    {warnings.map((w) => (
                      <p className="invoice-review-note" key={w.reason}>
                        {w.title} · {date(w.dueOn)}
                      </p>
                    ))}
                    <div className="inline-actions">
                      {writable && (
                        <Button
                          variant="secondary"
                          icon={Pencil}
                          disabled={register.busy}
                          onClick={() => setEditor(row)}
                        >
                          Editar neumático
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        icon={History}
                        onClick={() => void showHistory(row)}
                      >
                        Ver historial
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        <Pagination
          page={actual}
          total={rows.length}
          pageSize={12}
          onChange={setPage}
        />
      </section>
      {editor && (
        <TyreEditor
          key={editor === "new" ? "new" : editor.id}
          row={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            fleet.notify("Neumático guardado con su historial.");
          }}
        />
      )}
      {history && (
        <Modal
          title={`Historial de ${history.row.data.code}`}
          onClose={() => setHistory(null)}
        >
          <p>
            Cada revisión conserva sus datos anteriores. Retirar un neumático
            conserva su ficha e historial.
          </p>
          {history.loading ? (
            <p role="status">Cargando historial…</p>
          ) : history.error ? (
            <p role="alert" className="form-error">
              {history.error}
            </p>
          ) : (
            <>
              <Button
                variant="secondary"
                icon={Download}
                disabled={!history.rows.length}
                onClick={() =>
                  csv(
                    history.rows.map((h) => ({
                      data: h.data,
                      version: h.version,
                      at: h.changedAt,
                    })),
                    "truckcontrol-historial-neumatico.csv",
                  )
                }
              >
                Exportar historial
              </Button>
              <ol className="tyre-history">
                {history.rows
                  .slice((historyPage - 1) * 10, historyPage * 10)
                  .map((h) => (
                    <li key={h.id}>
                      <strong>
                        Versión {h.version} · {tyreStatusLabels[h.data.status]}
                      </strong>
                      <p>
                        {new Date(h.changedAt).toLocaleString("es-ES")} ·{" "}
                        {plate(h.data.truckId)} {h.data.position}
                      </p>
                      <p>
                        Dibujo: {scaled(h.data.treadTenthsMm, 10)} mm · Presión:{" "}
                        {scaled(h.data.pressureKpa, 100)} bar · Medición:{" "}
                        {h.data.measuredOn ? date(h.data.measuredOn) : "—"}
                      </p>
                    </li>
                  ))}
              </ol>
              <Pagination
                page={historyPage}
                total={history.rows.length}
                pageSize={10}
                onChange={setHistoryPage}
              />
            </>
          )}
        </Modal>
      )}
    </>
  );
}
function TyreEditor({
  row,
  onClose,
  onSaved,
}: {
  row: TyreRecord | null;
  onClose(): void;
  onSaved(): void;
}) {
  const fleet = useFleet(),
    register = useTyres(),
    day = useCurrentDay();
  const [id] = useState(() => row?.id ?? crypto.randomUUID()),
    [status, setStatus] = useState<TyreData["status"]>(
      row?.data.status ?? "stock",
    ),
    [error, setError] = useState("");
  const d = row?.data ?? emptyTyreData;
  function decimal(raw: FormDataEntryValue | null, digits: number) {
    const value = String(raw ?? "").trim();
    if (!value) return null;
    if (!new RegExp(`^\\d+(?:[.,]\\d{1,${digits}})?$`).test(value))
      throw Error(`Usa hasta ${digits} decimales en las mediciones.`);
    const [whole, fraction = ""] = value.replace(",", ".").split(".");
    return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const text = (k: string) => String(form.get(k) ?? ""),
        nullable = (k: string) => text(k) || null;
      const data = tyreDataSchema.parse({
        code: text("code"),
        status,
        truckId: status === "mounted" ? nullable("truckId") : null,
        position: status === "mounted" ? text("position") : "",
        brand: text("brand"),
        model: text("model"),
        size: text("size"),
        installedOn: nullable("installedOn"),
        installedKm:
          nullable("installedKm") === null ? null : Number(text("installedKm")),
        measuredOn: nullable("measuredOn"),
        treadTenthsMm: decimal(form.get("treadTenthsMm"), 1),
        pressureKpa: decimal(form.get("pressureKpa"), 2),
        minTreadTenthsMm: decimal(form.get("minTreadTenthsMm"), 1),
        minPressureKpa: decimal(form.get("minPressureKpa"), 2),
        maxPressureKpa: decimal(form.get("maxPressureKpa"), 2),
        nextCheckOn: nullable("nextCheckOn"),
        notes: text("notes"),
      });
      if (
        (data.measuredOn && data.measuredOn > day) ||
        (data.installedOn && data.installedOn > day)
      )
        throw Error("No registres una medición o montaje con fecha futura.");
      await register.save(id, data, row?.version ?? null);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      title={row ? "Editar neumático" : "Añadir neumático"}
      onClose={() => {
        if (!register.busy) onClose();
      }}
    >
      <form className="form-grid tyre-editor" onSubmit={submit}>
        <Field label="Código o número de serie">
          <input
            name="code"
            defaultValue={d.code}
            required
            maxLength={60}
            autoComplete="off"
          />
        </Field>
        <Field label="Estado del neumático">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TyreData["status"])}
          >
            {Object.entries(tyreStatusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {status === "mounted" && (
          <>
            <Field label="Camión del montaje">
              <select name="truckId" defaultValue={d.truckId ?? ""} required>
                <option value="">Selecciona un camión</option>
                {fleet.snapshot.trucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.plate}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Posición del neumático">
              <input
                name="position"
                defaultValue={d.position}
                placeholder="Eje 1 · izquierda"
                required
                maxLength={40}
              />
            </Field>
          </>
        )}
        {(
          [
            ["brand", "Marca", 80],
            ["model", "Modelo", 80],
            ["size", "Medida", 40],
          ] as const
        ).map(([k, l, max]) => (
          <Field label={l} key={k}>
            <input name={k} defaultValue={d[k]} maxLength={max} />
          </Field>
        ))}
        <Field label="Fecha del montaje">
          <input
            name="installedOn"
            type="date"
            defaultValue={d.installedOn ?? ""}
            max={day}
          />
        </Field>
        <Field label="Kilometraje del montaje">
          <input
            name="installedKm"
            type="number"
            min="0"
            max="10000000"
            step="1"
            defaultValue={d.installedKm ?? ""}
          />
        </Field>
        <Field label="Fecha de medición">
          <input
            name="measuredOn"
            type="date"
            defaultValue={d.measuredOn ?? ""}
            max={day}
          />
        </Field>
        {(
          [
            ["treadTenthsMm", "Dibujo medido (mm)", 10],
            ["pressureKpa", "Presión medida (bar)", 100],
            ["minTreadTenthsMm", "Umbral de dibujo (mm)", 10],
            ["minPressureKpa", "Presión mínima configurada (bar)", 100],
            ["maxPressureKpa", "Presión máxima configurada (bar)", 100],
          ] as const
        ).map(([k, l, factor]) => (
          <Field label={l} key={k}>
            <input
              name={k}
              inputMode="decimal"
              defaultValue={
                d[k] === null ? "" : String(d[k] / factor).replace(".", ",")
              }
            />
          </Field>
        ))}
        <Field label="Próxima revisión del neumático">
          <input
            name="nextCheckOn"
            type="date"
            defaultValue={d.nextCheckOn ?? ""}
          />
        </Field>
        <Field label="Notas del neumático" full>
          <textarea
            name="notes"
            defaultValue={d.notes}
            maxLength={500}
            rows={3}
          />
        </Field>
        <p className="form-span muted">
          Deja vacíos los datos desconocidos. Las mediciones necesitan su fecha.
          Cambiar a almacén o retirado libera la posición y conserva el
          historial; no crea gastos.
        </p>
        {error && (
          <p role="alert" className="form-error form-span">
            {error}
          </p>
        )}
        <div className="modal-actions form-span">
          <Button
            type="button"
            variant="secondary"
            disabled={register.busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={register.busy}>
            {register.busy ? "Guardando…" : "Guardar neumático"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

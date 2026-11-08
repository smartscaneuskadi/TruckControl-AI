import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Download, Pencil, Plus, RefreshCw } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useFleet, errorMessage } from "../app/FleetProvider";
import { useOffline } from "../app/OfflineContext";
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
import {
  emptySupplier,
  supplierFieldsSchema,
} from "../domain/commercial-records";
import type { Supplier, SupplierFields } from "../domain/commercial-records";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  loadSuppliers,
  saveSupplier,
} from "../integrations/supabase/commercial-records";
import { exportCsv } from "../lib/export";

// Fictitious demo edits live only in memory. Company records never use Web Storage.
const demoRows = new Map<string, Supplier[]>();
export function Suppliers() {
  const company = useCompany(),
    fleet = useFleet(),
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
    (!subscription.enabled || subscription.features.expenses) &&
    !(cloud && (offline.offline || !online));
  const key = `${cloud}:${company.user?.id ?? "demo"}:${org}:${allowed}`;
  const current = useRef(key);
  current.current = key;
  const locked = useRef(false),
    sequence = useRef(0);
  const [state, setState] = useState({
    key,
    rows: [] as Supplier[],
    loading: true,
    error: "",
  });
  const [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Supplier | "new" | null>(null);
  const [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1);
  const refresh = useCallback(async () => {
    const n = ++sequence.current;
    setState({ key, rows: [], loading: allowed, error: "" });
    if (!allowed) return;
    try {
      const client = getSupabaseClient();
      if (cloud && !client)
        throw Error("La conexión de empresa no está disponible.");
      const rows =
        cloud && client
          ? await loadSuppliers(client, org)
          : (demoRows.get(org) ?? []);
      if (current.current === key && n === sequence.current)
        setState({ key, rows, loading: false, error: "" });
    } catch (e) {
      if (current.current === key && n === sequence.current)
        setState({ key, rows: [], loading: false, error: errorMessage(e) });
    }
  }, [key, allowed, cloud, org]);
  useEffect(() => {
    setEditor(null);
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  const visible =
    state.key === key && allowed
      ? state
      : { key, rows: [], loading: allowed, error: "" };
  const writable =
    allowed &&
    (!subscription.enabled || subscription.access?.can_write === true);
  const rows = visible.rows
    .filter(
      (r) =>
        (archived || !r.archived) &&
        `${r.name} ${r.tax_id} ${r.email} ${r.phone}`
          .toLocaleLowerCase("es")
          .includes(search.trim().toLocaleLowerCase("es")),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const actual = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  async function save(
    id: string,
    fields: SupplierFields,
    expected: number | null,
  ) {
    if (
      !writable ||
      locked.current ||
      visible.loading ||
      visible.error ||
      (cloud && !navigator.onLine)
    )
      throw Error("Actualiza la conexión y los permisos antes de guardar.");
    locked.current = true;
    setBusy(true);
    try {
      const clean = supplierFieldsSchema.parse(fields),
        client = getSupabaseClient();
      if (cloud && !client)
        throw Error("La conexión de empresa no está disponible.");
      if (cloud && client) await saveSupplier(client, org, id, clean, expected);
      else {
        const previous = visible.rows.find((r) => r.id === id);
        if ((previous?.row_version ?? null) !== expected)
          throw Error("La ficha ha cambiado. Actualiza el listado.");
        if (visible.rows.some((r) => r.id !== id && r.tax_id === clean.tax_id))
          throw Error("Ya existe este identificador de proveedor.");
        const stamp = new Date().toISOString();
        const next: Supplier = {
          ...clean,
          id,
          organization_id: org,
          row_version: (expected ?? 0) + 1,
          created_at: previous?.created_at ?? stamp,
          updated_at: stamp,
        };
        demoRows.set(org, [...visible.rows.filter((r) => r.id !== id), next]);
      }
      if (current.current === key) {
        setEditor(null);
        await refresh();
      }
    } catch (e) {
      if (current.current === key)
        setState({
          key,
          rows: [],
          loading: false,
          error:
            "No se ha confirmado el guardado. Actualiza el listado y revisa la ficha antes de repetir.",
        });
      throw e;
    } finally {
      locked.current = false;
      if (current.current === key) setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRACIÓN"
        title="Proveedores"
        description="Talleres, estaciones y servicios de tu empresa, con sus datos de contacto."
      >
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={!allowed || busy || visible.loading}
          onClick={() => void refresh()}
        >
          Actualizar proveedores
        </Button>
        <Button
          variant="secondary"
          icon={Download}
          disabled={
            !rows.length || busy || visible.loading || Boolean(visible.error)
          }
          onClick={() =>
            exportCsv("truckcontrol-proveedores.csv", [
              [
                "Nombre",
                "Identificador fiscal",
                "Correo",
                "Teléfono",
                "Dirección",
                "Archivado",
                "Notas",
              ],
              ...rows.map((r) => [
                r.name,
                r.tax_id,
                r.email,
                r.phone,
                r.address,
                r.archived ? "Sí" : "No",
                r.notes,
              ]),
            ])
          }
        >
          Exportar proveedores
        </Button>
        {writable && (
          <Button
            icon={Plus}
            disabled={busy || visible.loading || Boolean(visible.error)}
            onClick={() => setEditor("new")}
          >
            Añadir proveedor
          </Button>
        )}
      </PageHeading>
      {!cloud && (
        <p className="muted">
          Demostración: utiliza datos ficticios. Estas fichas duran hasta cerrar
          o recargar la aplicación; puedes exportarlas a CSV.
        </p>
      )}
      {!allowed && (
        <p role="status" className="form-error">
          Conecta a internet y comprueba el acceso a Gastos para consultar los
          proveedores de la empresa.
        </p>
      )}
      {visible.error && (
        <p role="alert" className="form-error">
          {visible.error}
        </p>
      )}
      <section
        className="card operation-register"
        aria-label="Registro de proveedores"
      >
        <div className="table-toolbar">
          <SearchField
            label="Buscar proveedores"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => {
                setArchived(e.target.checked);
                setPage(1);
              }}
            />{" "}
            Incluir archivados
          </label>
        </div>
        {visible.loading ? (
          <p role="status">Cargando proveedores…</p>
        ) : !rows.length ? (
          <Empty title="Sin proveedores en este listado">
            Añade una ficha o ajusta la búsqueda.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Proveedor</th>
                  <th scope="col">Identificador fiscal</th>
                  <th scope="col">Contacto</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((actual - 1) * 12, actual * 12).map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.tax_id}</td>
                    <td>{r.email || r.phone || "—"}</td>
                    <td>
                      <Badge tone={r.archived ? "neutral" : "green"}>
                        {r.archived ? "Archivado" : "Activo"}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        icon={Pencil}
                        disabled={busy}
                        onClick={() => setEditor(r)}
                      >
                        {writable ? "Editar proveedor" : "Ver proveedor"}
                      </Button>
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
      {editor && allowed && (
        <SupplierEditor
          key={`${key}:${editor === "new" ? "new" : editor.id}`}
          row={editor === "new" ? null : editor}
          readOnly={!writable || Boolean(visible.error)}
          busy={busy}
          save={save}
          close={() => {
            if (!busy) setEditor(null);
          }}
        />
      )}
    </>
  );
}
function SupplierEditor({
  row,
  readOnly,
  busy,
  save,
  close,
}: {
  row: Supplier | null;
  readOnly: boolean;
  busy: boolean;
  save(
    id: string,
    fields: SupplierFields,
    expected: number | null,
  ): Promise<void>;
  close(): void;
}) {
  const [id] = useState(() => row?.id ?? crypto.randomUUID());
  const [fields, setFields] = useState<SupplierFields>(() =>
    row
      ? supplierFieldsSchema.parse({
          name: row.name,
          tax_id: row.tax_id,
          email: row.email,
          phone: row.phone,
          address: row.address,
          notes: row.notes,
          archived: row.archived,
        })
      : { ...emptySupplier },
  );
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await save(
        id,
        supplierFieldsSchema.parse(fields),
        row?.row_version ?? null,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Modal
      title={row ? "Ficha de proveedor" : "Nuevo proveedor"}
      subtitle="Archivar conserva la ficha. No se crean gastos ni facturas al guardar."
      onClose={close}
    >
      <form onSubmit={(e) => void submit(e)} className="entity-form">
        <fieldset
          disabled={readOnly || busy}
          className="form-grid operation-fieldset"
        >
          {(
            [
              ["name", "Nombre del proveedor", 160],
              ["tax_id", "Identificador fiscal", 30],
              ["email", "Correo del proveedor", 254],
              ["phone", "Teléfono del proveedor", 30],
              ["address", "Dirección del proveedor", 240],
            ] as const
          ).map(([k, label, max]) => (
            <Field key={k} label={label}>
              <input
                value={fields[k]}
                required={k === "name" || k === "tax_id"}
                type={k === "email" ? "email" : k === "phone" ? "tel" : "text"}
                maxLength={max}
                onChange={(e) =>
                  setFields((s) => ({ ...s, [k]: e.target.value }))
                }
              />
            </Field>
          ))}
          <Field label="Notas del proveedor" full>
            <textarea
              value={fields.notes}
              maxLength={500}
              onChange={(e) =>
                setFields((s) => ({ ...s, notes: e.target.value }))
              }
            />
          </Field>
          <label>
            <input
              type="checkbox"
              checked={fields.archived}
              onChange={(e) =>
                setFields((s) => ({ ...s, archived: e.target.checked }))
              }
            />{" "}
            Archivar proveedor
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy} onClick={close}>
            Cerrar ficha
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar proveedor"}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

import { useState } from "react";
import type { FormEvent } from "react";
import { Save, Trash2 } from "lucide-react";
import { useFleet, errorMessage } from "../app/FleetProvider";
import type { Editor } from "../app/WorkspaceContext";
import type { Driver, FinanceEntry, Truck } from "../domain/models";
import {
  categories,
  driverSchema,
  entrySchema,
  truckSchema,
  truckStatuses,
} from "../domain/models";
import { parseMoney } from "../domain/finance";
import { today } from "../lib/format";
import { Button, Field, Modal } from "./ui";
const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
const integer = (data: FormData, key: string) => {
  const value = text(data, key);
  return value === "" ? NaN : Number(value);
};
function readableError(error: unknown) {
  if (error && typeof error === "object" && "issues" in error)
    return "Revisa los campos. Los textos, fechas e importes deben tener un formato válido.";
  return errorMessage(error);
}

export function EntityEditor({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose(): void;
}) {
  const { snapshot, execute, busy, notify } = useFleet();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const value = editor.value;
  const kind = editor.kind;
  const label =
    kind === "truck"
      ? "camión"
      : kind === "driver"
        ? "conductor"
        : kind === "income"
          ? "ingreso"
          : "gasto";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const id = value?.id ?? crypto.randomUUID();
      if (kind === "truck") {
        const truck = truckSchema.parse({
          id,
          plate: text(data, "plate").toUpperCase(),
          brand: text(data, "brand"),
          model: text(data, "model"),
          year: integer(data, "year"),
          odometerKm: integer(data, "odometerKm"),
          status: text(data, "status"),
          driverId: text(data, "driverId") || null,
          inspectionDueOn: text(data, "inspectionDueOn"),
          route: text(data, "route"),
        });
        await execute({ type: "save-truck", value: truck });
      } else if (kind === "driver") {
        const driver = driverSchema.parse({
          id,
          name: text(data, "name"),
          email: text(data, "email"),
          phone: text(data, "phone"),
          license: text(data, "license"),
          licenseExpiresOn: text(data, "licenseExpiresOn"),
          status: text(data, "status"),
        });
        await execute({ type: "save-driver", value: driver });
      } else {
        const entry = entrySchema.parse({
          id,
          kind,
          truckId: text(data, "truckId"),
          concept: text(data, "concept"),
          date: text(data, "date"),
          amountCents: parseMoney(text(data, "amount")),
          category: text(data, "category"),
          paymentStatus: text(data, "paymentStatus"),
          distanceKm: kind === "income" ? integer(data, "distanceKm") : 0,
        });
        await execute({ type: "save-entry", value: entry });
      }
      notify(
        `${value ? "Cambios guardados" : `${label[0].toUpperCase()}${label.slice(1)} creado`} correctamente.`,
      );
      onClose();
    } catch (err) {
      setError(readableError(err));
    }
  }
  async function remove() {
    if (!value) return;
    try {
      await execute({
        type:
          kind === "truck"
            ? "delete-truck"
            : kind === "driver"
              ? "delete-driver"
              : "delete-entry",
        id: value.id,
      });
      notify("Registro eliminado.");
      onClose();
    } catch (err) {
      setError(readableError(err));
      setDeleting(false);
    }
  }
  return (
    <Modal
      title={`${value ? "Editar" : "Nuevo"} ${label}`}
      subtitle="Entorno de demostración · datos ficticios"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          {kind === "truck" && (
            <TruckFields value={value as Truck | undefined} />
          )}
          {kind === "driver" && (
            <DriverFields value={value as Driver | undefined} />
          )}
          {(kind === "income" || kind === "expense") && (
            <>
              <Field label="Concepto" full>
                <input
                  name="concept"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue={(value as FinanceEntry)?.concept}
                  placeholder={
                    kind === "income"
                      ? "Servicio de transporte · Bilbao → Madrid"
                      : "Repostaje, mantenimiento…"
                  }
                />
              </Field>
              <Field label="Camión">
                <select
                  name="truckId"
                  required
                  defaultValue={
                    (value as FinanceEntry)?.truckId ?? editor.truckId ?? ""
                  }
                >
                  <option value="" disabled>
                    Selecciona un camión
                  </option>
                  {snapshot.trucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                      {truck.plate} · {truck.brand}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha de devengo">
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={(value as FinanceEntry)?.date ?? today()}
                />
              </Field>
              <Field label="Importe (€)">
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  maxLength={14}
                  defaultValue={
                    value
                      ? ((value as FinanceEntry).amountCents / 100).toFixed(2)
                      : ""
                  }
                  placeholder="0,00"
                />
                <small>Sin IVA · máximo 2 decimales</small>
              </Field>
              <Field label="Categoría">
                <select
                  name="category"
                  defaultValue={
                    (value as FinanceEntry)?.category ??
                    (kind === "income" ? "transport" : "fuel")
                  }
                >
                  {Object.entries(categories)
                    .filter(([key]) =>
                      kind === "income"
                        ? ["transport", "other"].includes(key)
                        : key !== "transport",
                    )
                    .map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label={kind === "income" ? "Estado de cobro" : "Estado de pago"}
              >
                <select
                  name="paymentStatus"
                  defaultValue={
                    (value as FinanceEntry)?.paymentStatus ?? "pending"
                  }
                >
                  <option value="pending">Pendiente</option>
                  <option value="paid">
                    {kind === "income" ? "Cobrado" : "Pagado"}
                  </option>
                </select>
              </Field>
              {kind === "income" && (
                <Field label="Kilómetros del servicio">
                  <input
                    type="number"
                    name="distanceKm"
                    min={0}
                    max={1_000_000}
                    step={1}
                    required
                    defaultValue={(value as FinanceEntry)?.distanceKm ?? 0}
                  />
                  <small>Se usan para calcular el coste por km.</small>
                </Field>
              )}
            </>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {deleting && (
          <div className="confirm-box">
            <strong>¿Eliminar este {label}?</strong>
            <p>Esta acción elimina el registro de tu demostración local.</p>
            <div className="inline-actions">
              <Button variant="secondary" onClick={() => setDeleting(false)}>
                Conservar
              </Button>
              <Button variant="danger" disabled={busy} onClick={remove}>
                Confirmar eliminación
              </Button>
            </div>
          </div>
        )}
        <div className="modal-actions">
          {value && !deleting && (
            <Button
              variant="ghost"
              className="delete-action"
              icon={Trash2}
              onClick={() => setDeleting(true)}
            >
              Eliminar
            </Button>
          )}
          <div className="push-right inline-actions">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" icon={Save} disabled={busy || deleting}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function TruckFields({ value }: { value?: Truck }) {
  const { snapshot } = useFleet();
  const assigned = new Set(
    snapshot.trucks
      .filter((truck) => truck.id !== value?.id)
      .map((truck) => truck.driverId),
  );
  return (
    <>
      <Field label="Matrícula">
        <input
          name="plate"
          required
          minLength={3}
          maxLength={16}
          defaultValue={value?.plate}
          placeholder="1234 ABC"
        />
      </Field>
      <Field label="Estado">
        <select name="status" defaultValue={value?.status ?? "available"}>
          {Object.entries(truckStatuses).map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Marca">
        <input
          name="brand"
          required
          maxLength={50}
          defaultValue={value?.brand}
          placeholder="Volvo"
        />
      </Field>
      <Field label="Modelo">
        <input
          name="model"
          required
          maxLength={60}
          defaultValue={value?.model}
          placeholder="FH 500"
        />
      </Field>
      <Field label="Año">
        <input
          name="year"
          type="number"
          min={1980}
          max={2100}
          step={1}
          required
          defaultValue={value?.year ?? new Date().getFullYear()}
        />
      </Field>
      <Field label="Cuentakilómetros (km)">
        <input
          name="odometerKm"
          type="number"
          min={0}
          max={10_000_000}
          step={1}
          required
          defaultValue={value?.odometerKm ?? 0}
        />
      </Field>
      <Field label="Conductor asignado">
        <select name="driverId" defaultValue={value?.driverId ?? ""}>
          <option value="">Sin asignar</option>
          {snapshot.drivers
            .filter(
              (driver) =>
                driver.status === "active" && !assigned.has(driver.id),
            )
            .map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Próxima ITV">
        <input
          name="inspectionDueOn"
          type="date"
          required
          defaultValue={value?.inspectionDueOn}
        />
      </Field>
      <Field label="Ruta actual" full>
        <input
          name="route"
          maxLength={120}
          defaultValue={value?.route}
          placeholder="Bilbao → Madrid"
        />
      </Field>
    </>
  );
}
function DriverFields({ value }: { value?: Driver }) {
  return (
    <>
      <Field label="Nombre completo" full>
        <input
          name="name"
          minLength={2}
          maxLength={80}
          required
          defaultValue={value?.name}
          placeholder="Nombre de demostración"
        />
      </Field>
      <Field label="Correo electrónico">
        <input
          name="email"
          type="email"
          defaultValue={value?.email}
          placeholder="conductor@example.com"
        />
      </Field>
      <Field label="Teléfono">
        <input
          name="phone"
          type="tel"
          maxLength={24}
          defaultValue={value?.phone}
          placeholder="Opcional"
        />
      </Field>
      <Field label="Permiso de conducción">
        <input
          name="license"
          required
          maxLength={30}
          defaultValue={value?.license ?? "CE"}
        />
      </Field>
      <Field label="Vencimiento del permiso">
        <input
          name="licenseExpiresOn"
          type="date"
          required
          defaultValue={value?.licenseExpiresOn}
        />
      </Field>
      <Field label="Disponibilidad">
        <select name="status" defaultValue={value?.status ?? "active"}>
          <option value="active">Disponible</option>
          <option value="leave">De permiso</option>
        </select>
      </Field>
      <p className="field-note">
        Para poner de permiso a un conductor, desasígnalo primero de su camión.
      </p>
    </>
  );
}

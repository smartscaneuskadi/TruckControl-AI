import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { getSupabaseClient } from "../integrations/supabase/client";
import { Badge, Button, Modal } from "./ui";
import { money } from "../lib/format";

export const recurringStatusSchema = z.object({
  configured: z.boolean(),
  invoice_delivery_ready: z.boolean().default(false),
  management_available: z.boolean(),
  refresh_available: z.boolean().default(false),
  terms_version: z.string().nullable(),
  terms_url: z.url().nullable(),
  subscription: z
    .object({
      state: z.enum([
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "paused",
      ]),
      plan_id: z.enum(["limited", "full"]),
      monthly_cents: z.number().int().positive(),
      currency: z.literal("EUR"),
      period_end: z.iso.datetime({ offset: true }),
      cancel_at_period_end: z.boolean(),
      reconciliation_required: z.boolean().default(false),
    })
    .nullable(),
  invoices: z.array(
    z.object({
      invoice_id: z.string(),
      amount_cents: z.number().int().positive(),
      currency: z.literal("EUR"),
      period_start: z.iso.datetime({ offset: true }),
      period_end: z.iso.datetime({ offset: true }),
    }),
  ),
});
export type RecurringStatus = z.infer<typeof recurringStatusSchema>;
export function useRecurringSubscription(userId: string) {
  const [status, setStatus] = useState<RecurringStatus | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const client = getSupabaseClient();
  useEffect(() => {
    let current = true;
    setLoading(true);
    setStatus(null);
    if (!client) {
      setLoading(false);
      return;
    }
    void client.functions
      .invoke("truckcontrol-subscriptions", { body: { action: "status" } })
      .then(({ data, error }) => {
        if (!current) return;
        const parsed = recurringStatusSchema.safeParse(data);
        if (!error && parsed.success) {
          const url = parsed.data.terms_url
            ? new URL(parsed.data.terms_url)
            : null;
          if (
            !url ||
            (url.origin === location.origin && !url.username && !url.password)
          )
            setStatus(parsed.data);
        }
      })
      .catch(() => {
        /* Never infer paid access from an unavailable provider. */
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [client, userId, revision]);
  return { status, loading, refresh: () => setRevision((n) => n + 1) };
}
const stateLabels: Record<
  NonNullable<RecurringStatus["subscription"]>["state"],
  string
> = {
  incomplete: "Pago inicial pendiente",
  incomplete_expired: "Alta caducada",
  trialing: "Periodo de prueba",
  active: "Activa",
  past_due: "Renovación pendiente de pago",
  canceled: "Cancelada",
  unpaid: "Sin pagar",
  paused: "En pausa",
};
const date = (value: string) => new Date(value).toLocaleDateString("es-ES");
export function RecurringSubscription({
  status,
  canResume,
  onRefresh,
}: {
  status: RecurringStatus | null;
  canResume: boolean;
  onRefresh(): void;
}) {
  const client = getSupabaseClient();
  const [confirm, setConfirm] = useState<"cancel" | "resume" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refreshOperation = useRef<string | null>(null);
  const running = useRef(false);
  const subscription = status?.subscription;
  const pending = subscription?.reconciliation_required === true;
  if (!status || (!subscription && !status.invoices.length)) return null;
  async function refresh() {
    if (running.current) return;
    if (!client || !subscription || !status?.refresh_available) {
      onRefresh();
      return;
    }
    running.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    // Retain this operation after an uncertain network result. Repeating it
    // cannot reapply an already committed snapshot or clear a later warning.
    refreshOperation.current ??= crypto.randomUUID();
    try {
      const response = await client.functions.invoke(
        "truckcontrol-subscriptions",
        {
          body: { action: "refresh", operation_id: refreshOperation.current },
        },
      );
      if (response.error || response.data?.refreshed !== true)
        throw new Error("unavailable");
      refreshOperation.current = null;
      setMessage(
        "Estado consultado. Comprueba los datos actualizados de tu suscripción.",
      );
    } catch {
      setError(
        "No se ha podido confirmar el estado con el proveedor. Se conservan los últimos datos registrados. Vuelve a intentarlo o contacta con soporte.",
      );
    } finally {
      onRefresh();
      running.current = false;
      setBusy(false);
    }
  }
  async function manage(action: "cancel" | "resume") {
    if (!client || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await client.functions.invoke(
        "truckcontrol-subscriptions",
        {
          body: { action, operation_id: crypto.randomUUID() },
        },
      );
      if (response.error || response.data?.requested !== true)
        throw new Error("unavailable");
      setConfirm(null);
      setMessage(
        "Solicitud enviada. La confirmación del proveedor actualizará el estado; compruébalo de nuevo en unos instantes.",
      );
      onRefresh();
    } catch {
      setError(
        "No se ha podido confirmar el cambio. Actualiza el estado de la suscripción antes de volver a intentarlo o contacta con soporte.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const open =
    subscription &&
    !["canceled", "incomplete_expired"].includes(subscription.state);
  return (
    <section
      className="card settings-card recurring-subscription"
      aria-label="Suscripción mensual"
    >
      <Badge tone="blue">TU SUSCRIPCIÓN</Badge>
      <h2>Renovación y pagos</h2>
      {subscription && (
        <>
          <p>
            <strong>
              {pending
                ? "Estado pendiente de confirmar"
                : stateLabels[subscription.state]}
            </strong>{" "}
            · {money(subscription.monthly_cents)}/mes
          </p>
          <p>
            {pending
              ? "Fin del último periodo registrado"
              : subscription.cancel_at_period_end
                ? "Renovación desactivada. Fin del periodo"
                : "Fin del periodo actual"}
            : {date(subscription.period_end)}.
          </p>
          {pending && (
            <p role="status">
              El estado de la suscripción está pendiente de confirmar con el
              proveedor. Actualiza el estado.
            </p>
          )}
          {pending && !open && (
            <p>
              Si el estado sigue pendiente, contacta con soporte antes de
              gestionar esta suscripción.
            </p>
          )}
          {!pending && subscription.state === "past_due" && (
            <p>
              Una renovación fallida no amplía el acceso. Se conserva el periodo
              que ya esté pagado.
            </p>
          )}
          {open && (
            <Button
              variant="secondary"
              disabled={
                busy ||
                !status.management_available ||
                (!pending && subscription.cancel_at_period_end && !canResume)
              }
              onClick={() =>
                setConfirm(
                  !pending && subscription.cancel_at_period_end
                    ? "resume"
                    : "cancel",
                )
              }
            >
              {!pending && subscription.cancel_at_period_end
                ? "Reactivar renovación"
                : "Cancelar renovación"}
            </Button>
          )}
          <p>
            <small>
              Cancelar conserva tus datos y el periodo de acceso ya abonado. Una
              suspensión administrativa se mantiene aunque se reciba un pago.
            </small>
          </p>
        </>
      )}
      {status.invoices.length > 0 && (
        <>
          <h3>Pagos registrados</h3>
          <ul>
            {status.invoices.map((invoice) => (
              <li key={invoice.invoice_id}>
                {date(invoice.period_start)} – {date(invoice.period_end)} ·{" "}
                {money(invoice.amount_cents)}
              </li>
            ))}
          </ul>
        </>
      )}
      {message && (
        <p role="status" className="access-message">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
        Actualizar suscripción
      </Button>
      {confirm && (
        <Modal
          title={
            confirm === "cancel"
              ? "Cancelar la renovación mensual"
              : "Reactivar la renovación mensual"
          }
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p>
            {confirm === "cancel"
              ? "No se programarán nuevas renovaciones después del periodo actual. Se conserva el acceso que ya hayas pagado."
              : `Se retomarán los cobros mensuales de ${money(subscription!.monthly_cents)} bajo las condiciones de tu suscripción.`}
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="access-links">
            <Button disabled={busy} onClick={() => void manage(confirm)}>
              {busy ? "Enviando…" : "Confirmar cambio"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Volver
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}

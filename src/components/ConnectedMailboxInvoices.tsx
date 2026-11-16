import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, FileCheck2, ShieldCheck, Square } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useFleet } from "../app/FleetProvider";
import { useSubscription } from "../app/SubscriptionContext";
import { sessionExitEvent } from "../app/session-events";
import type { UnifiedMailboxAccount } from "../pages/MailWorkspace";
import { Invoices } from "../pages/Invoices";
import { Button, Modal } from "./ui";
import { InvoiceMailPeriod } from "./InvoiceMailPeriod";
import {
  connectedInvoiceConsentVersion,
  connectedInvoiceReadiness,
  ConnectedInvoiceImportError,
} from "../integrations/personal-mail/invoice-import";
import type {
  ConnectedInvoiceImportResult,
  ConnectedInvoiceReadiness,
} from "../integrations/personal-mail/invoice-import";
import { presetReceivedPeriod, resolveMailPeriod } from "../../supabase/functions/_shared/mail-period";
import type { ReceivedPeriod } from "../../supabase/functions/_shared/mail-period";
import { requestedInvoiceMailPeriod } from "../domain/invoice-mail-period";
import type { InvoiceMailPreset } from "../domain/invoice-mail-period";
import { currentLocale, t } from "../i18n/runtime";

function failureText(error: unknown) {
  const code = error instanceof ConnectedInvoiceImportError ? error.code : "uncertain";
  switch (code) {
    case "expired": return t("La sesión del correo o de TruckControl ha cambiado. Vuelve a seleccionar una cuenta conectada.");
    case "denied": return t("Tu cuenta necesita permiso de importación, IA habilitada y una empresa activa.");
    case "consent_required": return t("Confirma la autorización para esta cuenta y este período antes de descargar.");
    case "invalid_period": return t("Elige un período válido dentro de los últimos 12 meses.");
    case "identity_mismatch": return t("El buzón autorizado no coincide con la cuenta seleccionada. No se ha importado desde otra cuenta.");
    case "backend_outdated": return t("La importación desde esta cuenta aún no está disponible. Tu correo sigue disponible.");
    case "budget": return t("Se ha alcanzado el límite de IA o no se puede verificar el presupuesto. No se repetirá la lectura automáticamente.");
    case "unavailable": return t("No se puede comprobar el servicio de importación. Comprueba la conexión y vuelve a abrir esta opción.");
    default: return t("No se ha podido confirmar el resultado. Puede haber originales guardados: revisa las facturas de la empresa antes de iniciar otra descarga.");
  }
}
function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(currentLocale(), { timeZone: "Europe/Madrid" }).format(date)
    : t("fecha válida");
}

/** A connected mailbox grants no invoice access until the user confirms this specific account and period. */
export function ConnectedMailboxInvoices({ account }: { account: UnifiedMailboxAccount }) {
  const access = useCompany();
  const { snapshot } = useFleet();
  const subscription = useSubscription();
  const cloud = access.mode === "company";
  const canWrite = !subscription.enabled || subscription.access?.can_write === true;
  const entitled = !subscription.enabled ||
    (subscription.access?.active === true && subscription.features.gmail && subscription.features.invoice_ai);
  const allowed = cloud && canWrite && entitled && Boolean(account.mailbox.importInvoices);
  const actor = access.user?.id ?? "";
  const organization = snapshot.organization.id;
  const scope = `${actor}:${organization}:${account.id}:${account.email}:${allowed}`;
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [period, setPeriod] = useState<ReceivedPeriod>(() => presetReceivedPeriod());
  const [preset, setPreset] = useState<InvoiceMailPreset>("30d");
  const [consent, setConsent] = useState(false);
  const [readiness, setReadiness] = useState<ConnectedInvoiceReadiness | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ConnectedInvoiceImportResult | null>(null);
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const stateScope = useRef(scope);
  stateScope.current = scope;
  const generation = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const cancel = () => {
    generation.current++;
    operation.current?.abort();
    operation.current = null;
    locked.current = false;
    setBusy(false);
    setConsent(false);
  };
  useLayoutEffect(() => {
    cancel();
    setOpen(false);
    setReviewOpen(false);
    setReadiness(null);
    setResult(null);
    setNotice("");
    setError("");
    setPeriod(presetReceivedPeriod());
    setPreset("30d");
    return () => { generation.current++; operation.current?.abort(); };
  }, [scope]);
  useEffect(() => {
    const exit = () => { cancel(); setOpen(false); setReviewOpen(false); };
    const network = () => { setOnline(navigator.onLine); if (!navigator.onLine) cancel(); };
    window.addEventListener(sessionExitEvent, exit);
    window.addEventListener("pagehide", exit);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      window.removeEventListener(sessionExitEvent, exit);
      window.removeEventListener("pagehide", exit);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  useEffect(() => {
    if (!open || !allowed || !online) return;
    const controller = new AbortController();
    const expected = scope;
    setChecking(true);
    setReadiness(null);
    void connectedInvoiceReadiness(organization, actor, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && stateScope.current === expected) setReadiness(data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted && stateScope.current === expected) setError(failureText(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted && stateScope.current === expected) setChecking(false);
      });
    return () => controller.abort();
  }, [open, allowed, online, organization, actor, scope]);
  let validPeriod = true;
  try { resolveMailPeriod(period); } catch { validPeriod = false; }

  function openImport() {
    if (!allowed) return;
    cancel();
    setResult(null);
    setError("");
    setNotice("");
    setChecking(false);
    if (preset !== "custom") setPeriod(presetReceivedPeriod(preset));
    setOpen(true);
  }
  function close() {
    cancel();
    setOpen(false);
  }
  function changePeriod(value: ReceivedPeriod) {
    cancel();
    setPeriod(value);
    setResult(null);
    setError("");
    setNotice("");
  }
  async function download() {
    if (!allowed || !online || !consent || !readiness?.ready || !readiness.aiEnabled || locked.current || !account.mailbox.importInvoices)
      return;
    let requested: ReceivedPeriod;
    try { requested = requestedInvoiceMailPeriod(preset, period); }
    catch { setError(failureText(new ConnectedInvoiceImportError("invalid_period"))); return; }
    if (requested.from !== period.from || requested.to !== period.to) {
      changePeriod(requested);
      setNotice(t("El período se ha actualizado al día de hoy. Revisa las fechas y vuelve a confirmar la autorización."));
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const current = ++generation.current;
    const expected = scope;
    const controller = new AbortController();
    operation.current = controller;
    try {
      const data = await account.mailbox.importInvoices({
        organizationId: organization,
        actorId: actor,
        provider: account.provider,
        email: account.email,
        period: requested,
        consent: { version: connectedInvoiceConsentVersion, accepted: true, mailbox: account.email, provider: account.provider, period: requested },
        cursor: result?.has_more ? result.next_cursor : null,
      }, controller.signal);
      if (controller.signal.aborted || current !== generation.current || expected !== stateScope.current) return;
      setResult(data);
      setRevision((n) => n + 1);
      if (!data.has_more || data.failures) setConsent(false);
    } catch (reason) {
      if (!controller.signal.aborted && current === generation.current && expected === stateScope.current) {
        setError(failureText(reason));
        setConsent(false);
        setResult(null);
      }
    } finally {
      if (current === generation.current && expected === stateScope.current) {
        locked.current = false;
        setBusy(false);
        operation.current = null;
      }
    }
  }
  return <>
    <Button variant="secondary" icon={Download} onClick={openImport} disabled={!allowed || !online}
      title={!allowed ? t("Disponible con permiso de importación e IA habilitada para esta empresa.") : undefined}>
      Descargar facturas del correo por IA
    </Button>
    {open && <Modal title="Descargar facturas del correo por IA" subtitle={account.email} onClose={close} wide>
      <section className="card mail-invoice-authorization" aria-label={t("Cuenta y empresa autorizadas")}>
        <ShieldCheck size={22} aria-hidden="true" />
        <div><strong>{t("Correo seleccionado")}</strong><p>{account.email}</p></div>
        <div><strong>{t("Empresa de destino")}</strong><p>{snapshot.organization.name}</p></div>
      </section>
      <p>{t("Elige qué correos recibidos autorizas a consultar. Solo se descargarán adjuntos candidatos a factura dentro del período confirmado.")}</p>
      <InvoiceMailPeriod value={period} preset={preset} disabled={busy}
        onChange={changePeriod}
        onPresetChange={(value) => { cancel(); setPreset(value); setResult(null); setError(""); setNotice(""); }} />
      <div className="mail-invoice-disclosure">
        <p>{t("Al autorizar esta descarga, TruckControl enviará temporalmente al backend el permiso de acceso de esta cuenta para Gmail, o los datos de conexión para IMAP. Se transmitirán por HTTPS y no se guardarán como credenciales de importación.")}</p>
        <p>{t("Los originales candidatos se guardarán en el almacenamiento privado de esta empresa y podrán ser analizados por el proveedor de IA autorizado. Revisa los datos antes de registrar gastos.")}</p>
        <p>{t("La autorización se aplica a esta descarga y a los lotes que continúes con la misma cuenta y fechas. Puedes volver a ejecutar la descarga para incluir nuevos correos; no se activa una tarea en segundo plano.")}</p>
        <a href="/?legal=privacy#connected-mail-invoices" target="_blank" rel="noopener noreferrer">{t("Privacidad de la descarga de facturas por IA")}</a>
      </div>
      <label className="checkbox-row mail-invoice-consent">
        <input type="checkbox" checked={consent} disabled={busy || !validPeriod}
          onChange={(event) => setConsent(event.target.checked)} />
        <span>{t("Autorizo la descarga de facturas y su análisis IA desde el correo seleccionado, para esta empresa y únicamente del {0} al {1}.", [dateLabel(period.from), dateLabel(period.to)])}</span>
      </label>
      {checking && <p role="status">{t("Comprobando permiso y disponibilidad de la importación…")}</p>}
      {readiness && !readiness.ready && <p role="alert" className="form-error">{t("La importación desde esta cuenta aún no está disponible. Tu correo sigue disponible.")}</p>}
      {readiness?.ready && !readiness.aiEnabled && <p role="alert" className="form-error">{t("La lectura IA no está habilitada para esta empresa. El administrador puede revisar sus permisos y límites.")}</p>}
      {!online && <p role="alert" className="form-error">{t("Conecta a internet para descargar facturas del correo.")}</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {result && <section className="card" aria-label={t("Resultado de la descarga de facturas")}>
        <h3>{t("Resultado de este lote")}</h3>
        <dl className="mail-invoice-results">
          <div><dt>{t("Originales guardados")}</dt><dd>{result.imported}</dd></div>
          <div><dt>{t("Facturas analizadas")}</dt><dd>{result.ai_used}</dd></div>
          <div><dt>{t("Omitidos o ya guardados")}</dt><dd>{result.skipped}</dd></div>
          <div><dt>{t("Incidencias")}</dt><dd>{result.failures}</dd></div>
        </dl>
        <p>{result.has_more ? t("Quedan correos o adjuntos por comprobar. Puedes continuar otro lote con esta autorización.") : t("Este recorrido del período ha terminado. Los originales guardados están disponibles para revisión.")}</p>
        {result.failures > 0 && <p className="form-error">{t("Algunos documentos necesitan revisión. Comprueba la bandeja antes de repetir; los originales ya guardados se conservan.")}</p>}
      </section>}
      <div className="form-actions">
        <Button icon={FileCheck2} variant="secondary" onClick={() => { close(); setReviewOpen(true); }} disabled={busy}>
          Ver facturas de la empresa
        </Button>
        {busy ? <Button icon={Square} variant="secondary" onClick={() => {
          cancel(); setResult(null);
          setNotice(t("Se han detenido las siguientes solicitudes. El lote ya recibido por el servidor puede finalizar; comprueba las facturas guardadas antes de iniciar otro."));
        }}>Detener descarga</Button> : <Button icon={Download} onClick={() => void download()}
          disabled={!allowed || !online || !consent || !validPeriod || checking || !readiness?.ready || !readiness.aiEnabled}>
          {result?.has_more ? "Continuar descarga autorizada" : "Autorizar y descargar facturas"}
        </Button>}
        <Button variant="ghost" onClick={close}>Cerrar</Button>
      </div>
      {busy && <p role="status">{t("Descargando el lote autorizado. Los originales se conservarán para revisión y no se registrarán gastos automáticamente.")}</p>}
      <p className="help-text">{t("Desconectar este correo retira el acceso para próximas solicitudes. Los documentos ya guardados permanecen en la empresa.")}</p>
    </Modal>}
    {reviewOpen && <Modal title="Facturas de esta empresa" onClose={() => setReviewOpen(false)} wide>
      <Invoices reviewOnly embedded refreshKey={revision} />
    </Modal>}
  </>;
}

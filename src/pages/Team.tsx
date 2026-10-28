import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Building2, Plus, ShieldCheck } from "lucide-react";
import { useCompany } from "../app/CompanyAccess";
import { useSubscription } from "../app/SubscriptionContext";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHeading,
} from "../components/ui";
import { featureLabels } from "../domain/subscriptions";
import type { Features } from "../domain/subscriptions";

type Member = {
  user_id: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  status: "active" | "invited";
  module_overrides: Partial<Features>;
};
const roles = {
  admin: "Administrador de empresa",
  operator: "Operador",
  viewer: "Solo consulta",
};
export function CompanySelection() {
  const company = useCompany();
  return company.organizations.length > 1 ? (
    <Field label="Empresa seleccionada">
      <select
        value={company.organization?.id ?? ""}
        onChange={(e) => company.select(e.target.value)}
      >
        {company.organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  ) : null;
}
export function Invitations() {
  const company = useCompany(),
    client = getSupabaseClient();
  const [invitations, setInvitations] = useState<
      { organization_id: string; name: string; role: keyof typeof roles }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!client || !company.user) return;
    let active = true;
    void client
      .rpc("tc_team_control", { p_org: null, p_action: "invitations" })
      .then(({ data, error }) => {
        if (active && !error && Array.isArray(data))
          setInvitations(data as unknown as typeof invitations);
      });
    return () => {
      active = false;
    };
  }, [client, company.user?.id, company.organization?.id]);
  async function respond(id: string, accept: boolean) {
    if (!client || busy) return;
    setBusy(true);
    setError("");
    const { error } = await client.rpc("tc_team_control", {
      p_org: id,
      p_action: accept ? "accept" : "reject",
    });
    if (error)
      setError(
        "No se ha podido responder a la invitación. Actualiza e inténtalo de nuevo.",
      );
    else {
      setInvitations((rows) => rows.filter((r) => r.organization_id !== id));
      company.refreshCompanies(accept ? id : undefined);
    }
    setBusy(false);
  }
  return invitations.length ? (
    <section className="card integration-card">
      <h2>Invitaciones a empresas</h2>
      <p>
        Tu aceptación permite acceder con el rol indicado. Cada empresa mantiene
        su propio espacio.
      </p>
      {invitations.map((invite) => (
        <div className="operation-alert" key={invite.organization_id}>
          <Building2 size={20} />
          <div>
            <strong>{invite.name}</strong>
            <span>{roles[invite.role]}</span>
          </div>
          <Button
            disabled={busy}
            onClick={() => void respond(invite.organization_id, true)}
          >
            Aceptar
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void respond(invite.organization_id, false)}
          >
            Rechazar
          </Button>
        </div>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  ) : null;
}
export function Team() {
  const company = useCompany(),
    subscription = useSubscription(),
    client = getSupabaseClient();
  const [members, setMembers] = useState<Member[]>([]),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Member | "new" | null>(null),
    [removal, setRemoval] = useState<Member | null>(null);
  const manage =
    company.mode === "company" && subscription.access?.can_manage !== false;
  useEffect(() => {
    if (!client || !company.organization || !manage) return;
    let active = true;
    void client
      .rpc("tc_team_control", {
        p_org: company.organization.id,
        p_action: "list",
      })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError("No se puede consultar el equipo de esta empresa.");
        else {
          setMembers(data as unknown as Member[]);
          setError("");
        }
      });
    return () => {
      active = false;
    };
  }, [client, company.organization?.id, revision, manage]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !company.organization || !editor || busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget),
      overrides: Partial<Features> = {};
    for (const key of Object.keys(featureLabels) as (keyof Features)[])
      if (form.has(`disable_${key}`)) overrides[key] = false;
    const { error } = await client.rpc("tc_team_control", {
      p_org: company.organization.id,
      p_action: editor === "new" ? "invite" : "update",
      p_data: {
        ...(editor === "new"
          ? { email: String(form.get("email")) }
          : { user_id: editor.user_id }),
        role: String(form.get("role")),
        module_overrides: overrides,
      },
    });
    if (error)
      setError(
        "No se han guardado los permisos. Comprueba que el correo corresponde a una cuenta registrada y confirmada.",
      );
    else {
      setEditor(null);
      setRevision((n) => n + 1);
      subscription.refresh();
    }
    setBusy(false);
  }
  async function remove() {
    if (!client || !company.organization || !removal || busy) return;
    setBusy(true);
    const { error } = await client.rpc("tc_team_control", {
      p_org: company.organization.id,
      p_action: "remove",
      p_data: { user_id: removal.user_id },
    });
    if (error) setError("No se ha podido retirar el acceso.");
    else {
      setRemoval(null);
      setRevision((n) => n + 1);
    }
    setBusy(false);
  }
  return (
    <>
      <PageHeading
        eyebrow="ACCESO Y PERMISOS"
        title="Equipo de empresa"
        description="Invita a cuentas verificadas y asigna las responsabilidades de cada persona."
      >
        {manage && (
          <Button icon={Plus} onClick={() => setEditor("new")}>
            Invitar usuario
          </Button>
        )}
      </PageHeading>
      <CompanySelection />
      <Invitations />
      {company.mode !== "company" ? (
        <section className="card integration-card">
          <ShieldCheck size={28} />
          <h2>Un equipo por empresa</h2>
          <p>
            Los administradores pueden invitar a otros usuarios registrados. La
            invitación requiere aceptación y permite conceder acceso de
            administración, operación o consulta.
          </p>
          <Button onClick={company.openAccount}>Acceso de empresas</Button>
        </section>
      ) : !manage ? (
        <section className="card integration-card">
          <h2>Acceso de consulta</h2>
          <p>
            Solo un administrador de esta empresa puede gestionar los usuarios.
          </p>
        </section>
      ) : (
        <section className="card integration-card">
          <h2>Usuarios y permisos</h2>
          <p>
            La persona propietaria conserva el control de la empresa. Las
            restricciones individuales no pueden habilitar servicios bloqueados
            por el plan o por la plataforma.
          </p>
          {error && !editor && !removal && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {!members.length ? (
            <Empty title="Todavía no hay usuarios invitados" />
          ) : (
            members.map((member) => (
              <div className="operation-alert" key={member.user_id}>
                <div>
                  <strong>{member.email}</strong>
                  <span>{roles[member.role]}</span>
                  <Badge tone={member.status === "active" ? "green" : "amber"}>
                    {member.status === "active"
                      ? "Activo"
                      : "Pendiente de aceptación"}
                  </Badge>
                </div>
                <Button
                  variant="secondary"
                  disabled={member.status !== "active"}
                  onClick={() => setEditor(member)}
                >
                  Permisos
                </Button>
                <Button variant="ghost" onClick={() => setRemoval(member)}>
                  Retirar acceso
                </Button>
              </div>
            ))
          )}
        </section>
      )}
      {editor && (
        <Modal
          title={
            editor === "new" ? "Invitar a la empresa" : "Permisos de usuario"
          }
          onClose={() => !busy && setEditor(null)}
        >
          <form onSubmit={save} className="access-form">
            <p>
              El destinatario debe tener una cuenta confirmada en TruckControl
              AI. Verá la invitación dentro de la aplicación.
            </p>
            {editor === "new" ? (
              <Field label="Correo del usuario">
                <input name="email" required type="email" maxLength={254} />
              </Field>
            ) : (
              <p>{editor.email}</p>
            )}
            <Field label="Rol">
              <select
                name="role"
                defaultValue={editor === "new" ? "operator" : editor.role}
              >
                {Object.entries(roles).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset>
              <legend>Restringir módulos para esta persona</legend>
              {Object.entries(featureLabels).map(([key, label]) => (
                <label className="checkbox-line" key={key}>
                  <input
                    type="checkbox"
                    name={`disable_${key}`}
                    defaultChecked={
                      editor !== "new" &&
                      editor.module_overrides[key as keyof Features] === false
                    }
                  />{" "}
                  Desactivar {label}
                </label>
              ))}
            </fieldset>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? "Guardando…"
                : editor === "new"
                  ? "Crear invitación"
                  : "Guardar permisos"}
            </Button>
          </form>
        </Modal>
      )}
      {removal && (
        <Modal
          title="Retirar acceso de empresa"
          onClose={() => !busy && setRemoval(null)}
        >
          <p>
            {removal.email} dejará de tener acceso a esta empresa. Su cuenta y
            los datos de la empresa se conservan.
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRemoval(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              Retirar acceso
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

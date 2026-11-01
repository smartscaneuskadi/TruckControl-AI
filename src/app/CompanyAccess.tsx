import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { Building2, LogIn, ShieldCheck, Truck } from "lucide-react";
import { getSupabaseClient } from "../integrations/supabase/client";
import { SupabaseFleetRepository } from "../integrations/supabase/repository";
import { Button, Field } from "../components/ui";
import { FleetProvider } from "./FleetProvider";
import { commercialEnabled } from "../domain/subscriptions";
import type { Plan } from "../domain/subscriptions";
import { PublicPortal } from "../pages/PublicPortal";
import { CommercialSession } from "./CommercialSession";
import {
  customAuthMail,
  readEmailAction,
} from "../integrations/supabase/auth-mail";
import { EmailConfirmation } from "../components/EmailConfirmation";
import { LegalPage } from "../components/LegalPage";
import type { LegalDocument } from "../domain/legal";
import { demoRestoreViewKey } from "../data/demo-keys";
import { isCandidateRelease } from "../domain/release";
import {
  chooseCompany,
  readCompanySelection,
  rememberCompanySelection,
} from "../domain/company-selection";

type Organization = { id: string; name: string };
interface Access {
  configured: boolean;
  mode: "demo" | "company" | "portal";
  user: User | null;
  organizations: Organization[];
  organization: Organization | null;
  openAccount(): void;
  demo(): void;
  select(id: string): void;
  newCompany(): void;
  refreshCompanies(selectedId?: string): void;
  signOut(): Promise<void>;
  portal(): void;
}
const Context = createContext<Access | null>(null);
export function CompanyOfflineContext({
  children,
  user,
  organization,
  onExit,
}: {
  children: ReactNode;
  user: User;
  organization: Organization;
  onExit(): void;
}) {
  return (
    <Context.Provider
      value={{
        configured: true,
        mode: "company",
        user,
        organization,
        organizations: [organization],
        openAccount: onExit,
        demo: onExit,
        select: onExit,
        newCompany: onExit,
        refreshCompanies: onExit,
        signOut: async () => onExit(),
        portal: onExit,
      }}
    >
      {children}
    </Context.Provider>
  );
}
const companyPreference = () => {
  try {
    return (
      sessionStorage.getItem("truckcontrol-company-mode") === "yes" ||
      new URLSearchParams(location.search).has("code")
    );
  } catch {
    return false;
  }
};
const restoredDemoPreference = () => {
  try {
    return sessionStorage.getItem(demoRestoreViewKey) === "yes";
  } catch {
    return false;
  }
};
// Capture once before React StrictMode mounts; remove the one-use token from history immediately.
const initialEmailAction =
  typeof window !== "undefined" && customAuthMail && !isCandidateRelease
    ? readEmailAction(window.location.hash)
    : null;
if (initialEmailAction)
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
export function CompanyAccessProvider({ children }: { children: ReactNode }) {
  const [emailAction, setEmailAction] = useState(initialEmailAction);
  const [client] = useState(getSupabaseClient);
  const [mode, setMode] = useState<"demo" | "company" | "portal">(() =>
    companyPreference()
      ? "company"
      : restoredDemoPreference()
        ? "demo"
        : commercialEnabled()
          ? "portal"
          : "demo",
  );
  const [entryView, setEntryView] = useState<"login" | "signup">("login");
  const [entryPlan, setEntryPlan] = useState<Plan["id"]>("limited");
  const [account, setAccount] = useState<{
    user: User | null;
    organizations: Organization[];
    loaded: boolean;
  }>({ user: null, organizations: [], loaded: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(Boolean(client));
  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    let authRevision = 0;
    function receive(user: User | null) {
      if (!active) return;
      setAccount((old) =>
        old.user?.id === user?.id
          ? { ...old, user }
          : { user, organizations: [], loaded: false },
      );
      setLoading(false);
    }
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      authRevision++;
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setMode("company");
      }
      if (event === "SIGNED_OUT") {
        setRecovery(false);
        setSelected(null);
      }
      receive(session?.user ?? null);
    });
    const requestRevision = authRevision;
    // Validate a persisted session with the server; never authorize from user_metadata.
    void client.auth
      .getUser()
      .then(({ data, error }) => {
        if (!active || authRevision !== requestRevision) return;
        if (error && error.name !== "AuthSessionMissingError")
          setError(
            "No se ha podido verificar la sesión. Vuelve a iniciar sesión.",
          );
        receive(data.user);
      })
      .catch(() => {
        if (active) {
          setError("No se puede conectar con el acceso de empresas.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);
  const userId = account.user?.id;
  useEffect(() => {
    if (!client || !userId) return;
    let active = true;
    void client
      .from("organizations")
      .select("id,name")
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setError(
            "No se han podido cargar tus empresas. Reintenta la conexión.",
          );
          return;
        }
        setAccount((old) =>
          old.user?.id === userId
            ? { ...old, organizations: data, loaded: true }
            : old,
        );
        setSelected((old) =>
          chooseCompany(data, old, readCompanySelection(userId)),
        );
        setError("");
      });
    return () => {
      active = false;
    };
  }, [client, userId, revision]);
  const organization =
    account.organizations.find((o) => o.id === selected) ?? null;
  useEffect(() => {
    if (userId && organization)
      rememberCompanySelection(userId, organization.id);
  }, [userId, organization?.id]);
  function changeMode(next: "demo" | "company" | "portal") {
    setMode(next);
    try {
      sessionStorage.removeItem(demoRestoreViewKey);
      sessionStorage.setItem(
        "truckcontrol-company-mode",
        next === "company" ? "yes" : "no",
      );
    } catch {
      /* Preference only. */
    }
  }
  const value: Access = {
    configured: Boolean(client),
    mode,
    user: account.user,
    organizations: account.organizations,
    organization,
    openAccount: () => changeMode("company"),
    portal: () => changeMode("portal"),
    demo: () => changeMode("demo"),
    select: (id) => {
      if (account.organizations.some((o) => o.id === id)) setSelected(id);
    },
    newCompany: () => {
      setSelected(null);
      changeMode("company");
    },
    refreshCompanies: (selectedId) => {
      if (selectedId) setSelected(selectedId);
      setRevision((n) => n + 1);
    },
    signOut: async () => {
      if (!client) return;
      const { error } = await client.auth.signOut();
      if (error)
        throw new Error("No se ha podido cerrar la sesión. Reinténtalo.");
      setAccount({ user: null, organizations: [], loaded: false });
      setSelected(null);
      setRecovery(false);
    },
  };
  return (
    <Context.Provider value={value}>
      {["notice", "privacy", "terms"].includes(
        new URLSearchParams(window.location.search).get("legal") ?? "",
      ) ? (
        <LegalPage
          document={
            new URLSearchParams(window.location.search).get(
              "legal",
            ) as LegalDocument
          }
        />
      ) : emailAction ? (
        <EmailConfirmation
          action={emailAction}
          onCancel={() => {
            setEmailAction(null);
            changeMode("company");
          }}
          onComplete={() => {
            setRecovery(true);
            setEmailAction(null);
            changeMode("company");
          }}
        />
      ) : mode === "portal" && commercialEnabled() ? (
        <PublicPortal
          onDemo={() => {
            window.location.hash = "/dashboard";
            changeMode("demo");
          }}
          onAccess={(view, plan) => {
            setEntryView(view);
            setEntryPlan(plan ?? "limited");
            changeMode("company");
          }}
        />
      ) : mode === "company" && commercialEnabled() ? (
        <CommercialSession
          key={`${account.user?.id ?? "visitor"}:${organization?.id ?? "no-company"}`}
          user={account.user}
          organizationId={organization?.id}
          initialView={entryView}
          plan={entryPlan}
          recovery={recovery}
          onRecovered={() => setRecovery(false)}
          onProvisioned={() => setRevision((n) => n + 1)}
          onBack={() => changeMode("portal")}
          onDemo={() => changeMode("demo")}
          onSignOut={value.signOut}
        >
          {!organization ? (
            <AccessScreen
              client={client}
              user={account.user}
              loading={loading}
              loaded={account.loaded}
              error={error}
              recovery={recovery}
              onRecovered={() => setRecovery(false)}
              onCreated={(id) => {
                setSelected(id);
                setRevision((n) => n + 1);
              }}
              onRetry={() => setRevision((n) => n + 1)}
            />
          ) : (
            children
          )}
        </CommercialSession>
      ) : mode === "company" && (!organization || !account.user || recovery) ? (
        <AccessScreen
          client={client}
          user={account.user}
          loading={loading}
          loaded={account.loaded}
          error={error}
          recovery={recovery}
          onRecovered={() => setRecovery(false)}
          onCreated={(id) => {
            setSelected(id);
            setRevision((n) => n + 1);
          }}
          onRetry={() => setRevision((n) => n + 1)}
        />
      ) : (
        children
      )}
    </Context.Provider>
  );
}
export function useCompany() {
  const value = useContext(Context);
  if (!value) throw new Error("Falta el acceso de empresas.");
  return value;
}
export function FleetAccess({ children }: { children: ReactNode }) {
  const { mode, user, organization, demo } = useCompany();
  const client = getSupabaseClient();
  const repository = useMemo(
    () =>
      mode === "company" && client && user && organization
        ? new SupabaseFleetRepository(client, organization)
        : undefined,
    [mode, client, user?.id, organization?.id, organization?.name],
  );
  return (
    <FleetProvider
      key={repository ? `${user!.id}:${organization!.id}` : "local-demo"}
      repository={repository}
      mode={mode === "company" ? "company" : "demo"}
      onDemo={demo}
    >
      {children}
    </FleetProvider>
  );
}

function AccessScreen({
  client,
  user,
  loading,
  loaded,
  error: externalError,
  recovery,
  onRecovered,
  onCreated,
  onRetry,
}: {
  client: ReturnType<typeof getSupabaseClient>;
  user: User | null;
  loading: boolean;
  loaded: boolean;
  error: string;
  recovery: boolean;
  onRecovered(): void;
  onCreated(id: string): void;
  onRetry(): void;
}) {
  const access = useCompany();
  const [view, setView] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [newCompanyId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const redirect = window.location.origin + window.location.pathname;
    try {
      if (recovery) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        onRecovered();
        setMessage("Contraseña actualizada.");
      } else if (user) {
        if (!companyName.trim())
          throw new Error("Escribe el nombre de tu empresa.");
        const { data, error } = await client
          .from("organizations")
          .insert({
            id: newCompanyId,
            name: companyName.trim(),
            owner_id: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        onCreated(data.id);
      } else if (view === "signup") {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirect },
        });
        if (error) throw error;
        setPassword("");
        if (!data.session)
          setMessage(
            "Revisa tu correo y confirma la cuenta. Después podrás crear tu empresa.",
          );
      } else if (view === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: redirect },
        );
        if (error) throw error;
        setMessage(
          "Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.",
        );
      } else {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setPassword("");
      }
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e ? String(e.code) : "";
      setError(
        code === "invalid_credentials"
          ? "El correo o la contraseña no son correctos."
          : code === "email_not_confirmed"
            ? "Confirma tu correo antes de entrar."
            : "No se ha podido completar la operación. Comprueba los datos, la conexión y la configuración del acceso.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="access-page">
      <div className="access-intro">
        <span className="brand-mark">
          <Truck size={30} />
        </span>
        <p className="eyebrow">TRUCKCONTROL AI</p>
        <h1>
          Tu empresa.
          <br />
          <span>Tu flota, bajo control.</span>
        </h1>
        <p>
          Camiones, conductores y documentos en un espacio propio. Una conexión
          Gmail independiente para cada empresa.
        </p>
        <div className="config-fact">
          <ShieldCheck size={20} /> Acceso protegido por cuenta y empresa
        </div>
      </div>
      <section className="card access-card" aria-labelledby="access-title">
        <Building2 size={28} />
        <h2 id="access-title">
          {!client
            ? "Acceso de empresas pendiente"
            : recovery
              ? "Nueva contraseña"
              : user
                ? "Crea tu empresa"
                : view === "signup"
                  ? "Crear cuenta"
                  : view === "reset"
                    ? "Recuperar acceso"
                    : "Entrar en mi empresa"}
        </h2>
        {!client ? (
          <>
            <p>
              Esta demostración guarda sus datos en el navegador. El acceso de
              empresas se habilita desde el portal de TruckControl AI.
            </p>
            <p>
              Tu Gmail se conectará desde tu empresa cuando se active este
              acceso.
            </p>
          </>
        ) : loading ? (
          <p role="status">Verificando acceso…</p>
        ) : user && !loaded && !recovery ? (
          <>
            <p role={externalError ? "alert" : "status"}>
              {externalError || "Cargando tus empresas…"}
            </p>
            {externalError && <Button onClick={onRetry}>Reintentar</Button>}
          </>
        ) : (
          <form className="access-form" onSubmit={submit}>
            {user && !recovery ? (
              <>
                <p>
                  Sesión iniciada como {user.email}. La nueva empresa comenzará
                  vacía.
                </p>
                <Field label="Nombre de la empresa">
                  <input
                    autoComplete="organization"
                    maxLength={100}
                    minLength={1}
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <>
                {!recovery && (
                  <Field label="Correo electrónico">
                    <input
                      autoComplete="email"
                      type="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                )}
                {(view !== "reset" || recovery) && (
                  <Field label="Contraseña">
                    <input
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete={
                        view === "signup" || recovery
                          ? "new-password"
                          : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <small>Al menos 12 caracteres.</small>
                  </Field>
                )}
              </>
            )}
            {(error || externalError) && (
              <p className="form-error" role="alert">
                {error || externalError}
              </p>
            )}
            {message && (
              <p className="access-message" role="status">
                {message}
              </p>
            )}
            <Button type="submit" disabled={busy} icon={LogIn}>
              {busy
                ? "Un momento…"
                : recovery
                  ? "Guardar contraseña"
                  : user
                    ? "Crear empresa"
                    : view === "signup"
                      ? "Crear cuenta"
                      : view === "reset"
                        ? "Enviar enlace"
                        : "Entrar"}
            </Button>
            {!user && !recovery && (
              <div className="access-links">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setView(view === "signup" ? "login" : "signup");
                    setError("");
                    setMessage("");
                  }}
                >
                  {view === "signup" ? "Ya tengo cuenta" : "Crear cuenta"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setView(view === "reset" ? "login" : "reset")}
                >
                  {view === "reset"
                    ? "Volver al acceso"
                    : "He olvidado la contraseña"}
                </Button>
              </div>
            )}
          </form>
        )}
        <div className="access-links">
          <Button variant="secondary" onClick={access.demo}>
            Volver a la demo
          </Button>
          {user && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void access
                  .signOut()
                  .catch(() => setError("No se ha podido cerrar la sesión."))
              }
            >
              Cerrar sesión
            </Button>
          )}
        </div>
        {access.organizations.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => access.select(access.organizations[0].id)}
          >
            Volver a mi empresa
          </Button>
        )}
      </section>
    </main>
  );
}

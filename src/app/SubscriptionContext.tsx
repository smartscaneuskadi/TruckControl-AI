import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { demoFeatures } from "../domain/subscriptions";
import type {
  Feature,
  Features,
  SubscriptionAccess,
} from "../domain/subscriptions";
interface SubscriptionContextValue {
  enabled: boolean;
  features: Features;
  access: SubscriptionAccess | null;
  refresh(): void;
  openPlans(): void;
}
const Context = createContext<SubscriptionContextValue>({
  enabled: false,
  features: demoFeatures,
  access: null,
  refresh: () => {},
  openPlans: () => {},
});
export function SubscriptionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SubscriptionContextValue;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useSubscription = () => useContext(Context);
export function FeatureGate({
  feature,
  children,
}: {
  feature: Feature;
  children: ReactNode;
}) {
  const subscription = useSubscription();
  if (subscription.enabled && !subscription.features[feature])
    return (
      <section className="card integration-card">
        <h1>Módulo desactivado</h1>
        <p>
          Este apartado no está habilitado para tu cuenta. Puedes consultar tu
          plan o contactar con el administrador.
        </p>
        <button className="button primary" onClick={subscription.openPlans}>
          Consultar mi plan
        </button>
      </section>
    );
  return children;
}

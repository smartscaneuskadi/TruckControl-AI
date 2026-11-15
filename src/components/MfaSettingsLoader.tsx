import { lazy, Suspense } from "react";
const Settings = lazy(() =>
  import("./MfaSettings").then((module) => ({ default: module.MfaSettings })),
);
export function MfaSettingsLoader({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<p role="status">Comprobando autenticadores…</p>}>
      <Settings userId={userId} />
    </Suspense>
  );
}

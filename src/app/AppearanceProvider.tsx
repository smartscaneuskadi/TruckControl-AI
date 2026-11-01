import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { AppearanceContext } from "./AppearanceContext";
import type { AppearanceStatus } from "./AppearanceContext";
import {
  appearanceCacheKey,
  appearanceMetadataKey,
  appearanceSchema,
  defaultAppearance,
  parseAppearance,
  readAppearanceCache,
  setAppearanceDocument,
  writeAppearanceCache,
} from "../domain/appearance";
import type { Appearance } from "../domain/appearance";
import { getSupabaseClient } from "../integrations/supabase/client";
import { saveOwnAppearance } from "../integrations/supabase/appearance";
import { AppearanceSettings } from "../components/AppearanceSettings";
import { Modal } from "../components/ui";

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [client] = useState(getSupabaseClient);
  const [preference, setPreference] = useState(
    () => readAppearanceCache(null)?.preference ?? defaultAppearance,
  );
  const [resolved, setResolved] = useState(() =>
    setAppearanceDocument(preference),
  );
  const [account, setAccount] = useState<string | null>(null);
  const accountRef = useRef<string | null>(null);
  const preferenceRef = useRef(preference);
  const revision = useRef(0);
  const mounted = useRef(true);
  const tail = useRef(Promise.resolve());
  const [status, setStatus] = useState<AppearanceStatus>("local");
  const [opened, setOpened] = useState(false);
  const show = useCallback((value: Appearance) => {
    preferenceRef.current = value;
    setPreference(value);
    setResolved(setAppearanceDocument(value));
  }, []);
  const sync = useCallback(
    (id: string, value: Appearance, stamp: number) => {
      if (!client) return;
      tail.current = tail.current
        .catch(() => {})
        .then(async () => {
          const current = () =>
            mounted.current &&
            accountRef.current === id &&
            revision.current === stamp;
          if (!current()) return;
          setStatus("saving");
          try {
            await saveOwnAppearance(client, id, value, current);
            if (!current()) return;
            writeAppearanceCache(id, value, false);
            setStatus("synced");
          } catch {
            if (current()) setStatus("pending");
          }
        });
    },
    [client],
  );
  const apply = useCallback(
    (next: Appearance) => {
      const value = appearanceSchema.parse(next);
      const stamp = ++revision.current;
      const id = accountRef.current;
      show(value);
      writeAppearanceCache(id, value, Boolean(id));
      setStatus(id ? "pending" : "local");
      if (id && navigator.onLine) sync(id, value, stamp);
    },
    [show, sync],
  );
  useEffect(() => {
    mounted.current = true;
    let active = true;
    function receive(user: User | null) {
      if (!active) return;
      const id = user?.id ?? null;
      const changed = id !== accountRef.current;
      if (changed) {
        ++revision.current;
        accountRef.current = id;
        setAccount(id);
      }
      const cached = readAppearanceCache(id);
      if (cached?.pending && id) {
        show(cached.preference);
        setStatus("pending");
        if (navigator.onLine) sync(id, cached.preference, revision.current);
        return;
      }
      const remote = user
        ? parseAppearance(user.user_metadata?.[appearanceMetadataKey])
        : null;
      const next = remote ?? cached?.preference ?? defaultAppearance;
      show(next);
      writeAppearanceCache(id, next, false);
      setStatus(remote ? "synced" : "local");
    }
    async function refresh() {
      if (!client || !navigator.onLine || document.hidden) return;
      try {
        const result = await client.auth.getUser();
        if (!result.error) receive(result.data.user);
      } catch {
        // A failed refresh must keep the current local preference and account.
      }
    }
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      // Synchronous callback: never await another Auth call while its lock is held.
      if (
        event === "USER_UPDATED" &&
        readAppearanceCache(accountRef.current)?.pending
      )
        return;
      receive(session?.user ?? null);
    }).data.subscription;
    void refresh().catch(() => {});
    const media = [
      window.matchMedia("(prefers-color-scheme: dark)"),
      window.matchMedia("(prefers-reduced-motion: reduce)"),
    ];
    const resolve = () =>
      setResolved(setAppearanceDocument(preferenceRef.current));
    const storage = (event: StorageEvent) => {
      if (event.key === appearanceCacheKey(accountRef.current)) {
        const next = readAppearanceCache(accountRef.current);
        if (next) {
          ++revision.current;
          show(next.preference);
          setStatus(
            next.pending ? "pending" : accountRef.current ? "synced" : "local",
          );
          if (next.pending && accountRef.current && navigator.onLine)
            sync(accountRef.current, next.preference, revision.current);
        }
      }
    };
    media.forEach((query) => query.addEventListener("change", resolve));
    window.addEventListener("storage", storage);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      mounted.current = false;
      subscription?.unsubscribe();
      media.forEach((query) => query.removeEventListener("change", resolve));
      window.removeEventListener("storage", storage);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client, show, sync]);
  return (
    <AppearanceContext.Provider
      value={{
        preference,
        resolvedTheme: resolved.theme,
        motion: resolved.motion,
        account,
        status,
        apply,
        open: () => setOpened(true),
      }}
    >
      {children}
      {opened && (
        <Modal
          title="Apariencia de TruckControl"
          wide
          allowAppearance={false}
          onClose={() => setOpened(false)}
        >
          <AppearanceSettings compact />
        </Modal>
      )}
    </AppearanceContext.Provider>
  );
}

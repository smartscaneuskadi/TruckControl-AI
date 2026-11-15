import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../integrations/supabase/client";
import {
  mfaStateEvent,
  nativeSessionHint,
  readNativeMfa,
} from "../integrations/supabase/mfa";
import type { NativeMfaState } from "../integrations/supabase/mfa";
import { endPrivateSessions } from "./session-events";

export type MfaSessionStatus = {
  kind: "checking" | "ready" | "challenge" | "unavailable";
  userId: string | null;
  state: NativeMfaState | null;
  signingOut: boolean;
};
type Client = NonNullable<ReturnType<typeof getSupabaseClient>>;

/** This gate controls mounting private views. Native Auth and SQL remain authoritative. */
export function useNativeMfaSession(client: Client | null) {
  const [status, setStatus] = useState<MfaSessionStatus>({
    kind: "checking",
    userId: null,
    state: null,
    signingOut: false,
  });
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    if (!client) return;
    let active = true,
      suspended = false,
      signingOut = false,
      generation = 0;
    let actor: string | null | undefined;
    let actorSessionId: string | null | undefined;
    let accepted: NativeMfaState | null = null;
    let acceptedHint: ReturnType<typeof nativeSessionHint> = null;
    let requireRemainingChallenge = false;
    // Keep MFA-origin context across logout/relogin. A late refresh from removing
    // the last factor must not replace a newer baseline SID for that same actor.
    const mfaActors = new Set<string>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const defer = (action: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (active) action();
      }, 0);
      timers.add(timer);
    };
    const close = (
      kind: MfaSessionStatus["kind"],
      userId: string | null,
      state: NativeMfaState | null = null,
    ) => {
      accepted = null;
      acceptedHint = null;
      endPrivateSessions();
      setStatus({ kind, userId, state, signingOut });
    };
    function check(
      session: Session | null,
      event: AuthChangeEvent | "RECHECK",
      force = false,
    ) {
      if (!active || suspended || signingOut) return;
      const id = session?.user.id ?? null;
      const stamp = ++generation;
      if (!id) {
        actor = null;
        requireRemainingChallenge = false;
        close("checking", null);
        return;
      }
      const hint = nativeSessionHint(session);
      const sameToken =
        accepted?.user.id === id && accepted.token === session!.access_token;
      const unchangedRefresh =
        event === "TOKEN_REFRESHED" &&
        accepted?.user.id === id &&
        hint?.sessionId &&
        hint.sessionId === acceptedHint?.sessionId &&
        (hint.aal === accepted.currentLevel ||
          (!accepted.factors.length && hint.aal === "aal1"));
      const verifiedHere =
        event === "MFA_CHALLENGE_VERIFIED" &&
        accepted?.user.id === id &&
        hint?.aal === "aal2";
      const preserve =
        !force &&
        !requireRemainingChallenge &&
        Boolean(sameToken || unchangedRefresh || verifiedHere);
      if (!preserve) close("checking", id);
      actor = id;
      actorSessionId = hint?.sessionId ?? null;
      // Auth callbacks run under an SDK lock. Start native calls after it releases.
      defer(() => {
        void readNativeMfa(client!, id)
          .then((state) => {
            if (
              !active ||
              suspended ||
              signingOut ||
              generation !== stamp ||
              actor !== id
            )
              return;
            if (state.factors.length || state.pendingFactors.length)
              mfaActors.add(id);
            if (
              state.needsChallenge ||
              (requireRemainingChallenge && state.factors.length > 0)
            ) {
              close("challenge", id, state);
            } else {
              requireRemainingChallenge = false;
              accepted = state;
              acceptedHint = nativeSessionHint({
                ...session!,
                access_token: state.token,
              });
              setStatus({
                kind: "ready",
                userId: id,
                state,
                signingOut: false,
              });
            }
          })
          .catch(() => {
            if (
              active &&
              !suspended &&
              !signingOut &&
              generation === stamp &&
              actor === id
            )
              close("unavailable", id);
          });
      });
    }
    function refresh(force = false) {
      const stamp = generation;
      void client!.auth
        .getSession()
        .then(({ data, error }) => {
          if (!active || suspended || signingOut || generation !== stamp)
            return;
          if (error) close("unavailable", actor ?? null);
          else check(data.session, "RECHECK", force);
        })
        .catch(() => {
          if (active && generation === stamp)
            close("unavailable", actor ?? null);
        });
    }
    const subscription = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const id = session?.user.id ?? null;
      if (event === "MFA_CHALLENGE_VERIFIED" && id) mfaActors.add(id);
      if (event === "SIGNED_OUT") {
        signingOut = false;
        actor = null;
        actorSessionId = null;
        requireRemainingChallenge = false;
        ++generation;
        close("checking", null);
        return;
      }
      if (signingOut && actor === id) {
        // Ignore a same-actor refresh/recovery/late MFA result while logout is
        // pending or failed. The native SIGNED_OUT event above is terminal;
        // retrying logout does not turn this latch into an access grant.
        ++generation;
        return;
      }
      if (event === "SIGNED_IN" && actor !== id) signingOut = false;
      const hint = nativeSessionHint(session);
      const baselineRefresh = Boolean(
        event === "TOKEN_REFRESHED" &&
        id &&
        actor &&
        accepted?.user.id === actor &&
        !accepted.factors.length &&
        !accepted.pendingFactors.length &&
        !requireRemainingChallenge &&
        !mfaActors.has(actor) &&
        !mfaActors.has(id) &&
        !signingOut &&
        hint?.aal !== "aal2",
      );
      if (
        signingOut ||
        (["MFA_CHALLENGE_VERIFIED", "TOKEN_REFRESHED", "USER_UPDATED"].includes(
          event,
        ) &&
          ((actor !== undefined && actor !== id && !baselineRefresh) ||
            (actorSessionId &&
              hint?.sessionId &&
              actorSessionId !== hint.sessionId &&
              !baselineRefresh)))
      ) {
        // Native verify installs its response before notifying subscribers. A late
        // response after logout/actor change must never reopen that actor's view.
        ++generation;
        signingOut = true;
        close("unavailable", actor ?? null);
        defer(() => {
          void client!.auth.signOut({ scope: "local" }).catch(() => {});
        });
        return;
      }
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        if (actor !== id || actorSessionId !== (hint?.sessionId ?? null))
          requireRemainingChallenge = false;
        actor = id;
        actorSessionId = hint?.sessionId ?? null;
      }
      if (event === "MFA_CHALLENGE_VERIFIED") requireRemainingChallenge = false;
      if (suspended) {
        ++generation;
        return;
      }
      check(session, event);
    });
    function mutation(event: Event) {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      const scoped =
        detail && typeof detail === "object"
          ? (detail as Record<string, unknown>)
          : null;
      const reason = scoped ? scoped.reason : detail;
      if (reason === "factor-removed") {
        const affectedActor = scoped?.userId ?? actor;
        if (typeof affectedActor === "string") mfaActors.add(affectedActor);
      }
      if (scoped && scoped.userId !== actor) return;
      if (reason === "signout") {
        signingOut = true;
        ++generation;
        // Keep the existing disabled pending-logout control for baseline
        // accounts. The deny latch still rejects late auth responses, and RAM
        // capabilities/secrets close synchronously before network revocation.
        if (accepted && !accepted.factors.length) endPrivateSessions();
        else close("checking", actor ?? null);
      } else if (reason === "factor-removed") {
        const originSession =
          !scoped?.sessionId || scoped.sessionId === actorSessionId;
        requireRemainingChallenge = originSession;
        ++generation;
        close("checking", actor ?? null);
        if (!scoped || !originSession) refresh(true);
      } else if (reason === "signout-failed" && signingOut) {
        ++generation;
        close("unavailable", actor ?? null);
      } else if (reason === "refresh") refresh();
    }
    function suspend() {
      suspended = true;
      ++generation;
      flushSync(() => close("checking", actor ?? null));
    }
    function resume(event: PageTransitionEvent) {
      if (!suspended && !event.persisted) return;
      suspended = false;
      refresh(true);
    }
    function focus() {
      if (!document.hidden) refresh();
    }
    retry.current = () => refresh(true);
    window.addEventListener(mfaStateEvent, mutation);
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("online", focus);
    refresh();
    return () => {
      active = false;
      ++generation;
      timers.forEach(clearTimeout);
      subscription.data.subscription.unsubscribe();
      window.removeEventListener(mfaStateEvent, mutation);
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("online", focus);
      retry.current = () => {};
    };
  }, [client]);
  return { ...status, retry: () => retry.current() };
}

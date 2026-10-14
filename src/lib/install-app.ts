import { useEffect, useState } from "react";

/** Captures the browser's install prompt (Android/Chrome) so a button can trigger it later. */
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export type InstallState = "prompt" | "ios" | "unavailable";

export function useInstallApp() {
  const [state, setState] = useState<InstallState>(() =>
    deferred ? "prompt" : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "unavailable",
  );
  useEffect(() => {
    const update = () => setState(deferred ? "prompt" : state);
    listeners.add(update);
    return () => { listeners.delete(update); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const install = async () => { if (deferred) { await deferred.prompt(); deferred = null; } };
  return { state, install };
}

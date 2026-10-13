import { supabase } from "@/integrations/supabase/client";

/** Turning push on/off for this browser. The native apps (Capacitor) get their own push later. */
export type PushSupport = "ok" | "unsupported" | "ios-home-screen" | "native-app" | "denied";

export async function pushSupport(): Promise<PushSupport> {
  if (typeof window === "undefined") return "unsupported";
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) return "native-app";
  } catch { /* website */ }
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return ios && !standalone ? "ios-home-screen" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

const keyBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** This browser's current subscription, if push is on here. */
export async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "denied" : "dismissed");
  const res = await fetch("/api/public/push/key");
  const { publicKey } = (await res.json()) as { publicKey: string | null };
  if (!publicKey) throw new Error("not-ready");
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const j = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    _endpoint: sub.endpoint, _p256dh: j.keys?.["p256dh"] ?? "", _auth: j.keys?.["auth"] ?? "", _ua: navigator.userAgent.slice(0, 300),
  });
  if (error) throw new Error(error.message);
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.rpc("delete_push_subscription", { _endpoint: sub.endpoint });
  await sub.unsubscribe();
}

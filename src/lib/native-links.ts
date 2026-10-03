// Runs only inside the native app; on the website it does nothing.
const OWN_HOSTS = new Set(["valueaqar.com", "www.valueaqar.com"]);

export async function initNativeShell() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const [{ Browser }, { App }] = await Promise.all([import("@capacitor/browser"), import("@capacitor/app")]);

  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.href;
    let url: URL;
    try { url = new URL(href); } catch { return; }
    if (url.protocol === "http:" || url.protocol === "https:") {
      if (OWN_HOSTS.has(url.hostname)) return;
      e.preventDefault();
      void Browser.open({ url: href });
    } else if (["tel:", "mailto:", "whatsapp:", "sms:"].includes(url.protocol)) {
      e.preventDefault();
      window.location.href = href; // handed to the OS
    }
  }, true);

  const origOpen = window.open.bind(window);
  window.open = (u?: string | URL, ...rest) => {
    const s = u?.toString();
    if (s) {
      try {
        const url = new URL(s, location.href);
        if (!OWN_HOSTS.has(url.hostname)) { void Browser.open({ url: url.href }); return null; }
      } catch { /* fall through */ }
    }
    return origOpen(u, ...rest);
  };

  installOfflineGuard();

  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back(); else void App.exitApp();
  });
}

/** Shows a local "no connection" screen while offline; retry checks the site before reloading. */
export function installOfflineGuard() {
  if (document.getElementById("va-offline")) return;
  const el = document.createElement("div");
  el.id = "va-offline";
  el.setAttribute("role", "alert");
  el.dir = "rtl";
  el.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:none;place-items:center;text-align:center;padding:24px;background:#0b2545;color:#fff;font-family:Cairo,system-ui,sans-serif";
  el.innerHTML = '<div><div style="font-weight:800;font-size:28px;color:#2ec4b6;margin-bottom:20px">Value Aqar</div><h2 style="font-size:22px;margin:0 0 8px">لا يوجد اتصال بالإنترنت</h2><p data-msg style="opacity:.8;margin:0 0 24px">تحقق من اتصالك ثم حاول مرة أخرى.</p><button type="button" style="background:#2ec4b6;color:#0b2545;border:0;border-radius:12px;padding:14px 28px;font-size:16px;font-weight:700">إعادة المحاولة</button></div>';
  document.body.appendChild(el);
  const msg = el.querySelector("[data-msg]") as HTMLElement;
  const show = () => { el.style.display = "grid"; };
  const hide = () => { el.style.display = "none"; };
  const check = async () => {
    try {
      const r = await fetch(`/robots.txt?ping=${Date.now()}`, { cache: "no-store" });
      return r.ok;
    } catch { return false; }
  };
  el.querySelector("button")!.addEventListener("click", async () => {
    msg.textContent = "جارٍ التحقق من الاتصال...";
    if (navigator.onLine && (await check())) { hide(); window.location.reload(); }
    else msg.textContent = "ما زال الاتصال غير متاح. حاول بعد قليل.";
  });
  window.addEventListener("offline", show);
  window.addEventListener("online", async () => { if (await check()) hide(); });
  if (!navigator.onLine) show();
}

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

  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back(); else void App.exitApp();
  });
}

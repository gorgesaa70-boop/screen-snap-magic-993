import { THEME_INIT } from "@/lib/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LangProvider, useLang, t, getLang } from "@/lib/i18n";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useCallback, useEffect, type ReactNode } from "react";
import { useSocialReturn } from "@/components/auth/SocialLogin";

import appCss from "../styles.css?url";
import { Toaster } from "sonner";
import { AnnouncementPopup } from "@/components/site/SiteAnnouncement";
import { supabase } from "@/integrations/supabase/client";
import { reportLovableError } from "../lib/lovable-error-reporting";

/** Shared frame for the 404 and error screens: logo, message, and ways back into the site (Arabic / English). */
function FallbackScreen({ code, title, text, children }: { code?: string; title: string; text: string; children: ReactNode }) {
  useEffect(() => { document.title = `${title} | ${t("فاليو عقار")}`; }, [title]);
  return (
    <div dir={getLang() === "en" ? "ltr" : "rtl"} className="flex min-h-screen flex-col items-center justify-center bg-secondary px-4 py-10 text-center">
      <a href="/" className="mb-8 text-2xl font-extrabold text-primary">{t("فاليو عقار")} <span className="text-teal">Value Aqar</span></a>
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-card">
        {code && <p className="text-6xl font-extrabold text-primary">{code}</p>}
        <h1 className="mt-3 text-xl font-extrabold text-primary">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>
      </div>
    </div>
  );
}
const fallbackBtn = "inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-110";
const fallbackBtnOutline = "inline-flex h-11 items-center justify-center rounded-xl border border-primary px-5 text-sm font-bold text-primary hover:bg-secondary";

function NotFoundComponent() {
  return (
    <FallbackScreen code="404" title={t("الصفحة دي مش موجودة")} text={t("يمكن الرابط اتغيّر أو العقار اتشال. تقدر ترجع للرئيسية أو تتصفح العقارات المتاحة.")}>
      <a href="/" className={fallbackBtn}>{t("الرئيسية")}</a>
      <a href="/#properties" className={fallbackBtnOutline}>{t("تصفّح العقارات")}</a>
      <a href="/#request" className={fallbackBtnOutline}>{t("اطلب عقارك")}</a>
    </FallbackScreen>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    void import("../lib/app-errors").then((m) => m.reportAppError(error)).catch(() => {});
  }, [error]);

  return (
    <FallbackScreen title={t("الصفحة ما حمّلتش")} text={t("حصل خطأ عندنا واتسجّل عشان نصلّحه. جرّب تاني، أو ارجع للرئيسية.")}>
      <button type="button" onClick={() => { router.invalidate(); reset(); }} className={fallbackBtn}>{t("جرّب تاني")}</button>
      <a href="/" className={fallbackBtnOutline}>{t("الرئيسية")}</a>
    </FallbackScreen>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1F2B4D" },
      { name: "author", content: "Value Aqar" },
      { name: "google-site-verification", content: "lOa3fWX64EeXcESQQpPaasWdric73CaGjOpcNTUKjFI" },
      { name: "google-site-verification", content: "HVwysSnyE82fA-_xQNbPDBIq1FmYjIgFQ_Tmyi4213I" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Sets the dark class before the first paint (see lib/theme). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useSocialReturn(useCallback((to: string) => { void router.navigate({ to, replace: true }); }, [router]));
  useEffect(() => {
    void import("../lib/native-links").then((m) => m.initNativeShell()).catch(() => {});
    void import("../lib/attribution").then((m) => m.captureAttribution()).catch(() => {});
    void import("../lib/app-errors").then((m) => m.initErrorReporting()).catch(() => {});
  }, []);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <RootInner />
      </LangProvider>
    </QueryClientProvider>
  );
}

function RootInner() {
  const { dir } = useLang();
  return (
    <>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" dir={dir} richColors theme="system" />
      <AnnouncementPopup />
    </>
  );
}

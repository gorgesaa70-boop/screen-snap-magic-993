import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/site/ui";
import { AppDownload, storeFor, useAppLinks } from "@/components/site/AppDownload";
import { pageHead } from "@/lib/seo";
import { t, useLang } from "@/lib/i18n";

/** Target of the QR code: phones go straight to their store once a link exists, otherwise they see the options. */
export const Route = createFileRoute("/app")({
  head: () => pageHead({
    path: "/app",
    title: "حمّل تطبيق Value Aqar | فاليو عقار",
    description: "حمّل تطبيق فاليو عقار على الآيفون من App Store أو على الأندرويد من Google Play.",
  }),
  component: AppPage,
});

function AppPage() {
  useLang();
  const q = useAppLinks();
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    const store = storeFor(navigator.userAgent);
    const url = store === "ios" ? q.data.ios : store === "android" ? q.data.android : null;
    if (url) { setRedirecting(true); window.location.replace(url); }
  }, [q.data]);
  return (
    <PageShell>
      <div className="mx-auto max-w-xl px-4 pt-8 md:px-6">
        {redirecting && <p className="mb-4 rounded-2xl bg-teal-soft p-4 text-center text-sm font-bold text-primary">{t("جارٍ فتح المتجر...")}</p>}
        <AppDownload compact />
      </div>
    </PageShell>
  );
}

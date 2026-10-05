import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { PageShell } from "@/components/site/ui";
import { fetchPublicProperties } from "@/components/site/data";
import { PropertiesMap } from "@/components/site/PropertiesMap";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/map")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://valueaqar.com/map" }],
    meta: [
      { title: "خريطة العقارات | فاليو عقار" },
      { name: "description", content: "تصفح العقارات المتاحة على الخريطة واعرف موقع كل عقار وسعره." },
      { property: "og:title", content: "خريطة العقارات | فاليو عقار" },
      { property: "og:url", content: "https://valueaqar.com/map" },
      { property: "og:description", content: "كل العقارات المعتمدة على خريطة واحدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  useLang();
  const q = useQuery({ queryKey: ["public-properties"], queryFn: () => fetchPublicProperties() });
  const all = q.data ?? [];
  const located = all.filter((p) => p.lat != null && p.lng != null);
  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-10 md:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary md:text-3xl"><MapPin className="size-6 text-teal" />{t("خريطة العقارات")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("اضغط على أي علامة لعرض السعر وفتح تفاصيل العقار.")}</p>
        <div className="mt-5">
          {q.isLoading ? <div className="h-72 animate-pulse rounded-2xl bg-muted md:h-[500px]" />
            : q.isError ? <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">{t("تعذّر تحميل العقارات، حاول تحديث الصفحة.")}</p>
            : located.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
                <p className="font-bold text-primary">{t("لا توجد عقارات محدد موقعها على الخريطة بعد")}</p>
                <Link to="/" className="mt-3 inline-block text-sm font-bold text-teal">{t("تصفح كل العقارات")}</Link>
              </div>
            ) : <PropertiesMap properties={located} showError />}
        </div>
        {all.length > located.length && !q.isLoading && (
          <p className="mt-2 text-xs text-muted-foreground">{t("عقار بدون موقع محدد لا يظهر على الخريطة.", { n: all.length - located.length })}</p>
        )}
      </div>
    </PageShell>
  );
}

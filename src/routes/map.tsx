import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { PageShell, inputCls } from "@/components/site/ui";
import { PURPOSES, TYPES, fetchPublicProperties } from "@/components/site/data";
import { AreaFilter, matchesArea } from "@/components/site/AreaFilter";
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
  const all = useMemo(() => q.data ?? [], [q.data]);
  const [f, setF] = useState({ city: "", area: "", purpose: "", type: "" });
  const filtered = useMemo(() => all.filter((p) => matchesArea(p, f) && (!f.purpose || p.status === f.purpose) && (!f.type || p.type === f.type)), [all, f]);
  const located = filtered.filter((p) => p.lat != null && p.lng != null);
  const anyLocated = all.some((p) => p.lat != null && p.lng != null);
  const active = !!(f.city || f.area || f.purpose || f.type);
  const sel = `${inputCls} h-10`;
  return (
    <PageShell>
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-10 md:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary md:text-3xl"><MapPin className="size-6 text-teal" />{t("خريطة العقارات")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("اضغط على أي علامة لعرض السعر وفتح تفاصيل العقار.")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <AreaFilter city={f.city} area={f.area} onChange={(v) => setF((x) => ({ ...x, ...v }))} className={sel} />
          <select aria-label={t("الغرض")} className={sel} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>
            <option value="">{t("كل الأغراض")}</option>{PURPOSES.map((x) => <option key={x} value={x}>{t(x)}</option>)}
          </select>
          <select aria-label={t("نوع العقار")} className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="">{t("كل الأنواع")}</option>{TYPES.map((x) => <option key={x} value={x}>{t(x)}</option>)}
          </select>
        </div>
        {active && !q.isLoading && (
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {t("على الخريطة:")} {located.length}
            <button type="button" onClick={() => setF({ city: "", area: "", purpose: "", type: "" })} className="ms-3 text-teal hover:underline">{t("مسح الفلاتر")}</button>
          </p>
        )}
        <div className="mt-3">
          {q.isLoading ? <div className="h-72 animate-pulse rounded-2xl bg-muted md:h-[500px]" />
            : q.isError ? <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">{t("العقارات ماحمّلتش، حدّث الصفحة.")}</p>
            : located.length === 0 && anyLocated ? (
              <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
                <p className="font-bold text-primary">{t("مفيش عقارات على الخريطة بالفلاتر دي")}</p>
                <button type="button" onClick={() => setF({ city: "", area: "", purpose: "", type: "" })} className="mt-3 text-sm font-bold text-teal">{t("مسح الفلاتر")}</button>
              </div>
            ) : located.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
                <p className="font-bold text-primary">{t("لسه مفيش عقارات متحدد مكانها على الخريطة")}</p>
                <Link to="/" className="mt-3 inline-block text-sm font-bold text-teal">{t("تصفح كل العقارات")}</Link>
              </div>
            ) : <PropertiesMap properties={located} showError />}
        </div>
        {filtered.length > located.length && !q.isLoading && (
          <p className="mt-2 text-xs text-muted-foreground">{t("عقار بدون موقع محدد لا يظهر على الخريطة.", { n: filtered.length - located.length })}</p>
        )}
      </div>
    </PageShell>
  );
}

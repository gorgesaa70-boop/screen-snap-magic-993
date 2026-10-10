import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapPin, Search, Users } from "lucide-react";
import { PageShell, Avatar, inputCls } from "@/components/site/ui";
import { t, useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AREAS, fetchPublicBrokers, formatPrice } from "@/components/site/data";

export const Route = createFileRoute("/brokers/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://valueaqar.com/brokers" }],
    meta: [
      { title: "الوسطاء العقاريون | فاليو عقار" },
      { name: "description", content: "تصفح الوسطاء العقاريين في برج العرب الجديدة وابحث حسب المنطقة وتواصل مباشرة." },
      { property: "og:title", content: "الوسطاء العقاريون | فاليو عقار" },
      { property: "og:url", content: "https://valueaqar.com/brokers" },
      { property: "og:description", content: "دليل الوسطاء العقاريين ومناطق عملهم على منصة فاليو عقار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BrokersPage,
});

function BrokersPage() {
  useLang();
  const { data = [], isLoading } = useQuery({ queryKey: ["public-brokers"], queryFn: fetchPublicBrokers });
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const list = useMemo(
    () => data.filter((b) => (!area || b.areas.includes(area)) && (!q || b.name.includes(q.trim()) || (b.specialty ?? "").includes(q.trim()))),
    [data, q, area],
  );
  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
          <p className="text-sm font-bold text-teal">{t("دليل فاليو عقار")}</p>
          <h1 className="mt-2 text-2xl font-extrabold text-primary-foreground md:text-4xl">{t("الوسطاء العقاريون")}</h1>
          <p className="mt-3 max-w-xl text-sm text-primary-foreground/80 md:text-base">{t("اختر الوسيط المناسب حسب المنطقة والتخصص وتواصل معه مباشرة.")}</p>
          <div className="mt-6 grid gap-2.5 rounded-2xl bg-card p-3 sm:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className={`${inputCls} ps-9`} placeholder={t("ابحث بالاسم أو التخصص")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className={inputCls} value={area} onChange={(e) => setArea(e.target.value)} aria-label={t("المنطقة")}>
              <option value="">{t("كل المناطق")}</option>
              {AREAS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
            </select>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
        <p className="mb-4 text-sm font-bold text-primary" aria-live="polite">{isLoading ? t("جارٍ التحميل...") : `${formatPrice(list.length)} ${t("وسيط")}`}</p>
        {!isLoading && list.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <Users className="mx-auto size-10 text-teal" />
            <p className="mt-3 font-bold text-primary">{t("لا يوجد وسطاء مطابقون")}</p>
            <Button variant="link" onClick={() => { setQ(""); setArea(""); }} className="mt-4 text-sm font-bold text-primary underline">{t("مسح الفلاتر")}</Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((b) => (
              <Link key={b.id} to="/brokers/$slug" params={{ slug: b.slug }} className="group rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-teal hover:shadow-card focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none">
                <div className="flex items-center gap-4">
                  <Avatar name={b.name} url={b.photo_url} />
                  <div className="min-w-0">
                    <h2 className="truncate font-bold text-primary">{b.name}</h2>
                    <p className="truncate text-sm text-muted-foreground">{b.specialty}</p>
                  </div>
                </div>
                <p className="mt-4 flex items-start gap-2 text-sm text-foreground/75"><MapPin className="mt-0.5 size-4 shrink-0 text-teal" />{b.areas.map(t).join(" / ") || "—"}</p>
                <div className="mt-4 flex items-center justify-between">
                  {b.is_demo ? <span className="text-[11px] text-muted-foreground">{t("بيانات تجريبية")}</span> : <span />}
                  <span className="text-sm font-bold text-primary group-hover:text-teal">{t("عرض الملف ←")}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

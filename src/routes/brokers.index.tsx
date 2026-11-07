import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Briefcase, Building2, MapPin, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Avatar, inputCls, btnTeal } from "@/components/site/ui";
import { useMe } from "@/hooks/useAuth";
import { t, useLang } from "@/lib/i18n";
import { fetchAll } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { ACCOUNT_LABEL, CITIES, CITY_NAMES, areasOf, citiesOf, fetchPublicBrokers, formatPrice, useLocations } from "@/components/site/data";

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

/** Quick filter by account kind; offices count as companies. */
const KINDS = [
  { id: "", label: "الكل" },
  { id: "company", label: "شركات", types: ["company", "office"] },
  { id: "individual", label: "وسطاء أفراد", types: ["individual"] },
  { id: "developer", label: "مطوّرين", types: ["developer"] },
] as const;

/** Approved listings per account (residential, mall and industrial), for the count on each card. */
async function fetchListingCounts() {
  const rows = await fetchAll<{ broker_id: string | null }>((from, to) =>
    supabase.from("properties").select("broker_id").eq("review_status", "approved").not("broker_id", "is", null).order("id").range(from, to));
  const out: Record<string, number> = {};
  for (const r of rows) if (r.broker_id) out[r.broker_id] = (out[r.broker_id] ?? 0) + 1;
  return out;
}

function BrokersPage() {
  useLocations();
  useLang();
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ["public-brokers"], queryFn: fetchPublicBrokers });
  const counts = useQuery({ queryKey: ["broker-listing-counts"], queryFn: fetchListingCounts, staleTime: 5 * 60_000 }).data ?? {};
  // «انضم كوسيط» is for visitors and customers; anyone who already has (or asked for) an account doesn't see it.
  const { user, me, loading } = useMe();
  const canJoin = !loading && !me?.broker;
  // Visitors sign in first and come straight back to the join form.
  const joinHref = user ? "/join" : `/auth?next=${encodeURIComponent("/join")}`;
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [kind, setKind] = useState("");
  const filtered = !!(q.trim() || city || area || kind);
  const kindTypes = (id: string): readonly string[] | null => {
    const k = KINDS.find((x) => x.id === id);
    return k && "types" in k ? k.types : null;
  };
  // Only the kinds that have at least one account get a chip.
  const kinds = KINDS.filter((k) => !("types" in k) || data.some((b) => (k.types as readonly string[]).includes(b.account_type ?? "")));
  const list = useMemo(() => {
    const wanted = area ? [area] : city ? [city, ...areasOf(city)] : null;
    const types = kindTypes(kind);
    return data
      .filter((b) => (!wanted || b.areas.some((a) => wanted.includes(a))) && (!q || b.name.includes(q.trim()) || (b.specialty ?? "").includes(q.trim()))
        && (!types || types.includes(b.account_type ?? "")))
      // Accounts with listings first (stable for the rest, which keeps the join order).
      .map((b, i) => ({ b, i, n: counts[b.id] ?? 0 }))
      .sort((x, y) => y.n - x.n || x.i - y.i)
      .map((x) => x.b);
  }, [data, q, city, area, kind, counts]);
  const cityAreas = CITIES[city] ?? [];
  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-14">
          <p className="text-xs font-bold text-teal md:text-sm">{t("دليل فاليو عقار")}</p>
          <h1 className="mt-1 text-2xl font-extrabold text-primary-foreground md:mt-2 md:text-4xl">{t("الوسطاء العقاريون")}</h1>
          <p className="mt-2 max-w-xl text-sm text-primary-foreground/80 md:mt-3 md:text-base">{t("اختار الوسيط المناسب حسب المنطقة والتخصص، وكلّمه من خلال فاليو عقار.")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-card p-2.5 sm:grid-cols-[1fr_170px_170px] md:mt-6 md:gap-2.5 md:p-3">
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className={`${inputCls} ps-9`} placeholder={t("ابحث بالاسم أو التخصص")} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className={inputCls} value={city} onChange={(e) => { setCity(e.target.value); setArea(""); }} aria-label={t("المدينة")}>
              <option value="">{t("كل المدن")}</option>
              {CITY_NAMES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </select>
            <select className={inputCls} value={area} onChange={(e) => setArea(e.target.value)} aria-label={t("المنطقة")} disabled={!cityAreas.length}>
              <option value="">{t("كل المناطق")}</option>
              {cityAreas.map((a) => <option key={a} value={a}>{t(a)}</option>)}
            </select>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pt-5 md:px-6 md:pt-8">
        {kinds.length > 2 && (
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label={t("نوع الحساب")}>
            {kinds.map((k) => (
              <button key={k.id} type="button" onClick={() => setKind(k.id)} aria-pressed={kind === k.id}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold transition ${kind === k.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>
                {t(k.label)}
              </button>
            ))}
          </div>
        )}
        <p className="mb-4 text-sm font-bold text-primary" aria-live="polite">{isLoading ? t("بيحمّل...") : isError ? "" : `${formatPrice(list.length)} ${t("وسيط")}`}</p>
        {isError ? (
          // A loading problem is not "no results": say so and offer a retry.
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <p className="font-bold text-primary">{t("الوسطاء ماحمّلوش دلوقتي")}</p>
            <Button variant="link" onClick={() => refetch()} className="mt-3 text-sm font-bold text-primary underline">{t("جرّب تاني")}</Button>
          </div>
        ) : !isLoading && list.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <Users className="mx-auto size-10 text-teal" />
            <p className="mt-3 font-bold text-primary">{filtered ? t("مفيش وسطاء بالمواصفات دي") : t("لسه مفيش وسطاء منشورين")}</p>
            {filtered
              ? <Button variant="link" onClick={() => { setQ(""); setArea(""); setKind(""); }} className="mt-4 text-sm font-bold text-primary underline">{t("مسح الفلاتر")}</Button>
              : <a href="/#request" className="mt-4 inline-block text-sm font-bold text-teal">{t("قولّنا بتدوّر على إيه وإحنا نوصّلك")}</a>}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {list.map((b) => {
              const n = counts[b.id] ?? 0;
              const cities = citiesOf(b.areas).map((c) => t(c)).join(" · ");
              const label = b.account_type ? ACCOUNT_LABEL[b.account_type] : null;
              return (
                <Link key={b.id} to="/brokers/$slug" params={{ slug: b.slug }} className="group flex flex-col rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-teal hover:shadow-card focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none md:p-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={b.name} url={b.photo_url} />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-bold text-primary">{b.name}</h2>
                      {label && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-bold text-primary">{b.account_type === "individual" ? <Briefcase className="size-3" /> : <Building2 className="size-3" />}{t(label)}</span>}
                    </div>
                    {n > 0 && (
                      <div className="shrink-0 rounded-xl bg-secondary px-3 py-1.5 text-center">
                        <p className="text-lg leading-none font-extrabold text-primary">{formatPrice(n)}</p>
                        <p className="mt-1 text-[11px] font-bold text-muted-foreground">{t("إعلان")}</p>
                      </div>
                    )}
                  </div>
                  {b.specialty && <p className="mt-3 line-clamp-1 text-sm text-muted-foreground">{b.specialty}</p>}
                  {cities && <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground/75"><MapPin className="mt-px size-3.5 shrink-0 text-teal" />{cities}</p>}
                  <div className="min-h-4 flex-1" />
                  <div className="flex items-center justify-between border-t pt-3">
                    {b.is_demo ? <span className="text-[11px] text-muted-foreground">{t("بيانات تجريبية")}</span> : <span />}
                    <span className="text-sm font-bold text-primary group-hover:text-teal">{t("عرض الملف ←")}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {canJoin && !isError && (
          <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-primary">{t("إنت وسيط أو شركة تسويق؟")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("اعرض عقاراتك واستقبل عملاء من فاليو عقار. سجّل برقم موبايلك وقدّم طلب الانضمام، وبعد المراجعة ملفك يظهر هنا.")}</p>
            </div>
            <a href={joinHref} className={`${btnTeal} shrink-0`}><Briefcase className="size-4" />{t("انضم كوسيط أو شركة")}<ArrowLeft className="size-4 ltr:rotate-180" /></a>
          </div>
        )}
      </section>
    </PageShell>
  );
}

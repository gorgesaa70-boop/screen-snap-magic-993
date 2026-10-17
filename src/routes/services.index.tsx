import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, Camera, HardHat, Wrench, MapPin, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { PageShell, Avatar, inputCls, btnOutline, btnTeal } from "@/components/site/ui";
import { ALL_AREAS, PROVIDER_KIND, SERVICE_CATEGORIES, formatPrice, useLocations } from "@/components/site/data";
import { ProviderJoinForm, SERVICE_GROUPS, ServiceRequestForm, type ServiceGroup } from "@/components/site/ServiceForms";

export const Route = createFileRoute("/services/")({
  head: () => pageHead({
    path: "/services",
    title: "دليل الخدمات في برج العرب: مكاتب هندسية ومقاولين وصنايعية وتصوير وميديا | فاليو عقار",
    description: "دليل مقدمي الخدمات المعتمدين من فاليو عقار في برج العرب: مكاتب هندسية، شركات مقاولات وتشطيبات، صنايعية، وشركات تصوير عقاري وميديا — بصور شغلهم وتقييمات العملاء. اطلب الخدمة ونوصّلك بالأنسب.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "الخدمات", path: "/services" }])],
  }),
  component: Services,
});

const ICONS: Record<ServiceGroup, typeof Wrench> = { engineering: BadgeCheck, contracting: HardHat, crafts: Wrench, media: Camera };

type Row = { id: string; kind: string; category: string; name: string; specialty: string | null; areas: string[]; bio: string | null; photo_url: string | null; verified: boolean; rating: number | null; reviews: number; done: number; photos: number };

/** Services directory: approved providers (companies, offices and technicians) with their ratings, plus asking for a service and joining. */
function Services() {
  useLocations();
  useLang();
  const [cat, setCat] = useState<ServiceGroup | "">("");
  const [kind, setKind] = useState<"" | "company" | "technician">("");
  const [area, setArea] = useState("");
  const q = useQuery({
    queryKey: ["service-directory", cat, kind, area],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("service_directory", { ...(cat ? { _category: cat } : {}), ...(kind ? { _kind: kind } : {}), ...(area ? { _area: area } : {}) });
      return error ? [] : (data as Row[]);
    },
  });
  const list = q.data ?? [];
  const chip = (on: boolean) => `h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`;
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <h1 className="text-2xl font-extrabold text-primary-foreground md:text-4xl">{t("دليل الخدمات")}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("مكاتب هندسية ومقاولين وصنايعية وشركات تصوير وميديا في برج العرب، معتمدين من فاليو عقار، بصور شغلهم وتقييمات العملاء اللي اتعاملوا معاهم. اطلب الخدمة وإحنا نوصّلك بالأنسب.")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => scrollTo("service-request")} className={btnTeal}>{t("اطلب خدمة")}</button>
            <button type="button" onClick={() => scrollTo("provider-join")} className="inline-flex h-11 items-center rounded-xl border border-primary-foreground/30 px-4 text-sm font-bold text-primary-foreground hover:bg-primary-foreground/10">{t("انضم كمقدم خدمة")}</button>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" aria-pressed={!cat} onClick={() => setCat("")} className={chip(!cat)}>{t("كل الخدمات")}</button>
          {SERVICE_GROUPS.map((g) => { const I = ICONS[g.id]; return <button key={g.id} type="button" aria-pressed={cat === g.id} onClick={() => setCat(g.id)} className={`${chip(cat === g.id)} inline-flex items-center gap-1.5`}><I className="size-4" />{t(SERVICE_CATEGORIES[g.id]!)}</button>; })}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="grid grid-cols-3 gap-1 rounded-xl border bg-card p-1">
            {([["", "الكل"], ["company", "شركات ومكاتب"], ["technician", "فنيين"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`h-9 rounded-lg px-3 text-xs font-bold ${kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t(l)}</button>
            ))}
          </div>
          <select aria-label={t("المنطقة")} className={`${inputCls} h-11 w-auto`} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">{t("كل المناطق")}</option>
            {ALL_AREAS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
          </select>
        </div>
        {cat && <p className="text-sm text-muted-foreground">{t(SERVICE_GROUPS.find((g) => g.id === cat)!.hint)}</p>}
        {q.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />)}</div>
          : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">{t("لسه مفيش مقدمين خدمة معتمدين في الاختيار ده. ابعت طلبك وفريق فاليو عقار هيوصّلك بالأنسب.")}</p>
              <button type="button" onClick={() => scrollTo("service-request")} className={`${btnOutline} mt-3`}>{t("اطلب خدمة")}</button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => <ProviderCard key={p.id} p={p} />)}
            </div>
          )}
        <div className="grid gap-6 pt-6 md:grid-cols-2">
          <ServiceRequestForm category={cat || undefined} onCategory={setCat} />
          <ProviderJoinForm />
        </div>
      </div>
    </PageShell>
  );
}

function ProviderCard({ p }: { p: Row }) {
  return (
    <Link to="/services/$id" params={{ id: p.id }} className="flex flex-col rounded-2xl border bg-card p-4 transition hover:border-teal hover:shadow-card">
      <div className="flex items-start gap-3">
        <Avatar name={p.name} url={p.photo_url} size="size-14" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-extrabold text-primary"><span className="truncate">{p.name}</span>{p.verified && <BadgeCheck className="size-4 shrink-0 text-teal" aria-label={t("معتمد من فاليو عقار")} />}</p>
          <p className="text-xs font-semibold text-muted-foreground">{t(PROVIDER_KIND[p.kind] ?? "")} · {t(SERVICE_CATEGORIES[p.category] ?? "")}</p>
          {p.rating != null
            ? <p className="mt-1 flex items-center gap-1 text-sm font-bold text-primary"><Star className="size-4 fill-[#f2b84b] text-[#f2b84b]" />{p.rating} <span className="text-xs font-semibold text-muted-foreground">({t("{n} تقييم", { n: formatPrice(p.reviews) })})</span></p>
            : <p className="mt-1 text-xs text-muted-foreground">{t("لسه مفيش تقييمات")}</p>}
        </div>
      </div>
      {p.specialty && <p className="mt-3 text-sm font-semibold text-foreground/80">{p.specialty}</p>}
      {p.bio && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.bio}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-muted-foreground">
        {p.areas.length > 0 && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{p.areas.slice(0, 2).map((a) => t(a)).join("، ")}{p.areas.length > 2 ? ` +${p.areas.length - 2}` : ""}</span>}
        {p.done > 0 && <span>{t("{n} شغلانة اتنفّذت", { n: formatPrice(p.done) })}</span>}
        {p.photos > 0 && <span>{t("{n} صورة", { n: formatPrice(p.photos) })}</span>}
      </div>
    </Link>
  );
}

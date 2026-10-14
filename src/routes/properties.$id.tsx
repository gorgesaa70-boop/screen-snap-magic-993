import { cleanPhone } from "@/lib/phone";
import { t, useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BedDouble, Bath, Maximize, MapPin, MessageCircle, ExternalLink } from "lucide-react";
import { Gallery, PlaceMap } from "@/components/site/Gallery";
import { getAttribution } from "@/lib/attribution";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Avatar, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { PURPOSE_LABEL, PRICE_UNIT_LABEL, FURNISHED_LABEL, FINISHING_LABEL, type Property, ACCOUNT_LABEL, PUBLIC_BROKER_COLS, formatPrice, formatDate, toProperty, waLink, withContacts, type PublicBroker } from "@/components/site/data";
import { AlertButton, FavoriteButton, ShareButton, VerifiedBadge } from "@/components/site/CustomerTools";
import { PropertyCard } from "@/components/site/Sections";
import { TYPE_GROUPS } from "@/components/site/search";
import { pageHead, unavailableHead, breadcrumbs, priceText, SITE_NAME, SITE_URL } from "@/lib/seo";
import { ReferButton } from "@/components/site/ReferButton";

async function fetchProperty(id: string) {
  const { data, error } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let broker: PublicBroker | null = null;
  if (data.broker_id) {
    const r = await supabase.from("brokers").select(PUBLIC_BROKER_COLS).eq("id", data.broker_id).maybeSingle();
    broker = r.data ? ((await withContacts([r.data]))[0] as PublicBroker) : null;
  }
  return { p: toProperty(data), broker, sourceUrl: data.source_url, approved: data.review_status === "approved", createdAt: data.created_at,
    coBroke: { share: data.co_broke_share, ownerListing: !data.broker_id && !!data.owner_lead_id } };
}

export const Route = createFileRoute("/properties/$id")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["property", params.id], queryFn: () => fetchProperty(params.id) }),
  head: ({ params, loaderData }) => {
    const path = `/properties/${params.id}`;
    if (!loaderData || !loaderData.approved) return unavailableHead(path, "العقار غير متاح");
    const { p, broker } = loaderData;
    const price = priceText(p.price, p.status);
    const purpose = p.status === "مصيف" ? "للإيجار المصيفي" : `لل${p.status}`;
    const title = `${p.title}${p.title.includes(purpose) ? "" : ` ${purpose}`} في ${p.area}${price ? ` – ${price}` : ""} | ${SITE_NAME}`;
    const description = `${p.type} ${purpose} في ${p.area} بمساحة ${p.size} م²${p.rooms ? `، ${p.rooms} غرف` : ""}${price ? ` بسعر ${price}` : ""}. ${p.description ?? ""}`;
    return pageHead({
      path, title, description, image: p.image, type: "article", noindex: p.isDemo,
      jsonLd: [
        {
          "@context": "https://schema.org", "@type": "RealEstateListing", name: p.title, url: `${SITE_URL}${path}`,
          description: p.description || undefined, datePosted: loaderData.createdAt,
          image: /^https:/.test(p.image) ? p.image : p.image.startsWith("/") ? `${SITE_URL}${p.image}` : undefined,
          offers: p.price ? { "@type": "Offer", price: p.price, priceCurrency: "EGP" } : undefined,
          address: { "@type": "PostalAddress", addressLocality: p.area, addressCountry: "EG" },
          ...(broker ? { provider: { "@type": "RealEstateAgent", name: broker.name, url: `${SITE_URL}/brokers/${broker.slug}` } } : {}),
        },
        breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: p.title, path }]),
      ],
    });
  },
  component: PropertyPage,
});

function PropertyPage() {
  useLang();
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const q = useQuery({ queryKey: ["property", id], queryFn: () => fetchProperty(id), initialData: initial });
  if (q.isLoading) return <PageShell><div className="mx-auto max-w-5xl p-6"><div className="aspect-video animate-pulse rounded-2xl bg-muted" /></div></PageShell>;
  if (!q.data) return <PageShell><div className="mx-auto max-w-md p-10 text-center"><h1 className="text-xl font-bold text-primary">{t("العقار غير متاح")}</h1><Link to="/" className={`${btnOutline} mt-6`}>{t("الرئيسية")}</Link></div></PageShell>;
  const { p, broker, sourceUrl, coBroke } = q.data;
  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-6 md:px-6 lg:grid-cols-[1fr_360px]">
        <div>
          <Gallery images={p.images} title={p.title}>
            <span className="absolute top-3 right-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">{t(PURPOSE_LABEL[p.status] ?? p.status)}</span>
            {p.isDemo && <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{t("إعلان تجريبي")}</span>}
          </Gallery>
          <div className="mt-5 flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold text-primary md:text-3xl">{p.title}</h1>
            <div className="flex shrink-0 gap-2"><FavoriteButton id={p.id} className="border" /><ShareButton title={p.title} /></div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-teal">{p.status === "مصيف" && <span className="text-sm text-muted-foreground">{t("من")} </span>}{formatPrice(p.price)} <span className="text-sm text-muted-foreground">{t("ج.م")}{p.priceUnit ? t(PRICE_UNIT_LABEL[p.priceUnit] ?? "") : ""}</span></p>
          {p.status === "بيع" && p.price > 0 && p.size > 0 && <p className="mt-1 text-sm font-bold text-muted-foreground">{t("سعر المتر:")} {formatPrice(Math.round(p.price / p.size))} {t("ج.م")}</p>}
          {p.verified && <VerifiedBadge at={p.verified.at} note={p.verified.note} />}
          {p.highlight && (
            <div className="mt-3 rounded-2xl border-2 border-[#f2b84b]/60 bg-[#f2b84b]/10 p-4">
              <p className="text-sm font-extrabold text-primary">★ {t("ليه ده عرض بسعر مميز؟")}</p>
              <p className="mt-1 text-sm text-foreground/80">{p.highlight.reason}{p.highlight.yield ? ` — ${t("عائد تقريبي")} ${formatPrice(p.highlight.yield)}%` : ""}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("* تقديري ومش ضمان.")}</p>
            </div>
          )}
          {p.rent && <RentDetails p={p} />}
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-primary">
            <span className="rounded-lg bg-secondary px-3 py-1.5">{t(p.type)}</span>
            <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><MapPin className="size-4 text-teal" />{p.area === p.city ? t(p.city) : `${t(p.area)} / ${t(p.city)}`}</span>
            <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><Maximize className="size-4 text-teal" />{formatPrice(p.size)} {t("م²")}</span>
            {p.rooms && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><BedDouble className="size-4 text-teal" />{formatPrice(p.rooms)} {t("غرف")}</span>}
            {p.baths && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><Bath className="size-4 text-teal" />{formatPrice(p.baths)} {t("حمام")}</span>}
            {p.finishing && FINISHING_LABEL[p.finishing] && <span className="rounded-lg bg-secondary px-3 py-1.5">{t(FINISHING_LABEL[p.finishing]!)}</span>}
          </div>
          <p className="mt-5 leading-relaxed whitespace-pre-line text-foreground/80">{p.description || t("مفيش وصف إضافي.")}</p>
          {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={`${btnOutline} mt-4 gap-1.5`}><ExternalLink className="size-4" />{t("عرض التفاصيل من المصدر")}</a>}
          {p.lat != null && p.lng != null && <PlaceMap lat={p.lat} lng={p.lng} />}
          <p className="mt-3 text-xs text-muted-foreground">{t("آخر تحديث:")} {formatDate(p.updated)}</p>
          <Similar p={p} />
        </div>
        <aside className="h-fit space-y-4 lg:sticky lg:top-20">
          {broker && (
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <Avatar name={broker.name} url={broker.photo_url} size="size-12" />
                <div className="min-w-0"><p className="truncate font-bold text-primary">{broker.name}</p><span className="text-xs font-bold text-muted-foreground">{t(ACCOUNT_LABEL[broker.account_type] ?? "وسيط عقاري")}</span><Link to="/brokers/$slug" params={{ slug: broker.slug }} className="text-xs font-bold text-teal">{t("عرض الملف")}</Link></div>
              </div>
              <a href={waLink(broker.whatsapp || broker.phone, `${t("مرحبًا، أستفسر عن:")} ${p.title}`)} target="_blank" rel="noreferrer" className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp text-sm font-bold text-primary-foreground hover:brightness-95"><MessageCircle className="size-4" />{t("تواصل واتساب")}</a>
            </div>
          )}
          <InquiryForm propertyId={p.id} />
          {coBroke && <ReferButton kind="property" targetId={p.id} share={coBroke.share} ownerId={p.brokerId} ownerListing={coBroke.ownerListing} />}
        </aside>
      </div>
    </PageShell>
  );
}

function InquiryForm({ propertyId }: { propertyId: string }) {
  useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !cleanPhone(phone)) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({ name: name.trim(), phone: cleanPhone(phone)!, details: details.trim().slice(0, 1000) || null, property_id: propertyId, kind: "inquiry", original_source: "website", utm: getAttribution() });
    setBusy(false);
    if (error) { toast.error(t("ماتبعتش، جرّب تاني")); return; }
    setDone(true);
  }
  if (done) return <div className="rounded-2xl bg-teal-soft p-5 text-center font-bold text-primary">{t("استفسارك وصل للوسيط ✓")}</div>;
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-2xl border bg-card p-5">
      <h2 className="font-bold text-primary">{t("ابعت استفسار")}</h2>
      <input className={inputCls} placeholder={t("الاسم")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} required />
      <textarea className={`${inputCls} h-20 py-2`} placeholder={t("رسالتك (اختياري)")} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
      <Button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? t("بيتبعت...") : t("إرسال الاستفسار")}</Button>
    </form>
  );
}

/** Rent terms; summer listings show every price the owner set. */
function RentDetails({ p }: { p: Property }) {
  useLang();
  const r = p.rent!;
  const day = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "long" }) : "");
  const prices = p.status === "مصيف" ? ([["night", r.night], ["week", r.week], ["month", r.month], ["season", r.season]] as const).filter(([, v]) => v) : [];
  const facts = [
    r.furnished && t(FURNISHED_LABEL[r.furnished] ?? r.furnished),
    r.minMonths && `${t("أقل مدة:")} ${formatPrice(r.minMonths)} ${t("شهور")}`,
    r.deposit && `${t("التأمين:")} ${formatPrice(r.deposit)} ${t("ج.م")}`,
    r.guests && `${t("يكفي")} ${formatPrice(r.guests)} ${t("أفراد")}`,
    (r.from || r.to) && `${t("متاح")} ${r.from ? `${t("من")} ${day(r.from)}` : ""} ${r.to ? `${t("لحد")} ${day(r.to)}` : ""}`,
  ].filter(Boolean) as string[];
  if (!prices.length && !facts.length) return null;
  return (
    <div className="mt-4 space-y-3 rounded-2xl border bg-card p-4">
      {prices.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {prices.map(([unit, v]) => (
            <div key={unit} className="rounded-xl bg-secondary p-3 text-center">
              <p className="text-lg font-extrabold text-primary">{formatPrice(v!)}</p>
              <p className="text-xs font-semibold text-muted-foreground">{t("ج.م")}{t(PRICE_UNIT_LABEL[unit] ?? "")}</p>
            </div>
          ))}
        </div>
      )}
      {facts.length > 0 && <ul className="flex flex-wrap gap-2 text-sm font-semibold text-primary">{facts.map((f) => <li key={f} className="rounded-lg bg-teal-soft px-3 py-1.5">{f}</li>)}</ul>}
    </div>
  );
}

/** Similar listings: same purpose and city, same type first, price within ±30% preferred; plus "notify me" for more. */
function Similar({ p }: { p: Property }) {
  useLang();
  // Same family of types only (an apartment never suggests land).
  const sameGroup = Object.values(TYPE_GROUPS).find((g) => g.includes(p.type)) ?? [p.type];
  const q = useQuery({
    queryKey: ["similar", p.id],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("*").eq("review_status", "approved").eq("category", "residential")
        .eq("status", p.status).eq("city", p.city).in("type", sameGroup).neq("id", p.id).gte("price", p.price * 0.7).lte("price", p.price * 1.3).limit(24);
      const rows = (data ?? []).map(toProperty);
      const score = (x: Property) => (x.type === p.type ? 0 : 2) + (x.area === p.area ? 0 : 1);
      return rows.sort((a, b) => score(a) - score(b)).slice(0, 3);
    },
  });
  const range = (f: number) => String(Math.round((p.price * f) / 1000) * 1000);
  return (
    <section className="mt-10 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-primary">{t("عقارات مشابهة")}</h2>
        <AlertButton filters={{ status: p.status, type: p.type, city: p.city, area: p.area === p.city ? "" : p.area, min: range(0.8), max: range(1.2) }} />
      </div>
      {q.data && q.data.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{q.data.map((x) => <PropertyCard key={x.id} p={x} />)}</div>
      ) : q.data ? <p className="mt-3 text-sm text-muted-foreground">{t("مفيش عقارات مشابهة دلوقتي — دوس «نبّهني» ونبلغك أول ما ينزل.")}</p> : null}
    </section>
  );
}

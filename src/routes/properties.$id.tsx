import { t, useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BedDouble, Bath, Maximize, MapPin, MessageCircle, ExternalLink } from "lucide-react";
import { Gallery, PlaceMap } from "@/components/site/Gallery";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Avatar, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { ACCOUNT_LABEL, PUBLIC_BROKER_COLS, formatPrice, formatDate, toProperty, waLink, type PublicBroker } from "@/components/site/data";
import { pageHead, unavailableHead, breadcrumbs, priceText, SITE_NAME, SITE_URL } from "@/lib/seo";

async function fetchProperty(id: string) {
  const { data, error } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let broker: PublicBroker | null = null;
  if (data.broker_id) {
    const r = await supabase.from("brokers").select(PUBLIC_BROKER_COLS).eq("id", data.broker_id).maybeSingle();
    broker = r.data as PublicBroker | null;
  }
  return { p: toProperty(data), broker, sourceUrl: data.source_url, approved: data.review_status === "approved", createdAt: data.created_at };
}

export const Route = createFileRoute("/properties/$id")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["property", params.id], queryFn: () => fetchProperty(params.id) }),
  head: ({ params, loaderData }) => {
    const path = `/properties/${params.id}`;
    if (!loaderData || !loaderData.approved) return unavailableHead(path, "العقار غير متاح");
    const { p, broker } = loaderData;
    const price = priceText(p.price, p.status);
    const title = `${p.title} لل${p.status} في ${p.area}${price ? ` – ${price}` : ""} | ${SITE_NAME}`;
    const description = `${p.type} لل${p.status} في ${p.area} بمساحة ${p.size} م²${p.rooms ? `، ${p.rooms} غرف` : ""}${price ? ` بسعر ${price}` : ""}. ${p.description ?? ""}`;
    return pageHead({
      path, title, description, image: p.image, type: "article",
      jsonLd: [
        {
          "@context": "https://schema.org", "@type": "RealEstateListing", name: p.title, url: `${SITE_URL}${path}`,
          description: p.description || undefined, datePosted: loaderData.createdAt,
          image: /^https:/.test(p.image) ? p.image : undefined,
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
  const { p, broker, sourceUrl } = q.data;
  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-6 md:px-6 lg:grid-cols-[1fr_360px]">
        <div>
          <Gallery images={p.images} title={p.title}>
            <span className="absolute top-3 right-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">{t("لل")}{t(p.status)}</span>
            {p.isDemo && <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{t("إعلان تجريبي")}</span>}
          </Gallery>
          <h1 className="mt-5 text-2xl font-extrabold text-primary md:text-3xl">{p.title}</h1>
          <p className="mt-2 text-2xl font-extrabold text-teal">{formatPrice(p.price)} <span className="text-sm text-muted-foreground">{t("ج.م")}{p.status === "إيجار" ? t(" / شهريًا") : ""}</span></p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-primary">
            <span className="rounded-lg bg-secondary px-3 py-1.5">{t(p.type)}</span>
            <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><MapPin className="size-4 text-teal" />{p.area === p.city ? t(p.city) : `${t(p.area)} / ${t(p.city)}`}</span>
            <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><Maximize className="size-4 text-teal" />{formatPrice(p.size)} {t("م²")}</span>
            {p.rooms && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><BedDouble className="size-4 text-teal" />{formatPrice(p.rooms)} {t("غرف")}</span>}
            {p.baths && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><Bath className="size-4 text-teal" />{formatPrice(p.baths)} {t("حمام")}</span>}
          </div>
          <p className="mt-5 leading-relaxed whitespace-pre-line text-foreground/80">{p.description || t("لا يوجد وصف إضافي.")}</p>
          {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={`${btnOutline} mt-4 gap-1.5`}><ExternalLink className="size-4" />{t("عرض التفاصيل من المصدر")}</a>}
          {p.lat != null && p.lng != null && <PlaceMap lat={p.lat} lng={p.lng} />}
          <p className="mt-3 text-xs text-muted-foreground">{t("آخر تحديث:")} {formatDate(p.updated)}</p>
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
    if (name.trim().length < 2 || !/^[0-9+\s]{8,20}$/.test(phone.trim())) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({ name: name.trim(), phone: phone.trim(), details: details.trim().slice(0, 1000) || null, property_id: propertyId, kind: "inquiry" });
    setBusy(false);
    if (error) { toast.error(t("تعذّر الإرسال")); return; }
    setDone(true);
  }
  if (done) return <div className="rounded-2xl bg-teal-soft p-5 text-center font-bold text-primary">{t("تم إرسال استفسارك للوسيط ✓")}</div>;
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-2xl border bg-card p-5">
      <h2 className="font-bold text-primary">{t("أرسل استفسارًا")}</h2>
      <input className={inputCls} placeholder={t("الاسم")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} required />
      <textarea className={`${inputCls} h-20 py-2`} placeholder={t("رسالتك (اختياري)")} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
      <Button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? t("جارٍ الإرسال...") : t("إرسال الاستفسار")}</Button>
    </form>
  );
}

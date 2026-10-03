import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BedDouble, Bath, Maximize, MapPin, MessageCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Avatar, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { PUBLIC_BROKER_COLS, formatPrice, formatDate, toProperty, waLink, type PublicBroker } from "@/components/site/data";

export const Route = createFileRoute("/properties/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل العقار | فاليو عقار" },
      { name: "description", content: "مواصفات العقار وسعره ووسيلة التواصل مع الوسيط على فاليو عقار." },
      { property: "og:title", content: "تفاصيل العقار | فاليو عقار" },
      { property: "og:description", content: "اعرف تفاصيل العقار وأرسل استفسارك للوسيط." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PropertyPage,
});

function PropertyMap({ lat, lng }: { lat: number; lng: number }) {
  const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as string | undefined;
  if (!key) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-lg font-extrabold text-primary"><MapPin className="size-5 text-teal" />الموقع على الخريطة</h2>
      <iframe
        title="موقع العقار على الخريطة"
        src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${lat},${lng}&zoom=15&language=ar&region=EG`}
        className="h-64 w-full rounded-2xl border bg-muted md:h-80"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  );
}

function PropertyPage() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let broker: PublicBroker | null = null;
      if (data.broker_id) {
        const r = await supabase.from("brokers").select(PUBLIC_BROKER_COLS).eq("id", data.broker_id).maybeSingle();
        broker = r.data as PublicBroker | null;
      }
      return { p: toProperty(data), broker, sourceUrl: data.source_url };
    },
  });
  if (q.isLoading) return <PageShell><div className="mx-auto max-w-5xl p-6"><div className="aspect-video animate-pulse rounded-2xl bg-muted" /></div></PageShell>;
  if (!q.data) return <PageShell><div className="mx-auto max-w-md p-10 text-center"><h1 className="text-xl font-bold text-primary">العقار غير متاح</h1><Link to="/" className={`${btnOutline} mt-6`}>الرئيسية</Link></div></PageShell>;
  const { p, broker, sourceUrl } = q.data;
  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-6 md:px-6 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="relative overflow-hidden rounded-2xl bg-muted">
            <img src={p.image} alt={p.title} className="aspect-[4/3] w-full object-cover md:aspect-video" />
            <span className="absolute top-3 right-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">لل{p.status}</span>
            {p.isDemo && <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">إعلان تجريبي</span>}
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-primary md:text-3xl">{p.title}</h1>
          <p className="mt-2 text-2xl font-extrabold text-teal">{formatPrice(p.price)} <span className="text-sm text-muted-foreground">ج.م{p.status === "إيجار" ? " / شهريًا" : ""}</span></p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-primary">
            <span className="rounded-lg bg-secondary px-3 py-1.5">{p.type}</span>
            <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><MapPin className="size-4 text-teal" />{p.area}</span>
            <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><Maximize className="size-4 text-teal" />{p.size} م²</span>
            {p.rooms && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><BedDouble className="size-4 text-teal" />{p.rooms} غرف</span>}
            {p.baths && <span className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5"><Bath className="size-4 text-teal" />{p.baths} حمام</span>}
          </div>
          <p className="mt-5 leading-relaxed whitespace-pre-line text-foreground/80">{p.description || "لا يوجد وصف إضافي."}</p>
          {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={`${btnOutline} mt-4 gap-1.5`}><ExternalLink className="size-4" />عرض التفاصيل من المصدر</a>}
          {p.lat != null && p.lng != null && <PropertyMap lat={p.lat} lng={p.lng} />}
          <p className="mt-3 text-xs text-muted-foreground">آخر تحديث: {formatDate(p.updated)}</p>
        </div>
        <aside className="h-fit space-y-4 lg:sticky lg:top-20">
          {broker && (
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <Avatar name={broker.name} url={broker.photo_url} size="size-12" />
                <div className="min-w-0"><p className="truncate font-bold text-primary">{broker.name}</p><Link to="/brokers/$slug" params={{ slug: broker.slug }} className="text-xs font-bold text-teal">عرض الملف</Link></div>
              </div>
              <a href={waLink(broker.whatsapp || broker.phone, `مرحبًا، أستفسر عن: ${p.title}`)} target="_blank" rel="noreferrer" className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp text-sm font-bold text-primary-foreground hover:brightness-95"><MessageCircle className="size-4" />تواصل واتساب</a>
            </div>
          )}
          <InquiryForm propertyId={p.id} />
        </aside>
      </div>
    </PageShell>
  );
}

function InquiryForm({ propertyId }: { propertyId: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !/^[0-9+\s]{8,20}$/.test(phone.trim())) { toast.error("اكتب الاسم ورقم هاتف صحيح"); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({ name: name.trim(), phone: phone.trim(), details: details.trim().slice(0, 1000) || null, property_id: propertyId, kind: "inquiry" });
    setBusy(false);
    if (error) { toast.error("تعذّر الإرسال"); return; }
    setDone(true);
  }
  if (done) return <div className="rounded-2xl bg-teal-soft p-5 text-center font-bold text-primary">تم إرسال استفسارك للوسيط ✓</div>;
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-2xl border bg-card p-5">
      <h2 className="font-bold text-primary">أرسل استفسارًا</h2>
      <input className={inputCls} placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      <input className={inputCls} placeholder="رقم الهاتف" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} required />
      <textarea className={`${inputCls} h-20 py-2`} placeholder="رسالتك (اختياري)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
      <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "جارٍ الإرسال..." : "إرسال الاستفسار"}</button>
    </form>
  );
}

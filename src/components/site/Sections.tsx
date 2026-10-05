import { Building2, Home, LandPlot, Store, Briefcase, KeyRound, Factory, Landmark, BedDouble, Bath, Maximize, MapPin, MessageCircle, ArrowLeft, Facebook, Instagram, Phone, Mail, BarChart3, Megaphone, Inbox, ShieldQuestion, CalendarClock, RotateCcw, SearchX } from "lucide-react";
import { applyFilters, isEmpty, type Filters } from "./search";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicProperties, fetchPublicBrokers, formatPrice, formatDate, waLink, WHATSAPP_NUMBER, TYPES, AREAS, type Property } from "./data";
import { PropertiesMap } from "./PropertiesMap";
import { Avatar, inputCls } from "./ui";
import { Logo } from "./Navbar";
import { t as tr, useLang } from "@/lib/i18n";

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end md:mb-8 justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-teal">{eyebrow}</p>
        <h2 className="mt-1.5 text-[1.375rem] font-extrabold text-primary md:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const cats = [
  { label: "شقق", icon: Building2, f: { type: "شقة" } },
  { label: "فلل", icon: Home, f: { type: "فيلا" } },
  { label: "أراضٍ", icon: LandPlot, f: { type: "أرض" } },
  { label: "محلات تجارية", icon: Store, f: { type: "محل" } },
  { label: "مكاتب إدارية", icon: Briefcase, f: { type: "مكتب" } },
  { label: "عقارات للإيجار", icon: KeyRound, f: { status: "إيجار" } },
];

export function Categories({ onPick }: { onPick: (f: Partial<Filters>) => void }) {
  useLang();
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 md:px-6 md:pt-20">
      <SectionHead eyebrow={tr("تصفّح حسب النوع")} title={tr("التصنيفات الرئيسية")} />
      <div className="grid grid-cols-3 gap-2.5 md:grid-cols-8 md:gap-4">
        {[
          { label: "المصانع والأراضي الصناعية", icon: Factory, to: "/industrial" as const },
          { label: "المولات", icon: Landmark, to: "/malls" as const },
        ].map(({ label, icon: Icon, to }) => (
          <Link key={label} to={to}
            className="group flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-2xl border bg-card p-3 text-center transition hover:-translate-y-1 hover:border-teal hover:shadow-card focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.97] md:p-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-soft text-primary transition group-hover:bg-primary group-hover:text-primary-foreground md:size-14">
              <Icon className="size-5 md:size-6" />
            </span>
            <span className="text-[13px] leading-tight font-bold text-primary md:text-sm">{tr(label)}</span>
          </Link>
        ))}
        {cats.map(({ label, icon: Icon, f }) => (
          <button key={label} type="button" onClick={() => onPick(f)}
            className="group flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-2xl border bg-card p-3 text-center transition hover:-translate-y-1 hover:border-teal hover:shadow-card focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.97] md:p-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-soft text-primary transition group-hover:bg-primary group-hover:text-primary-foreground md:size-14">
              <Icon className="size-5 md:size-6" />
            </span>
            <span className="text-[13px] leading-tight font-bold text-primary md:text-sm">{tr(label)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function PropertyCard({ p, whatsapp }: { p: Property; whatsapp?: string | null }) {
  useLang();
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition hover:shadow-card">
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-muted">
        <img src={p.image} alt={p.title} loading="lazy" decoding="async" width={944} height={704}
          className="size-full object-cover transition duration-500 group-hover:scale-105" />
        <span className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold ${p.status === "بيع" ? "bg-primary text-primary-foreground" : "bg-teal text-accent-foreground"}`}>
          {tr("لل")}{tr(p.status)}
        </span>
        {p.isDemo ? <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{tr("إعلان تجريبي")}</span>
          : p.featured ? <span className="absolute top-3 left-3 rounded-full bg-teal px-2.5 py-1 text-[11px] font-bold text-accent-foreground">{tr("مميز")}</span> : null}
      </div>
      <div className="flex flex-1 flex-col p-4 md:p-5">
        <p className="text-xl font-extrabold text-primary md:text-2xl">
          {formatPrice(p.price)} <span className="text-sm font-semibold text-muted-foreground">{tr("ج.م")}{p.status === "إيجار" ? tr(" / شهريًا") : ""}</span>
        </p>
        <h3 className="mt-1 line-clamp-1 text-base font-bold text-foreground">{p.title}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-lg bg-secondary px-2.5 py-1.5 text-primary">{tr(p.type)}</span>
          <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-primary"><MapPin className="size-3.5 shrink-0 text-teal" />{p.area === p.city ? tr(p.city) : `${tr(p.area)}، ${tr(p.city)}`}</span>
          <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-primary"><Maximize className="size-3.5 shrink-0 text-teal" />{formatPrice(p.size)} {tr("م²")}</span>
        </div>
        <div className="mt-3 flex min-h-5 items-center gap-4 text-sm text-foreground/70">
          {p.rooms && <span className="flex items-center gap-1.5"><BedDouble className="size-4 shrink-0 text-teal" />{formatPrice(p.rooms)} {tr("غرف")}</span>}
          {p.baths && <span className="flex items-center gap-1.5"><Bath className="size-4 shrink-0 text-teal" />{formatPrice(p.baths)} {tr("حمام")}</span>}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><ShieldQuestion className="size-3.5 shrink-0" />{p.isDemo ? tr("لم يتم التحقق بعد") : tr("تمت مراجعته")}</span>
          <span className="flex items-center gap-1"><CalendarClock className="size-3.5 shrink-0" />{tr("تحديث:")} {formatDate(p.updated)}</span>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          <Link to="/properties/$id" params={{ id: p.id }} className="flex h-11 items-center justify-center rounded-xl border border-primary text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.98]">{tr("تفاصيل العقار")}</Link>
          <a href={waLink(whatsapp, `${tr("مرحبًا، أستفسر عن:")} ${p.title}`)} target="_blank" rel="noreferrer"
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp text-sm font-bold text-primary-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98]">
            <MessageCircle className="size-4 shrink-0" /> {tr("واتساب")}
          </a>
        </div>
      </div>
    </article>
  );
}

export function FeaturedProperties({ filters, onClear }: { filters: Filters; onClear: () => void }) {
  useLang();
  const { data: properties = [], isLoading, isError } = useQuery({ queryKey: ["public-properties"], queryFn: () => fetchPublicProperties() });
  const results = applyFilters(properties, filters);
  const filtered = !isEmpty(filters);
  return (
    <section id="properties" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-12 md:px-6 md:pt-24">
      <SectionHead eyebrow={filtered ? tr("نتائج البحث") : tr("مختارات فاليو عقار")} title={filtered ? tr("العقارات المطابقة") : tr("العقارات المميزة")} />
      {filtered && (
        <div className="-mt-4 mb-6 flex items-center justify-between gap-3 rounded-xl bg-teal-soft px-4 py-3" aria-live="polite">
          <p className="text-sm font-bold text-primary">{tr("تم العثور على")} {formatPrice(results.length)} {results.length === 1 ? tr("عقار") : tr("عقارات")}</p>
          <button onClick={onClear} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold text-primary underline-offset-4 transition hover:underline focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none">
            <RotateCcw className="size-3.5" /> {tr("مسح الفلاتر")}
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2].map((i) => <div key={i} className="h-96 animate-pulse rounded-2xl bg-muted" />)}</div>
      ) : isError ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">{tr("تعذّر تحميل العقارات، حاول تحديث الصفحة.")}</p>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
          <SearchX className="mx-auto size-10 text-teal" />
          <h3 className="mt-4 text-lg font-bold text-primary">{tr("لا توجد عقارات تطابق بحثك")}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{tr("جرّب توسيع نطاق السعر أو اختيار منطقة أو نوع مختلف، أو اطلب عقارك وسنساعدك.")}</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button onClick={onClear} className="h-11 rounded-xl border border-primary px-6 text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground">{tr("مسح الفلاتر")}</button>
            <a href="#request" className="flex h-11 items-center justify-center rounded-xl bg-teal px-6 text-sm font-bold text-accent-foreground transition hover:brightness-95">{tr("اطلب عقارك")}</a>
          </div>
        </div>
      ) : (
        <>
        <PropertiesMap properties={results} />
        <div className="grid gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {results.map((p) => <PropertyCard key={p.id} p={p} />)}
        </div>
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{tr("* العقارات التي تحمل علامة «إعلان تجريبي» بيانات توضيحية فقط.")}</p>
    </section>
  );
}

export function RequestCTA() {
  useLang();
  return (
    <section id="request" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16 md:px-6 md:pt-24">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 md:px-14 md:py-16">
        <div className="absolute -top-20 -left-20 size-64 rounded-full bg-teal/20 blur-3xl" />
        <div className="relative grid items-start gap-8 md:grid-cols-2 md:items-center">
          <div className="max-w-xl">
            <h2 className="text-2xl font-extrabold text-primary-foreground md:text-4xl">{tr("مش لاقي العقار اللي بتدور عليه؟")}</h2>
            <p className="mt-4 leading-relaxed text-primary-foreground/80">{tr("حدد مواصفات العقار وميزانيتك، وسيقوم فريق فاليو عقار بمساعدتك في الوصول إلى الخيارات المناسبة.")}</p>
          </div>
          <RequestForm />
        </div>
      </div>
    </section>
  );
}

function RequestForm() {
  useLang();
  const [f, setF] = useState({ name: "", phone: "", property_type: "", area: "", budget: "", details: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2 || !/^[0-9+\s]{8,20}$/.test(f.phone.trim())) { toast.error(tr("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({ name: f.name.trim(), phone: f.phone.trim(), kind: "request", property_type: f.property_type || null, area: f.area || null, budget: f.budget ? Number(f.budget) : null, details: f.details.trim().slice(0, 1000) || null });
    setBusy(false);
    if (error) { toast.error(tr("تعذّر إرسال الطلب، حاول مرة أخرى")); return; }
    setDone(true);
  }
  if (done) return <div className="rounded-2xl bg-card p-6 text-center"><p className="text-lg font-bold text-primary">{tr("تم استلام طلبك ✓")}</p><p className="mt-2 text-sm text-muted-foreground">{tr("سيتواصل معك أحد وسطائنا قريبًا.")}</p></div>;
  return (
    <form onSubmit={submit} className="grid gap-2.5 rounded-2xl bg-card p-4 sm:grid-cols-2 md:p-5">
      <input className={inputCls} placeholder={tr("الاسم")} value={f.name} onChange={set("name")} maxLength={100} required />
      <input className={inputCls} placeholder={tr("رقم الهاتف")} inputMode="tel" dir="ltr" value={f.phone} onChange={set("phone")} maxLength={20} required />
      <select className={inputCls} value={f.property_type} onChange={set("property_type")}><option value="">{tr("نوع العقار")}</option>{TYPES.map((v) => <option key={v}>{tr(v)}</option>)}</select>
      <select className={inputCls} value={f.area} onChange={set("area")}><option value="">{tr("المنطقة")}</option>{AREAS.map((v) => <option key={v}>{tr(v)}</option>)}</select>
      <input className={`${inputCls} sm:col-span-2`} placeholder={tr("الميزانية (ج.م)")} inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/\D/g, "") })} />
      <textarea className={`${inputCls} h-20 py-2 sm:col-span-2`} placeholder={tr("تفاصيل إضافية")} value={f.details} onChange={set("details")} maxLength={1000} />
      <button disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal font-bold text-accent-foreground transition hover:brightness-95 disabled:opacity-60 sm:col-span-2">{busy ? tr("جارٍ الإرسال...") : tr("أرسل طلبك")} <ArrowLeft className="size-4" /></button>
    </form>
  );
}

export function Brokers() {
  useLang();
  const { data: brokers = [] } = useQuery({ queryKey: ["public-brokers"], queryFn: fetchPublicBrokers });
  return (
    <section id="brokers" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16 md:px-6 md:pt-24">
      <SectionHead eyebrow={tr("شركاء موثوقون")} title={tr("تواصل مع الوسيط المناسب")}
        action={<Link to="/brokers" className="shrink-0 text-sm font-bold text-primary hover:text-teal">{tr("كل الوسطاء ←")}</Link>} />
      <div className="grid gap-5 md:grid-cols-3">
        {brokers.slice(0, 3).map((b) => (
          <div key={b.id} className="rounded-2xl border bg-card p-6 transition hover:shadow-card">
            <div className="flex items-center gap-4">
              <Avatar name={b.name} url={b.photo_url} />
              <div>
                <h3 className="font-bold text-primary">{b.name}</h3>
                <p className="text-sm text-muted-foreground">{b.specialty}</p>
              </div>
            </div>
            <p className="mt-5 flex items-start gap-2 text-sm text-foreground/75"><MapPin className="mt-0.5 size-4 shrink-0 text-teal" />{b.areas.join("، ") || "—"}</p>
            <Link to="/brokers/$slug" params={{ slug: b.slug }} className="mt-5 block rounded-xl bg-secondary py-2.5 text-center text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground">{tr("عرض الملف الشخصي")}</Link>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BrokerServices() {
  useLang();
  const feats = [
    { icon: Megaphone, label: "تسويق عقاراتك" },
    { icon: Inbox, label: "إدارة الاستفسارات" },
    { icon: BarChart3, label: "متابعة الأداء" },
  ];
  return (
    <section id="broker-services" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16 md:px-6 md:pt-24">
      <div className="grid items-center gap-8 rounded-3xl bg-teal-soft p-6 md:grid-cols-2 md:p-14">
        <div>
          <p className="text-sm font-bold text-primary/70">{tr("للوسطاء والمكاتب العقارية")}</p>
          <h2 className="mt-2 text-2xl font-extrabold text-primary md:text-4xl">{tr("كبّر نشاطك العقاري مع فاليو عقار")}</h2>
          <p className="mt-4 leading-relaxed text-foreground/75">{tr("أدوات تسويق وإدارة تساعدك في الوصول إلى عملاء جدد وتنظيم عقاراتك واستفساراتك.")}</p>
          <Link to="/auth" className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 font-bold text-primary-foreground transition hover:bg-navy-deep">
            {tr("دخول الوسطاء")} <ArrowLeft className="size-4" />
          </Link>
        </div>
        <div className="grid gap-3">
          {feats.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-card">
              <span className="grid size-11 place-items-center rounded-xl bg-primary text-teal"><Icon className="size-5" /></span>
              <span className="font-bold text-primary">{tr(label)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

export function Footer() {
  useLang();
  const pages = [["الرئيسية", "/#top"], ["العقارات", "/#properties"], ["الوسطاء العقاريون", "/brokers"], ["اطلب عقارك", "/#request"], ["دخول الوسطاء", "/auth"]];
  return (
    <footer className="mt-16 pb-20 lg:pb-0 md:mt-20 bg-navy-deep text-primary-foreground/75">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-4 md:px-6">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">{tr("منصة عقارية تربطك بالعقارات والوسطاء في برج العرب الجديدة.")}</p>
          <div className="mt-5 flex gap-2">
            {[
              { I: Facebook, href: "https://www.facebook.com/share/19VhkpxBhr/?mibextid=wwXIfr", label: "صفحتنا على فيسبوك" },
              { I: Instagram, href: "https://www.instagram.com/value._.square", label: "حسابنا على إنستاجرام" },
              { I: TikTokIcon, href: "https://www.tiktok.com/@value.square8", label: "حسابنا على تيك توك" },
              { I: MessageCircle, href: waLink(WHATSAPP_NUMBER, tr("مرحبًا، أريد الاستفسار عن أحد العقارات على منصة فاليو عقار.")), label: "تواصل معنا على واتساب" },
            ].map(({ I, href, label }, i) => (
              <a key={i} href={href} aria-label={tr(label)} title={tr(label)} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} className="grid size-10 place-items-center rounded-full bg-primary-foreground/10 transition hover:bg-teal hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-navy-deep"><I className="size-4" aria-hidden="true" /><span className="sr-only">{tr(label)}</span></a>
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-bold text-primary-foreground">{tr("روابط")}</h4>
          <ul className="mt-4 space-y-2.5 text-sm">{pages.map(([l, h]) => <li key={h}><a href={h} className="hover:text-teal">{tr(l)}</a></li>)}</ul>
        </div>
        <div>
          <h4 className="font-bold text-primary-foreground">{tr("تواصل معنا")}</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li className="flex items-center gap-2"><MapPin className="size-4 text-teal" />{tr("برج العرب الجديدة، الإسكندرية")}</li>
            <li className="flex items-center gap-2" dir="ltr"><Phone className="size-4 text-teal" />+20 100 000 0000</li>
            <li className="flex items-center gap-2"><Mail className="size-4 text-teal" />info@valueaqar.com</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs md:flex-row md:px-6">
          <p>© {new Date().getFullYear()} {tr("فاليو عقار. جميع الحقوق محفوظة.")}</p>
          <div className="flex gap-5"><a href="#top" className="hover:text-teal">{tr("سياسة الخصوصية")}</a><a href="#top" className="hover:text-teal">{tr("الشروط والأحكام")}</a></div>
        </div>
      </div>
    </footer>
  );
}

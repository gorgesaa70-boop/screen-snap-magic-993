import { Building2, Home, LandPlot, Store, Briefcase, KeyRound, BedDouble, Bath, Maximize, MapPin, MessageCircle, ArrowLeft, Facebook, Instagram, Phone, Mail, BarChart3, Megaphone, Inbox, ShieldQuestion, CalendarClock, RotateCcw, SearchX } from "lucide-react";
import { applyFilters, isEmpty, type Filters } from "./search";
import { properties, brokers, formatPrice, formatDate, WHATSAPP_NUMBER, type Property } from "./data";
import { Logo } from "./Navbar";

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
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 md:px-6 md:pt-20">
      <SectionHead eyebrow="تصفّح حسب النوع" title="التصنيفات الرئيسية" />
      <div className="grid grid-cols-3 gap-2.5 md:grid-cols-6 md:gap-4">
        {cats.map(({ label, icon: Icon, f }) => (
          <button key={label} type="button" onClick={() => onPick(f)}
            className="group flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-2xl border bg-card p-3 text-center transition hover:-translate-y-1 hover:border-teal hover:shadow-card focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.97] md:p-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-soft text-primary transition group-hover:bg-primary group-hover:text-primary-foreground md:size-14">
              <Icon className="size-5 md:size-6" />
            </span>
            <span className="text-[13px] leading-tight font-bold text-primary md:text-sm">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PropertyCard({ p }: { p: Property }) {
  const msg = encodeURIComponent(`مرحبًا، أستفسر عن: ${p.title} (إعلان تجريبي)`);
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition hover:shadow-card">
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-muted">
        <img src={p.image} alt={p.title} loading="lazy" decoding="async" width={944} height={704}
          className="size-full object-cover transition duration-500 group-hover:scale-105" />
        <span className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold ${p.status === "بيع" ? "bg-primary text-primary-foreground" : "bg-teal text-accent-foreground"}`}>
          لل{p.status}
        </span>
        <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">إعلان تجريبي</span>
      </div>
      <div className="flex flex-1 flex-col p-4 md:p-5">
        <p className="text-xl font-extrabold text-primary md:text-2xl">
          {formatPrice(p.price)} <span className="text-sm font-semibold text-muted-foreground">ج.م{p.status === "إيجار" ? " / شهريًا" : ""}</span>
        </p>
        <h3 className="mt-1 line-clamp-1 text-base font-bold text-foreground">{p.title}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-lg bg-secondary px-2.5 py-1.5 text-primary">{p.type}</span>
          <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-primary"><MapPin className="size-3.5 shrink-0 text-teal" />{p.area}</span>
          <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-primary"><Maximize className="size-3.5 shrink-0 text-teal" />{p.size} م²</span>
        </div>
        <div className="mt-3 flex min-h-5 items-center gap-4 text-sm text-foreground/70">
          {p.rooms && <span className="flex items-center gap-1.5"><BedDouble className="size-4 shrink-0 text-teal" />{p.rooms} غرف</span>}
          {p.baths && <span className="flex items-center gap-1.5"><Bath className="size-4 shrink-0 text-teal" />{p.baths} حمام</span>}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><ShieldQuestion className="size-3.5 shrink-0" />لم يتم التحقق بعد</span>
          <span className="flex items-center gap-1"><CalendarClock className="size-3.5 shrink-0" />تحديث: {formatDate(p.updated)}</span>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          <a href="#properties" className="flex h-11 items-center justify-center rounded-xl border border-primary text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.98]">تفاصيل العقار</a>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`} target="_blank" rel="noreferrer"
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp text-sm font-bold text-primary-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98]">
            <MessageCircle className="size-4 shrink-0" /> واتساب
          </a>
        </div>
      </div>
    </article>
  );
}

export function FeaturedProperties({ filters, onClear }: { filters: Filters; onClear: () => void }) {
  const results = applyFilters(properties, filters);
  const filtered = !isEmpty(filters);
  return (
    <section id="properties" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-12 md:px-6 md:pt-24">
      <SectionHead eyebrow={filtered ? "نتائج البحث" : "مختارات فاليو عقار"} title={filtered ? "العقارات المطابقة" : "العقارات المميزة"} />
      {filtered && (
        <div className="-mt-4 mb-6 flex items-center justify-between gap-3 rounded-xl bg-teal-soft px-4 py-3" aria-live="polite">
          <p className="text-sm font-bold text-primary">تم العثور على {formatPrice(results.length)} {results.length === 1 ? "عقار" : "عقارات"}</p>
          <button onClick={onClear} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold text-primary underline-offset-4 transition hover:underline focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none">
            <RotateCcw className="size-3.5" /> مسح الفلاتر
          </button>
        </div>
      )}
      {results.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
          <SearchX className="mx-auto size-10 text-teal" />
          <h3 className="mt-4 text-lg font-bold text-primary">لا توجد عقارات تطابق بحثك</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">جرّب توسيع نطاق السعر أو اختيار منطقة أو نوع مختلف، أو اطلب عقارك وسنساعدك.</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button onClick={onClear} className="h-11 rounded-xl border border-primary px-6 text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground">مسح الفلاتر</button>
            <a href="#request" className="flex h-11 items-center justify-center rounded-xl bg-teal px-6 text-sm font-bold text-accent-foreground transition hover:brightness-95">اطلب عقارك</a>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {results.map((p) => <PropertyCard key={p.id} p={p} />)}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">* جميع العقارات المعروضة بيانات توضيحية لأغراض العرض فقط وليست إعلانات حقيقية، ولم يتم التحقق منها.</p>
    </section>
  );
}

export function RequestCTA() {
  return (
    <section id="request" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16 md:px-6 md:pt-24">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 md:px-14 md:py-16">
        <div className="absolute -top-20 -left-20 size-64 rounded-full bg-teal/20 blur-3xl" />
        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-extrabold text-primary-foreground md:text-4xl">مش لاقي العقار اللي بتدور عليه؟</h2>
            <p className="mt-4 leading-relaxed text-primary-foreground/80">حدد مواصفات العقار وميزانيتك، وسيقوم فريق فاليو عقار بمساعدتك في الوصول إلى الخيارات المناسبة.</p>
          </div>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("مرحبًا، أريد طلب عقار بالمواصفات التالية:")}`} target="_blank" rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-teal px-8 py-4 font-bold text-accent-foreground transition hover:brightness-95">
            اطلب عقارك <ArrowLeft className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function Brokers() {
  return (
    <section id="brokers" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16 md:px-6 md:pt-24">
      <SectionHead eyebrow="شركاء موثوقون" title="تواصل مع الوسيط المناسب" />
      <div className="grid gap-5 md:grid-cols-3">
        {brokers.map((b) => (
          <div key={b.name} className="rounded-2xl border bg-card p-6 transition hover:shadow-card">
            <div className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-2xl bg-primary text-lg font-extrabold text-teal">{b.initials}</span>
              <div>
                <h3 className="font-bold text-primary">{b.name}</h3>
                <p className="text-sm text-muted-foreground">{b.specialty}</p>
              </div>
            </div>
            <p className="mt-5 flex items-start gap-2 text-sm text-foreground/75"><MapPin className="mt-0.5 size-4 shrink-0 text-teal" />{b.areas}</p>
            <a href="#brokers" className="mt-5 block rounded-xl bg-secondary py-2.5 text-center text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground">عرض الملف الشخصي</a>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">* أسماء الوسطاء توضيحية.</p>
    </section>
  );
}

export function BrokerServices() {
  const feats = [
    { icon: Megaphone, t: "تسويق عقاراتك" },
    { icon: Inbox, t: "إدارة الاستفسارات" },
    { icon: BarChart3, t: "متابعة الأداء" },
  ];
  return (
    <section id="broker-services" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16 md:px-6 md:pt-24">
      <div className="grid items-center gap-8 rounded-3xl bg-teal-soft p-6 md:grid-cols-2 md:p-14">
        <div>
          <p className="text-sm font-bold text-primary/70">للوسطاء والمكاتب العقارية</p>
          <h2 className="mt-2 text-2xl font-extrabold text-primary md:text-4xl">كبّر نشاطك العقاري مع فاليو عقار</h2>
          <p className="mt-4 leading-relaxed text-foreground/75">أدوات تسويق وإدارة تساعدك في الوصول إلى عملاء جدد وتنظيم عقاراتك واستفساراتك.</p>
          <a href="#broker-services" className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 font-bold text-primary-foreground transition hover:bg-navy-deep">
            اكتشف خدمات الوسطاء <ArrowLeft className="size-4" />
          </a>
        </div>
        <div className="grid gap-3">
          {feats.map(({ icon: Icon, t }) => (
            <div key={t} className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-card">
              <span className="grid size-11 place-items-center rounded-xl bg-primary text-teal"><Icon className="size-5" /></span>
              <span className="font-bold text-primary">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const pages = [["الرئيسية", "#top"], ["العقارات", "#properties"], ["الوسطاء", "#brokers"], ["اطلب عقارك", "#request"], ["خدمات الوسطاء", "#broker-services"]];
  return (
    <footer className="mt-16 pb-20 lg:pb-0 md:mt-20 bg-navy-deep text-primary-foreground/75">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-4 md:px-6">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">منصة عقارية تربطك بالعقارات والوسطاء في برج العرب الجديدة.</p>
          <div className="mt-5 flex gap-2">
            {[Facebook, Instagram, MessageCircle].map((I, i) => (
              <a key={i} href="#top" aria-label="تواصل اجتماعي" className="grid size-10 place-items-center rounded-full bg-primary-foreground/10 transition hover:bg-teal hover:text-accent-foreground"><I className="size-4" /></a>
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-bold text-primary-foreground">روابط</h4>
          <ul className="mt-4 space-y-2.5 text-sm">{pages.map(([l, h]) => <li key={h}><a href={h} className="hover:text-teal">{l}</a></li>)}</ul>
        </div>
        <div>
          <h4 className="font-bold text-primary-foreground">تواصل معنا</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li className="flex items-center gap-2"><MapPin className="size-4 text-teal" />برج العرب الجديدة، الإسكندرية</li>
            <li className="flex items-center gap-2" dir="ltr"><Phone className="size-4 text-teal" />+20 100 000 0000</li>
            <li className="flex items-center gap-2"><Mail className="size-4 text-teal" />info@valueaqar.com</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs md:flex-row md:px-6">
          <p>© {new Date().getFullYear()} فاليو عقار. جميع الحقوق محفوظة.</p>
          <div className="flex gap-5"><a href="#top" className="hover:text-teal">سياسة الخصوصية</a><a href="#top" className="hover:text-teal">الشروط والأحكام</a></div>
        </div>
      </div>
    </footer>
  );
}

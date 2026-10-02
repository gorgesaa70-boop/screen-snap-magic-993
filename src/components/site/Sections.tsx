import { Building2, Home, LandPlot, Store, Briefcase, KeyRound, BedDouble, Bath, Maximize, MapPin, MessageCircle, ArrowLeft, Facebook, Instagram, Phone, Mail, BarChart3, Megaphone, Inbox } from "lucide-react";
import { properties, brokers, formatPrice, WHATSAPP_NUMBER, type Property } from "./data";
import { Logo } from "./Navbar";

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-teal">{eyebrow}</p>
        <h2 className="mt-1.5 text-2xl font-extrabold text-primary md:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const cats = [
  { label: "شقق", icon: Building2 },
  { label: "فلل", icon: Home },
  { label: "أراضٍ", icon: LandPlot },
  { label: "محلات تجارية", icon: Store },
  { label: "مكاتب إدارية", icon: Briefcase },
  { label: "عقارات للإيجار", icon: KeyRound },
];

export function Categories() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-16 md:px-6 md:pt-20">
      <SectionHead eyebrow="تصفّح حسب النوع" title="التصنيفات الرئيسية" />
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6 md:gap-4">
        {cats.map(({ label, icon: Icon }) => (
          <a key={label} href="#properties" className="group flex flex-col items-center gap-3 rounded-2xl border bg-card p-4 text-center transition hover:-translate-y-1 hover:border-teal hover:shadow-card md:p-6">
            <span className="grid size-12 place-items-center rounded-xl bg-teal-soft text-primary transition group-hover:bg-primary group-hover:text-primary-foreground md:size-14">
              <Icon className="size-6" />
            </span>
            <span className="text-sm font-bold text-primary">{label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function PropertyCard({ p }: { p: Property }) {
  const msg = encodeURIComponent(`مرحبًا، أستفسر عن: ${p.title} (إعلان تجريبي)`);
  return (
    <article className="group overflow-hidden rounded-2xl border bg-card transition hover:shadow-card">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img src={p.image} alt={p.title} loading="lazy" width={944} height={704} className="size-full object-cover transition duration-500 group-hover:scale-105" />
        <span className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold ${p.status === "بيع" ? "bg-primary text-primary-foreground" : "bg-teal text-accent-foreground"}`}>
          لل{p.status}
        </span>
        <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">إعلان تجريبي</span>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>{p.type}</span>
          <span className="flex items-center gap-1"><MapPin className="size-3.5" />{p.area}</span>
        </div>
        <h3 className="mt-2 text-lg font-bold text-primary">{p.title}</h3>
        <p className="mt-1 text-xl font-extrabold text-primary">
          {formatPrice(p.price)} <span className="text-sm font-semibold text-muted-foreground">ج.م{p.status === "إيجار" ? " / شهريًا" : ""}</span>
        </p>
        <div className="mt-4 flex items-center gap-4 border-t pt-4 text-sm text-foreground/70">
          <span className="flex items-center gap-1.5"><Maximize className="size-4 text-teal" />{p.size} م²</span>
          {p.rooms && <span className="flex items-center gap-1.5"><BedDouble className="size-4 text-teal" />{p.rooms} غرف</span>}
          {p.baths && <span className="flex items-center gap-1.5"><Bath className="size-4 text-teal" />{p.baths}</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href="#properties" className="rounded-xl border border-primary py-2.5 text-center text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground">تفاصيل العقار</a>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-whatsapp py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-95">
            <MessageCircle className="size-4" /> واتساب
          </a>
        </div>
      </div>
    </article>
  );
}

export function FeaturedProperties() {
  return (
    <section id="properties" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-16 md:px-6 md:pt-24">
      <SectionHead eyebrow="مختارات فاليو عقار" title="العقارات المميزة"
        action={<a href="#properties" className="hidden items-center gap-1 text-sm font-bold text-primary hover:text-teal sm:flex">عرض الكل <ArrowLeft className="size-4" /></a>} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((p) => <PropertyCard key={p.id} p={p} />)}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">* جميع العقارات المعروضة بيانات توضيحية لأغراض العرض فقط وليست إعلانات حقيقية.</p>
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
    <footer className="mt-20 bg-navy-deep text-primary-foreground/75">
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

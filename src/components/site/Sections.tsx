import { cleanPhone } from "@/lib/phone";
import { Home, LandPlot, Store, Briefcase, Factory, Landmark, House, BedDouble, Bath, Maximize, MapPin, MessageCircle, Phone, ArrowLeft, Instagram, Mail, BarChart3, Megaphone, Inbox, ShieldQuestion, BadgeCheck, CalendarClock, RotateCcw, SearchX } from "lucide-react";
import { applyFilters, isEmpty, type Filters } from "./search";
import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { getAttribution } from "@/lib/attribution";
import { supabase } from "@/integrations/supabase/client";
import { contactNumber } from "./ContactActions";
import { fetchPublicProperties, fetchPublicBrokers, formatPrice, formatDate, waLink, listingMessage, WHATSAPP_NUMBER, TYPES_FOR, CITIES, CITY_NAMES, PURPOSE_LABEL, PRICE_UNIT_LABEL, type Property, useLocations } from "./data";
import { PropertiesMap } from "./PropertiesMap";
import { OpportunityCard } from "./OpportunityCard";
import { AlertButton, FavoriteButton } from "./CustomerTools";
import { fetchOpportunities } from "@/lib/investments";
import { fetchMallSummary } from "./malls";
import { fetchSearchEverything } from "./search-everything";
import { withPins } from "./mix";
import { useBadgeAccounts, useHomePins } from "@/lib/plan-perks";
import { AvailabilityBadge } from "./availability";
import { Avatar, inputCls } from "./ui";
import { Logo } from "./Navbar";
import { t as tr, useLang } from "@/lib/i18n";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { downPct } from "@/lib/installments";
import { WhatsAppMark } from "./FloatingWhatsApp";
import { thumb } from "@/lib/images";
import { trackContact, useImpression } from "@/lib/track";

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
  { label: "أراضي", icon: LandPlot, f: { group: "land" } },
  { label: "سكني", icon: Home, f: { group: "residential" } },
  { label: "تجاري", icon: Store, f: { group: "commercial" } },
  { label: "إداري", icon: Briefcase, f: { group: "office" } },
];

export function Categories({ onPick, status = "" }: { onPick: (f: Partial<Filters>) => void; status?: string }) {
  useLang();
  const card = "group flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-2xl border bg-card p-3 text-center transition hover:-translate-y-1 hover:border-teal hover:shadow-card focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.97] md:p-6";
  const icon = "grid size-11 shrink-0 place-items-center rounded-xl bg-teal-soft text-primary transition group-hover:bg-primary group-hover:text-primary-foreground md:size-14";
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 md:px-6 md:pt-20">
      <SectionHead eyebrow={tr("تصفّح حسب النوع")} title={status ? `${tr("التصنيفات الرئيسية")} — ${tr(PURPOSE_LABEL[status] ?? status)}` : tr("التصنيفات الرئيسية")} />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6 md:gap-4">
        {cats.filter(({ f }) => !(status && status !== "بيع" && f.group === "land")).map(({ label, icon: Icon, f }) => (
          <button key={label} type="button" onClick={() => onPick({ ...f, status })} className={card}>
            <span className={icon}><Icon className="size-5 md:size-6" /></span>
            <span className="text-[13px] leading-tight font-bold text-primary md:text-sm">{tr(label)}</span>
          </button>
        ))}
        <Link to="/industrial" className={card}>
          <span className={icon}><Factory className="size-5 md:size-6" /></span>
          <span className="text-[13px] leading-tight font-bold text-primary md:text-sm">{tr("صناعي")}</span>
        </Link>
        <Link to="/malls" className={card}>
          <span className={icon}><Landmark className="size-5 md:size-6" /></span>
          <span className="text-[13px] leading-tight font-bold text-primary md:text-sm">{tr("المولات")}</span>
        </Link>
        <Link to="/compounds" className={card}>
          <span className={icon}><House className="size-5 md:size-6" /></span>
          <span className="text-[13px] leading-tight font-bold text-primary md:text-sm">{tr("الكمبوندات")}</span>
        </Link>
      </div>
    </section>
  );
}

/** «تفاصيل العقار»: industrial listings have their own page; compound / project price-list units open their compound / project. */
function DetailsLink({ p, className }: { p: Property; className: string }) {
  const label = tr("تفاصيل العقار");
  if (p.kind === "industrial") return <Link to="/industrial/$id" params={{ id: p.id }} className={className}>{label}</Link>;
  if (p.kind === "compound" && p.parentId) return <Link to="/compounds/$id" params={{ id: p.parentId }} className={className}>{label}</Link>;
  if (p.kind === "project" && p.parentId) return <Link to="/projects/$id" params={{ id: p.parentId }} className={className}>{label}</Link>;
  return <Link to="/properties/$id" params={{ id: p.id }} className={className}>{label}</Link>;
}

export function PropertyCard({ p, whatsapp }: { p: Property; whatsapp?: string | null }) {
  useLang();
  // The listing's account, from the shared (cached) brokers list: its number is there only if the admin opened it up.
  const { data: brokers } = useQuery({ queryKey: ["public-brokers"], queryFn: fetchPublicBrokers, staleTime: 60_000 });
  const owner = p.brokerId ? brokers?.find((b) => b.id === p.brokerId) : undefined;
  const num = contactNumber(owner);
  const wa = whatsapp ?? (owner?.whatsapp || owner?.phone);
  // Statistics: a showing once the card is on screen, a contact on WhatsApp / call (listings only, not demos or units).
  const stat = !p.kind && !p.isDemo ? p.id : null;
  const seen = useImpression<HTMLElement>(stat);
  const contacted = () => { if (stat) trackContact(stat); };
  const badges = useBadgeAccounts();
  const accountVerified = !!p.brokerId && badges.has(p.brokerId);
  return (
    <article ref={seen} className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition hover:shadow-card">
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-muted">
        <img src={thumb(p.image)} alt={p.title} loading="lazy" decoding="async" width={944} height={704}
          className="size-full object-cover transition duration-500 group-hover:scale-105" />
        <span className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold ${p.status === "بيع" ? "bg-primary text-primary-foreground" : p.status === "مصيف" ? "bg-[#f2b84b] text-primary" : "bg-teal text-accent-foreground"}`}>
          {tr(PURPOSE_LABEL[p.status] ?? p.status)}
        </span>
        {p.installments && !p.highlight && <span className="absolute bottom-3 right-3 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold text-primary">{tr("تقسيط")}{p.installments.down != null && p.price > 0 ? ` · ${tr("مقدم")} ${downPct(p.price, p.installments.down)}%` : ""}</span>}
        {p.highlight && <span className="absolute bottom-3 right-3 rounded-full bg-[#f2b84b] px-2.5 py-1 text-[11px] font-bold text-primary">{tr("سعر مميز")}</span>}
        <AvailabilityBadge p={p} className="absolute top-12 right-3" />
        {p.isDemo ? <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{tr("إعلان تجريبي")}</span>
          : p.featured ? <span className="absolute top-3 left-3 rounded-full bg-teal px-2.5 py-1 text-[11px] font-bold text-accent-foreground">{tr("مميز")}</span> : null}
        {!p.parentId && <FavoriteButton id={p.id} className="absolute bottom-3 left-3" />}
      </div>
      <div className="flex flex-1 flex-col p-4 md:p-5">
        <p className="text-xl font-extrabold text-primary md:text-2xl">
          {p.status === "مصيف" && <span className="text-sm font-semibold text-muted-foreground">{tr("من")} </span>}{formatPrice(p.price)} <span className="text-sm font-semibold text-muted-foreground">{tr("ج.م")}{p.priceUnit ? tr(PRICE_UNIT_LABEL[p.priceUnit] ?? "") : ""}</span>
        </p>
        <h3 className="mt-1 line-clamp-1 text-base font-bold text-foreground">{p.title}</h3>
        {p.place && <p className="mt-1 line-clamp-1 flex items-center gap-1 text-xs font-bold text-teal">{p.kind === "mall" ? <Landmark className="size-3.5 shrink-0" /> : <House className="size-3.5 shrink-0" />}{tr(p.kind === "mall" ? "داخل مول" : p.kind === "project" ? "داخل مشروع" : "داخل كمبوند")} {p.place}</p>}
        {p.highlight && <p className="mt-1 line-clamp-1 text-xs font-bold text-teal">★ {p.highlight.reason}{p.highlight.yield ? ` · ${tr("عائد تقريبي")} ${formatPrice(p.highlight.yield)}%` : ""}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-lg bg-secondary px-2.5 py-1.5 text-primary">{tr(p.type)}</span>
          <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-primary"><MapPin className="size-3.5 shrink-0 text-teal" />{p.area === p.city ? tr(p.city) : `${tr(p.area)}${tr("، ")}${tr(p.city)}`}</span>
          <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-primary"><Maximize className="size-3.5 shrink-0 text-teal" />{formatPrice(p.size)} {tr("م²")}</span>
        </div>
        <div className="mt-3 flex min-h-5 items-center gap-4 text-sm text-foreground/70">
          {p.rooms && <span className="flex items-center gap-1.5"><BedDouble className="size-4 shrink-0 text-teal" />{formatPrice(p.rooms)} {tr("غرف")}</span>}
          {p.baths && <span className="flex items-center gap-1.5"><Bath className="size-4 shrink-0 text-teal" />{formatPrice(p.baths)} {tr("حمام")}</span>}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          {p.verified ? <span className="flex items-center gap-1 font-bold text-teal"><BadgeCheck className="size-3.5 shrink-0" />{tr("متحقق منه")}</span>
            : accountVerified ? <span className="flex items-center gap-1 font-bold text-teal"><BadgeCheck className="size-3.5 shrink-0" />{tr("حساب متحقق")}</span>
            : <span className="flex items-center gap-1"><ShieldQuestion className="size-3.5 shrink-0" />{p.isDemo ? tr("لسه ماتراجعش") : tr("تمت مراجعته")}</span>}
          {p.code && <span className="font-bold text-primary" dir="ltr">{p.code}</span>}
          <span className="flex items-center gap-1"><CalendarClock className="size-3.5 shrink-0" />{tr("تحديث:")} {formatDate(p.updated)}</span>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          <DetailsLink p={p} className="flex h-11 items-center justify-center rounded-xl border border-primary text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.98]" />
          <a href={waLink(wa, listingMessage(p))} target="_blank" rel="noreferrer" onClick={contacted}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp text-sm font-bold text-primary-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98]">
            <MessageCircle className="size-4 shrink-0" /> {tr("واتساب")}
          </a>
          {num && (
            <a href={`tel:${num}`} onClick={contacted} className="col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-teal text-sm font-bold text-accent-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98]">
              <Phone className="size-4 shrink-0" />{tr("اتصال")} <span dir="ltr">{num}</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function FeaturedProperties({ filters, onClear }: { filters: Filters; onClear: () => void }) {
  useLang();
  const filtered = !isEmpty(filters);
  const base = useQuery({ queryKey: ["public-properties"], queryFn: () => fetchPublicProperties() });
  // Everything = mall units, industrial, compound / project price lists too. The plain list shows the residential
  // listings until it arrives, then all of them taking turns by kind (so a batch of lands doesn't fill the screen).
  const everything = useQuery({ queryKey: ["search-everything"], queryFn: fetchSearchEverything });
  const { data: properties = [], isLoading, isError } = filtered || everything.data ? everything : base;
  // Pins rotate per visit: picked once per list so the order doesn't jump while the visitor scrolls.
  const pins = useHomePins();
  const results = useMemo(() => (filtered ? applyFilters(properties, filters) : withPins(properties, pins)), [filtered, properties, filters, pins]);
  // Show a few first (the home page was very long on phones); more on request. Reset when the search changes.
  const step = filtered ? 12 : 6;
  const [shown, setShown] = useState(step);
  const [showMap, setShowMap] = useState(false);
  const searchKey = JSON.stringify(filters);
  const [lastKey, setLastKey] = useState(searchKey);
  if (searchKey !== lastKey) { setLastKey(searchKey); setShown(step); }
  // Price-list units have no page of their own, so they stay off the map (their compound / project is on it).
  const mappable = results.filter((p) => !p.parentId && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const located = mappable.length;
  return (
    <section id="properties" className="mx-auto max-w-7xl scroll-mt-28 px-4 pt-12 md:px-6 md:pt-24">
      <SectionHead eyebrow={filtered ? tr("نتائج البحث") : tr("مختارات فاليو عقار")} title={filtered ? tr("العقارات المطابقة") : tr("العقارات المميزة")} />
      {filtered && (
        <div className="-mt-4 mb-6 flex items-center justify-between gap-3 rounded-xl bg-teal-soft px-4 py-3" aria-live="polite">
          <p className="text-sm font-bold text-primary">{tr("لقينا")} {formatPrice(results.length)} {results.length === 1 ? tr("عقار") : tr("عقارات")}</p>
          <AlertButton key={JSON.stringify(filters)} filters={filters} className="ms-auto h-9" />
          <button onClick={onClear} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold text-primary underline-offset-4 transition hover:underline focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none">
            <RotateCcw className="size-3.5" /> {tr("مسح الفلاتر")}
          </button>
        </div>
      )}
      {filters.group === "commercial" && (
        <Link to="/malls" className="-mt-3 mb-6 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-bold text-primary transition hover:border-teal">
          <span className="flex items-center gap-2"><Landmark className="size-4 text-teal" />{tr("تصفّح المحلات والوحدات داخل المولات التجارية")}</span>
          <ArrowLeft className="size-4" />
        </Link>
      )}
      {filters.group === "residential" && (
        <Link to="/compounds" className="-mt-3 mb-6 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-bold text-primary transition hover:border-teal">
          <span className="flex items-center gap-2"><House className="size-4 text-teal" />{tr("تصفّح الوحدات داخل الكمبوندات السكنية")}</span>
          <ArrowLeft className="size-4" />
        </Link>
      )}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2].map((i) => <div key={i} className="h-96 animate-pulse rounded-2xl bg-muted" />)}</div>
      ) : isError ? (
        <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">{tr("العقارات ماحمّلتش، حدّث الصفحة.")}</p>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
          <SearchX className="mx-auto size-10 text-teal" />
          <h3 className="mt-4 text-lg font-bold text-primary">{tr("مفيش عقارات زي اللي بتدور عليه")}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{tr("جرّب توسّع السعر أو تختار منطقة أو نوع تاني، أو اطلب عقارك وإحنا ندوّرلك.")}</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button onClick={onClear} className="h-11 rounded-xl border border-primary px-6 text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground">{tr("مسح الفلاتر")}</button>
            <AlertButton key={JSON.stringify(filters)} filters={filters} />
            <a href="#request" onClick={() => { if (filters.place) window.dispatchEvent(new CustomEvent(REQUEST_PLACE_EVENT, { detail: filters.place })); }}
              className="flex h-11 items-center justify-center rounded-xl bg-teal px-6 text-sm font-bold text-accent-foreground transition hover:brightness-95">{tr(filters.place ? "اطلب عقار في المكان ده" : "اطلب عقارك")}</a>
          </div>
        </div>
      ) : (
        <>
        {located > 0 && (
          <div className="mb-4">
            <button type="button" onClick={() => setShowMap(!showMap)} aria-expanded={showMap} className="inline-flex h-10 items-center gap-1.5 rounded-xl border bg-card px-4 text-sm font-bold text-primary transition hover:border-teal">
              <MapPin className="size-4 text-teal" />{showMap ? tr("إخفاء الخريطة") : `${tr("اعرض على الخريطة")} (${formatPrice(located)})`}
            </button>
            {showMap && <div className="mt-3"><PropertiesMap properties={mappable} /></div>}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {results.slice(0, shown).map((p) => <PropertyCard key={p.id} p={p} />)}
        </div>
        {results.length > shown && (
          <div className="mt-6 text-center">
            <button type="button" onClick={() => setShown(shown + step)} className="inline-flex h-11 items-center justify-center rounded-xl border border-primary px-6 text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground">
              {tr("عرض المزيد")} ({formatPrice(results.length - shown)})
            </button>
          </div>
        )}
        </>
      )}
      {results.slice(0, shown).some((p) => p.isDemo) && <p className="mt-4 text-xs text-muted-foreground">{tr("* العقارات التي تحمل علامة «إعلان تجريبي» بيانات توضيحية فقط.")}</p>}
    </section>
  );
}

/** Latest listings for one purpose (rent / summer) with a "see all" that filters the main list. */
export function PurposeStrip({ status, eyebrow, title, onAll }: { status: "إيجار" | "مصيف"; eyebrow: string; title: string; onAll: () => void }) {
  useLang();
  const { data: properties = [] } = useQuery({ queryKey: ["public-properties"], queryFn: () => fetchPublicProperties() });
  const list = properties.filter((p) => p.status === status).slice(0, 6);
  if (list.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 md:px-6 md:pt-20">
      <SectionHead eyebrow={tr(eyebrow)} title={tr(title)} action={
        <button type="button" onClick={onAll} className="-my-2 flex shrink-0 items-center gap-1 py-3 text-sm font-bold text-primary hover:text-teal">{tr("عرض الكل")} <ArrowLeft className="size-4" /></button>
      } />
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {list.map((p) => <div key={p.id} className="w-[85%] shrink-0 snap-start sm:w-[45%] md:w-auto"><PropertyCard p={p} /></div>)}
      </div>
    </section>
  );
}

/** Investment opportunities (big deals) — shown once at least one is published. */
export function InvestmentsStrip() {
  useLang();
  const { data = [] } = useQuery({ queryKey: ["opportunities"], queryFn: fetchOpportunities });
  if (data.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 md:px-6 md:pt-20">
      <SectionHead eyebrow={tr("أراضي للتطوير · أنشطة قائمة · شراكات")} title={tr("فرص استثمارية")} action={
        <Link to="/investments" className="flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:text-teal">{tr("كل الفرص")} <ArrowLeft className="size-4" /></Link>
      } />
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {data.slice(0, 3).map((o) => <div key={o.id} className="w-[85%] shrink-0 snap-start sm:w-[45%] md:w-auto"><OpportunityCard o={o} /></div>)}
      </div>
    </section>
  );
}

/** Malls with units on sale or rent: count and starting price per mall. Hidden until at least one mall has units. */
export function MallsStrip() {
  useLang();
  const { data = [] } = useQuery({ queryKey: ["home-malls"], queryFn: fetchMallSummary });
  if (data.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 md:px-6 md:pt-20">
      <SectionHead eyebrow={tr("محلات · مكاتب · عيادات")} title={tr("المولات التجارية")} action={
        <Link to="/malls" className="flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:text-teal">{tr("كل المولات")} <ArrowLeft className="size-4" /></Link>
      } />
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {data.slice(0, 4).map(({ m, n, from }) => (
          <Link key={m.id} to="/malls/$id" params={{ id: m.id }} className="w-[70%] shrink-0 snap-start overflow-hidden rounded-2xl border bg-card shadow-card transition hover:-translate-y-0.5 sm:w-[45%] md:w-auto">
            <div className="grid aspect-[4/3] place-items-center bg-secondary">
              {m.logo_url ? <img src={thumb(m.logo_url)} alt={m.name} loading="lazy" className="size-full object-cover" /> : <Store className="size-12 text-teal" />}
            </div>
            <div className="p-4">
              <h3 className="font-extrabold text-primary">{m.name}</h3>
              {m.location && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" />{m.location}</p>}
              <p className="mt-2 text-sm font-bold text-teal">{formatPrice(n)} {tr("وحدة متاحة")}</p>
              {from > 0 && <p className="text-xs font-semibold text-primary">{tr("تبدأ من")} {formatPrice(from)} {tr("ج.م")}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Curated special-price listings — shown only when there are at least 3, so the section never looks empty. */
export function HighlightsStrip() {
  useLang();
  const { data: properties = [] } = useQuery({ queryKey: ["public-properties"], queryFn: () => fetchPublicProperties() });
  const list = properties.filter((p) => p.highlight).slice(0, 6);
  if (list.length < 3) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 md:px-6 md:pt-20">
      <SectionHead eyebrow={tr("مختارة من فريق فاليو عقار")} title={tr("عروض بسعر مميز")} />
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {list.map((p) => <div key={p.id} className="w-[85%] shrink-0 snap-start sm:w-[45%] md:w-auto"><PropertyCard p={p} /></div>)}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{tr("* أسباب الترشيح والعوائد تقديرية ومش ضمان.")}</p>
    </section>
  );
}

export function RequestCTA() {
  useLang();
  return (
    <section id="request" className="mx-auto max-w-7xl scroll-mt-28 px-4 pt-16 md:px-6 md:pt-24">
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

/** The search sends a typed place here so «اطلب عقارك» starts with it. */
const REQUEST_PLACE_EVENT = "va-request-place";

function RequestForm() {
  useLocations();
  useLang();
  const [f, setF] = useState({ name: "", phone: "", purpose: "sale" as "sale" | "rent" | "summer", property_type: "", city: "", area: "", budget: "", details: "" });
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    const onPlace = (e: Event) => { const place = String((e as CustomEvent).detail ?? "").slice(0, 60); setTyped(true); setF((x) => ({ ...x, city: place, area: "" })); };
    window.addEventListener(REQUEST_PLACE_EVENT, onPlace);
    return () => window.removeEventListener(REQUEST_PLACE_EVENT, onPlace);
  }, []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2 || !cleanPhone(f.phone)) { toast.error(tr("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({ name: f.name.trim(), phone: cleanPhone(f.phone)!, kind: "request", purpose: f.purpose, property_type: f.property_type || null, area: (f.area.trim() && f.city.trim() ? `${f.area.trim()}، ${f.city.trim()}` : f.area.trim() || f.city.trim()).slice(0, 60) || null, budget: f.budget ? Number(f.budget) : null, details: f.details.trim().slice(0, 1000) || null, original_source: "website", utm: getAttribution() });
    setBusy(false);
    if (error) { toast.error(tr("الطلب ماتبعتش، جرّب تاني")); return; }
    setDone(true);
  }
  if (done) return <div className="rounded-2xl bg-card p-6 text-center"><p className="text-lg font-bold text-primary">{tr("طلبك وصل ✓")}</p><p className="mt-2 text-sm text-muted-foreground">{tr("سيتواصل معك أحد وسطائنا قريبًا.")}</p></div>;
  return (
    <form onSubmit={submit} className="grid gap-2.5 rounded-2xl bg-card p-4 sm:grid-cols-2 md:p-5">
      <input className={inputCls} placeholder={tr("الاسم")} value={f.name} onChange={set("name")} maxLength={100} required />
      <input className={inputCls} placeholder={tr("رقم الهاتف")} inputMode="tel" dir="ltr" value={f.phone} onChange={set("phone")} maxLength={20} required />
      <div role="radiogroup" aria-label={tr("الغرض")} className="grid grid-cols-3 gap-1.5 sm:col-span-2">
        {([["sale", "شراء"], ["rent", "إيجار"], ["summer", "مصيف"]] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={f.purpose === v} onClick={() => setF({ ...f, purpose: v })}
            className={`h-10 rounded-xl border text-sm font-bold transition ${f.purpose === v ? "border-teal bg-teal/10 text-primary" : "text-muted-foreground hover:border-teal/50"}`}>{tr(l)}</button>
        ))}
      </div>
      <select aria-label={tr("نوع العقار")} className={`${inputCls} sm:col-span-2`} value={f.property_type} onChange={set("property_type")}><option value="">{tr("نوع العقار")}</option>{TYPES_FOR[f.purpose === "sale" ? "بيع" : f.purpose === "rent" ? "إيجار" : "مصيف"]!.map((v) => <option key={v} value={v}>{tr(v)}</option>)}</select>
      <select className={inputCls} value={typed ? "__other__" : f.city} aria-label={tr("المدينة")} onChange={(e) => {
        const other = e.target.value === "__other__";
        setTyped(other); setF({ ...f, city: other ? "" : e.target.value, area: "" });
      }}><option value="">{tr("المدينة")}</option>{CITY_NAMES.map((v) => <option key={v} value={v}>{tr(v)}</option>)}<option value="__other__">{tr("مدينة تانية…")}</option></select>
      {typed ? (
        <input className={inputCls} placeholder={tr("اكتب المدينة")} value={f.city} onChange={set("city")} maxLength={40} aria-label={tr("المدينة")} />
      ) : (
        <select className={inputCls} value={f.area} onChange={set("area")} aria-label={tr("المنطقة")} disabled={!CITIES[f.city]?.length}><option value="">{tr("المنطقة")}</option>{(CITIES[f.city] ?? []).map((v) => <option key={v} value={v}>{tr(v)}</option>)}</select>
      )}
      {typed && <input className={`${inputCls} sm:col-span-2`} placeholder={tr("المنطقة (اختياري)")} value={f.area} onChange={set("area")} maxLength={40} aria-label={tr("المنطقة")} />}
      <input className={`${inputCls} sm:col-span-2`} placeholder={tr(f.purpose === "rent" ? "الميزانية الشهرية (ج.م)" : f.purpose === "summer" ? "الميزانية لليلة (ج.م)" : "الميزانية (ج.م)")} inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") })} />
      <textarea className={`${inputCls} h-20 py-2 sm:col-span-2`} placeholder={tr("تفاصيل إضافية")} value={f.details} onChange={set("details")} maxLength={1000} />
      <button disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal font-bold text-accent-foreground transition hover:brightness-95 disabled:opacity-60 sm:col-span-2">{busy ? tr("بيتبعت...") : tr("ابعت طلبك")} <ArrowLeft className="size-4" /></button>
    </form>
  );
}

export function Brokers() {
  useLang();
  const { data: brokers = [] } = useQuery({ queryKey: ["public-brokers"], queryFn: fetchPublicBrokers });
  return (
    <section id="brokers" className="mx-auto max-w-7xl scroll-mt-28 px-4 pt-16 md:px-6 md:pt-24">
      <SectionHead eyebrow={tr("شركاء موثوقون")} title={tr("تواصل مع الوسيط المناسب")}
        action={<Link to="/brokers" className="-my-2 inline-block shrink-0 py-3 text-sm font-bold text-primary hover:text-teal">{tr("كل الوسطاء ←")}</Link>} />
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
            <p className="mt-5 flex items-start gap-2 text-sm text-foreground/75"><MapPin className="mt-0.5 size-4 shrink-0 text-teal" />{b.areas.map((area) => tr(area)).join(" / ") || "—"}</p>
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
    <section id="broker-services" className="mx-auto max-w-7xl scroll-mt-28 px-4 pt-16 md:px-6 md:pt-24">
      <div className="grid items-center gap-8 rounded-3xl bg-teal-soft p-6 md:grid-cols-2 md:p-14">
        <div>
          <p className="text-sm font-bold text-primary/70">{tr("للوسطاء والمكاتب العقارية")}</p>
          <h2 className="mt-2 text-2xl font-extrabold text-primary md:text-4xl">{tr("كبّر نشاطك العقاري مع فاليو عقار")}</h2>
          <p className="mt-4 leading-relaxed text-foreground/75">{tr("أدوات تسويق وإدارة تساعدك في الوصول إلى عملاء جدد وتنظيم عقاراتك واستفساراتك.")}</p>
          <Link to="/auth" className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 font-bold text-primary-foreground transition hover:bg-navy-deep">
            {tr("انضم لفاليو عقار")} <ArrowLeft className="size-4" />
          </Link>
          <a href="/broker-network" className="mt-4 flex items-center gap-2 text-sm font-bold text-primary hover:text-teal">
            {tr("سوق الوسطاء")}: {tr("شغّل مع باقي الوسطاء واقسم العمولة بضمان المنصة")} ←
          </a>
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

/** Brand marks for the footer social links (official colors; paths from Simple Icons, CC0). */
function FacebookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#fff" />
      <path fill="#1877F2" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
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
  const pages: [string, string][] = [["الرئيسية", "/#top"], ["العقارات", "/#properties"], ["الوسطاء العقاريون", "/brokers"], ["اطلب عقارك", "/#request"], ["الباقات", "/plans"], ["تسجيل الدخول", "/auth"]];
  return (
    <footer className="mt-16 pb-20 lg:pb-0 md:mt-20 bg-navy-deep text-primary-foreground/75">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 md:grid-cols-4 md:gap-10 md:px-6 md:py-14">
        {/* Phones: brand + social across the top, then links and contact side by side (the footer was very tall). */}
        <div className="col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">{tr("منصة عقارية تربطك بالعقارات والوسطاء في برج العرب والساحل الشمالي.")}</p>
          <div className="mt-5 flex gap-2">
            {[
              { icon: <FacebookMark className="size-10" />, bg: "", href: "https://www.facebook.com/share/19VhkpxBhr/?mibextid=wwXIfr", label: "صفحتنا على فيسبوك" },
              { icon: <Instagram className="size-5" />, bg: "bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fdf497_5%,#fd5949_45%,#d6249f_60%,#285AEB_90%)] text-white", href: "https://www.instagram.com/value._.square", label: "حسابنا على إنستاجرام" },
              { icon: <TikTokIcon className="size-5 [filter:drop-shadow(-1.5px_-1.5px_0_#25F4EE)_drop-shadow(1.5px_1.5px_0_#FE2C55)]" />, bg: "bg-black text-white", href: "https://www.tiktok.com/@value.square8", label: "حسابنا على تيك توك" },
              { icon: <WhatsAppMark className="size-5" />, bg: "bg-[#25D366] text-white", href: waLink(WHATSAPP_NUMBER, tr("مرحبًا، أريد الاستفسار عن أحد العقارات على منصة فاليو عقار.")), label: "تواصل معنا على واتساب" },
            ].map(({ icon, bg, href, label }, i) => (
              <a key={i} href={href} aria-label={tr(label)} title={tr(label)} target="_blank" rel="noreferrer" className={`grid size-10 place-items-center overflow-hidden rounded-full transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-navy-deep ${bg}`}>{icon}<span className="sr-only">{tr(label)}</span></a>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-bold text-primary-foreground">{tr("روابط")}</h2>
          <ul className="mt-3 text-sm">{pages.map(([l, h]) => <li key={h}><a href={h} className="inline-block py-2.5 hover:text-teal">{tr(l)}</a></li>)}</ul>
        </div>
        <div>
          <h2 className="font-bold text-primary-foreground">{tr("تواصل معنا")}</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><a href="https://maps.google.com/?cid=6237911875878729662" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-teal"><MapPin className="size-4 shrink-0 text-teal" />{tr("عمارات المستثمرين، برج العرب — موقعنا على الخريطة")}</a></li>
            <li><a href={waLink(WHATSAPP_NUMBER, tr("أهلاً فاليو عقار"))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 py-1 hover:text-teal"><MessageCircle className="size-4 text-teal" />{tr("راسلنا على واتساب")}</a></li>
            <li className="flex items-center gap-2"><Mail className="size-4 text-teal" />info@valueaqar.com</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs md:flex-row md:px-6">
          <p>© {new Date().getFullYear()} {tr("فاليو عقار. جميع الحقوق محفوظة.")}</p>
          <div className="flex gap-5"><Link to="/privacy" className="inline-block py-2.5 hover:text-teal">{tr("سياسة الخصوصية")}</Link><Link to="/terms" className="inline-block py-2.5 hover:text-teal">{tr("الشروط والأحكام")}</Link></div>
        </div>
      </div>
    </footer>
  );
}

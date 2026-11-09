import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, ClipboardList, HandCoins, MapPin, Plus, Search, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { cleanPhone } from "@/lib/phone";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { PageShell, inputCls, btnOutline, btnPrimary, btnTeal } from "@/components/site/ui";
import { RequestForm } from "@/components/site/RequestForm";
import { formatDate, formatPrice } from "@/components/site/data";

export const Route = createFileRoute("/wanted")({
  head: () => pageHead({
    path: "/wanted",
    title: "العقارات المطلوبة في برج العرب والساحل الشمالي | فاليو عقار",
    description: "طلبات عملاء بيدوروا على شقق وأراضي ومحلات للبيع والإيجار. عندك عقار مناسب؟ ابعت عرضك وفريق فاليو عقار يوصّلك بالعميل. أو اكتب طلبك لو ملقتش اللي بتدور عليه.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "المطلوب", path: "/wanted" }])],
  }),
  component: Wanted,
});

const PURPOSES: Record<string, string> = { sale: "شراء", rent: "إيجار", summer: "مصيف" };
const WANTED_LABEL: Record<string, string> = { sale: "مطلوب للشراء", rent: "مطلوب للإيجار", summer: "مطلوب للمصيف" };
type Item = { id: string; lead_no: number; purpose: string | null; property_type: string | null; area: string | null; budget: number | null; note: string | null; created_at: string };

/** Customers' requests, open to everyone without their name or number. An offer goes to Value Aqar only. */
function Wanted() {
  useLang();
  const q = useQuery({
    queryKey: ["wanted-board"],
    staleTime: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc("wanted_board"); return error ? [] : (data ?? []); },
  });
  const [filter, setFilter] = useState({ purpose: "", type: "", text: "" });
  const [writing, setWriting] = useState(false);
  const items = q.data ?? [];
  const types = useMemo(() => [...new Set(items.map((x) => x.property_type).filter((x): x is string => !!x))], [items]);
  const shown = useMemo(() => {
    const text = filter.text.trim().toLowerCase();
    return items.filter((x) => (!filter.purpose || x.purpose === filter.purpose) && (!filter.type || x.property_type === filter.type)
      && (!text || [x.area, x.note, x.property_type].some((v) => (v ?? "").toLowerCase().includes(text))));
  }, [items, filter]);

  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14">
          <h1 className="text-2xl font-extrabold text-primary-foreground md:text-4xl">{t("العقارات المطلوبة")}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("دي مش عقارات معروضة. دي طلبات عملاء بيدوروا على عقار دلوقتي. عندك عقار مناسب؟ ابعت عرضك، ولو ملقتش اللي بتدور عليه اكتب طلبك.")}</p>
          <button type="button" className={`${btnTeal} mt-5`} aria-expanded={writing} onClick={() => setWriting(!writing)}>
            {writing ? <X className="size-4" /> : <Plus className="size-4" />}{t(writing ? "إغلاق" : "اكتب طلبك")}
          </button>
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-6">
        {writing && (
          <div className="rounded-2xl border bg-secondary/50 p-3 md:p-4">
            <RequestForm onSent={() => void q.refetch()} />
          </div>
        )}
        <p className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-teal" />{t("بيانات أصحاب الطلبات محمية، والتواصل بيتم عن طريق فاليو عقار بس.")}</p>
        {items.length > 0 && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <input aria-label={t("بحث")} className={`${inputCls} col-span-2`} placeholder={t("دوّر بالمنطقة...")} value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
            <select aria-label={t("الغرض")} className={inputCls} value={filter.purpose} onChange={(e) => setFilter({ ...filter, purpose: e.target.value })}><option value="">{t("كل الطلبات")}</option>{Object.entries(PURPOSES).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
            <select aria-label={t("نوع العقار")} className={inputCls} value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}><option value="">{t("كل الأنواع")}</option>{types.map((v) => <option key={v} value={v}>{t(v)}</option>)}</select>
          </div>
        )}
        {q.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">{t("جاري التحميل...")}</p>
          : shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
              <ClipboardList className="mx-auto size-10 text-teal" />
              <p className="mt-3 font-bold text-primary">{t(items.length ? "مفيش طلبات مطابقة" : "لسه مفيش طلبات")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("اكتب طلبك وهيظهر هنا من غير اسمك ورقمك.")}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shown.map((x) => <Card key={x.id} x={x} />)}</div>
          )}
      </div>
    </PageShell>
  );
}

function Card({ x }: { x: Item }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", details: "" });
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.rpc("submit_wanted_offer", { _request: x.id, _name: f.name.trim(), _phone: phone, _details: f.details.trim().slice(0, 900) });
    setBusy(false);
    if (error) { toast.error(t(error.code === "P0001" ? error.message : "العرض ماتبعتش، جرّب تاني")); return; }
    setDone(true);
  }
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition duration-300 hover:-translate-y-0.5 hover:shadow-card motion-reduce:hover:translate-y-0">
      <div className="relative grid aspect-[4/3] shrink-0 place-items-center bg-primary text-primary-foreground">
        <span className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold ${x.purpose === "sale" ? "bg-background text-primary" : x.purpose === "summer" ? "bg-[#f2b84b] text-primary" : "bg-teal text-accent-foreground"}`}>{t(WANTED_LABEL[x.purpose ?? ""] ?? "مطلوب")}</span>
        <div className="text-center">
          <Search className="mx-auto size-12 text-teal" />
          <p className="mt-2 text-3xl font-extrabold">{t("مطلوب")}</p>
          <p className="mt-1 text-xs font-semibold text-primary-foreground/70">{t("عميل بيدور على العقار ده")}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4 md:p-5">
        <p className="text-xl font-extrabold text-primary md:text-2xl">
          {x.budget != null ? <><span className="text-sm font-semibold text-muted-foreground">{t("ميزانيته")} </span>{formatPrice(Number(x.budget))} <span className="text-sm font-semibold text-muted-foreground">{t("ج.م")}</span></> : <span className="text-base">{t("الميزانية حسب العرض")}</span>}
        </p>
        <h2 className="mt-1 line-clamp-1 text-base font-bold text-foreground">{t("عميل بيدور على {type}", { type: t(x.property_type ?? "عقار") })}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          {x.property_type && <span className="rounded-lg bg-secondary px-2.5 py-1.5 text-primary">{t(x.property_type)}</span>}
          {x.area && <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-primary"><MapPin className="size-3.5 shrink-0 text-teal" />{x.area}</span>}
        </div>
        {x.note && <p className="mt-3 line-clamp-2 text-sm text-foreground/70">{x.note}</p>}
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          <span className="font-bold text-primary" dir="ltr">VA-{String(x.lead_no).padStart(6, "0")}</span>
          <span className="flex items-center gap-1"><CalendarClock className="size-3.5 shrink-0" />{t("اتطلب في {date}", { date: formatDate(x.created_at) })}</span>
        </div>
      {done ? <p className="mt-3 rounded-xl bg-teal/10 p-3 text-center text-sm font-bold text-primary">{t("عرضك وصل ✓ فريق فاليو عقار هيتواصل معاك.")}</p>
        : open ? (
          <form onSubmit={send} className="mt-3 space-y-2">
            <input className={inputCls} placeholder={t("الاسم")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} required />
            <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} required />
            <textarea className={`${inputCls} h-20 py-2`} placeholder={t("تفاصيل عقارك")} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} maxLength={900} />
            <p className="text-xs text-muted-foreground">{t("بياناتك هتوصل لفاليو عقار بس، ومش هتظهر لصاحب الطلب.")}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={btnOutline} onClick={() => setOpen(false)}>{t("إلغاء")}</button>
              <button disabled={busy} className={btnPrimary}>{busy ? "..." : t("ابعت العرض")}</button>
            </div>
          </form>
        ) : <div className="mt-auto pt-4"><p className="mb-1.5 text-center text-xs font-bold text-muted-foreground">{t("عندك عقار زي ده؟")}</p><button type="button" className={`${btnPrimary} w-full`} onClick={() => setOpen(true)}><HandCoins className="size-4" />{t("عندي العقار ده")}</button></div>}
      </div>
    </article>
  );
}

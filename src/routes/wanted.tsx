import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, ClipboardList, HandCoins, MapPin, Plus, ShieldCheck, X } from "lucide-react";
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
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("طلبات عملاء بيدوروا على عقار دلوقتي. عندك عقار مناسب؟ ابعت عرضك، ولو ملقتش اللي بتدور عليه اكتب طلبك.")}</p>
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
    <article className="flex flex-col rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
        <span className="rounded-full bg-primary px-2.5 py-0.5 text-primary-foreground">{t(PURPOSES[x.purpose ?? ""] ?? "مطلوب")}</span>
        <span className="text-muted-foreground" dir="ltr">VA-{String(x.lead_no).padStart(6, "0")}</span>
      </div>
      <h2 className="mt-2 font-extrabold text-primary">{t(x.property_type ?? "عقار")}</h2>
      {x.area && <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0 text-teal" />{x.area}</p>}
      {x.budget != null && <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-teal"><Banknote className="size-4 shrink-0" />{formatPrice(Number(x.budget))} {t("ج.م")}</p>}
      {x.note && <p className="mt-2 text-sm text-foreground/75">{x.note}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{formatDate(x.created_at)}</p>
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
        ) : <button type="button" className={`${btnPrimary} mt-3 w-full`} onClick={() => setOpen(true)}><HandCoins className="size-4" />{t("عندي العقار ده")}</button>}
    </article>
  );
}

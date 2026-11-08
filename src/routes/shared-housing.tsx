import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BedDouble, Building, Factory, GraduationCap, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { cleanPhone } from "@/lib/phone";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { PageShell, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { SHARED_GENDER, SHARED_KIND, formatPrice } from "@/components/site/data";

export const Route = createFileRoute("/shared-housing")({
  head: () => pageHead({
    path: "/shared-housing",
    title: "سكن مشترك للعمال والطلبة في برج العرب — قريبًا | فاليو عقار",
    description: "سرير أو أوضة قريبة من المناطق الصناعية والجامعات في برج العرب، وشركاء سكن مناسبين، وسكن جماعي للشركات. سجّل اهتمامك ونبلّغك أول ما يفتح.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "سكن مشترك", path: "/shared-housing" }])],
  }),
  component: SharedHousing,
});

const WHO = [
  { id: "worker", label: "عامل / موظف في مصنع", icon: Factory },
  { id: "student", label: "طالب", icon: GraduationCap },
  { id: "company", label: "شركة عايزة سكن لعمالها", icon: Building },
  { id: "owner", label: "عندي سكن عايز أأجّره", icon: BedDouble },
] as const;

/** Shared housing (bed / room) for factory workers and students: "coming soon" page that collects demand as leads. */
function SharedHousing() {
  useLang();
  const q = useQuery({
    queryKey: ["shared-units-public"],
    staleTime: 5 * 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc("shared_units_public"); return error ? [] : (data ?? []); },
  });
  const units = q.data ?? [];
  const open = units.length > 0;
  const [filter, setFilter] = useState({ gender: "", kind: "", text: "", max: "", free: false });
  const [unit, setUnit] = useState<{ id: string; title: string } | null>(null);
  const shown = useMemo(() => units.filter((u) => {
    const text = filter.text.trim().toLowerCase();
    return (!filter.gender || u.gender === filter.gender) && (!filter.kind || u.kind === filter.kind)
      && (!filter.max || Number(u.monthly_price) <= Number(filter.max)) && (!filter.free || u.free_places > 0)
      && (!text || [u.title, u.area, u.near].some((x) => (x ?? "").toLowerCase().includes(text)));
  }), [units, filter]);
  const book = (u: { id: string; title: string; gender: string }) => {
    setUnit({ id: u.id, title: u.title });
    setF((c) => ({ ...c, gender: u.gender }));
    document.getElementById("shared-request")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const [f, setF] = useState({ gender: "", who: "worker" as (typeof WHO)[number]["id"], near: "", budget: "", count: "", name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const digits = (v: string) => v.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("shared_requests").insert({
      unit_id: unit?.id ?? null, who: f.who, gender: f.gender || null, name: f.name.trim().slice(0, 100), phone,
      near: f.near.trim().slice(0, 120) || null, budget: f.budget ? Number(f.budget) : null, people: f.count ? Math.min(Number(f.count), 500) : null,
    });
    setBusy(false);
    if (error) { toast.error(t("الطلب ماتبعتش، جرّب تاني")); return; }
    setDone(true);
  }

  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14">
          <span className="inline-block rounded-full bg-teal px-3 py-1 text-xs font-extrabold text-accent-foreground">{t(open ? "متاح دلوقتي" : "قريبًا")}</span>
          <h1 className="mt-3 text-2xl font-extrabold text-primary-foreground md:text-4xl">{t("سكن مشترك للعمال والطلبة")}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("سرير أو أوضة قريبة من شغلك أو جامعتك في برج العرب، بسعر مناسب ومع ناس مناسبين. بنجهّز الخدمة دلوقتي — سجّل اهتمامك ونبلّغك أول ما تفتح.")}</p>
        </div>
      </section>
      {open && (
        <div className="mx-auto max-w-5xl space-y-3 px-4 pt-8 md:px-6">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <input aria-label={t("بحث")} className={`${inputCls} col-span-2`} placeholder={t("المنطقة أو قريب من...")} value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
            <select aria-label={t("السكن لـ")} className={inputCls} value={filter.gender} onChange={(e) => setFilter({ ...filter, gender: e.target.value })}><option value="">{t("رجال وسيدات")}</option>{Object.entries(SHARED_GENDER).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
            <select aria-label={t("النوع")} className={inputCls} value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })}><option value="">{t("كل الأنواع")}</option>{Object.entries(SHARED_KIND).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
            <input aria-label={t("أقصى سعر")} className={inputCls} inputMode="numeric" placeholder={t("أقصى سعر")} value={filter.max} onChange={(e) => setFilter({ ...filter, max: digits(e.target.value).slice(0, 7) })} />
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-primary"><input type="checkbox" checked={filter.free} onChange={(e) => setFilter({ ...filter, free: e.target.checked })} />{t("الأماكن الفاضية بس")}</label>
          {shown.length === 0 ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("مفيش سكن مطابق، ابعت طلبك وهندوّرلك.")}</p> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((u) => (
                <article key={u.id} className="flex flex-col overflow-hidden rounded-2xl border bg-card">
                  {u.photos[0] ? <img src={u.photos[0]} alt={u.title} loading="lazy" className="h-40 w-full object-cover" /> : <div className="grid h-40 place-items-center bg-secondary text-primary"><BedDouble className="size-10" /></div>}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-bold"><span className="rounded-full bg-primary px-2.5 py-0.5 text-primary-foreground">{t(SHARED_GENDER[u.gender] ?? "")}</span><span className="rounded-full bg-secondary px-2.5 py-0.5 text-primary">{t(SHARED_KIND[u.kind] ?? "")}</span></div>
                    <h2 className="mt-2 font-extrabold text-primary">{u.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{[u.area, u.near].filter(Boolean).join(" · ")}</p>
                    {u.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{u.description}</p>}
                    <p className="mt-2 font-extrabold text-teal">{formatPrice(Number(u.monthly_price))} {t("ج.م / شهر")}</p>
                    <p className="text-xs font-bold text-muted-foreground">{u.free_places > 0 ? t("فاضي {n} مكان", { n: formatPrice(u.free_places) }) : t("كامل العدد")}</p>
                    <button type="button" className={`${u.free_places > 0 ? btnPrimary : btnOutline} mt-3 w-full`} onClick={() => book(u)}>{t(u.free_places > 0 ? "احجز مكان" : "سجّلني لو فضي مكان")}</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-2 md:px-6">
        <ul className="space-y-3 text-sm">
          {[
            [BedDouble, "إيجار بالسرير أو بالأوضة، مش لازم شقة كاملة"],
            [Factory, "قريب من المناطق الصناعية والجامعات"],
            [Users, "شركاء سكن من نفس الشغل أو الوردية أو الجامعة"],
            [Building, "سكن جماعي للشركات والمصانع لعمالها"],
          ].map(([Icon, text]) => {
            const I = Icon as typeof BedDouble;
            return <li key={text as string} className="flex items-start gap-3 rounded-2xl border bg-card p-4"><I className="mt-0.5 size-5 shrink-0 text-teal" /><span className="font-semibold text-primary">{t(text as string)}</span></li>;
          })}
        </ul>
        {done ? (
          <div className="rounded-2xl border bg-card p-6 text-center"><p className="text-lg font-bold text-primary">{t("اتسجّلت ✓")}</p><p className="mt-2 text-sm text-muted-foreground">{t("هنكلّمك أول ما الخدمة تفتح.")}</p></div>
        ) : (
          <form id="shared-request" onSubmit={submit} className="space-y-3 rounded-2xl border bg-card p-5">
            <p className="font-extrabold text-primary">{t(open ? "ابعت طلب سكن" : "سجّل اهتمامك")}</p>
            {unit && <p className="flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-primary"><span>{unit.title}</span><button type="button" className="text-xs underline" onClick={() => setUnit(null)}>{t("إلغاء")}</button></p>}
            <div className="grid grid-cols-2 gap-1.5">
              {WHO.map((w) => (
                <button key={w.id} type="button" aria-pressed={f.who === w.id} onClick={() => setF({ ...f, who: w.id })}
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold ${f.who === w.id ? "border-teal bg-teal/10 text-primary" : "text-muted-foreground"}`}><w.icon className="size-4 shrink-0" />{t(w.label)}</button>
              ))}
            </div>
            <select aria-label={t("السكن لـ")} className={inputCls} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} required><option value="">{t("السكن لرجال ولا سيدات؟")}</option>{Object.entries(SHARED_GENDER).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
            <input className={inputCls} placeholder={t("قريب من (مصنع، منطقة صناعية، جامعة...)")} value={f.near} onChange={(e) => setF({ ...f, near: e.target.value })} maxLength={80} />
            <div className="grid grid-cols-2 gap-2.5">
              <input className={inputCls} inputMode="numeric" placeholder={t(f.who === "owner" ? "الإيجار للسرير (ج.م)" : "الميزانية الشهرية (ج.م)")} value={f.budget} onChange={(e) => setF({ ...f, budget: digits(e.target.value) })} />
              <input className={inputCls} inputMode="numeric" placeholder={t(f.who === "owner" ? "عدد الأسرّة" : "عدد الأفراد")} value={f.count} onChange={(e) => setF({ ...f, count: digits(e.target.value) })} />
            </div>
            <input className={inputCls} placeholder={t("الاسم")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} required />
            <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} required />
            <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : t("سجّلني")}</button>
          </form>
        )}
      </div>
    </PageShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BedDouble, Building, Factory, GraduationCap, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { cleanPhone } from "@/lib/phone";
import { getAttribution } from "@/lib/attribution";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { PageShell, inputCls, btnPrimary } from "@/components/site/ui";

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
  const [f, setF] = useState({ who: "worker" as (typeof WHO)[number]["id"], near: "", budget: "", count: "", name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const digits = (v: string) => v.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const who = WHO.find((w) => w.id === f.who)!.label;
    const { error } = await supabase.from("leads").insert({
      name: f.name.trim().slice(0, 100), phone, kind: f.who === "owner" ? "listing" : "request", purpose: "rent",
      area: f.near.trim().slice(0, 80) || null, budget: f.budget ? Number(f.budget) : null,
      details: `سكن مشترك (قريبًا) — ${who}${f.count ? ` — العدد: ${f.count}` : ""}${f.near.trim() ? ` — قريب من: ${f.near.trim()}` : ""}`.slice(0, 1000),
      original_source: "website", utm: getAttribution(),
    });
    setBusy(false);
    if (error) { toast.error(t("الطلب ماتبعتش، جرّب تاني")); return; }
    setDone(true);
  }

  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14">
          <span className="inline-block rounded-full bg-teal px-3 py-1 text-xs font-extrabold text-accent-foreground">{t("قريبًا")}</span>
          <h1 className="mt-3 text-2xl font-extrabold text-primary-foreground md:text-4xl">{t("سكن مشترك للعمال والطلبة")}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("سرير أو أوضة قريبة من شغلك أو جامعتك في برج العرب، بسعر مناسب ومع ناس مناسبين. بنجهّز الخدمة دلوقتي — سجّل اهتمامك ونبلّغك أول ما تفتح.")}</p>
        </div>
      </section>
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
          <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-card p-5">
            <p className="font-extrabold text-primary">{t("سجّل اهتمامك")}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {WHO.map((w) => (
                <button key={w.id} type="button" aria-pressed={f.who === w.id} onClick={() => setF({ ...f, who: w.id })}
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold ${f.who === w.id ? "border-teal bg-teal/10 text-primary" : "text-muted-foreground"}`}><w.icon className="size-4 shrink-0" />{t(w.label)}</button>
              ))}
            </div>
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

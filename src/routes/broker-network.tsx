import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Handshake, Percent, ShieldCheck, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { cleanPhone } from "@/lib/phone";
import { getAttribution } from "@/lib/attribution";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { PageShell, inputCls, btnPrimary } from "@/components/site/ui";

export const Route = createFileRoute("/broker-network")({
  head: () => pageHead({
    path: "/broker-network",
    title: "سوق الوسطاء: بيع واشتري من وحدات الوسطاء التانيين — قريبًا | فاليو عقار",
    description: "عندك مشتري ومعندكش الوحدة؟ شوف وحدات الوسطاء التانيين في برج العرب، واقفل الصفقة بعمولة متقسمة بضمان فاليو عقار. سجّل اهتمامك.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "سوق الوسطاء", path: "/broker-network" }])],
  }),
  component: BrokerNetwork,
});

const POINTS = [
  { icon: Store, title: "وحدات أكتر لعملائك", text: "شوف الوحدات اللي الوسطاء التانيين عارضينها في برج العرب، وبيانات صاحبها محمية." },
  { icon: Percent, title: "إنت بتحدد القسمة", text: "كل وسيط بيحدد نسبة العمولة اللي هيقسمها على وحدته، وبتبان للكل قبل أي طلب." },
  { icon: Handshake, title: "مشتريك محفوظ باسمك", text: "لما صاحب الوحدة يوافق، المشتري بيتسجل باسمك بالتاريخ والساعة، ومحدش يقدر ياخده." },
  { icon: ShieldCheck, title: "العمولة بتتقسم لوحدها", text: "الصفقة بوسيطين، والعمولة بتتحسب وتتقسم أوتوماتيك بعد اعتماد الإدارة، وكل خطوة متسجلة." },
] as const;

/** Broker-to-broker market (co-brokerage): "coming soon" page collecting brokers' interest as leads. */
function BrokerNetwork() {
  useLang();
  const [f, setF] = useState({ side: "both" as "sell" | "buy" | "both", company: "", name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const SIDES = { sell: "عندي وحدات أعرضها للوسطاء", buy: "بدوّر على وحدات لعملائي", both: "الاتنين" } as const;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({
      name: f.name.trim().slice(0, 100), phone, kind: "request",
      details: `سوق الوسطاء (قريبًا) — ${SIDES[f.side]}${f.company.trim() ? ` — ${f.company.trim()}` : ""}`.slice(0, 1000),
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
          <h1 className="mt-3 text-2xl font-extrabold text-primary-foreground md:text-4xl">{t("سوق الوسطاء")}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("عندك مشتري ومعندكش الوحدة؟ أو عندك وحدة ومحتاج مشتري؟ اشتغل مع باقي وسطاء برج العرب على فاليو عقار، والعمولة بتتقسم بضمان المنصة.")}</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-2 md:px-6">
        <ul className="space-y-3">
          {POINTS.map((p) => (
            <li key={p.title} className="flex items-start gap-3 rounded-2xl border bg-card p-4">
              <p.icon className="mt-0.5 size-5 shrink-0 text-teal" />
              <div><p className="font-bold text-primary">{t(p.title)}</p><p className="mt-0.5 text-sm text-muted-foreground">{t(p.text)}</p></div>
            </li>
          ))}
        </ul>
        {done ? (
          <div className="rounded-2xl border bg-card p-6 text-center"><p className="text-lg font-bold text-primary">{t("اتسجّلت ✓")}</p><p className="mt-2 text-sm text-muted-foreground">{t("هنكلّمك أول ما الخدمة تفتح.")}</p></div>
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-card p-5">
            <p className="font-extrabold text-primary">{t("سجّل اهتمامك")}</p>
            <div className="grid gap-1.5">
              {(Object.keys(SIDES) as (keyof typeof SIDES)[]).map((k) => (
                <button key={k} type="button" aria-pressed={f.side === k} onClick={() => setF({ ...f, side: k })}
                  className={`h-10 rounded-xl border px-3 text-start text-sm font-bold ${f.side === k ? "border-teal bg-teal/10 text-primary" : "text-muted-foreground"}`}>{t(SIDES[k])}</button>
              ))}
            </div>
            <input className={inputCls} placeholder={t("اسم المكتب أو الشركة (اختياري)")} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} maxLength={100} />
            <input className={inputCls} placeholder={t("الاسم")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} required />
            <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} required />
            <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : t("سجّلني")}</button>
          </form>
        )}
      </div>
    </PageShell>
  );
}

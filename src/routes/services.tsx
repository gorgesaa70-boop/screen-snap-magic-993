import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Camera, HardHat, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { cleanPhone } from "@/lib/phone";
import { getAttribution } from "@/lib/attribution";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { PageShell, inputCls, btnPrimary } from "@/components/site/ui";

export const Route = createFileRoute("/services")({
  head: () => pageHead({
    path: "/services",
    title: "مكاتب هندسية ومقاولين وصنايعية وشركات تصوير وميديا في برج العرب — قريبًا | فاليو عقار",
    description: "دليل مكاتب هندسية معتمدة من فاليو عقار، وشركات مقاولات وتشطيبات، وصنايعية بتقييمات السكان، وشركات تصوير عقاري وميديا في برج العرب. سجّل اهتمامك كعميل أو كمقدم خدمة.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "الخدمات", path: "/services" }])],
  }),
  component: Services,
});

const GROUPS = [
  { id: "engineering", label: "مكاتب هندسية معتمدة من فاليو عقار", hint: "تصميم، رخص، إشراف، معاينة قبل الشراء", icon: BadgeCheck },
  { id: "contracting", label: "شركات مقاولات وتشطيبات", hint: "بناء، تشطيب كامل أو نص تشطيب، ترميم", icon: HardHat },
  { id: "crafts", label: "صنايعية", hint: "سباك، كهربائي، نجار، نقاش، ألوميتال، تكييف", icon: Wrench },
  { id: "media", label: "شركات التصوير والميديا", hint: "تصوير عقاري احترافي، فيديو ودرون، جولات 360°، إعلانات وسوشيال ميديا", icon: Camera },
] as const;

/** Services directory (engineering offices, contractors, craftsmen, photography & media): "coming soon" page collecting interest as leads. */
function Services() {
  useLang();
  const [f, setF] = useState({ role: "customer" as "customer" | "provider", group: "crafts" as (typeof GROUPS)[number]["id"], what: "", name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const group = GROUPS.find((g) => g.id === f.group)!.label;
    const { error } = await supabase.from("leads").insert({
      name: f.name.trim().slice(0, 100), phone, kind: "request",
      details: `دليل الخدمات (قريبًا) — ${f.role === "provider" ? "مقدم خدمة" : "طالب خدمة"} — ${group}${f.what.trim() ? ` — ${f.what.trim()}` : ""}`.slice(0, 1000),
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
          <h1 className="mt-3 text-2xl font-extrabold text-primary-foreground md:text-4xl">{t("مكاتب هندسية ومقاولين وصنايعية وتصوير وميديا")}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("كل اللي محتاجه لبيتك أو وحدتك أو مشروعك في برج العرب في مكان واحد: مكاتب هندسية معتمدة من فاليو عقار، ومقاولين، وصنايعية بتقييمات السكان، وشركات تصوير وميديا تعرض عقارك بأحسن شكل. بنجهّز الخدمة دلوقتي — سجّل اهتمامك.")}</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-2 md:px-6">
        <ul className="space-y-3">
          {GROUPS.map((g) => (
            <li key={g.id} className="flex items-start gap-3 rounded-2xl border bg-card p-4">
              <g.icon className="mt-0.5 size-5 shrink-0 text-teal" />
              <div><p className="font-bold text-primary">{t(g.label)}</p><p className="mt-0.5 text-sm text-muted-foreground">{t(g.hint)}</p></div>
            </li>
          ))}
        </ul>
        {done ? (
          <div className="rounded-2xl border bg-card p-6 text-center"><p className="text-lg font-bold text-primary">{t("اتسجّلت ✓")}</p><p className="mt-2 text-sm text-muted-foreground">{t("هنكلّمك أول ما الخدمة تفتح.")}</p></div>
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-card p-5">
            <p className="font-extrabold text-primary">{t("سجّل اهتمامك")}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {([["customer", "محتاج خدمة"], ["provider", "أنا مقدم خدمة"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={f.role === k} onClick={() => setF({ ...f, role: k })}
                  className={`h-10 rounded-xl border text-sm font-bold ${f.role === k ? "border-teal bg-teal/10 text-primary" : "text-muted-foreground"}`}>{t(l)}</button>
              ))}
            </div>
            <select aria-label={t("نوع الخدمة")} className={inputCls} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value as typeof f.group })}>
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{t(g.label)}</option>)}
            </select>
            <input className={inputCls} placeholder={t(f.role === "provider" ? "تخصصك (مثال: سباكة، تشطيبات...)" : "محتاج إيه بالظبط؟")} value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} maxLength={120} />
            <input className={inputCls} placeholder={t("الاسم")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} required />
            <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} required />
            <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : t("سجّلني")}</button>
          </form>
        )}
      </div>
    </PageShell>
  );
}

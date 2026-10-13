import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Camera, HardHat, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { cleanPhone } from "@/lib/phone";
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
  const [f, setF] = useState({ role: "customer" as "customer" | "provider", kind: "technician" as "technician" | "company", group: "crafts" as (typeof GROUPS)[number]["id"], what: "", name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "customer" | "provider">("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    // Services are their own section (not real-estate leads): customers ask for a service, providers register for review.
    const name = f.name.trim().slice(0, 100), what = f.what.trim().slice(0, 120) || null;
    let { error } = f.role === "provider"
      ? await supabase.from("service_providers").insert({ kind: f.kind, category: f.group, name, phone, specialty: what })
      : await supabase.from("service_requests").insert({ category: f.group, name, phone, details: what });
    // Until the services tables exist on the database (release 19), keep the request as a lead in the old format —
    // nothing is lost, and release 19 copies these into the services section by themselves.
    if (error && (error.code === "PGRST205" || error.code === "42P01")) {
      const group = GROUPS.find((g) => g.id === f.group)!.label;
      ({ error } = await supabase.from("leads").insert({
        name, phone, kind: "request", original_source: "website",
        details: `دليل الخدمات (قريبًا) — ${f.role === "provider" ? "مقدم خدمة" : "طالب خدمة"} — ${group}${what ? ` — ${what}` : ""}`.slice(0, 1000),
      }));
    }
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? t("الرقم ده مسجّل كمقدم خدمة قبل كده — سجّل دخول برقمك عشان تتابع حسابك.") : t("الطلب ماتبعتش، جرّب تاني")); return; }
    setDone(f.role);
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
            <li key={g.id}>
              {/* Picking a service here selects it in the form and brings the form into view (phones show it below). */}
              <button type="button" aria-pressed={f.group === g.id} onClick={() => { setF((x) => ({ ...x, group: g.id })); document.getElementById("services-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-start transition hover:border-teal ${f.group === g.id ? "border-teal bg-teal-soft" : "bg-card"}`}>
                <g.icon className="mt-0.5 size-5 shrink-0 text-teal" />
                <div><p className="font-bold text-primary">{t(g.label)}</p><p className="mt-0.5 text-sm text-muted-foreground">{t(g.hint)}</p></div>
              </button>
            </li>
          ))}
        </ul>
        {done ? (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <p className="text-lg font-bold text-primary">{t("اتسجّلت ✓")}</p>
            {done === "provider" ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">{t("طلب انضمامك كمقدم خدمة وصل لفاليو عقار للمراجعة. سجّل دخول بنفس رقم الموبايل عشان تتابع حسابك وباقتك والطلبات اللي هتتحول ليك.")}</p>
                <a href="/auth" className={`${btnPrimary} mt-4`}>{t("تسجيل الدخول")}</a>
              </>
            ) : <p className="mt-2 text-sm text-muted-foreground">{t("طلبك وصل لفاليو عقار، وهنكلّمك ونوصّلك بمقدم خدمة مناسب.")}</p>}
          </div>
        ) : (
          <form id="services-form" onSubmit={submit} className="h-fit space-y-3 rounded-2xl border bg-card p-5">
            <p className="font-extrabold text-primary">{t("سجّل اهتمامك")}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {([["customer", "محتاج خدمة"], ["provider", "أنا مقدم خدمة"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={f.role === k} onClick={() => setF({ ...f, role: k })}
                  className={`h-10 rounded-xl border text-sm font-bold ${f.role === k ? "border-teal bg-teal/10 text-primary" : "text-muted-foreground"}`}>{t(l)}</button>
              ))}
            </div>
            {f.role === "provider" && (
              <div className="grid grid-cols-2 gap-1.5">
                {([["technician", "فني"], ["company", "شركة"]] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })}
                    className={`h-9 rounded-xl border text-xs font-bold ${f.kind === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t(l)}</button>
                ))}
              </div>
            )}
            <select aria-label={t("نوع الخدمة")} className={inputCls} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value as typeof f.group })}>
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{t(g.label)}</option>)}
            </select>
            <input className={inputCls} placeholder={t(f.role === "provider" ? "تخصصك (مثال: سباكة، تشطيبات...)" : "محتاج إيه بالظبط؟")} value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} maxLength={120} />
            <input className={inputCls} placeholder={t(f.role === "provider" && f.kind === "company" ? "اسم الشركة" : "الاسم")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} required />
            <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} required />
            <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : t("سجّلني")}</button>
          </form>
        )}
      </div>
    </PageShell>
  );
}

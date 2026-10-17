import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "@/components/dash/DashShell";
import { useMe } from "@/hooks/useAuth";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { CITY_NAMES, useLocations } from "@/components/site/data";
import { OPP_KINDS } from "@/lib/investments";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

export const Route = createFileRoute("/_authenticated/investor")({
  head: () => ({ meta: [{ title: "سجّل كمستثمر | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: InvestorPage,
});

/** Investor profile: budget and interests; a matching new opportunity triggers a notification (bell + WhatsApp if enabled). */
function InvestorPage() {
  useLocations();
  const { me, user } = useMe();
  const q = useQuery({ queryKey: ["investor-profile", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("investor_profiles").select("*").maybeSingle()).data });
  const [f, setF] = useState({ name: "", budget_min: "", budget_max: "", kinds: [] as string[], areas: [] as string[], notify: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setF({ name: q.data.name, budget_min: q.data.budget_min?.toString() ?? "", budget_max: q.data.budget_max?.toString() ?? "", kinds: q.data.kinds, areas: q.data.areas, notify: q.data.notify });
  }, [q.data]);
  const toggle = (k: "kinds" | "areas", v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const num = (v: string) => (v === "" ? null : Number(v));

  async function save() {
    if (f.name.trim().length < 2) { toast.error("اكتب اسمك أو اسم شركتك"); return; }
    setBusy(true);
    const { error } = await supabase.from("investor_profiles").upsert({
      user_id: user!.id, name: f.name.trim(), budget_min: num(f.budget_min), budget_max: num(f.budget_max), kinds: f.kinds, areas: f.areas, notify: f.notify, updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("اتسجلت كمستثمر ✓ هنبعتلك أول ما تنزل فرصة تناسبك");
    q.refetch();
  }
  const chip = (on: boolean) => `h-10 rounded-full border px-4 text-sm font-bold transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`;
  return (
    <DashShell title="سجّل كمستثمر" isAdmin={!!me?.isAdmin}>
      <div className="max-w-2xl space-y-4 rounded-2xl border bg-card p-4 md:p-6">
        <p className="text-sm text-muted-foreground">قولنا بتدوّر على إيه، وأول ما فاليو عقار تنشر فرصة تناسبك هيجيلك إشعار. بياناتك مش بتظهر لحد.</p>
        <Field label="الاسم أو اسم الشركة"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الميزانية من (ج.م)"><input className={inputCls} inputMode="numeric" value={f.budget_min} onChange={(e) => setF({ ...f, budget_min: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") })} /></Field>
          <Field label="لحد (ج.م)"><input className={inputCls} inputMode="numeric" value={f.budget_max} onChange={(e) => setF({ ...f, budget_max: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") })} /></Field>
        </div>
        <div><p className="mb-2 text-sm font-bold text-primary">مهتم بـ (فاضي = الكل)</p><div className="flex flex-wrap gap-2">{Object.entries(OPP_KINDS).map(([k, v]) => <button key={k} type="button" onClick={() => toggle("kinds", k)} className={chip(f.kinds.includes(k))}>{v}</button>)}</div></div>
        <div><p className="mb-2 text-sm font-bold text-primary">المناطق (فاضي = الكل)</p><div className="flex flex-wrap gap-2">{CITY_NAMES.map((c) => <button key={c} type="button" onClick={() => toggle("areas", c)} className={chip(f.areas.includes(c))}>{c}</button>)}</div></div>
        <label className="flex items-center gap-2 text-sm font-bold text-primary"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} className="size-4" />ابعتلي إشعار بالفرص الجديدة</label>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy} onClick={save} className={btnPrimary}>{q.data ? "حفظ" : "تسجيل"}</button>
          <Link to="/investments" className="text-sm font-bold text-primary hover:text-teal">تصفّح الفرص الحالية</Link>
        </div>
      </div>
    </DashShell>
  );
}

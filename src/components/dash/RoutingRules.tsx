import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AREAS, CITY_NAMES, LEAD_KINDS, LEAD_SOURCES, TYPES } from "@/components/site/data";
import { UNIT_TYPES } from "@/components/site/projects";
import { Field, inputCls, btnOutline, btnPrimary } from "@/components/site/ui";

type Rule = Tables<"routing_rules">;
type Draft = { id?: string; name: string; areas: string[]; property_types: string[]; kinds: string[]; sources: string[]; broker_ids: string[] };
const EMPTY: Draft = { name: "", areas: [], property_types: [], kinds: [], sources: [], broker_ids: [] };
const AREA_OPTIONS = [...new Set([...AREAS, ...CITY_NAMES])];
const TYPE_OPTIONS = [...new Set([...TYPES, ...UNIT_TYPES])];

/** Chip multi-select; empty = "any". */
function Chips({ label, options, value, onChange, anyLabel }: { label: string; options: [string, string][]; value: string[]; onChange: (v: string[]) => void; anyLabel: string }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-primary">{label} <span className="text-xs font-semibold text-muted-foreground">({value.length ? `${value.length} مختار` : anyLabel})</span></p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([k, l]) => { const on = value.includes(k); return (
          <button key={k} type="button" onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{l}</button>
        ); })}
      </div>
    </div>
  );
}

/** Admin: rules that send new leads to a company automatically (one company or rotation), plus response-time settings. */
export function RoutingRules() {
  const q = useQuery({
    queryKey: ["routing-rules"],
    queryFn: async () => {
      const [r, b, s] = await Promise.all([
        supabase.from("routing_rules").select("*").order("priority").order("created_at"),
        supabase.rpc("admin_brokers"),
        supabase.from("app_settings").select("response_sla_minutes, work_start_hour, work_end_hour").eq("id", 1).maybeSingle(),
      ]);
      if (r.error) throw r.error;
      return { rules: r.data ?? [], brokers: (b.data ?? []).filter((x) => x.is_active && !x.suspended_at && x.account_type !== "owner"), settings: s.data };
    },
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const rules = q.data?.rules ?? [];
  const name = useMemo(() => new Map((q.data?.brokers ?? []).map((b) => [b.id, b.name])), [q.data]);

  async function save() {
    if (!draft) return;
    if (draft.name.trim().length < 2) { toast.error("اكتب اسم للقاعدة"); return; }
    if (!draft.broker_ids.length) { toast.error("اختار شركة واحدة على الأقل"); return; }
    const row = {
      name: draft.name.trim().slice(0, 100), broker_ids: draft.broker_ids,
      areas: draft.areas.length ? draft.areas : null, property_types: draft.property_types.length ? draft.property_types : null,
      kinds: draft.kinds.length ? draft.kinds : null, sources: draft.sources.length ? draft.sources : null,
    };
    setBusy(true);
    const res = draft.id
      ? await supabase.from("routing_rules").update({ ...row, updated_at: new Date().toISOString() }).eq("id", draft.id)
      : await supabase.from("routing_rules").insert({ ...row, priority: (rules.at(-1)?.priority ?? 0) + 10 });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("اتحفظت القاعدة"); setDraft(null); q.refetch();
  }
  async function move(i: number, dir: -1 | 1) {
    const a = rules[i]; const b = rules[i + dir]; if (!a || !b) return;
    const [pa, pb] = a.priority === b.priority ? [b.priority + dir, a.priority] : [b.priority, a.priority];
    const r1 = await supabase.from("routing_rules").update({ priority: pa }).eq("id", a.id);
    const r2 = await supabase.from("routing_rules").update({ priority: pb }).eq("id", b.id);
    if (r1.error || r2.error) toast.error((r1.error ?? r2.error)!.message); else q.refetch();
  }
  async function patch(r: Rule, p: Partial<Rule>, msg: string) {
    const { error } = await supabase.from("routing_rules").update(p).eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success(msg); q.refetch(); }
  }
  const summary = (r: Rule) => [
    r.areas?.length ? `المنطقة: ${r.areas.join("، ")}` : null,
    r.property_types?.length ? `النوع: ${r.property_types.join("، ")}` : null,
    r.kinds?.length ? `الطلب: ${r.kinds.map((k) => LEAD_KINDS[k] ?? k).join("، ")}` : null,
    r.sources?.length ? `المصدر: ${r.sources.map((k) => LEAD_SOURCES[k] ?? k).join("، ")}` : null,
  ].filter(Boolean).join(" · ") || "كل العملاء الجداد";

  if (q.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (q.error) return <p className="rounded-2xl border bg-card p-6 text-sm text-destructive">تعذّر تحميل القواعد.</p>;
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        العميل الجديد اللي مش مسند لحد بيروح لوحده لأول قاعدة تنطبق عليه (من فوق لتحت). لو القاعدة فيها أكتر من شركة، العملاء بيتوزعوا عليهم بالدور (الشركة اللي بقالها أطول وقت من غير عميل تاخد اللي بعده). لو مفيش قاعدة انطبقت، العميل بيفضل عند الإدارة.
        استفسار عن عقار معيّن بيروح لصاحب العقار، واستفسار من صفحة وسيط بيروح للوسيط ده — القواعد مابتغيّرش ده.
      </p>
      <SlaSettings settings={q.data?.settings ?? null} onSaved={() => q.refetch()} />
      {!draft && <button onClick={() => setDraft({ ...EMPTY })} className={btnPrimary}><Plus className="size-4" />قاعدة جديدة</button>}
      {draft && (
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <Field label="اسم القاعدة"><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={100} placeholder="مثال: شقق الحي الأول" /></Field>
          <Chips label="المنطقة" anyLabel="أي منطقة" options={AREA_OPTIONS.map((a) => [a, a])} value={draft.areas} onChange={(v) => setDraft({ ...draft, areas: v })} />
          <Chips label="نوع العقار" anyLabel="أي نوع" options={TYPE_OPTIONS.map((t) => [t, t])} value={draft.property_types} onChange={(v) => setDraft({ ...draft, property_types: v })} />
          <Chips label="نوع الطلب" anyLabel="أي طلب" options={Object.entries(LEAD_KINDS)} value={draft.kinds} onChange={(v) => setDraft({ ...draft, kinds: v })} />
          <Chips label="المصدر" anyLabel="أي مصدر" options={Object.entries(LEAD_SOURCES)} value={draft.sources} onChange={(v) => setDraft({ ...draft, sources: v })} />
          <Chips label="يروح لمين" anyLabel="لازم تختار" options={(q.data?.brokers ?? []).map((b) => [b.id, b.name])} value={draft.broker_ids} onChange={(v) => setDraft({ ...draft, broker_ids: v })} />
          {draft.broker_ids.length > 1 && <p className="text-xs font-semibold text-teal">{draft.broker_ids.length} شركات — العملاء هيتوزعوا عليهم بالدور.</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={save} className={btnPrimary}>حفظ</button>
            <button onClick={() => setDraft(null)} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
          </div>
        </div>
      )}
      {rules.length === 0 ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش قواعد لسه — كل العملاء الجداد بيستنوا الإدارة تسندهم.</p> : (
        <ol className="space-y-2">
          {rules.map((r, i) => (
            <li key={r.id} className={`flex flex-col gap-3 rounded-2xl border bg-card p-4 md:flex-row md:items-center ${r.is_active ? "" : "opacity-60"}`}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-extrabold text-primary">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-primary">{r.name} {!r.is_active && <span className="text-xs text-destructive">(متوقفة)</span>}</p>
                <p className="text-xs text-muted-foreground">{summary(r)}</p>
                <p className="mt-1 text-xs font-semibold text-foreground/80">← {r.broker_ids.map((id) => name.get(id) ?? "حساب موقوف").join(r.broker_ids.length > 1 ? " / " : "")}{r.broker_ids.length > 1 ? " (بالدور)" : ""}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button aria-label="لفوق" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-lg border text-primary disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button aria-label="لتحت" disabled={i === rules.length - 1} onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-lg border text-primary disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button onClick={() => patch(r, { is_active: !r.is_active }, r.is_active ? "القاعدة اتوقفت" : "القاعدة اشتغلت")} className={btnOutline}>{r.is_active ? "إيقاف" : "تشغيل"}</button>
                <button aria-label="تعديل" onClick={() => setDraft({ id: r.id, name: r.name, areas: r.areas ?? [], property_types: r.property_types ?? [], kinds: r.kinds ?? [], sources: r.sources ?? [], broker_ids: r.broker_ids })} className="grid size-9 place-items-center rounded-lg border text-primary"><Pencil className="size-4" /></button>
                <button aria-label="حذف" onClick={async () => { if (!confirm(`حذف القاعدة «${r.name}»؟`)) return; const { error } = await supabase.from("routing_rules").delete().eq("id", r.id); if (error) toast.error(error.message); else q.refetch(); }} className="grid size-9 place-items-center rounded-lg border text-destructive"><Trash2 className="size-4" /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SlaSettings({ settings, onSaved }: { settings: { response_sla_minutes: number; work_start_hour: number; work_end_hour: number } | null; onSaved: () => void }) {
  const [f, setF] = useState({ sla: "60", start: "9", end: "21" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings) setF({ sla: String(settings.response_sla_minutes), start: String(settings.work_start_hour), end: String(settings.work_end_hour) }); }, [settings]);
  async function save() {
    const sla = Number(f.sla), start = Number(f.start), end = Number(f.end);
    if (!(sla >= 5 && sla <= 1440)) { toast.error("مدة الرد من 5 دقايق لـ 24 ساعة"); return; }
    if (!(start >= 0 && end <= 24 && end > start)) { toast.error("ساعات العمل مش مظبوطة"); return; }
    setBusy(true);
    const { error } = await supabase.from("app_settings").update({ response_sla_minutes: sla, work_start_hour: start, work_end_hour: end }).eq("id", 1);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("اتحفظت إعدادات وقت الرد"); onSaved(); }
  }
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="font-bold text-primary">وقت الرد على العميل</p>
      <p className="mt-1 text-xs text-muted-foreground">لو العميل ما اتردّش عليه (مكالمة، واتساب، ملاحظة، أو تغيير مرحلة) في المدة دي من ساعات العمل، الشركة بيجيلها تنبيه. ولو عدّى ضعف المدة، الإدارة وموظفي فاليو عقار بيجيلهم تنبيه عشان يعيدوا الإسناد.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="المدة (دقيقة)"><input className={`${inputCls} w-28`} inputMode="numeric" value={f.sla} onChange={(e) => setF({ ...f, sla: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="ساعات العمل من"><input className={`${inputCls} w-20`} inputMode="numeric" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="لحد"><input className={`${inputCls} w-20`} inputMode="numeric" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value.replace(/\D/g, "") })} /></Field>
        <button disabled={busy} onClick={save} className={btnOutline}>حفظ</button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">بتوقيت القاهرة، كل يوم. مثال: 9 لـ 21 يعني من 9 الصبح لـ 9 بالليل.</p>
    </div>
  );
}

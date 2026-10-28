import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { PLAN_AUDIENCES, PLAN_MONTHS_LABEL, formatDate, formatPrice, type BrokerRow, type PlanRow } from "@/components/site/data";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { cleanPhone } from "@/lib/phone";
import { AdminListingStats } from "@/components/dash/ListingStats";

const num = (x: string) => x.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "");
/** Which plans an account can hold (same rule as the database's account_audience). */
export const audienceOf = (accountType: string) =>
  accountType === "individual" ? "individual" : accountType === "developer" ? "developer" : accountType === "owner" ? "owner" : "company";
const AUD_LABEL: Record<string, string> = Object.fromEntries(PLAN_AUDIENCES.map((a) => [a.id, a.label]));

/** «الباقات» in the admin: requests to activate, the free month and term discounts, every plan's limits/perks, owners by phone. */
export function PlansAdmin({ plans, reload, canEdit = true }: { plans: PlanRow[]; reload: () => void; canEdit?: boolean }) {
  const [showOld, setShowOld] = useState(false);
  return (
    <div className="space-y-5">
      <PlanRequests plans={plans} canEdit={canEdit} />
      <PlanTasksAdmin canEdit={canEdit} />
      <AdminListingStats />
      <PlanSettings canEdit={canEdit} />
      {PLAN_AUDIENCES.map((a) => (
        <div key={a.id} className="space-y-2">
          <p className="font-extrabold text-primary">باقات {a.label}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {plans.filter((p) => p.audience === a.id).map((p) => <PlanCard key={p.id} p={p} reload={reload} canEdit={canEdit} />)}
          </div>
        </div>
      ))}
      <OwnerGrants plans={plans.filter((p) => p.audience.startsWith("owner") && p.is_active)} canEdit={canEdit} />
      <button className="text-xs font-bold text-muted-foreground underline" onClick={() => setShowOld(!showOld)}>{showOld ? "إخفاء" : "عرض"} الباقات القديمة (مش معروضة على العملاء)</button>
      {showOld && (
        <div className="grid gap-3 opacity-70 md:grid-cols-3">
          {plans.filter((p) => p.audience === "broker" || !p.is_active).map((p) => <PlanCard key={p.id} p={p} reload={reload} canEdit={canEdit} />)}
        </div>
      )}
    </div>
  );
}

/** Requests from accounts and owners: activate (starts the term, tells them) or decline. */
function PlanRequests({ plans, canEdit }: { plans: PlanRow[]; canEdit: boolean }) {
  const q = useQuery({
    queryKey: ["admin-plan-requests"],
    queryFn: async () => (await supabase.from("plan_requests").select("*, broker:brokers(name, account_type)").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const [busy, setBusy] = useState<string | null>(null);
  const open = (q.data ?? []).filter((r) => r.status === "new");
  const done = (q.data ?? []).filter((r) => r.status !== "new").slice(0, 15);
  const handle = async (id: string, activate: boolean) => {
    let note: string | null = null;
    if (!activate) { note = prompt("سبب الرفض (هيوصل لصاحب الطلب):"); if (note === null) return; }
    setBusy(id);
    const { error } = await supabase.rpc("admin_handle_plan_request", { _id: id, _activate: activate, ...(note?.trim() ? { _note: note.trim() } : {}) });
    setBusy(null);
    if (error) toast.error(error.message); else { toast.success(activate ? "الباقة اتفعّلت وصاحبها وصله إشعار" : "الطلب اترفض"); q.refetch(); }
  };
  const who = (r: (typeof open)[number]) => r.broker ? `${r.broker.name}` : `مالك — ${r.phone}`;
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="font-bold text-primary">طلبات الباقات {open.length > 0 && <span className="ms-1 rounded-full bg-destructive px-2 py-0.5 text-xs text-white">{open.length}</span>}</p>
      {open.length === 0 && <p className="text-sm text-muted-foreground">مفيش طلبات مستنية. لما حد يطلب باقة من «باقتي» هتظهر هنا ويوصلك إشعار.</p>}
      <ul className="divide-y">
        {open.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span><b className="text-primary">{who(r)}</b> · {plans.find((p) => p.id === r.plan_id)?.name ?? "باقة"} · {PLAN_MONTHS_LABEL[r.months] ?? `${r.months} شهور`} · <b>{formatPrice(Number(r.amount))} ج.م</b> · {formatDate(r.created_at)}</span>
            {canEdit && (
              <span className="flex gap-2">
                <button className={btnPrimary} disabled={busy === r.id} onClick={() => handle(r.id, true)}><Check className="size-4" />اتدفع — فعّل</button>
                <button className={btnOutline} disabled={busy === r.id} onClick={() => handle(r.id, false)}><X className="size-4" />رفض</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-bold">آخر الطلبات اللي اتعامل معاها</summary>
          <ul className="mt-2 space-y-1">{done.map((r) => <li key={r.id}>{who(r)} · {plans.find((p) => p.id === r.plan_id)?.name} · {PLAN_MONTHS_LABEL[r.months]} · {r.status === "activated" ? "اتفعّلت" : r.status === "rejected" ? "اترفضت" : "اتلغت"}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/** The free month length, term discounts, grace days and featured prices. */
function PlanSettings({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({ queryKey: ["plan-settings-admin"], queryFn: async () => (await supabase.from("app_settings").select("plan_trial_days, plan_discount_3m, plan_discount_6m, plan_discount_12m, subscription_grace_days, featured_week_price, featured_month_price, plan_home_pins, plan_top_tier_cap, plan_addon_photos, plan_addon_video, plan_addon_photos_video, plan_addon_pin, plan_addon_whatsapp").eq("id", 1).maybeSingle()).data });
  const [f, setF] = useState<Record<string, string> | null>(null);
  const d = q.data;
  const v = f ?? (d ? Object.fromEntries(Object.entries(d).map(([k, x]) => [k, x == null ? "" : String(x)])) : null);
  if (!v) return null;
  const field = (k: string, label: string, max = 4) => <Field label={label}><input className={inputCls} inputMode="numeric" disabled={!canEdit} value={v[k]} onChange={(e) => setF({ ...v, [k]: num(e.target.value).slice(0, max) })} /></Field>;
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="font-bold text-primary">الشهر المجاني وخصم المدد</p>
      <div className="grid gap-3 sm:grid-cols-4">
        {field("plan_trial_days", "أيام التجربة المجانية", 2)}
        {field("plan_discount_3m", "خصم 3 شهور %", 2)}
        {field("plan_discount_6m", "خصم 6 شهور %", 2)}
        {field("plan_discount_12m", "خصم السنة %", 2)}
        {field("subscription_grace_days", "أيام السماح بعد انتهاء الباقة", 2)}
        {field("featured_week_price", "تمييز إضافي أسبوع (ج.م)")}
        {field("featured_month_price", "تمييز إضافي شهر (ج.م)")}
        {field("plan_home_pins", "أماكن التثبيت في الرئيسية", 2)}
        {field("plan_top_tier_cap", "أقصى عدد في الباقة الأعلى (فاضي = مفتوح)", 3)}
        {field("plan_addon_photos", "تصوير صور (ج.م)")}
        {field("plan_addon_video", "تصوير فيديو (ج.م)")}
        {field("plan_addon_photos_video", "صور + فيديو (ج.م)")}
        {field("plan_addon_pin", "تثبيت إضافي 7 أيام (ج.م)")}
        {field("plan_addon_whatsapp", "حملة واتساب إضافية (ج.م)")}
      </div>
      <p className="text-xs text-muted-foreground">التجربة المجانية بتبدأ لوحدها لكل حساب جديد أول ما يتعتمد، ولكل مالك مع أول إعلان، على الباقة الوسطى. بعد ما الباقة (أو الشهر المجاني) تخلص، الإعلانات بتستخبى عن الزوار، ومش بتتمسح، لحد ما يشترك.</p>
      {canEdit && (
        <button className={btnPrimary} onClick={async () => {
          const n = (k: string, cap: number) => Math.min(Number(v[k] || 0), cap);
          const { error } = await supabase.from("app_settings").update({
            plan_trial_days: n("plan_trial_days", 90), plan_discount_3m: n("plan_discount_3m", 90), plan_discount_6m: n("plan_discount_6m", 90), plan_discount_12m: n("plan_discount_12m", 90),
            subscription_grace_days: n("subscription_grace_days", 30), featured_week_price: Number(v["featured_week_price"] || 0), featured_month_price: Number(v["featured_month_price"] || 0),
            plan_home_pins: Math.max(1, n("plan_home_pins", 30)), plan_top_tier_cap: v["plan_top_tier_cap"] ? Math.max(1, n("plan_top_tier_cap", 1000)) : null,
            plan_addon_photos: Number(v["plan_addon_photos"] || 0), plan_addon_video: Number(v["plan_addon_video"] || 0), plan_addon_photos_video: Number(v["plan_addon_photos_video"] || 0),
            plan_addon_pin: Number(v["plan_addon_pin"] || 0), plan_addon_whatsapp: Number(v["plan_addon_whatsapp"] || 0),
          }).eq("id", 1);
          if (error) toast.error(error.message); else { toast.success("تم الحفظ"); setF(null); q.refetch(); }
        }}>حفظ</button>
      )}
    </div>
  );
}

const PERK_FLAGS = [["verified_badge", "علامة متحقق"], ["whatsapp_broadcast", "رسايل واتساب"], ["excel_import", "رفع Excel"], ["home_banner", "بانر في الرئيسية"], ["is_active", "معروضة على العملاء"]] as const;
const PERK_NUMS = [["featured_slots", "عدد الإعلانات المثبّتة"], ["pin_days", "أيام التثبيت"], ["spotlights_per_month", "«عرض للكل» في الشهر"], ["posts_per_month", "بوستات في الشهر"], ["videos_per_month", "فيديوهات في الشهر"]] as const;

function PlanCard({ p, reload, canEdit }: { p: PlanRow; reload: () => void; canEdit: boolean }) {
  const init = () => ({
    name: p.name, max_properties: String(p.max_properties), monthly_price: String(p.monthly_price), listing_days: p.listing_days != null ? String(p.listing_days) : "",
    max_staff: p.max_staff != null ? String(p.max_staff) : "", max_projects: p.max_projects != null ? String(p.max_projects) : "",
    support_level: p.support_level ?? "normal", stats_level: p.stats_level ?? "basic", features: (p.features ?? []).join("\n"),
    ...Object.fromEntries(PERK_NUMS.map(([k]) => [k, String(p[k] ?? 0)])), ...Object.fromEntries(PERK_FLAGS.map(([k]) => [k, !!p[k]])),
  } as Record<string, string | boolean>);
  const [f, setF] = useState(init);
  const s = (k: string) => String(f[k] ?? "");
  const input = (k: string, label: string, max = 6) => <Field label={label}><input className={inputCls} inputMode="numeric" disabled={!canEdit} value={s(k)} onChange={(e) => setF({ ...f, [k]: num(e.target.value).slice(0, max) })} /></Field>;
  const dev = p.audience === "developer";
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground">{AUD_LABEL[p.audience] ?? "قديمة"}{p.tier ? ` · مستوى ${p.tier}` : ""}</span>
        {!p.is_active && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">مش معروضة</span>}
      </div>
      <Field label="اسم الباقة"><input className={inputCls} disabled={!canEdit} value={s("name")} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        {input("monthly_price", "السعر الشهري (ج.م)")}
        {dev ? input("max_projects", "مشروعات / كمبوندات", 4) : input("max_properties", "عدد الإعلانات")}
        {p.audience === "company" && input("max_staff", "عدد الفريق", 4)}
        {input("listing_days", "مدة كل إعلان (فاضي = طول الباقة)", 3)}
        {PERK_NUMS.map(([k, l]) => <div key={k}>{input(k, l, 2)}</div>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الدعم الفني"><select className={inputCls} disabled={!canEdit} value={s("support_level")} onChange={(e) => setF({ ...f, support_level: e.target.value })}><option value="normal">عادي</option><option value="priority">بأولوية</option><option value="dedicated">مسؤول خاص</option></select></Field>
        <Field label="الإحصائيات"><select className={inputCls} disabled={!canEdit} value={s("stats_level")} onChange={(e) => setF({ ...f, stats_level: e.target.value })}><option value="basic">أساسية</option><option value="full">كاملة</option><option value="report">كاملة + تقرير</option></select></Field>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {PERK_FLAGS.map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" disabled={!canEdit} checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{l}</label>
        ))}
      </div>
      <Field label="مميزات إضافية (كل سطر ميزة)"><textarea className={`${inputCls} h-16 py-2 text-sm`} disabled={!canEdit} value={s("features")} onChange={(e) => setF({ ...f, features: e.target.value })} /></Field>
      {canEdit && (
        <button className={`${btnPrimary} w-full`} onClick={async () => {
          const n = (k: string) => Number(s(k) || 0);
          const monthly = n("monthly_price");
          const { error } = await supabase.from("plans").update({
            name: s("name").trim(), monthly_price: monthly, yearly_price: Math.round(monthly * 12 * 0.7),
            max_properties: dev ? p.max_properties : n("max_properties"), max_projects: s("max_projects") === "" ? null : n("max_projects"), max_staff: s("max_staff") === "" ? null : n("max_staff"),
            listing_days: s("listing_days") === "" ? null : Math.min(365, Math.max(1, n("listing_days"))),
            featured_slots: n("featured_slots"), pin_days: Math.min(31, n("pin_days")), spotlights_per_month: Math.min(31, n("spotlights_per_month")),
            posts_per_month: Math.min(31, n("posts_per_month")), videos_per_month: Math.min(31, n("videos_per_month")),
            support_level: s("support_level"), stats_level: s("stats_level"),
            verified_badge: !!f["verified_badge"], whatsapp_broadcast: !!f["whatsapp_broadcast"], excel_import: !!f["excel_import"], home_banner: !!f["home_banner"], is_active: !!f["is_active"],
            features: s("features").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 15),
          }).eq("id", p.id);
          if (error) toast.error(error.message); else { toast.success("تم الحفظ"); reload(); }
        }}>حفظ</button>
      )}
    </div>
  );
}

/** Owner plans are given by phone number (owners have no company account). */
function OwnerGrants({ plans, canEdit }: { plans: PlanRow[]; canEdit: boolean }) {
  const q = useQuery({ queryKey: ["owner-grants"], queryFn: async () => (await supabase.from("owner_plan_grants").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [] });
  const [f, setF] = useState({ phone: "", plan: "", months: "1" });
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="font-bold text-primary">تفعيل باقة لمالك برقم الموبايل</p>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="موبايل المالك"><input className={`${inputCls} w-44`} dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} /></Field>
          <Field label="الباقة"><select className={`${inputCls} w-auto`} value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option value="">اختار</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="المدة"><select className={`${inputCls} w-auto`} value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })}>{Object.entries(PLAN_MONTHS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <button className={btnPrimary} disabled={!f.plan || !cleanPhone(f.phone)} onClick={async () => {
            const { error } = await supabase.rpc("admin_grant_plan", { _broker: null, _phone: cleanPhone(f.phone)!, _plan: f.plan, _months: Number(f.months) });
            if (error) toast.error(error.message); else { toast.success("الباقة اتفعّلت للرقم ده"); setF({ phone: "", plan: "", months: "1" }); q.refetch(); }
          }}>تفعيل</button>
        </div>
      )}
      {(q.data?.length ?? 0) > 0 && (
        <ul className="divide-y text-sm">
          {q.data!.map((g) => {
            const running = g.status === "active" && new Date(g.ends_at) > new Date();
            return (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span dir="ltr">{g.phone}</span> · {plans.find((p) => p.id === g.plan_id)?.name ?? "باقة"}{g.is_trial ? " (الشهر المجاني)" : ""} · {formatDate(g.starts_at)} ← {formatDate(g.ends_at)}{running ? "" : " · منتهية"}</span>
                {running && canEdit && <button className="text-xs font-bold text-destructive hover:underline" onClick={async () => { if (!confirm("إلغاء الباقة دي؟ إعلانات المالك هتستخبى.")) return; const { error } = await supabase.from("owner_plan_grants").update({ status: "cancelled" }).eq("id", g.id); if (error) toast.error(error.message); else q.refetch(); }}>إلغاء</button>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Next to each account in «الحسابات»: its plan and end, activate a plan for a term, or exempt it (Value Aqar's own). */
export function AccountPlan({ b, plans, reload }: { b: BrokerRow; plans: PlanRow[]; reload: () => void }) {
  const mine = plans.filter((p) => p.is_active && p.audience === audienceOf(b.account_type));
  const [plan, setPlan] = useState("");
  const [months, setMonths] = useState("1");
  const current = plans.find((p) => p.id === b.plan_id);
  const ended = b.access_until && new Date(b.access_until) <= new Date();
  return (
    <div className="space-y-1.5 md:w-64">
      <p className="text-xs text-muted-foreground">
        {b.plan_exempt ? "معفي من الباقات (ظاهر دايمًا)" : <>الباقة: <b className="text-primary">{current?.name ?? "—"}</b>{b.access_until ? (ended ? <b className="text-destructive"> · خلصت {formatDate(b.access_until)}</b> : ` · لحد ${formatDate(b.access_until)}`) : ""}</>}
      </p>
      <div className="flex gap-1.5">
        <select aria-label="الباقة" className={`${inputCls} h-9 flex-1 text-xs`} value={plan} onChange={(e) => setPlan(e.target.value)}><option value="">فعّل باقة…</option>{mine.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select aria-label="المدة" className={`${inputCls} h-9 w-24 text-xs`} value={months} onChange={(e) => setMonths(e.target.value)}>{Object.entries(PLAN_MONTHS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className={`${btnPrimary} h-9 px-3 text-xs`} disabled={!plan} onClick={async () => {
          const { error } = await supabase.rpc("admin_grant_plan", { _broker: b.id, _phone: null, _plan: plan, _months: Number(months) });
          if (error) toast.error(error.message); else { toast.success("الباقة اتفعّلت"); setPlan(""); reload(); }
        }}>تفعيل</button>
      </div>
      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={b.plan_exempt} onChange={async (e) => {
        const { error } = await supabase.from("brokers").update({ plan_exempt: e.target.checked }).eq("id", b.id);
        if (error) toast.error(error.message); else { toast.success(e.target.checked ? "الحساب معفي — إعلاناته ظاهرة من غير باقة" : "الحساب رجع للباقات"); reload(); }
      }} />معفي من الباقات (حسابات فاليو عقار)</label>
    </div>
  );
}

const TASK_LABEL: Record<string, string> = {
  post: "بوست على صفحاتنا", video: "فيديو على صفحاتنا", whatsapp: "رسايل واتساب للعملاء المهتمين", photos: "تصوير صور", video_shoot: "تصوير فيديو",
  photos_video: "تصوير صور + فيديو", extra_pin: "تثبيت إضافي 7 أيام", extra_whatsapp: "حملة واتساب إضافية",
};

/** Requests the team does by hand (plan perks and paid extras), and the «عرض للكل» days booked ahead. */
function PlanTasksAdmin({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({
    queryKey: ["admin-plan-tasks"],
    queryFn: async () => (await supabase.from("plan_tasks").select("*, broker:brokers(name), property:properties(title)").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const spots = useQuery({
    queryKey: ["admin-spotlights"],
    queryFn: async () => (await supabase.from("plan_spotlights").select("day, property:properties(title), broker:brokers(name), phone").gte("day", new Date().toISOString().slice(0, 10)).order("day").limit(60)).data ?? [],
  });
  const [days, setDays] = useState<Record<string, string>>({});
  const open = (q.data ?? []).filter((t) => t.status === "new" || t.status === "scheduled");
  const set = async (id: string, status: string) => {
    const note = status === "cancelled" ? prompt("سبب الإلغاء (هيوصل لصاحب الطلب):") : null;
    if (status === "cancelled" && note === null) return;
    const { error } = await supabase.rpc("admin_update_plan_task", { _id: id, _status: status, ...(days[id] ? { _day: days[id] } : {}), ...(note?.trim() ? { _note: note.trim() } : {}) });
    if (error) toast.error(error.message); else { toast.success("اتحدّث وصاحب الطلب وصله إشعار"); q.refetch(); }
  };
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="font-bold text-primary">طلبات المميزات والخدمات {open.length > 0 && <span className="ms-1 rounded-full bg-destructive px-2 py-0.5 text-xs text-white">{open.length}</span>}</p>
      {open.length === 0 && <p className="text-sm text-muted-foreground">مفيش طلبات مفتوحة (بوستات، فيديوهات، رسايل واتساب، تصوير، تثبيت إضافي).</p>}
      <ul className="divide-y">
        {open.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>#{t.task_no} · <b className="text-primary">{TASK_LABEL[t.kind] ?? t.kind}</b> · {t.broker?.name ?? `مالك — ${t.phone}`} · {t.property?.title ?? ""}{Number(t.price) > 0 ? <b> · {formatPrice(Number(t.price))} ج.م (اتأكد من الدفع)</b> : ""}{t.scheduled_for ? ` · ميعاده ${formatDate(t.scheduled_for)}` : ""}{t.note ? ` — ${t.note}` : ""}</span>
            {canEdit && (
              <span className="flex flex-wrap items-center gap-1.5">
                <input type="date" aria-label="الميعاد" className={`${inputCls} h-9 w-36 text-xs`} value={days[t.id] ?? ""} onChange={(e) => setDays({ ...days, [t.id]: e.target.value })} />
                <button className={`${btnOutline} h-9 px-3 text-xs`} onClick={() => set(t.id, "scheduled")}>حدّد الميعاد</button>
                <button className={`${btnPrimary} h-9 px-3 text-xs`} onClick={() => set(t.id, "done")}><Check className="size-3.5" />اتعمل</button>
                <button className="h-9 px-2 text-xs font-bold text-destructive" onClick={() => set(t.id, "cancelled")}>إلغاء</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">رسايل الواتساب: ابعت للعملاء المهتمين بالمنطقة ونوع العقار بس، ومحدش يوصله أكتر من رسالتين في الأسبوع، عشان رقم فاليو عقار مايتحظرش.</p>
      {(spots.data?.length ?? 0) > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-primary">أيام «عرض للكل» المحجوزة ({spots.data!.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{spots.data!.map((x) => <li key={x.day}>{formatDate(x.day)} · {x.property?.title} · {x.broker?.name ?? `مالك — ${x.phone}`}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

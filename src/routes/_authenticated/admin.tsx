import { createFileRoute, Link } from "@tanstack/react-router";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Star, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";

/** fetchAll result in the { data, error } shape the admin loader already checks. */
const paged = <T,>(load: () => Promise<T[]>) => load().then((data) => ({ data, error: null }), (error: Error) => ({ data: null, error }));
import { dbx } from "@/lib/dbx";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { Stat, Tabs, Field, inputCls, btnPrimary, btnOutline, Avatar } from "@/components/site/ui";
import { STAGES_WITH_DATA, PRICE_UNIT_LABEL, ACCOUNT_LABEL, LEAD_KINDS, REVIEW, STAGES, formatPrice, formatDate, waLink, type BrokerRow, type PlanRow, leadKindLabel } from "@/components/site/data";
import { AreaPicker } from "@/components/site/AreaPicker";
import { MallsAdmin } from "@/components/dash/MallsAdmin";
import { CompoundsAdmin } from "@/components/dash/CompoundsAdmin";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";
import { ProjectsAdmin } from "@/components/dash/ProjectsAdmin";
import { StaffAdmin } from "@/components/dash/StaffAdmin";
import { AppSettingsAdmin } from "@/components/dash/AppSettingsAdmin";
import { LeadAlerts } from "@/components/dash/LeadAlerts";
import { AuditLog } from "@/components/dash/AuditLog";
import { SystemHealth } from "@/components/dash/SystemHealth";
import { InvestmentsAdmin } from "@/components/dash/InvestmentsAdmin";
import { RoutingRules } from "@/components/dash/RoutingRules";
import { Reports as ReportsDashboard } from "@/components/dash/Reports";
import { IndustrialAdmin } from "@/components/dash/IndustrialAdmin";
import { AdminNotifications } from "@/components/dash/AdminNotifications";
import { createBrokerAccount, setBrokerActive } from "@/lib/admin.functions";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "لوحة الإدارة | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type Tab = "reports" | "review_alerts" | "alerts" | "brokers" | "staff" | "review" | "leads" | "plans" | "projects" | "industrial" | "malls" | "compounds" | "app" | "audit" | "health" | "routing" | "investments";

function useAdminData(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-data"], enabled,
    queryFn: async () => {
      const [b, p, l, pl] = await Promise.all([
        supabase.rpc("admin_brokers"),
        paged(() => fetchAll((a, b) => supabase.from("properties").select("*, owner:leads!properties_owner_lead_id_fkey(name, phone, phone_verified)").order("updated_at", { ascending: false }).order("id").range(a, b))),
        paged(() => fetchAll((a, b) => supabase.from("leads").select("*, properties!leads_property_id_fkey(title)").order("created_at", { ascending: false }).order("id").range(a, b))),
        supabase.from("plans").select("*").order("max_properties"),
      ]);
      const err = b.error || p.error || l.error || pl.error;
      if (err) throw err;
      return { brokers: b.data, properties: p.data, leads: l.data, plans: pl.data };
    },
  });
}

function AdminPage() {
  const { me, loading } = useMe();
  const [tab, setTab] = useState<Tab>("reports");
  const q = useAdminData(!!me?.isAdmin);
  if (loading) return <DashShell title="لوحة الإدارة"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;
  if (!me?.isAdmin) return <DashShell title="لوحة الإدارة"><p className="rounded-2xl border bg-card p-6 text-sm">ليست لديك صلاحية الوصول. <Link to="/dashboard" className="font-bold text-primary underline">لوحتي</Link></p></DashShell>;
  const d = q.data;
  const reload = () => q.refetch();
  const pending = d?.properties.filter((p) => p.review_status === "pending").length ?? 0;
  const pendingAccounts = d?.brokers.filter((b) => accountStatus(b) === "pending").length ?? 0;
  return (
    <DashShell title="لوحة الإدارة" isAdmin>
      {/* 16 sections grouped in 5 (UX review): pick a group, then a section inside it. */}
      {(() => {
        const labels: Record<Tab, string> = {
          reports: "التقارير", review_alerts: "تنبيهات المراجعة", alerts: "الإشعارات الإدارية", brokers: `الحسابات والشركات${pendingAccounts ? ` (${pendingAccounts})` : ""}`, staff: "فريق فاليو عقار",
          review: `مراجعة العقارات${pending ? ` (${pending})` : ""}`, leads: "طلبات العملاء", routing: "قواعد التوزيع", plans: "الباقات", projects: "المشروعات", investments: "الفرص الاستثمارية",
          industrial: "الصناعي", malls: "المولات", compounds: "الكمبوندات", app: "التطبيق", audit: "سجل التدقيق", health: "الصيانة والنسخ الاحتياطي",
        };
        const groups: { id: string; label: string; tabs: Tab[] }[] = [
          { id: "reports", label: "التقارير والتنبيهات", tabs: ["reports", "alerts", "audit"] },
          { id: "customers", label: "العملاء", tabs: ["leads", "review_alerts", "routing"] },
          { id: "listings", label: `العقارات${pending ? ` (${pending})` : ""}`, tabs: ["review", "projects", "investments", "malls", "compounds", "industrial"] },
          { id: "accounts", label: `الحسابات${pendingAccounts ? ` (${pendingAccounts})` : ""}`, tabs: ["brokers", "staff", "plans"] },
          { id: "settings", label: "الإعدادات", tabs: ["app", "health"] },
        ];
        const group = groups.find((g) => g.tabs.includes(tab)) ?? groups[0]!;
        return (
          <>
            <Tabs<string> value={group.id} onChange={(id) => setTab(groups.find((g) => g.id === id)!.tabs[0]!)} tabs={groups.map((g) => ({ id: g.id, label: g.label }))} />
            {group.tabs.length > 1 && (
              <div className="-mt-3 mb-5 flex flex-wrap gap-2">
                {group.tabs.map((id) => (
                  <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
                    className={`h-10 rounded-full border px-4 text-sm font-bold transition ${tab === id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{labels[id]}</button>
                ))}
              </div>
            )}
          </>
        );
      })()}
      {!d ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : (
        <>
          {tab === "reports" && <ReportsDashboard scope={{ seeAll: true, isAdmin: true, companyId: null }} />}
          {tab === "alerts" && <AdminNotifications />}
          {tab === "staff" && <StaffAdmin />}
          {tab === "review_alerts" && <LeadAlerts />}
          {tab === "app" && <AppSettingsAdmin />}
          {tab === "investments" && <InvestmentsAdmin isAdmin />}
          {tab === "audit" && <AuditLog />}
          {tab === "health" && <SystemHealth />}
          {tab === "routing" && <RoutingRules />}
          {tab === "brokers" && <BrokersAdmin brokers={d.brokers} plans={d.plans} reload={reload} />}
          {tab === "review" && <ReviewAdmin d={d} reload={reload} />}
          {tab === "leads" && <LeadsAdmin d={d} reload={reload} />}
          {tab === "plans" && <PlansAdmin plans={d.plans} reload={reload} />}
          {tab === "projects" && <ProjectsAdmin brokers={d.brokers} />}
          {tab === "malls" && <MallsAdmin properties={d.properties} brokers={d.brokers} reload={reload} />}
          {tab === "compounds" && <CompoundsAdmin brokers={d.brokers} />}
          {tab === "industrial" && <IndustrialAdmin properties={d.properties} brokers={d.brokers} reload={reload} />}
        </>
      )}
    </DashShell>
  );
}

type D = NonNullable<ReturnType<typeof useAdminData>["data"]>;

const ACCOUNT_STATUS = {
  pending: { label: "بانتظار المراجعة", cls: "bg-teal-soft text-primary" },
  approved: { label: "معتمد", cls: "bg-primary text-primary-foreground" },
  rejected: { label: "مرفوض", cls: "bg-destructive/10 text-destructive" },
  suspended: { label: "موقوف", cls: "bg-destructive text-primary-foreground" },
} as const;
type AccountStatus = keyof typeof ACCOUNT_STATUS;
function accountStatus(b: BrokerRow): AccountStatus {
  if (b.suspended_at) return "suspended";
  if (b.is_active) return "approved";
  return b.rejected_at ? "rejected" : "pending";
}

function BrokersAdmin({ brokers, plans, reload }: { brokers: BrokerRow[]; plans: PlanRow[]; reload: () => void }) {
  const toggle = useServerFn(setBrokerActive);
  const [showNew, setShowNew] = useState(false);
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [type, setType] = useState("");
  const team = useQuery({
    queryKey: ["admin-team-counts"],
    queryFn: async () => ((await dbx.from("company_members").select("company_id, is_active")).data ?? []),
  });
  const list = brokers.filter((b) => (!status || accountStatus(b) === status) && (!type || b.account_type === type));
  const activate = async (b: BrokerRow, active: boolean) => {
    const r = await toggle({ data: { brokerId: b.id, active } });
    if (!r.ok) toast.error(r.error); else { toast.success(active ? "تم اعتماد الحساب" : "تم إيقاف الحساب"); reload(); }
  };
  return (
    <div className="space-y-3">
      <button onClick={() => setShowNew(!showNew)} className={btnPrimary}>{showNew ? "إغلاق" : "إضافة وسيط / إرسال دعوة"}</button>
      {showNew && <NewBroker plans={plans} onDone={() => { setShowNew(false); reload(); }} />}
      <div className="flex flex-wrap gap-2">
        <select aria-label="الحالة" className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value as AccountStatus | "")}>
          <option value="">كل الحالات</option>{Object.entries(ACCOUNT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select aria-label="نوع الحساب" className={`${inputCls} w-auto`} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">كل الأنواع</option>{Object.entries(ACCOUNT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا توجد حسابات.</p>}
      {list.map((b) => {
        const st = accountStatus(b);
        const members = (team.data ?? []).filter((m) => m.company_id === b.id);
        return (
          <div key={b.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Avatar name={b.name} url={b.photo_url} size="size-12" />
              <div className="min-w-0 space-y-1">
                <p className="truncate font-bold text-primary">{b.name} {b.is_demo && <span className="text-xs text-muted-foreground">(تجريبي)</span>}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${ACCOUNT_STATUS[st].cls}`}>{ACCOUNT_STATUS[st].label}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${["developer", "company"].includes(b.account_type) ? "bg-teal text-accent-foreground" : "bg-secondary text-primary"}`}>{ACCOUNT_LABEL[b.account_type] ?? b.account_type}</span>
                  {members.length > 0 && <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary">الفريق: {members.filter((m) => m.is_active).length}</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[b.phone ? `+${b.phone}` : null, b.email, b.contact_person ? `المسؤول: ${b.contact_person}` : null, b.commercial_register ? `س.ت: ${b.commercial_register}` : null, b.address].filter(Boolean).join(" · ") || (b.user_id ? "" : "بدون حساب دخول")}
                </p>
                {st === "rejected" && b.review_note && <p className="text-xs text-destructive">سبب الرفض: {b.review_note}</p>}
                {st === "approved" && (b.whatsapp || b.phone) && !b.is_demo && (
                  <a href={waLink(b.whatsapp || b.phone, welcomeMessage(b.name, b.account_type))} target="_blank" rel="noreferrer" className="inline-block text-xs font-bold text-teal hover:underline">📩 ابعت رسالة الترحيب على واتساب</a>
                )}
              </div>
            </div>
            {st === "approved" && (
              <select aria-label="الباقة" className={`${inputCls} md:w-48`} value={b.plan_id ?? ""} onChange={async (e) => {
                const { error } = await supabase.from("brokers").update({ plan_id: e.target.value || null }).eq("id", b.id);
                if (error) toast.error(error.message); else { toast.success("تم تحديث الباقة"); reload(); }
              }}>
                <option value="">بدون باقة</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <div className="flex flex-wrap gap-2">
              {st === "approved" && (
                <button className={b.show_contact ? btnPrimary : btnOutline} title="رقم التليفون والواتساب والإيميل يظهروا للعملاء (حسب الاتفاقية)" onClick={async () => {
                  const { error } = await supabase.from("brokers").update({ show_contact: !b.show_contact }).eq("id", b.id);
                  if (error) toast.error(error.message); else { toast.success(b.show_contact ? "بيانات التواصل اتخفت عن العملاء" : "بيانات التواصل بقت ظاهرة للعملاء"); reload(); }
                }}>{b.show_contact ? "التواصل ظاهر" : "التواصل مخفي"}</button>
              )}
              {st === "approved" ? (
                <button className={btnOutline} onClick={() => activate(b, false)}>إيقاف</button>
              ) : (
                <button className={btnPrimary} onClick={() => activate(b, true)}><Check className="size-4" />{st === "suspended" ? "إعادة تفعيل" : "اعتماد"}</button>
              )}
              {st === "pending" && (
                <button className={btnOutline} onClick={async () => {
                  const note = prompt("سبب الرفض (هيظهر لصاحب الطلب):"); if (note === null) return;
                  const { error } = await supabase.from("brokers").update({ rejected_at: new Date().toISOString(), review_note: note.trim().slice(0, 500) || null }).eq("id", b.id);
                  if (error) toast.error(error.message); else { toast.success("تم رفض الطلب"); reload(); }
                }}><X className="size-4" />رفض</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NewBroker({ plans, onDone }: { plans: PlanRow[]; onDone: () => void }) {
  const create = useServerFn(createBrokerAccount);
  const [f, setF] = useState({ name: "", email: "", phone: "", specialty: "", password: "", mode: "invite" as "invite" | "password", planId: "", areas: [] as string[] });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await create({ data: { ...f, planId: f.planId || undefined, password: f.mode === "password" ? f.password : undefined, phone: f.phone || undefined, specialty: f.specialty || undefined, redirectTo: `${window.location.origin}/reset-password` } });
      if (!r.ok) toast.error(r.error); else { toast.success(f.mode === "invite" ? "تم إرسال الدعوة للبريد" : "تم إنشاء الحساب"); onDone(); }
    } catch { toast.error("تحقق من البيانات (كلمة المرور 8 أحرف على الأقل)"); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 md:p-6">
      <Field label="اسم الوسيط / المكتب"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Field>
      <Field label="البريد الإلكتروني"><input required type="email" dir="ltr" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="الهاتف"><input dir="ltr" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} /></Field>
      <Field label="التخصص"><input className={inputCls} value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} maxLength={120} /></Field>
      <Field label="الباقة"><select className={inputCls} value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })}><option value="">المجانية (افتراضي)</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="طريقة الإنشاء"><select className={inputCls} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as "invite" | "password" })}><option value="invite">إرسال دعوة بالبريد</option><option value="password">إنشاء بكلمة مرور</option></select></Field>
      {f.mode === "password" && <Field label="كلمة المرور المؤقتة"><input dir="ltr" minLength={8} required className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>}
      <div className="sm:col-span-2"><AreaPicker small value={f.areas} onChange={(areas) => setF({ ...f, areas })} /></div>
      <button disabled={busy} className={`${btnPrimary} sm:col-span-2`}>{busy ? "..." : "حفظ"}</button>
    </form>
  );
}

function ReviewAdmin({ d, reload }: { d: D; reload: () => void }) {
  const [filter, setFilter] = useState("pending");
  const [locFor, setLocFor] = useState<string | null>(null);
  const brokerName = (id: string | null) => d.brokers.find((b) => b.id === id)?.name ?? "—";
  const list = d.properties.filter((p) => !filter || p.review_status === filter);
  const upd = async (id: string, patch: TablesUpdate<"properties">, msg: string) => {
    const { error } = await supabase.from("properties").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(msg); reload(); }
  };
  return (
    <div className="space-y-3">
      <select className={`${inputCls} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="">كل العقارات</option>{Object.entries(REVIEW).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      {list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا توجد عقارات.</p>}
      {list.map((p) => (
        <div key={p.id} className="rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
          <a href={p.images[0] || p.image_url || "/demo/p1.jpg"} target="_blank" rel="noreferrer" className="relative shrink-0">
            <img src={p.images[0] || p.image_url || "/demo/p1.jpg"} alt="" loading="lazy" className="h-28 w-full rounded-xl object-cover md:h-20 md:w-28" />
            {p.images.length > 1 && <span className="absolute bottom-1 left-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold text-primary">{p.images.length} صور</span>}
          </a>
          <div className="min-w-0 flex-1">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${REVIEW[p.review_status].cls}`}>{REVIEW[p.review_status].label}</span>
            {p.owner_lead_id && <span className="ms-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">عرض مالك</span>}
            <p className="mt-1 truncate font-bold text-primary">{p.title}</p>
            <p className="text-sm text-muted-foreground">{formatPrice(Number(p.price))} ج.م{PRICE_UNIT_LABEL[p.price_unit ?? ""] ?? ""} · {p.status} · {p.type} · {p.area === p.city ? p.city : `${p.area}، ${p.city}`} · {p.owner_lead_id ? "بدون وسيط" : brokerName(p.broker_id)}</p>
            {p.owner && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-bold text-primary">المالك: {p.owner.name}</span>
                <a href={`tel:+${p.owner.phone}`} dir="ltr" className="font-semibold text-primary underline">+{p.owner.phone}</a>
                <a href={waLink(p.owner.phone, `مرحبًا ${p.owner.name}، معك فريق فاليو عقار بخصوص إعلانك: ${p.title}`)} target="_blank" rel="noreferrer" className="font-bold text-whatsapp">واتساب</a>
                <span className={`text-xs font-bold ${p.owner.phone_verified ? "text-teal" : "text-muted-foreground"}`}>{p.owner.phone_verified ? "✓ رقم مؤكَّد" : "رقم غير مؤكَّد"}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {p.review_status !== "approved" && <button className={btnPrimary} onClick={() => upd(p.id, { review_status: "approved", review_note: null }, "تم الاعتماد")}><Check className="size-4" />اعتماد</button>}
            <button className={p.is_highlight ? btnPrimary : btnOutline} title={p.highlight_requested_at ? "الشركة طالبة ترشيحه" : "عرض بسعر مميز"} onClick={async () => {
              if (p.is_highlight) { await upd(p.id, { is_highlight: false }, "اتشال من العروض المميزة"); return; }
              const reason = prompt("ليه ده عرض بسعر مميز؟ (سطر واحد بيظهر للناس)", p.highlight_reason ?? ""); if (!reason?.trim()) return;
              const y = prompt("عائد سنوي تقريبي % (اختياري — سيبه فاضي لو مفيش)", p.highlight_yield?.toString() ?? "");
              await upd(p.id, { is_highlight: true, highlight_reason: reason.trim().slice(0, 160), highlight_yield: y && Number(y) > 0 ? Number(y) : null }, "اتضاف للعروض المميزة");
            }}>{p.is_highlight ? "★ سعر مميز" : p.highlight_requested_at ? "★ مطلوب ترشيحه" : "☆ سعر مميز"}</button>
            <button className={p.verified_at ? btnPrimary : btnOutline} title="فريق فاليو عقار عاين العقار على الطبيعة" onClick={async () => {
              if (p.verified_at) { if (confirm("تشيل علامة «متحقق منه»؟")) await upd(p.id, { verified_at: null }, "اتشالت علامة متحقق منه"); return; }
              const note = prompt("ملاحظة المعاينة (اختياري — بتظهر للناس، مثلاً: عاينه أحمد ومطابق للصور)", ""); if (note === null) return;
              await upd(p.id, { verified_at: new Date().toISOString(), verified_note: note.trim().slice(0, 160) || null }, "اتعلّم «متحقق منه»");
            }}>{p.verified_at ? "✓ متحقق منه" : "متحقق منه؟"}</button>
            {p.review_status !== "rejected" && <button className={btnOutline} onClick={() => { const note = prompt(p.review_status === "approved" ? "سبب الإخفاء (يظهر للوسيط)" : "سبب الرفض (يظهر للوسيط)"); if (note === null) return; upd(p.id, { review_status: "rejected", review_note: note.slice(0, 500) || null }, p.review_status === "approved" ? "تم إخفاء العقار" : "تم الرفض"); }}><X className="size-4" />{p.review_status === "approved" ? "إخفاء" : "رفض"}</button>}
            <button title="الموقع على الخريطة" onClick={() => setLocFor(locFor === p.id ? null : p.id)} className={`grid size-11 place-items-center rounded-xl border ${p.lat != null ? "text-teal" : "text-muted-foreground"}`} aria-label="الموقع على الخريطة">📍</button>
            <button aria-label="تمييز" className={`grid size-11 place-items-center rounded-xl border ${p.is_featured ? "bg-teal text-accent-foreground" : "text-primary"}`} onClick={() => upd(p.id, { is_featured: !p.is_featured }, p.is_featured ? "أُلغي التمييز" : "تم التمييز")}><Star className="size-4" /></button>
          </div>
        </div>
        {locFor === p.id && <LocationEditor id={p.id} initial={p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null} onDone={() => { setLocFor(null); reload(); }} />}
        </div>
      ))}
    </div>
  );
}

/** Admin sets or corrects a listing's map pin (owners can't search addresses, so they may pin roughly). */
function LocationEditor({ id, initial, onDone }: { id: string; initial: LatLng | null; onDone: () => void }) {
  const [loc, setLoc] = useState<LatLng | null>(initial);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("properties").update({ lat: loc?.lat ?? null, lng: loc?.lng ?? null }).eq("id", id);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success(loc ? "اتحفظ الموقع" : "اتشال الموقع"); onDone(); }
  }
  return (
    <div className="space-y-2 border-t p-3">
      <MapPicker value={loc} onChange={setLoc} />
      <button disabled={busy} onClick={save} className={btnPrimary}>حفظ الموقع</button>
    </div>
  );
}

function LeadsAdmin({ d, reload }: { d: D; reload: () => void }) {
  const [filter, setFilter] = useState<"unassigned" | "all">("unassigned");
  const list = d.leads.filter((l) => filter === "all" || !l.assigned_broker_id);
  const upd = async (id: string, patch: TablesUpdate<"leads">) => {
    const { error } = await supabase.from("leads").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم التحديث"); reload(); }
  };
  return (
    <div className="space-y-3">
      <select className={`${inputCls} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as "unassigned" | "all")}>
        <option value="unassigned">غير موزعة</option><option value="all">كل الطلبات</option>
      </select>
      {list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا توجد طلبات.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((l) => (
          <div key={l.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold text-primary">{l.name} <span className="text-xs text-muted-foreground">· {leadKindLabel(l)} · {STAGES[l.stage]}</span></p>
                <p className="text-xs text-muted-foreground">{formatDate(l.created_at)}</p>
              </div>
              <a href={`tel:${l.phone}`} dir="ltr" className="inline-flex h-9 items-center gap-1 rounded-lg bg-secondary px-3 text-sm font-bold text-primary"><Phone className="size-3.5" />{l.phone}</a>
            </div>
            <p className="mt-2 text-sm text-foreground/80">{[l.properties?.title, l.property_type, l.area, l.budget ? `${formatPrice(Number(l.budget))} ج.م` : null].filter(Boolean).join(" · ")}</p>
            {l.details && <p className="mt-1 text-sm text-foreground/70">{l.details}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select aria-label="إسناد لوسيط" className={inputCls} value={l.assigned_broker_id ?? ""} onChange={(e) => upd(l.id, { assigned_broker_id: e.target.value || null })}>
                <option value="">غير مُسند</option>{d.brokers.filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select aria-label="المرحلة" className={inputCls} value={l.stage} onChange={(e) => upd(l.id, { stage: e.target.value as NonNullable<TablesUpdate<"leads">["stage"]> })}>
                {Object.entries(STAGES).filter(([k]) => k === l.stage || !STAGES_WITH_DATA.includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlansAdmin({ plans, reload }: { plans: PlanRow[]; reload: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">حدّد عدد العقارات والإعلانات المميزة والأسعار لكل باقة. الباقة اللي سعرها صفر مش بتتدفع. الدفع الأونلاين هيشتغل لما بوابة الدفع تتربط.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => <PlanCard key={p.id} p={p} reload={reload} />)}
      </div>
      <PaymentSettings />
    </div>
  );
}

function PlanCard({ p, reload }: { p: PlanRow; reload: () => void }) {
  const [f, setF] = useState({ name: p.name, max_properties: String(p.max_properties), featured_slots: String(p.featured_slots), monthly_price: String(p.monthly_price), yearly_price: String(p.yearly_price ?? 0), trial_days: String(p.trial_days ?? 0) });
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <Field label="اسم الباقة"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="الحد الأقصى للعقارات"><input className={inputCls} inputMode="numeric" value={f.max_properties} onChange={(e) => setF({ ...f, max_properties: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") })} /></Field>
      <Field label="الإعلانات المميزة"><input className={inputCls} inputMode="numeric" value={f.featured_slots} onChange={(e) => setF({ ...f, featured_slots: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") })} /></Field>
      <Field label="السعر الشهري (ج.م)"><input className={inputCls} inputMode="numeric" value={f.monthly_price} onChange={(e) => setF({ ...f, monthly_price: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") })} /></Field>
      <Field label="السعر السنوي (ج.م)"><input className={inputCls} inputMode="numeric" value={f.yearly_price} onChange={(e) => setF({ ...f, yearly_price: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") })} /></Field>
      {Number(f.monthly_price) > 0 && Number(f.yearly_price) > 0 && Number(f.yearly_price) < Number(f.monthly_price) * 12 && <p className="-mt-2 text-xs font-bold text-teal">توفير {Math.round((1 - Number(f.yearly_price) / (Number(f.monthly_price) * 12)) * 100)}% على السنوي</p>}
      <Field label="أيام التجربة المجانية"><input className={inputCls} inputMode="numeric" value={f.trial_days} onChange={(e) => setF({ ...f, trial_days: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "").slice(0, 2) })} /></Field>
      <button className={`${btnPrimary} w-full`} onClick={async () => {
        const { error } = await supabase.from("plans").update({ name: f.name.trim(), max_properties: Number(f.max_properties || 0), featured_slots: Number(f.featured_slots || 0), monthly_price: Number(f.monthly_price || 0), yearly_price: Number(f.yearly_price || 0), trial_days: Math.min(Number(f.trial_days || 0), 60) }).eq("id", p.id);
        if (error) toast.error(error.message); else { toast.success("تم الحفظ"); reload(); }
      }}>حفظ</button>
    </div>
  );
}

/** Featured-listing prices and the grace period after a subscription ends (payments phase 1). */
function PaymentSettings() {
  const q = useQuery({ queryKey: ["payment-settings"], queryFn: async () => (await supabase.from("app_settings").select("featured_week_price, featured_month_price, subscription_grace_days").eq("id", 1).maybeSingle()).data });
  const [f, setF] = useState<{ week: string; month: string; grace: string } | null>(null);
  const v = f ?? (q.data ? { week: String(q.data.featured_week_price), month: String(q.data.featured_month_price), grace: String(q.data.subscription_grace_days) } : null);
  if (!v) return null;
  const num = (x: string) => x.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "");
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="font-bold text-primary">تمييز العقار والتجديد</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="تمييز عقار أسبوع (ج.م)"><input className={inputCls} inputMode="numeric" value={v.week} onChange={(e) => setF({ ...v, week: num(e.target.value) })} /></Field>
        <Field label="تمييز عقار شهر (ج.م)"><input className={inputCls} inputMode="numeric" value={v.month} onChange={(e) => setF({ ...v, month: num(e.target.value) })} /></Field>
        <Field label="أيام السماح بعد انتهاء الباقة"><input className={inputCls} inputMode="numeric" value={v.grace} onChange={(e) => setF({ ...v, grace: num(e.target.value).slice(0, 2) })} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">بعد أيام السماح الحساب بيرجع للباقة المجانية، والعقارات الزيادة عن حدها بتستخبى (مش بتتمسح) لحد ما يجدد. وفيه تنبيه قبل الانتهاء بأسبوع وبيوم.</p>
      <button className={btnPrimary} onClick={async () => {
        const { error } = await supabase.from("app_settings").update({ featured_week_price: Number(v.week || 0), featured_month_price: Number(v.month || 0), subscription_grace_days: Math.min(Number(v.grace || 0), 30) }).eq("id", 1);
        if (error) toast.error(error.message); else { toast.success("تم الحفظ"); setF(null); q.refetch(); }
      }}>حفظ</button>
    </div>
  );
}

/** Item 32: ready welcome text for a newly approved company or broker, sent from the admin's own WhatsApp. */
function welcomeMessage(name: string, type: string) {
  const company = ["company", "developer", "office"].includes(type);
  return [
    `أهلاً ${name} 👋`,
    "حسابك على فاليو عقار اتفعّل ✓",
    "",
    "1) ادخل من هنا برقم موبايلك: https://valueaqar.com/auth",
    company ? "2) من «عقاراتي» ضيف عقاراتك واحد واحد، أو ارفعهم مرة واحدة من «رفع من Excel» (فيه نموذج جاهز)." : "2) من «عقاراتي» ضيف عقاراتك بالصور.",
    company ? "3) من تاب «الفريق» ضيف فريقك (مديرين ومبيعات) بأرقام موبايلاتهم." : "3) العملاء المهتمين هيوصلوك في «العملاء والطلبات» ومعاهم إشعار.",
    "",
    "أي سؤال إحنا معاك هنا على واتساب.",
  ].join("\n");
}

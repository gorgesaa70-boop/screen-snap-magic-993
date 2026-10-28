import { createFileRoute, Link } from "@tanstack/react-router";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Star, Phone, Pencil, Trash2 } from "lucide-react";
import { AvailabilitySelect, DeleteButton } from "@/components/dash/ManageActions";
import { PropertyForm } from "@/components/dash/PropertyForm";
import { MallUnitForm } from "@/components/dash/MallUnitForm";
import { IndustrialForm } from "@/components/dash/IndustrialForm";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";

/** fetchAll result in the { data, error } shape the admin loader already checks. */
const paged = <T,>(load: () => Promise<T[]>) => load().then((data) => ({ data, error: null }), (error: Error) => ({ data: null, error }));
import { dbx } from "@/lib/dbx";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { Stat, Tabs, Field, inputCls, btnPrimary, btnOutline, Avatar } from "@/components/site/ui";
import { STAGES_WITH_DATA, PRICE_UNIT_LABEL, ACCOUNT_LABEL, LEAD_KINDS, REVIEW, STAGES, formatPrice, formatDate, waLink, type BrokerRow, type PlanRow, leadKindLabel, PUBLIC_BROKER_COLS } from "@/components/site/data";
import { can, hasAny } from "@/lib/permissions";
import type { Database } from "@/integrations/supabase/types";

type AdminBroker = Database["public"]["Functions"]["admin_brokers"]["Returns"][number];
import { AreaPicker } from "@/components/site/AreaPicker";
import { MallsAdmin } from "@/components/dash/MallsAdmin";
import { CompoundsAdmin } from "@/components/dash/CompoundsAdmin";
import { ServicesAdmin } from "@/components/dash/ServicesAdmin";
import { ReferralsAdmin } from "@/components/dash/ReferralsAdmin";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";
import { ProjectsAdmin } from "@/components/dash/ProjectsAdmin";
import { LocationsAdmin } from "@/components/dash/LocationsAdmin";
import { AccountsAdmin } from "@/components/dash/AccountsAdmin";
import { StaffAdmin } from "@/components/dash/StaffAdmin";
import { AppSettingsAdmin } from "@/components/dash/AppSettingsAdmin";
import { AnnouncementAdmin } from "@/components/dash/AnnouncementAdmin";
import { SiteClosedAdmin } from "@/components/dash/SiteClosedAdmin";
import { WhatsappSettingsAdmin } from "@/components/dash/WhatsappSettingsAdmin";
import { WhatsappInbox } from "@/components/dash/WhatsappInbox";
import { AssistantSettingsAdmin } from "@/components/dash/AssistantSettingsAdmin";
import { LeadAlerts } from "@/components/dash/LeadAlerts";
import { AuditLog } from "@/components/dash/AuditLog";
import { SystemHealth } from "@/components/dash/SystemHealth";
import { DirectMessageButton } from "@/components/site/DirectMessageButton";
import { InvestmentsAdmin } from "@/components/dash/InvestmentsAdmin";
import { RoutingRules } from "@/components/dash/RoutingRules";
import { Reports as ReportsDashboard } from "@/components/dash/Reports";
import { IndustrialAdmin } from "@/components/dash/IndustrialAdmin";
import { AdminNotifications } from "@/components/dash/AdminNotifications";
import { PlansAdmin, AccountPlan } from "@/components/dash/PlansAdmin";
import { createBrokerAccount, deleteAccountAsAdmin, notifySearchEnginesSoon, setBrokerActive } from "@/lib/admin.functions";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { cleanPhone } from "@/lib/phone";
import { thumb } from "@/lib/images";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "لوحة الإدارة | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type Tab = "reports" | "review_alerts" | "alerts" | "brokers" | "staff" | "review" | "leads" | "plans" | "projects" | "industrial" | "malls" | "compounds" | "svc_requests" | "svc_providers" | "svc_plans" | "svc_reviews" | "referrals" | "app" | "announce" | "closed" | "wa" | "audit" | "health" | "routing" | "investments" | "locations" | "accounts" | "wa_inbox" | "assistant";
const ALL_TABS: Tab[] = ["reports", "leads", "wa_inbox", "review", "svc_requests", "review_alerts", "routing", "referrals", "locations", "projects", "investments", "malls", "compounds", "industrial", "svc_providers", "svc_plans", "svc_reviews", "brokers", "accounts", "staff", "plans", "assistant", "announce", "closed", "wa", "app", "health", "alerts", "audit"];

function useAdminData(enabled: boolean, isAdmin: boolean) {
  return useQuery({
    queryKey: ["admin-data", isAdmin], enabled,
    queryFn: async () => {
      const [b, p, l, pl] = await Promise.all([
        // Employees (release 38) don't get the admin's account list with contacts; the public columns are enough to assign.
        isAdmin ? supabase.rpc("admin_brokers")
          : supabase.from("brokers").select(PUBLIC_BROKER_COLS).eq("is_active", true).order("name").then((r) => ({ ...r, data: r.data as unknown as AdminBroker[] | null })),
        paged(() => fetchAll((a, b) => supabase.from("properties").select("*, owner:leads!properties_owner_lead_id_fkey(name, phone, phone_verified)").order("updated_at", { ascending: false }).order("id").range(a, b))),
        paged(() => fetchAll((a, b) => supabase.from("leads").select("*, properties!leads_property_id_fkey(title)").order("created_at", { ascending: false }).order("id").range(a, b))),
        supabase.from("plans").select("*").order("audience").order("sort_order"),
      ]);
      const err = b.error || p.error || l.error || pl.error;
      if (err) throw err;
      // Accounts deleted from the admin but kept for money records (release 31) leave every list.
      return { brokers: (b.data ?? []).filter((x) => !x.deleted_at), properties: p.data, leads: l.data, plans: pl.data };
    },
  });
}

function AdminPage() {
  const { me, loading } = useMe();
  // Notifications can open a section directly (e.g. /admin?tab=locations).
  const [rawTab, setTab] = useState<Tab>(() => {
    const t = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab");
    return t && (ALL_TABS as string[]).includes(t) ? (t as Tab) : "reports";
  });
  // The admin sees everything; an employee only the sections granted in «فريق فاليو عقار» (release 38).
  const perms = me?.perms;
  const allowed = !!me?.isAdmin || (!!me?.isStaff && hasAny(perms));
  const pendingPlaces = useQuery({
    queryKey: ["admin-locations-pending"], enabled: can(perms, "locations"),
    queryFn: async () => (await supabase.from("locations").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0,
  }).data ?? 0;
  // Full account rows (status, contacts) for the admin and employees holding «الحسابات والشركات».
  const q = useAdminData(allowed, !!me?.isAdmin || can(perms, "brokers"));
  if (loading) return <DashShell title="لوحة الإدارة"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;
  if (!allowed) return <DashShell title="لوحة الإدارة"><p className="rounded-2xl border bg-card p-6 text-sm">{me?.isStaff ? "لسه مافيش أقسام متاحة ليك. اطلب من الأدمن يحددلك صلاحياتك." : "ليست لديك صلاحية الوصول."} <Link to="/dashboard" className="font-bold text-primary underline">لوحتي</Link></p></DashShell>;
  const visible = (id: Tab) => (id === "staff" ? !!me?.isAdmin : can(perms, id));
  // A section that isn't granted opens the first one that is.
  const tab: Tab = visible(rawTab) ? rawTab : (ALL_TABS.find(visible) ?? rawTab);
  const viewOnly = !me?.isAdmin && !can(perms, tab, "edit");
  const d = q.data;
  const reload = () => q.refetch();
  const pending = d?.properties.filter((p) => p.review_status === "pending").length ?? 0;
  const pendingAccounts = d?.brokers.filter((b) => accountStatus(b) === "pending").length ?? 0;
  return (
    <DashShell title={me?.isAdmin ? "لوحة الإدارة" : "لوحة العمل"} isAdmin={!!me?.isAdmin}>
      {/* 16 sections grouped in 5 (UX review): pick a group, then a section inside it. */}
      {(() => {
        const labels: Record<Tab, string> = {
          reports: "التقارير", review_alerts: "تنبيهات المراجعة", alerts: "الإشعارات الإدارية", brokers: `الحسابات والشركات${pendingAccounts ? ` (${pendingAccounts})` : ""}`, staff: "فريق فاليو عقار", accounts: "كل الحسابات",
          wa_inbox: "محادثات الواتساب", assistant: "المساعد والزرار العايم", review: `مراجعة العقارات${pending ? ` (${pending})` : ""}`, leads: "طلبات العملاء", routing: "قواعد التوزيع", plans: "الباقات", projects: "المشروعات", investments: "الفرص الاستثمارية",
          industrial: "الصناعي", malls: "المولات", compounds: "الكمبوندات", locations: `المناطق${pendingPlaces ? ` (${pendingPlaces})` : ""}`, svc_requests: "طلبات الخدمات", svc_providers: "مقدمين الخدمة", svc_plans: "باقات الخدمات", svc_reviews: "التقييمات", referrals: "الإحالات بين الوسطاء", app: "التطبيق", announce: "رسالة التثبيت", closed: "غلق الموقع", wa: "رقم الواتساب العائم", audit: "سجل التدقيق", health: "الصيانة والنسخ الاحتياطي",
        };
        const groups: { id: string; label: string; tabs: Tab[] }[] = ([
          { id: "reports", label: "التقارير والتنبيهات", tabs: ["reports", "alerts", "audit"] },
          { id: "customers", label: "العملاء", tabs: ["leads", "wa_inbox", "review_alerts", "routing", "referrals"] },
          { id: "listings", label: `العقارات${pending + pendingPlaces ? ` (${pending + pendingPlaces})` : ""}`, tabs: ["review", "locations", "projects", "investments", "malls", "compounds", "industrial"] },
          { id: "services", label: "الخدمات", tabs: ["svc_requests", "svc_providers", "svc_plans", "svc_reviews"] },
          { id: "accounts", label: `الحسابات${pendingAccounts ? ` (${pendingAccounts})` : ""}`, tabs: ["brokers", "accounts", "staff", "plans"] },
          { id: "settings", label: "الإعدادات", tabs: ["assistant", "announce", "closed", "wa", "app", "health"] },
        ] as { id: string; label: string; tabs: Tab[] }[]).map((g) => ({ ...g, tabs: g.tabs.filter(visible) })).filter((g) => g.tabs.length);
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
      {viewOnly && visible(tab) && (
        <p className="mb-4 rounded-xl border border-teal/40 bg-teal-soft px-4 py-2 text-sm font-bold text-primary">👁️ القسم ده عندك «عرض بس»؛ أي تعديل محتاج صلاحية من الأدمن.</p>
      )}
      {!d || !visible(tab) ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : (
        // «يشوف بس»: every button and field inside is disabled (the database refuses the change anyway).
        <fieldset disabled={viewOnly} className="m-0 min-w-0 border-0 p-0">
          {tab === "reports" && <ReportsDashboard scope={{ seeAll: true, isAdmin: !!me?.isAdmin, companyId: null }} />}
          {tab === "alerts" && <AdminNotifications />}
          {tab === "staff" && <StaffAdmin />}
          {tab === "review_alerts" && <LeadAlerts />}
          {tab === "app" && <AppSettingsAdmin />}
          {tab === "announce" && <AnnouncementAdmin />}
          {tab === "closed" && <SiteClosedAdmin />}
          {tab === "wa" && <WhatsappSettingsAdmin />}
          {tab === "wa_inbox" && <WhatsappInbox />}
          {tab === "assistant" && <AssistantSettingsAdmin />}
          {tab === "investments" && <InvestmentsAdmin isAdmin={can(perms, "investments", "edit")} />}
          {tab === "audit" && <AuditLog />}
          {tab === "health" && <SystemHealth />}
          {tab === "routing" && <RoutingRules />}
          {tab === "referrals" && <ReferralsAdmin />}
          {tab === "brokers" && <BrokersAdmin brokers={d.brokers} plans={d.plans} reload={reload} />}
          {tab === "review" && <ReviewAdmin d={d} reload={reload} />}
          {tab === "leads" && <LeadsAdmin d={d} reload={reload} />}
          {tab === "plans" && <PlansAdmin plans={d.plans} reload={reload} canEdit={!viewOnly} />}
          {tab === "projects" && <ProjectsAdmin brokers={d.brokers} />}
          {tab === "malls" && <MallsAdmin properties={d.properties} brokers={d.brokers} reload={reload} />}
          {tab === "compounds" && <CompoundsAdmin brokers={d.brokers} />}
          {tab === "locations" && <LocationsAdmin />}
          {tab === "accounts" && <AccountsAdmin />}
          {(tab === "svc_requests" || tab === "svc_providers" || tab === "svc_plans" || tab === "svc_reviews") && <ServicesAdmin tab={tab} />}
          {tab === "industrial" && <IndustrialAdmin properties={d.properties} brokers={d.brokers} reload={reload} />}
        </fieldset>
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
  const removeLogin = useServerFn(deleteAccountAsAdmin);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /** Deletes the whole account: its login first (if any), then the broker / company itself. */
  async function removeAccount(b: BrokerRow) {
    if (!confirm(`متأكد إنك عايز تمسح حساب «${b.name}»؟\nإعلاناته هتتمسح، واللي عليه عملاء أو صفقات هيفضل في السجلات بس.`)) return;
    if (!confirm("تأكيد أخير: الحذف نهائي ومش هيرجع.")) return;
    if (b.user_id) {
      const r = await removeLogin({ data: { userId: b.user_id } }).catch((e: Error) => ({ ok: false as const, error: e.message }));
      if (!r.ok) { toast.error(r.error); return; }
    }
    const { data, error } = await supabase.rpc("admin_delete_broker", { _id: b.id });
    if (error) { toast.error(error.code === "PGRST202" ? "حذف الحسابات محتاج تحديث قاعدة البيانات (إصدار 31)" : error.message); reload(); return; }
    toast.success(data === "hidden" ? "الحساب اتمسح من القوايم — اتساب في السجلات بس عشان عليه صفقات أو اتفاقيات" : "الحساب اتمسح");
    reload();
  }
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
      {showNew && <NewBroker onDone={() => { setShowNew(false); reload(); }} />}
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
          <div key={b.id} className="space-y-2">
          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 md:flex-row md:items-center">
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
                {b.show_contact && !b.phone && !b.whatsapp && <p className="text-xs font-bold text-destructive">⚠️ التواصل ظاهر بس مفيش رقم متسجّل، فمش هيظهر رقم للعملاء. دوس «تعديل» واكتب الموبايل أو الواتساب.</p>}
                {st === "approved" && (b.whatsapp || b.phone) && !b.is_demo && (
                  <a href={waLink(b.whatsapp || b.phone, welcomeMessage(b.name, b.account_type))} target="_blank" rel="noreferrer" className="inline-block text-xs font-bold text-teal hover:underline">📩 ابعت رسالة الترحيب على واتساب</a>
                )}
              </div>
            </div>
            {st === "approved" && !b.is_demo && <AccountPlan b={b} plans={plans} reload={reload} />}
            <div className="flex flex-wrap gap-2">
              {!b.is_demo && <DirectMessageButton brokerId={b.id} className={btnOutline} />}
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
              <button className={btnOutline} onClick={() => setEditing(editing === b.id ? null : b.id)}><Pencil className="size-4" />تعديل</button>
              <button className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-destructive/40 px-3 text-sm font-bold text-destructive hover:bg-destructive/5" onClick={() => removeAccount(b)}><Trash2 className="size-4" />حذف الحساب</button>
              {st === "pending" && (
                <button className={btnOutline} onClick={async () => {
                  const note = prompt("سبب الرفض (هيظهر لصاحب الطلب):"); if (note === null) return;
                  const { error } = await supabase.from("brokers").update({ rejected_at: new Date().toISOString(), review_note: note.trim().slice(0, 500) || null }).eq("id", b.id);
                  if (error) toast.error(error.message); else { toast.success("تم رفض الطلب"); reload(); }
                }}><X className="size-4" />رفض</button>
              )}
            </div>
          </div>
          {editing === b.id && <BrokerEdit b={b} onDone={() => { setEditing(null); reload(); }} />}
          </div>
        );
      })}
    </div>
  );
}

/** Admin corrects an account's details (name, type, contact details, register). */
function BrokerEdit({ b, onDone }: { b: BrokerRow; onDone: () => void }) {
  const [f, setF] = useState({ name: b.name, account_type: b.account_type, phone: b.phone ? "+" + b.phone : "", whatsapp: b.whatsapp ? "+" + b.whatsapp : "", email: b.email ?? "", contact_person: b.contact_person ?? "", address: b.address ?? "", commercial_register: b.commercial_register ?? "" });
  const [busy, setBusy] = useState(false);
  // Stored like the rest of the accounts: country code + number, digits only.
  const digits = (v: string) => { if (!v.trim()) return null; const c = cleanPhone(v); return c ? (c.startsWith("+") ? c.slice(1) : "20" + c.slice(1)) : undefined; };
  async function save() {
    const phone = digits(f.phone), whatsapp = digits(f.whatsapp);
    if (f.name.trim().length < 2) { toast.error("اكتب الاسم"); return; }
    if (phone === undefined || whatsapp === undefined) { toast.error("رقم الموبايل أو الواتساب مش صحيح"); return; }
    setBusy(true);
    const { error } = await supabase.from("brokers").update({ name: f.name.trim().slice(0, 120), account_type: f.account_type, phone, whatsapp, email: f.email.trim() || null, contact_person: f.contact_person.trim() || null, address: f.address.trim() || null, commercial_register: f.commercial_register.trim() || null }).eq("id", b.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("اتحفظت بيانات الحساب"); onDone();
  }
  const input = (k: keyof typeof f, label: string, ltr = false) => <Field label={label}><input dir={ltr ? "ltr" : undefined} className={inputCls} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <div className="grid gap-2 rounded-2xl border bg-secondary/40 p-4 sm:grid-cols-2">
      {input("name", "اسم الحساب")}
      <Field label="نوع الحساب"><select className={inputCls} value={f.account_type} onChange={(e) => setF({ ...f, account_type: e.target.value })}>{Object.entries(ACCOUNT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      {input("phone", "الموبايل", true)}
      {input("whatsapp", "واتساب", true)}
      {input("email", "الإيميل", true)}
      {input("contact_person", "المسؤول")}
      {input("commercial_register", "السجل التجاري")}
      {input("address", "العنوان")}
      <div className="flex gap-2 sm:col-span-2"><button disabled={busy} onClick={save} className={btnPrimary}>{busy ? "..." : "حفظ"}</button><button onClick={onDone} className="h-11 px-4 text-sm font-bold text-muted-foreground">إلغاء</button></div>
    </div>
  );
}

function NewBroker({ onDone }: { onDone: () => void }) {
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
      <p className="self-end pb-2 text-xs text-muted-foreground">الحساب بياخد أول شهر مجانًا على الباقة الوسطى أول ما يتعتمد، وبعدها تفعّل باقته من هنا.</p>
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
  const [editing, setEditing] = useState<D["properties"][number] | null>(null);
  const brokerName = (id: string | null) => d.brokers.find((b) => b.id === id)?.name ?? "—";
  const active = d.brokers.filter((b) => b.is_active).map((b) => ({ id: b.id, name: b.name }));
  if (editing) {
    const done = () => { setEditing(null); reload(); };
    if (editing.category === "mall") return <MallUnitForm brokers={active} initial={editing} onCancel={() => setEditing(null)} onDone={done} />;
    if (editing.category === "industrial") return <IndustrialForm brokers={active} initial={editing} onCancel={() => setEditing(null)} onDone={done} />;
    return <PropertyForm admin brokerId={editing.broker_id ?? ""} initial={editing} onCancel={() => setEditing(null)} onDone={done} />;
  }
  const list = d.properties.filter((p) => !filter || p.review_status === filter);
  const pingEngines = useServerFn(notifySearchEnginesSoon);
  const upd = async (id: string, patch: TablesUpdate<"properties">, msg: string) => {
    const { error } = await supabase.from("properties").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(msg); reload();
      // A newly approved listing: Bing / Yandex hear about it right away (Google reads the sitemap).
      if (patch.review_status === "approved") void pingEngines().catch(() => {});
    }
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
            <img src={thumb(p.images[0] || p.image_url) || "/demo/p1.jpg"} alt="" loading="lazy" className="h-28 w-full rounded-xl object-cover md:h-20 md:w-28" />
            {p.images.length > 1 && <span className="absolute bottom-1 left-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold text-primary">{p.images.length} صور</span>}
          </a>
          <div className="min-w-0 flex-1">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${REVIEW[p.review_status].cls}`}>{REVIEW[p.review_status].label}</span>
            {p.owner_lead_id && <span className="ms-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">عرض مالك</span>}
            {p.listing_no != null && <span className="ms-1.5 text-[11px] font-bold text-muted-foreground" dir="ltr">VA-{p.listing_no}</span>}
            <p className="mt-1 truncate font-bold text-primary">{p.title}</p>
            <p className="text-sm text-muted-foreground">{formatPrice(Number(p.price))} ج.م{PRICE_UNIT_LABEL[p.price_unit ?? ""] ?? ""} · {p.status} · {p.type} · {p.area === p.city ? p.city : `${p.area}، ${p.city}`} · {p.owner_lead_id ? "بدون وسيط" : brokerName(p.broker_id)}</p>
            {(p.payment_method === "installment" || p.payment_method === "both") && <p className="text-xs font-semibold text-teal">{p.payment_method === "both" ? "كاش أو تقسيط" : "تقسيط"}{p.down_payment != null ? ` · مقدم ${formatPrice(Number(p.down_payment))}` : ""}{p.installment_years ? ` · ${p.installment_years} سنين` : ""}{p.monthly_installment != null ? ` · قسط ${formatPrice(Number(p.monthly_installment))}` : ""}</p>}
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
            <AvailabilitySelect p={p} onChanged={reload} />
            <button className={btnOutline} onClick={() => setEditing(p)}><Pencil className="size-4" />تعديل</button>
            <DeleteButton kind="property" id={p.id} name={p.title} onDone={reload} />
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

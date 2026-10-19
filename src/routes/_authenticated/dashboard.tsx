import { can, hasAny } from "@/lib/permissions";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Phone, MessageCircle, ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useMe, type MemberRole } from "@/hooks/useAuth";
import { CustomerHome } from "@/components/dash/CustomerHome";
import { ProviderHome } from "@/components/dash/ProviderHome";
import { BrokerGuide } from "@/components/dash/BrokerGuide";
import { DeadlineBadge } from "@/components/dash/Deadline";
import { ContactOutcome } from "@/components/dash/LeadsBoard";
import { ListingsImport } from "@/components/dash/ListingsImport";
import { DashShell } from "@/components/dash/DashShell";
import { PropertyForm } from "@/components/dash/PropertyForm";
import { IndustrialForm } from "@/components/dash/IndustrialForm";
import { MallUnitForm } from "@/components/dash/MallUnitForm";
import { MallUnitsImport } from "@/components/dash/MallUnitsImport";
import { AvailabilitySelect } from "@/components/dash/ManageActions";
import { AvailabilityBadge } from "@/components/site/availability";
import { MyProjects } from "@/components/dash/MyProjects";
import { CompoundsHub } from "@/components/dash/CompoundsHub";
import { CompanyTeam, MEMBER_ROLES } from "@/components/dash/CompanyTeam";
import { ListingPlan, useMyListingPlan } from "@/components/dash/ListingPlan";
import { Referrals, CoBrokeShare } from "@/components/dash/Referrals";
import { Factory, FileSpreadsheet, Store } from "lucide-react";
import { Stat, Tabs, Field, inputCls, btnPrimary, btnOutline, Avatar } from "@/components/site/ui";
import { STAGES_WITH_DATA, PRICE_UNIT_LABEL, listingTerm, leadNo, ACCOUNT_LABEL, LEAD_KINDS, REVIEW, STAGES, formatPrice, formatDate, uploadImage, waLink, type BrokerRow, type PropertyRow, leadKindLabel } from "@/components/site/data";
import { AreaPicker } from "@/components/site/AreaPicker";
import { thumb } from "@/lib/images";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "لوحة التحكم | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { me, loading, refetch } = useMe();
  if (loading || !me) return <DashShell title="لوحة التحكم"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;

  if (!me.broker) {
    // Service providers (companies / technicians) have their own dashboard.
    if (me.provider && !me.isAdmin && !me.isStaff) return <ProviderHome provider={me.provider} refetch={refetch} />;
    if (!me.isAdmin && !me.isStaff && me.adminExists) return <CustomerHome />;
    if (me.isAdmin) return <Navigate to="/admin" replace />;
    return (
      <DashShell title="لوحة التحكم" isAdmin={me.isAdmin}>
        <div className="max-w-lg rounded-2xl border bg-card p-6">
          {me.isStaff ? (
            <>
              <ShieldCheck className="size-10 text-teal" />
              <p className="mt-3 font-bold text-primary">أنت في فريق فاليو عقار.</p>
              {hasAny(me.perms) ? (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">أقسام شغلك في «لوحة العمل»، حسب الصلاحيات اللي حددها الأدمن.</p>
                  <Link to="/admin" className={`${btnPrimary} mt-5`}>افتح لوحة العمل</Link>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">لسه مافيش أقسام متاحة ليك. اطلب من الأدمن يحددلك صلاحياتك من «فريق فاليو عقار».</p>
              )}
              {can(me.perms, "compounds") && (
                <>
                  <p className="mt-6 mb-2 font-bold text-primary">الكمبوندات اللي عليك</p>
                  <CompoundsHub />
                </>
              )}
            </>
          ) : !me.adminExists ? (
            <>
              <p className="font-bold text-primary">لا يوجد مدير للمنصة بعد.</p>
              <p className="mt-2 text-sm text-muted-foreground">يمكنك تفعيل صلاحية المدير لهذا الحساب (مرة واحدة فقط).</p>
              <button className={`${btnPrimary} mt-5`} onClick={async () => {
                const { data, error } = await supabase.rpc("claim_first_admin");
                if (error || !data) toast.error("تعذّر التفعيل"); else { toast.success("تم تفعيل صلاحية المدير"); refetch(); }
              }}>تفعيل صلاحية المدير</button>
            </>
          ) : (
            <><p className="text-sm text-muted-foreground">حسابك غير مرتبط بملف وسيط نشط بعد.</p><Link to="/join" className={`${btnPrimary} mt-5`}>طلب الانضمام كوسيط</Link></>
          )}
        </div>
      </DashShell>
    );
  }
  if (me.broker.suspended_at) return (
    <DashShell title="الحساب موقوف" isAdmin={me.isAdmin}>
      <p className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">تم إيقاف هذا الحساب من الإدارة، ولا يمكن الوصول إلى لوحة التحكم. تواصل مع إدارة المنصة.</p>
    </DashShell>
  );
  if (!me.broker.is_active) return me.broker.rejected_at ? (
    <DashShell title="طلب الانضمام اترفض" isAdmin={me.isAdmin}>
      <div className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        <p>للأسف طلب الانضمام ما اتقبلش.</p>
        {me.broker.review_note && <p className="mt-2 font-bold text-destructive">السبب: {me.broker.review_note}</p>}
        <p className="mt-2">لو عندك استفسار تواصل مع إدارة فاليو عقار.</p>
      </div>
    </DashShell>
  ) : (
    <DashShell title="حسابك قيد المراجعة" isAdmin={me.isAdmin}>
      <p className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">طلب انضمامك قيد المراجعة من الإدارة، وستتمكن من الوصول إلى لوحة الوسيط فور الاعتماد.</p>
    </DashShell>
  );
  return <BrokerDash broker={me.broker} isAdmin={me.isAdmin} role={me.memberRole ?? "owner"} memberName={me.memberName} />;
}

type Tab = "overview" | "projects" | "compounds" | "properties" | "plan" | "referrals" | "leads" | "team" | "profile";
const TEAM_ACCOUNTS = ["office", "company", "developer"];

function BrokerDash({ broker, isAdmin, role, memberName }: { broker: BrokerRow; isAdmin: boolean; role: MemberRole; memberName: string | null }) {
  const isOwner = role === "owner";
  // Also a Value Aqar employee on the same account (release 38): a shortcut to their «لوحة العمل».
  const { me } = useMe();
  const worksForValueAqar = !!me?.isStaff && !me.isAdmin && hasAny(me.perms);
  const canList = isOwner || role === "manager";
  const [tab, setTab] = useState<Tab>("overview");
  const props = useQuery({
    queryKey: ["my-properties", broker.id],
    queryFn: async () => {
      return fetchAll((a, b) => supabase.from("properties").select("*").eq("broker_id", broker.id).order("updated_at", { ascending: false }).order("id").range(a, b));
    },
  });
  const leads = useQuery({
    queryKey: ["my-leads", broker.id],
    queryFn: async () => {
      return fetchAll((a, b) => supabase.from("leads").select("*, properties!leads_property_id_fkey(title)").eq("assigned_broker_id", broker.id).order("created_at", { ascending: false }).order("id").range(a, b));
    },
  });
  // The plan in force (none = free) and how many listings are up now (expired or hidden ones don't count).
  const plan = useMyListingPlan();
  const team = useQuery({
    queryKey: ["team-count", broker.id], enabled: isOwner && TEAM_ACCOUNTS.includes(broker.account_type),
    queryFn: async () => (await supabase.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", broker.id)).count ?? 0,
  });
  const hasTeam = (team.data ?? 0) > 0;
  const P = props.data ?? [];
  const L = leads.data ?? [];
  const count = (s: string) => P.filter((p) => p.review_status === s).length;

  return (
    <DashShell title={`أهلًا، ${memberName ?? broker.name}`} isAdmin={isAdmin}>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="inline-block rounded-full bg-teal-soft px-3 py-1 text-xs font-bold text-primary">{broker.account_type === "individual" ? "وسيط فرد" : ACCOUNT_LABEL[broker.account_type] ?? broker.account_type}</span>
        {!isOwner && <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">{broker.name} · {MEMBER_ROLES[role]?.label}</span>}
        {worksForValueAqar && <Link to="/admin" className="inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">لوحة العمل (فاليو عقار) ←</Link>}
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "overview", label: "نظرة عامة" },
        ...(canList && broker.account_type === "developer" ? [{ id: "projects" as const, label: "مشروعاتي" }] : []),
        ...(broker.account_type === "developer" ? [{ id: "compounds" as const, label: "كمبونداتي" }] : []),
        ...(canList ? [{ id: "properties" as const, label: isOwner ? "عقاراتي" : "العقارات" }] : []),
        ...(canList ? [{ id: "plan" as const, label: "باقتي" }] : []),
        { id: "leads", label: "أحدث العملاء" },
        { id: "referrals", label: "الإحالات" },
        ...(isOwner && TEAM_ACCOUNTS.includes(broker.account_type) ? [{ id: "team" as const, label: "الفريق" }] : []),
        ...(isOwner ? [{ id: "profile" as const, label: "الملف الشخصي" }] : []),
      ]} />
      {tab === "overview" && (
        <div className="space-y-4">
          {isOwner && (
            <BrokerGuide brokerId={broker.id} steps={[
              { done: !!(broker.photo_url && broker.bio), title: "كمّل ملفك", hint: "صورة أو لوجو ونبذة قصيرة — ده اللي العملاء بيشوفوه.", action: "الملف الشخصي", onClick: () => setTab("profile") },
              { done: P.length > 0, title: "ضيف أول عقار", hint: TEAM_ACCOUNTS.includes(broker.account_type) ? "واحد واحد، أو كله مرة واحدة من «رفع من Excel»." : "بالصور والسعر والمنطقة.", action: "عقاراتي", onClick: () => setTab("properties") },
              TEAM_ACCOUNTS.includes(broker.account_type)
                ? { done: hasTeam, title: "ضيف فريقك", hint: "مديرين ومبيعات بأرقام موبايلاتهم — كل واحد يدخل برقمه.", action: "الفريق", onClick: () => setTab("team") }
                : { done: L.length > 0, title: "استقبل أول عميل", hint: "العملاء المهتمين بيوصلوك هنا ومعاهم إشعار — رد بسرعة.", action: "العملاء", onClick: () => setTab("leads") },
            ]} />
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="كل العقارات" value={P.length} hint={plan.data ? `ظاهر ${plan.data.used} من ${plan.data.max} (${plan.data.name})` : undefined} />
            <Stat label="معتمدة" value={count("approved")} />
            <Stat label="قيد المراجعة" value={count("pending")} />
            <Stat label="مرفوضة / مسودة" value={count("rejected") + count("draft")} />
            <Stat label="كل العملاء" value={L.length} />
            <Stat label="استفسارات العقارات" value={L.filter((l) => l.kind === "inquiry").length} />
            <Stat label="عملاء جدد" value={L.filter((l) => l.stage === "new").length} />
            <Stat label="مبيعات مؤكدة" value={L.filter((l) => l.stage === "sold").length} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/brokers/$slug" params={{ slug: broker.slug }} className={btnOutline}>{isOwner ? "عرض ملفي العام" : "عرض ملف الشركة"}</Link>
            <Link to="/reports" className={btnOutline}>التقارير</Link>
            <Link to="/tasks" className={btnOutline}>متابعاتي</Link>
          </div>
        </div>
      )}
      {tab === "projects" && canList && <MyProjects developerId={broker.id} />}
      {tab === "compounds" && <CompoundsHub developerId={canList ? broker.id : null} canAdd={canList} />}
      {tab === "team" && isOwner && <CompanyTeam companyId={broker.id} />}
      {tab === "properties" && canList && <MyProperties brokerId={broker.id} list={P} remaining={plan.data ? Math.max(0, plan.data.max - plan.data.used) : null} reload={() => { props.refetch(); plan.refetch(); }} />}
      {tab === "plan" && canList && <ListingPlan canRequest={isOwner} />}
      {tab === "leads" && <MyLeads list={L} reload={() => leads.refetch()} />}
      {tab === "referrals" && <Referrals canManage={isOwner || role === "manager"} />}
      {tab === "profile" && isOwner && <ProfileForm broker={broker} />}
    </DashShell>
  );
}

function MyProperties({ brokerId, list, remaining, reload }: { brokerId: string; list: PropertyRow[]; remaining: number | null; reload: () => void }) {
  const [editing, setEditing] = useState<PropertyRow | null | "new" | "new-ind" | "new-mall" | "import" | "import-mall">(null);
  if (editing === "import")
    return <ListingsImport brokerId={brokerId} remaining={remaining} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  if (editing === "import-mall")
    return <MallUnitsImport brokerId={brokerId} remaining={remaining} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  if (editing === "new-mall" || (editing && typeof editing !== "string" && editing.category === "mall"))
    return <MallUnitForm brokerId={brokerId} initial={editing === "new-mall" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  if (editing === "new-ind" || (editing && typeof editing !== "string" && editing.category === "industrial"))
    return <IndustrialForm brokerId={brokerId} initial={editing === "new-ind" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  if (editing) return <PropertyForm brokerId={brokerId} initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2"><button onClick={() => setEditing("new")} className={btnPrimary}><Plus className="size-4" />إضافة عقار</button><button onClick={() => setEditing("new-ind")} className={btnOutline}><Factory className="size-4" />إضافة عقار صناعي</button><button onClick={() => setEditing("new-mall")} className={btnOutline}><Store className="size-4" />إضافة وحدة في مول</button><button onClick={() => setEditing("import")} className={btnOutline}><FileSpreadsheet className="size-4" />رفع من Excel</button><button onClick={() => setEditing("import-mall")} className={btnOutline}><FileSpreadsheet className="size-4" />رفع وحدات مولات من Excel</button></div>
      {list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لم تضف أي عقار بعد.</p>}
      {list.map((p) => (
        <div key={p.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
          <img src={thumb(p.image_url) || "/demo/p1.jpg"} alt="" loading="lazy" className="h-28 w-full rounded-xl object-cover sm:h-20 sm:w-28" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${REVIEW[p.review_status].cls}`}>{REVIEW[p.review_status].label}</span>
              {p.is_featured && <span className="rounded-full bg-teal px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">مميز</span>}
              <AvailabilityBadge p={p} className="!px-2.5 !py-0.5 !text-[11px]" />
              {p.review_status === "approved" && !p.hidden_by_plan && (() => { const term = listingTerm(p.listed_until); return term && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${term.cls}`}>{term.label}</span>; })()}
              {p.hidden_by_plan && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-bold text-destructive" title="باقتك انتهت والعقار ده زيادة عن حد الباقة المجانية — بيرجع يظهر لما تجدد">مخفي — جدّد باقتك</span>}
            </div>
            <p className="mt-1 truncate font-bold text-primary">{p.title}</p>
            {p.review_status === "approved" && <div className="mt-1"><CoBrokeShare table="properties" id={p.id} value={p.co_broke_share} onSaved={reload} /></div>}
            <p className="text-sm text-muted-foreground">{formatPrice(Number(p.price))} ج.م{PRICE_UNIT_LABEL[p.price_unit ?? ""] ?? ""} · {p.status} · {p.type} · {p.area === p.city ? p.city : `${p.area}، ${p.city}`}</p>
            {p.review_status === "rejected" && p.review_note && <p className="mt-1 text-xs text-destructive">{p.review_note}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {p.review_status !== "draft" && <AvailabilitySelect p={p} onChanged={reload} />}
            {p.review_status === "draft" && <button className={btnOutline} onClick={async () => { const { error } = await supabase.from("properties").update({ review_status: "pending" }).eq("id", p.id); if (error) toast.error(error.message); else { toast.success("أُرسل للمراجعة"); reload(); } }}>إرسال</button>}
            {p.review_status === "approved" && !p.hidden_by_plan && listingTerm(p.listed_until)?.renewable && (
              <button className={btnOutline} onClick={async () => {
                const { error } = await supabase.rpc("renew_listing", { _property: p.id });
                if (error) toast.error(error.message); else { toast.success("الإعلان اتجدّد"); reload(); }
              }}><RefreshCw className="size-4" />جدّد</button>
            )}
            {p.review_status === "approved" && !p.is_highlight && (
              <button title="اطلب من فاليو عقار تعرضه في «عروض بسعر مميز»" className={btnOutline} disabled={!!p.highlight_requested_at} onClick={async () => {
                const { error } = await supabase.from("properties").update({ highlight_requested_at: new Date().toISOString() }).eq("id", p.id);
                if (error) toast.error(error.message); else { toast.success("اتبعت طلب الترشيح للإدارة"); reload(); }
              }}>{p.highlight_requested_at ? "مطلوب ترشيحه ⏳" : "☆ رشّحه كعرض مميز"}</button>
            )}
            {p.is_highlight && <span className="self-center rounded-full bg-[#f2b84b] px-2.5 py-1 text-[11px] font-bold text-primary">★ عرض مميز</span>}
            <button aria-label="تعديل" onClick={() => setEditing(p)} className="grid size-11 place-items-center rounded-xl border text-primary hover:bg-secondary"><Pencil className="size-4" /></button>
            <button aria-label="حذف" onClick={async () => { if (!confirm("حذف العقار؟")) return; const { error } = await supabase.from("properties").delete().eq("id", p.id); if (error) toast.error(error.message); else reload(); }} className="grid size-11 place-items-center rounded-xl border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

type LeadWithProp = { transfer_deadline_at?: string | null; first_response_at?: string | null; assigned_broker_id?: string | null; lead_no?: number; id: string; name: string; phone: string; kind: string; details: string | null; property_type: string | null; area: string | null; budget: number | null; stage: string; notes: string | null; created_at: string; properties: { title: string } | null };

function LeadCard({ l, onStage, onNotes, extra, onChanged }: { l: LeadWithProp; onStage: (s: string) => void; onNotes?: (n: string) => void; extra?: React.ReactNode; onChanged?: (() => void) | undefined }) {
  const [notes, setNotes] = useState(l.notes ?? "");
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">{l.name} <span className="text-xs font-semibold text-muted-foreground">· {leadKindLabel(l)}</span></p>
          <p className="text-xs text-muted-foreground"><span dir="ltr">{leadNo(l.lead_no)}</span> · {formatDate(l.created_at)}</p>
        </div>
        <select aria-label="مرحلة المتابعة" value={l.stage} onChange={(e) => onStage(e.target.value)} className={`${inputCls} h-10 w-auto`}>
          {Object.entries(STAGES).filter(([k]) => k === l.stage || !STAGES_WITH_DATA.includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="mt-2 space-y-1 text-sm text-foreground/80">
        {l.properties?.title && <p>العقار: {l.properties.title}</p>}
        {(l.property_type || l.area || l.budget) && <p>{[l.property_type, l.area, l.budget ? `${formatPrice(Number(l.budget))} ج.م` : null].filter(Boolean).join(" · ")}</p>}
        {l.details && <p className="whitespace-pre-line">{l.details}</p>}
      </div>
      {l.transfer_deadline_at && !l.first_response_at && <div className="mt-3"><DeadlineBadge at={l.transfer_deadline_at} /></div>}
      {!l.first_response_at && l.assigned_broker_id && <div className="mt-2"><ContactOutcome leadId={l.id} onDone={onChanged} /></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${l.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary" dir="ltr"><Phone className="size-4" />{l.phone}</a>
        <a href={waLink(l.phone, `مرحبًا ${l.name}، معك وسيط فاليو عقار`)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-whatsapp px-3 text-sm font-bold text-primary-foreground"><MessageCircle className="size-4" />واتساب</a>
        {extra}
        <Link to="/leads/$id" params={{ id: l.id }} className="inline-flex h-10 items-center rounded-xl border px-3 text-sm font-bold text-primary hover:bg-secondary">التفاصيل والصفقة</Link>
      </div>
      {onNotes && (
        <div className="mt-3 flex gap-2">
          <input className={inputCls} placeholder="ملاحظات المتابعة" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          <button className={btnOutline} onClick={() => onNotes(notes)}>حفظ</button>
        </div>
      )}
    </div>
  );
}

function MyLeads({ list, reload }: { list: LeadWithProp[]; reload: () => void }) {
  const upd = async (id: string, patch: { stage?: any; notes?: string }) => {
    const { error } = await supabase.from("leads").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم التحديث"); reload(); }
  };
  if (list.length === 0) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش عملاء وصلوك. أول ما حد يطلب أو يستفسر هيظهر هنا ويجيلك إشعار.</p>;
  // The latest few here; the full list with filters and the pipeline lives on the "العملاء والطلبات" page (no duplicate lists).
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">{list.slice(0, 6).map((l) => <LeadCard key={l.id} l={l} onStage={(s) => upd(l.id, { stage: s })} onNotes={(n) => upd(l.id, { notes: n })} onChanged={reload} />)}</div>
      <Link to="/inquiries" className={btnOutline}>كل العملاء والطلبات ({list.length}) ←</Link>
    </div>
  );
}

function ProfileForm({ broker }: { broker: BrokerRow }) {
  const [f, setF] = useState({ name: broker.name, specialty: broker.specialty ?? "", bio: broker.bio ?? "", phone: broker.phone ?? "", whatsapp: broker.whatsapp ?? "", email: broker.email ?? "", facebook: broker.facebook ?? "", photo_url: broker.photo_url ?? "", areas: broker.areas });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    if (f.name.trim().length < 2) { toast.error("الاسم مطلوب"); return; }
    if (f.facebook && !/^https?:\/\//.test(f.facebook)) { toast.error("رابط فيسبوك غير صحيح"); return; }
    setBusy(true);
    const { phone: _p, ...rest } = f;
    const { error } = await supabase.from("brokers").update({ ...rest, name: f.name.trim().slice(0, 100), bio: f.bio.slice(0, 2000) }).eq("id", broker.id);
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("تم حفظ الملف الشخصي");
  }
  return (
    <div className="max-w-2xl space-y-4 rounded-2xl border bg-card p-4 md:p-6">
      <div className="flex items-center gap-4">
        <Avatar name={f.name} url={f.photo_url} size="size-20" />
        <label className={`${btnOutline} cursor-pointer`}>تغيير الصورة<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const url = await uploadImage(file); setF((x) => ({ ...x, photo_url: url })); } catch (err) { toast.error((err as Error).message); } }} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الاسم"><input className={inputCls} value={f.name} onChange={set("name")} maxLength={100} /></Field>
        <Field label="التخصص"><input className={inputCls} value={f.specialty} onChange={set("specialty")} maxLength={120} /></Field>
        <Field label="هاتف تسجيل الدخول"><><input className={inputCls} dir="ltr" value={f.phone} readOnly disabled /><Link to="/account" className="mt-1 block text-xs font-bold text-primary hover:text-teal">تغيير الرقم بعد التحقق منه</Link></></Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">{broker.show_contact ? "بيانات التواصل دي ظاهرة للعملاء حسب اتفاقيتك مع فاليو عقار." : "بيانات التواصل دي مش ظاهرة للعملاء — العملاء بيتواصلوا عن طريق فاليو عقار، والاستفسار بيوصلك كعميل في لوحتك."}</p>
        <Field label="واتساب"><input className={inputCls} dir="ltr" value={f.whatsapp} onChange={set("whatsapp")} maxLength={20} /></Field>
        <Field label="البريد"><input className={inputCls} dir="ltr" value={f.email} onChange={set("email")} maxLength={255} /></Field>
        <Field label="رابط فيسبوك"><input className={inputCls} dir="ltr" value={f.facebook} onChange={set("facebook")} maxLength={300} /></Field>
      </div>
      <Field label="نبذة تعريفية"><textarea className={`${inputCls} h-28 py-2`} value={f.bio} onChange={set("bio")} maxLength={2000} /></Field>
      <div>
        <p className="mb-2 text-sm font-bold text-primary">مناطق العمل</p>
        <AreaPicker value={f.areas} onChange={(areas) => setF({ ...f, areas })} />
      </div>
      <button disabled={busy} onClick={save} className={btnPrimary}>حفظ التغييرات</button>
    </div>
  );
}

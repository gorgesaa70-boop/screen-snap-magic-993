import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Star, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { Stat, Tabs, Field, inputCls, btnPrimary, btnOutline, Avatar } from "@/components/site/ui";
import { AREAS, REVIEW, STAGES, formatPrice, formatDate, type BrokerRow, type PlanRow } from "@/components/site/data";
import { createBrokerAccount, setBrokerActive } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "لوحة الإدارة | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type Tab = "reports" | "brokers" | "review" | "leads" | "plans";

function useAdminData(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-data"], enabled,
    queryFn: async () => {
      const [b, p, l, pl] = await Promise.all([
        supabase.from("brokers").select("*").order("created_at", { ascending: false }),
        supabase.from("properties").select("*").order("updated_at", { ascending: false }),
        supabase.from("leads").select("*, properties(title)").order("created_at", { ascending: false }),
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
  return (
    <DashShell title="لوحة الإدارة" isAdmin>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "reports", label: "التقارير" }, { id: "brokers", label: "الوسطاء" },
        { id: "review", label: `مراجعة العقارات${pending ? ` (${pending})` : ""}` }, { id: "leads", label: "طلبات العملاء" }, { id: "plans", label: "الباقات" },
      ]} />
      {!d ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : (
        <>
          {tab === "reports" && <Reports d={d} />}
          {tab === "brokers" && <BrokersAdmin brokers={d.brokers} plans={d.plans} reload={reload} />}
          {tab === "review" && <ReviewAdmin d={d} reload={reload} />}
          {tab === "leads" && <LeadsAdmin d={d} reload={reload} />}
          {tab === "plans" && <PlansAdmin plans={d.plans} reload={reload} />}
        </>
      )}
    </DashShell>
  );
}

type D = NonNullable<ReturnType<typeof useAdminData>["data"]>;

function Reports({ d }: { d: D }) {
  const by = (s: string) => d.properties.filter((p) => p.review_status === s).length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="الوسطاء النشطون" value={d.brokers.filter((b) => b.is_active).length} hint={`من ${d.brokers.length}`} />
        <Stat label="العقارات المعتمدة" value={by("approved")} hint={`إجمالي ${d.properties.length}`} />
        <Stat label="بانتظار المراجعة" value={by("pending")} />
        <Stat label="العقارات المميزة" value={d.properties.filter((p) => p.is_featured).length} />
        <Stat label="كل الطلبات" value={d.leads.length} />
        <Stat label="طلبات غير موزعة" value={d.leads.filter((l) => !l.assigned_broker_id).length} />
        <Stat label="صفقات مغلقة" value={d.leads.filter((l) => l.stage === "won").length} />
        <Stat label="نسبة الإغلاق" value={`${d.leads.length ? Math.round((d.leads.filter((l) => l.stage === "won").length / d.leads.length) * 100) : 0}%`} />
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-secondary text-primary"><tr>{["الوسيط", "العقارات", "معتمدة", "العملاء", "قيد المتابعة", "مغلقة"].map((h) => <th key={h} className="p-3 text-start font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {d.brokers.map((b) => {
              const P = d.properties.filter((p) => p.broker_id === b.id); const L = d.leads.filter((l) => l.assigned_broker_id === b.id);
              return (
                <tr key={b.id} className="border-t">
                  <td className="p-3 font-bold text-primary">{b.name}{!b.is_active && <span className="ms-2 text-xs text-destructive">موقوف</span>}</td>
                  <td className="p-3">{P.length}</td><td className="p-3">{P.filter((p) => p.review_status === "approved").length}</td>
                  <td className="p-3">{L.length}</td><td className="p-3">{L.filter((l) => !["won", "lost"].includes(l.stage)).length}</td><td className="p-3">{L.filter((l) => l.stage === "won").length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BrokersAdmin({ brokers, plans, reload }: { brokers: BrokerRow[]; plans: PlanRow[]; reload: () => void }) {
  const toggle = useServerFn(setBrokerActive);
  const [showNew, setShowNew] = useState(false);
  return (
    <div className="space-y-3">
      <button onClick={() => setShowNew(!showNew)} className={btnPrimary}>{showNew ? "إغلاق" : "إضافة وسيط / إرسال دعوة"}</button>
      {showNew && <NewBroker plans={plans} onDone={() => { setShowNew(false); reload(); }} />}
      {brokers.map((b) => (
        <div key={b.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={b.name} url={b.photo_url} size="size-12" />
            <div className="min-w-0">
              <p className="truncate font-bold text-primary">{b.name} {b.is_demo && <span className="text-xs text-muted-foreground">(تجريبي)</span>}</p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr">{b.email || (b.user_id ? "" : "بدون حساب دخول")}</p>
            </div>
          </div>
          <select aria-label="الباقة" className={`${inputCls} md:w-48`} value={b.plan_id ?? ""} onChange={async (e) => {
            const { error } = await supabase.from("brokers").update({ plan_id: e.target.value || null }).eq("id", b.id);
            if (error) toast.error(error.message); else { toast.success("تم تحديث الباقة"); reload(); }
          }}>
            <option value="">بدون باقة</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className={b.is_active ? btnOutline : btnPrimary} onClick={async () => {
            const r = await toggle({ data: { brokerId: b.id, active: !b.is_active } });
            if (!r.ok) toast.error(r.error); else { toast.success(b.is_active ? "تم إيقاف الحساب" : "تم تفعيل الحساب"); reload(); }
          }}>{b.is_active ? "إيقاف" : "تفعيل"}</button>
        </div>
      ))}
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
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        {AREAS.map((a) => { const on = f.areas.includes(a); return <button key={a} type="button" onClick={() => setF({ ...f, areas: on ? f.areas.filter((x) => x !== a) : [...f.areas, a] })} className={`h-9 rounded-full border px-3 text-xs font-bold ${on ? "border-primary bg-primary text-primary-foreground" : "text-primary"}`}>{a}</button>; })}
      </div>
      <button disabled={busy} className={`${btnPrimary} sm:col-span-2`}>{busy ? "..." : "حفظ"}</button>
    </form>
  );
}

function ReviewAdmin({ d, reload }: { d: D; reload: () => void }) {
  const [filter, setFilter] = useState("pending");
  const brokerName = (id: string | null) => d.brokers.find((b) => b.id === id)?.name ?? "—";
  const list = d.properties.filter((p) => !filter || p.review_status === filter);
  const upd = async (id: string, patch: Record<string, unknown>, msg: string) => {
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
        <div key={p.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-3 md:flex-row md:items-center">
          <img src={p.image_url || "/demo/p1.jpg"} alt="" loading="lazy" className="h-28 w-full rounded-xl object-cover md:h-20 md:w-28" />
          <div className="min-w-0 flex-1">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${REVIEW[p.review_status].cls}`}>{REVIEW[p.review_status].label}</span>
            <p className="mt-1 truncate font-bold text-primary">{p.title}</p>
            <p className="text-sm text-muted-foreground">{formatPrice(Number(p.price))} ج.م · {p.type} · {p.area} · {brokerName(p.broker_id)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.review_status !== "approved" && <button className={btnPrimary} onClick={() => upd(p.id, { review_status: "approved", review_note: null }, "تم الاعتماد")}><Check className="size-4" />اعتماد</button>}
            {p.review_status !== "rejected" && <button className={btnOutline} onClick={() => { const note = prompt("سبب الرفض (يظهر للوسيط)") ?? ""; upd(p.id, { review_status: "rejected", review_note: note.slice(0, 500) || null }, "تم الرفض"); }}><X className="size-4" />رفض</button>}
            <button aria-label="تمييز" className={`grid size-11 place-items-center rounded-xl border ${p.is_featured ? "bg-teal text-accent-foreground" : "text-primary"}`} onClick={() => upd(p.id, { is_featured: !p.is_featured }, p.is_featured ? "أُلغي التمييز" : "تم التمييز")}><Star className="size-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadsAdmin({ d, reload }: { d: D; reload: () => void }) {
  const [filter, setFilter] = useState<"unassigned" | "all">("unassigned");
  const list = d.leads.filter((l) => filter === "all" || !l.assigned_broker_id);
  const upd = async (id: string, patch: Record<string, unknown>) => {
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
                <p className="font-bold text-primary">{l.name} <span className="text-xs text-muted-foreground">· {l.kind === "inquiry" ? "استفسار" : "طلب"} · {STAGES[l.stage]}</span></p>
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
              <select aria-label="المرحلة" className={inputCls} value={l.stage} onChange={(e) => upd(l.id, { stage: e.target.value })}>
                {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
      <p className="text-sm text-muted-foreground">حدّد عدد العقارات والإعلانات المميزة لكل باقة. الأسعار جاهزة لربط الدفع لاحقًا.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => <PlanCard key={p.id} p={p} reload={reload} />)}
      </div>
    </div>
  );
}

function PlanCard({ p, reload }: { p: PlanRow; reload: () => void }) {
  const [f, setF] = useState({ name: p.name, max_properties: String(p.max_properties), featured_slots: String(p.featured_slots), monthly_price: String(p.monthly_price) });
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <Field label="اسم الباقة"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="الحد الأقصى للعقارات"><input className={inputCls} inputMode="numeric" value={f.max_properties} onChange={(e) => setF({ ...f, max_properties: e.target.value.replace(/\D/g, "") })} /></Field>
      <Field label="الإعلانات المميزة"><input className={inputCls} inputMode="numeric" value={f.featured_slots} onChange={(e) => setF({ ...f, featured_slots: e.target.value.replace(/\D/g, "") })} /></Field>
      <Field label="السعر الشهري (ج.م)"><input className={inputCls} inputMode="numeric" value={f.monthly_price} onChange={(e) => setF({ ...f, monthly_price: e.target.value.replace(/\D/g, "") })} /></Field>
      <button className={`${btnPrimary} w-full`} onClick={async () => {
        const { error } = await supabase.from("plans").update({ name: f.name.trim(), max_properties: Number(f.max_properties || 0), featured_slots: Number(f.featured_slots || 0), monthly_price: Number(f.monthly_price || 0) }).eq("id", p.id);
        if (error) toast.error(error.message); else { toast.success("تم الحفظ"); reload(); }
      }}>حفظ</button>
    </div>
  );
}

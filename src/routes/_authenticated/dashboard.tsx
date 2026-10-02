import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Phone, MessageCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { PropertyForm } from "@/components/dash/PropertyForm";
import { Stat, Tabs, Field, inputCls, btnPrimary, btnOutline, Avatar } from "@/components/site/ui";
import { AREAS, REVIEW, STAGES, formatPrice, formatDate, uploadImage, waLink, type BrokerRow, type PropertyRow } from "@/components/site/data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "لوحة التحكم | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { me, loading, refetch } = useMe();
  if (loading || !me) return <DashShell title="لوحة التحكم"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;

  if (!me.broker) {
    return (
      <DashShell title="لوحة التحكم" isAdmin={me.isAdmin}>
        <div className="max-w-lg rounded-2xl border bg-card p-6">
          {me.isAdmin ? (
            <>
              <ShieldCheck className="size-10 text-teal" />
              <p className="mt-3 font-bold text-primary">أنت مسجّل كمدير للمنصة.</p>
              <Link to="/admin" className={`${btnPrimary} mt-5`}>الذهاب للوحة الإدارة</Link>
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
            <p className="text-sm text-muted-foreground">حسابك غير مرتبط بملف وسيط نشط. تواصل مع إدارة المنصة.</p>
          )}
        </div>
      </DashShell>
    );
  }
  return <BrokerDash broker={me.broker} isAdmin={me.isAdmin} />;
}

type Tab = "overview" | "properties" | "leads" | "profile";

function BrokerDash({ broker, isAdmin }: { broker: BrokerRow; isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");
  const props = useQuery({
    queryKey: ["my-properties", broker.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").eq("broker_id", broker.id).order("updated_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
  const leads = useQuery({
    queryKey: ["my-leads", broker.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*, properties(title)").eq("assigned_broker_id", broker.id).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
  const plan = useQuery({
    queryKey: ["plan", broker.plan_id], enabled: !!broker.plan_id,
    queryFn: async () => (await supabase.from("plans").select("*").eq("id", broker.plan_id!).maybeSingle()).data,
  });
  const P = props.data ?? [];
  const L = leads.data ?? [];
  const count = (s: string) => P.filter((p) => p.review_status === s).length;

  return (
    <DashShell title={`أهلًا، ${broker.name}`} isAdmin={isAdmin}>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "overview", label: "نظرة عامة" }, { id: "properties", label: "عقاراتي" }, { id: "leads", label: "العملاء والطلبات" }, { id: "profile", label: "الملف الشخصي" }]} />
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="كل العقارات" value={P.length} hint={plan.data ? `الحد: ${plan.data.max_properties} (${plan.data.name})` : undefined} />
            <Stat label="معتمدة" value={count("approved")} />
            <Stat label="قيد المراجعة" value={count("pending")} />
            <Stat label="مرفوضة / مسودة" value={count("rejected") + count("draft")} />
            <Stat label="كل العملاء" value={L.length} />
            <Stat label="استفسارات العقارات" value={L.filter((l) => l.kind === "inquiry").length} />
            <Stat label="عملاء جدد" value={L.filter((l) => l.stage === "new").length} />
            <Stat label="صفقات مغلقة" value={L.filter((l) => l.stage === "won").length} />
          </div>
          <Link to="/brokers/$slug" params={{ slug: broker.slug }} className={btnOutline}>عرض ملفي العام</Link>
        </div>
      )}
      {tab === "properties" && <MyProperties brokerId={broker.id} list={P} reload={() => props.refetch()} />}
      {tab === "leads" && <MyLeads list={L} reload={() => leads.refetch()} />}
      {tab === "profile" && <ProfileForm broker={broker} />}
    </DashShell>
  );
}

function MyProperties({ brokerId, list, reload }: { brokerId: string; list: PropertyRow[]; reload: () => void }) {
  const [editing, setEditing] = useState<PropertyRow | null | "new">(null);
  if (editing) return <PropertyForm brokerId={brokerId} initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  return (
    <div className="space-y-3">
      <button onClick={() => setEditing("new")} className={btnPrimary}><Plus className="size-4" />إضافة عقار</button>
      {list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لم تضف أي عقار بعد.</p>}
      {list.map((p) => (
        <div key={p.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
          <img src={p.image_url || "/demo/p1.jpg"} alt="" loading="lazy" className="h-28 w-full rounded-xl object-cover sm:h-20 sm:w-28" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${REVIEW[p.review_status].cls}`}>{REVIEW[p.review_status].label}</span>
              {p.is_featured && <span className="rounded-full bg-teal px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">مميز</span>}
            </div>
            <p className="mt-1 truncate font-bold text-primary">{p.title}</p>
            <p className="text-sm text-muted-foreground">{formatPrice(Number(p.price))} ج.م · {p.type} · {p.area}</p>
            {p.review_status === "rejected" && p.review_note && <p className="mt-1 text-xs text-destructive">{p.review_note}</p>}
          </div>
          <div className="flex gap-2">
            {p.review_status === "draft" && <button className={btnOutline} onClick={async () => { const { error } = await supabase.from("properties").update({ review_status: "pending" }).eq("id", p.id); if (error) toast.error(error.message); else { toast.success("أُرسل للمراجعة"); reload(); } }}>إرسال</button>}
            <button aria-label="تعديل" onClick={() => setEditing(p)} className="grid size-11 place-items-center rounded-xl border text-primary hover:bg-secondary"><Pencil className="size-4" /></button>
            <button aria-label="حذف" onClick={async () => { if (!confirm("حذف العقار؟")) return; const { error } = await supabase.from("properties").delete().eq("id", p.id); if (error) toast.error(error.message); else reload(); }} className="grid size-11 place-items-center rounded-xl border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

type LeadWithProp = { id: string; name: string; phone: string; kind: string; details: string | null; property_type: string | null; area: string | null; budget: number | null; stage: string; notes: string | null; created_at: string; properties: { title: string } | null };

function LeadCard({ l, onStage, onNotes, extra }: { l: LeadWithProp; onStage: (s: string) => void; onNotes?: (n: string) => void; extra?: React.ReactNode }) {
  const [notes, setNotes] = useState(l.notes ?? "");
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">{l.name} <span className="text-xs font-semibold text-muted-foreground">· {l.kind === "inquiry" ? "استفسار عقار" : "طلب عقار"}</span></p>
          <p className="text-xs text-muted-foreground">{formatDate(l.created_at)}</p>
        </div>
        <select aria-label="مرحلة المتابعة" value={l.stage} onChange={(e) => onStage(e.target.value)} className={`${inputCls} h-10 w-auto`}>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="mt-2 space-y-1 text-sm text-foreground/80">
        {l.properties?.title && <p>العقار: {l.properties.title}</p>}
        {(l.property_type || l.area || l.budget) && <p>{[l.property_type, l.area, l.budget ? `${formatPrice(Number(l.budget))} ج.م` : null].filter(Boolean).join(" · ")}</p>}
        {l.details && <p className="whitespace-pre-line">{l.details}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${l.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary" dir="ltr"><Phone className="size-4" />{l.phone}</a>
        <a href={waLink(l.phone, `مرحبًا ${l.name}، معك وسيط فاليو عقار`)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-whatsapp px-3 text-sm font-bold text-primary-foreground"><MessageCircle className="size-4" />واتساب</a>
        {extra}
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
  if (list.length === 0) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا يوجد عملاء مسندون إليك حاليًا.</p>;
  return <div className="grid gap-3 lg:grid-cols-2">{list.map((l) => <LeadCard key={l.id} l={l} onStage={(s) => upd(l.id, { stage: s })} onNotes={(n) => upd(l.id, { notes: n })} />)}</div>;
}

function ProfileForm({ broker }: { broker: BrokerRow }) {
  const [f, setF] = useState({ name: broker.name, specialty: broker.specialty ?? "", bio: broker.bio ?? "", phone: broker.phone ?? "", whatsapp: broker.whatsapp ?? "", email: broker.email ?? "", facebook: broker.facebook ?? "", photo_url: broker.photo_url ?? "", areas: broker.areas });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    if (f.name.trim().length < 2) { toast.error("الاسم مطلوب"); return; }
    if (f.facebook && !/^https?:\/\//.test(f.facebook)) { toast.error("رابط فيسبوك غير صحيح"); return; }
    setBusy(true);
    const { error } = await supabase.from("brokers").update({ ...f, name: f.name.trim().slice(0, 100), bio: f.bio.slice(0, 2000) }).eq("id", broker.id);
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
        <Field label="الهاتف"><input className={inputCls} dir="ltr" value={f.phone} onChange={set("phone")} maxLength={20} /></Field>
        <Field label="واتساب"><input className={inputCls} dir="ltr" value={f.whatsapp} onChange={set("whatsapp")} maxLength={20} /></Field>
        <Field label="البريد"><input className={inputCls} dir="ltr" value={f.email} onChange={set("email")} maxLength={255} /></Field>
        <Field label="رابط فيسبوك"><input className={inputCls} dir="ltr" value={f.facebook} onChange={set("facebook")} maxLength={300} /></Field>
      </div>
      <Field label="نبذة تعريفية"><textarea className={`${inputCls} h-28 py-2`} value={f.bio} onChange={set("bio")} maxLength={2000} /></Field>
      <div>
        <p className="mb-2 text-sm font-bold text-primary">مناطق العمل</p>
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => { const on = f.areas.includes(a); return (
            <button key={a} type="button" onClick={() => setF({ ...f, areas: on ? f.areas.filter((x) => x !== a) : [...f.areas, a] })} className={`h-10 rounded-full border px-4 text-sm font-bold transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{a}</button>
          ); })}
        </div>
      </div>
      <button disabled={busy} onClick={save} className={btnPrimary}>حفظ التغييرات</button>
    </div>
  );
}

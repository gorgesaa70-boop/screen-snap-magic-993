import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, BadgeCheck, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Field, Stat, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { cleanPhone } from "@/lib/phone";
import { PROVIDER_KIND, PROVIDER_STATUS, SERVICE_CATEGORIES, SERVICE_REQUEST_STATUS, formatDate, formatPrice, serviceRequestNo } from "@/components/site/data";

type Provider = Tables<"service_providers">;
type Plan = Tables<"service_plans">;
export type ServicesTab = "svc_requests" | "svc_providers" | "svc_plans";

const useProviders = () => useQuery({
  queryKey: ["svc-providers"],
  queryFn: async () => { const { data, error } = await supabase.from("service_providers").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; },
});
const usePlans = () => useQuery({ queryKey: ["svc-plans-admin"], queryFn: async () => (await supabase.from("service_plans").select("*").order("sort_order")).data ?? [] });

/** Admin «الخدمات»: customer service requests, registered providers (join requests included) and provider plans. */
export function ServicesAdmin({ tab }: { tab: ServicesTab }) {
  if (tab === "svc_providers") return <ProvidersAdmin />;
  if (tab === "svc_plans") return <PlansAdmin />;
  return <RequestsAdmin />;
}

function RequestsAdmin() {
  const q = useQuery({
    queryKey: ["svc-requests"],
    queryFn: async () => { const { data, error } = await supabase.from("service_requests").select("*").order("created_at", { ascending: false }).limit(500); if (error) throw error; return data; },
  });
  const providers = useProviders();
  const [status, setStatus] = useState("");
  const [cat, setCat] = useState("");
  const list = (q.data ?? []).filter((r) => (!status || r.status === status) && (!cat || r.category === cat));
  const count = (s: string) => (q.data ?? []).filter((r) => r.status === s).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="جديد" value={formatPrice(count("new"))} />
        <Stat label="اتحوّل لمقدم خدمة" value={formatPrice(count("assigned"))} />
        <Stat label="اتنفّذ" value={formatPrice(count("done"))} />
        <Stat label="كل الطلبات" value={formatPrice(q.data?.length ?? 0)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="الحالة" className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>{Object.entries(SERVICE_REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select aria-label="الخدمة" className={`${inputCls} w-auto`} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">كل الخدمات</option>{Object.entries(SERVICE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!q.isLoading && list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش طلبات خدمات.</p>}
      {list.map((r) => <RequestRow key={r.id} r={r} providers={(providers.data ?? []).filter((p) => p.status === "approved" && p.category === r.category)} onChanged={() => q.refetch()} />)}
    </div>
  );
}

function RequestRow({ r, providers, onChanged }: { r: Tables<"service_requests">; providers: Provider[]; onChanged: () => void }) {
  const [notes, setNotes] = useState(r.notes ?? "");
  async function save(patch: Partial<Tables<"service_requests">>, ok = "اتحفظ") {
    const { error } = await supabase.from("service_requests").update(patch).eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success(ok); onChanged(); }
  }
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">{r.name} <span className="text-xs font-semibold text-muted-foreground">· {SERVICE_CATEGORIES[r.category]}</span></p>
          <p className="text-xs text-muted-foreground"><span dir="ltr">{serviceRequestNo(r.request_no)}</span> · {formatDate(r.created_at)}</p>
        </div>
        <select aria-label="الحالة" className={`${inputCls} h-10 w-auto text-xs`} value={r.status} onChange={(e) => save({ status: e.target.value })}>
          {Object.entries(SERVICE_REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {r.details && <p className="mt-2 text-sm whitespace-pre-line text-foreground/80">{r.details}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={`tel:${r.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary" dir="ltr"><Phone className="size-4" />{r.phone}</a>
        <select aria-label="حوّل لمقدم خدمة" className={`${inputCls} h-10 w-auto min-w-48 text-xs`} value={r.assigned_provider_id ?? ""} onChange={(e) => e.target.value && save({ assigned_provider_id: e.target.value }, "اتحوّل، ووصل إشعار لمقدم الخدمة وللإدارة")}>
          <option value="">{providers.length ? "حوّل لمقدم خدمة…" : "مفيش مقدمين خدمة معتمدين في الخدمة دي"}</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.verified ? " ✓" : ""}{p.areas.length ? ` — ${p.areas.slice(0, 2).join("، ")}` : ""}</option>)}
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <input className={inputCls} placeholder="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        <button className={btnOutline} onClick={() => save({ notes: notes.trim() || null })}>حفظ</button>
      </div>
    </div>
  );
}

function ProvidersAdmin() {
  const q = useProviders();
  const plans = usePlans();
  const [status, setStatus] = useState("");
  const [cat, setCat] = useState("");
  const [adding, setAdding] = useState(false);
  const list = (q.data ?? []).filter((p) => (!status || p.status === status) && (!cat || p.category === cat));
  const pending = (q.data ?? []).filter((p) => p.status === "pending").length;
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted-foreground">الشركات والفنيين اللي سجّلوا من صفحة الخدمات بيوصلوا هنا «قيد المراجعة». بعد الاعتماد بيدخلوا برقم موبايلهم على لوحتهم، وتقدر تحوّل لهم طلبات وتفعّل لهم باقة.</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setAdding(!adding)} className={btnPrimary}><Plus className="size-4" />إضافة مقدم خدمة</button>
        <select aria-label="الحالة" className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات{pending ? ` (${pending} مستني)` : ""}</option>{Object.entries(PROVIDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select aria-label="الخدمة" className={`${inputCls} w-auto`} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">كل الخدمات</option>{Object.entries(SERVICE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {adding && <AddProvider onDone={() => { setAdding(false); q.refetch(); }} />}
      {!q.isLoading && list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش مقدمين خدمة.</p>}
      {list.map((p) => <ProviderRow key={p.id} p={p} plans={plans.data ?? []} onChanged={() => q.refetch()} />)}
    </div>
  );
}

function AddProvider({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ kind: "technician", category: "crafts", name: "", phone: "", specialty: "" });
  async function add() {
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error("اكتب الاسم ورقم موبايل صحيح"); return; }
    const { error } = await supabase.from("service_providers").insert({ kind: f.kind, category: f.category, name: f.name.trim(), phone, specialty: f.specialty.trim() || null, status: "approved" });
    if (error) toast.error(error.code === "23505" ? "الرقم ده مسجّل قبل كده" : error.message); else { toast.success("اتضاف ومعتمد — يقدر يدخل برقمه"); onDone(); }
  }
  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
      <Field label="النوع"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(PROVIDER_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="الخدمة"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(SERVICE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="التخصص"><input className={inputCls} value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} maxLength={120} /></Field>
      <Field label="الاسم"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Field>
      <Field label="الموبايل"><input className={inputCls} dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} /></Field>
      <div className="flex items-end"><button onClick={add} className={btnPrimary}>إضافة</button></div>
    </div>
  );
}

function ProviderRow({ p, plans, onChanged }: { p: Provider; plans: Plan[]; onChanged: () => void }) {
  const [sub, setSub] = useState({ plan: "", months: "1" });
  const plan = plans.find((x) => x.id === p.plan_id);
  async function update(patch: Partial<Provider>, ok: string) {
    const { error } = await supabase.from("service_providers").update(patch).eq("id", p.id);
    if (error) toast.error(error.message); else { toast.success(ok); onChanged(); }
  }
  async function activate() {
    if (!sub.plan) return;
    const ends = new Date(); ends.setMonth(ends.getMonth() + Number(sub.months));
    const { error } = await supabase.from("service_subscriptions").insert({ provider_id: p.id, plan_id: sub.plan, ends_at: ends.toISOString() });
    if (error) toast.error(error.message); else { toast.success("الباقة اتفعّلت، ووصل إشعار لمقدم الخدمة"); setSub({ plan: "", months: "1" }); onChanged(); }
  }
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PROVIDER_STATUS[p.status]?.cls}`}>{PROVIDER_STATUS[p.status]?.label}</span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">{PROVIDER_KIND[p.kind]} · {SERVICE_CATEGORIES[p.category]}</span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">باقة {plan?.name ?? "مجانية"}{p.plan_ends_at ? ` لحد ${formatDate(p.plan_ends_at)}` : ""}</span>
            {p.verified && <span className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground"><BadgeCheck className="size-3" />موثّق</span>}
          </div>
          <p className="mt-1 font-bold text-primary">{p.name}{p.contact_person ? <span className="text-xs font-semibold text-muted-foreground"> · {p.contact_person}</span> : null}</p>
          <p className="text-xs text-muted-foreground"><span dir="ltr">{p.phone}</span>{p.specialty ? ` · ${p.specialty}` : ""}{p.areas.length ? ` · ${p.areas.join("، ")}` : ""} · سجّل {formatDate(p.created_at)}</p>
          {p.review_note && <p className="mt-1 text-xs text-destructive">ملاحظة: {p.review_note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status !== "approved" && <button className={btnPrimary} onClick={() => update({ status: "approved", review_note: null }, "اتعتمد، ووصله إشعار")}>اعتماد</button>}
          {p.status === "pending" && <button className={btnOutline} onClick={() => { const note = prompt("سبب الرفض (بيوصل لمقدم الخدمة):") ?? ""; update({ status: "rejected", review_note: note.trim().slice(0, 500) || null }, "اترفض"); }}>رفض</button>}
          {p.status === "approved" && <button className={btnOutline} onClick={() => { const note = prompt("سبب الإيقاف:") ?? ""; update({ status: "suspended", review_note: note.trim().slice(0, 500) || null }, "اتوقف"); }}>إيقاف</button>}
          <button className={btnOutline} onClick={() => update({ verified: !p.verified }, p.verified ? "اتشالت علامة التوثيق" : "اتوثّق")}>{p.verified ? "شيل التوثيق" : "توثيق"}</button>
        </div>
      </div>
      {p.status === "approved" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs font-bold text-primary">تفعيل باقة:</span>
          <select aria-label="الباقة" className={`${inputCls} h-10 w-auto text-xs`} value={sub.plan} onChange={(e) => setSub({ ...sub, plan: e.target.value })}>
            <option value="">اختار الباقة</option>{plans.filter((x) => x.code !== "free").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select aria-label="المدة" className={`${inputCls} h-10 w-auto text-xs`} value={sub.months} onChange={(e) => setSub({ ...sub, months: e.target.value })}>
            {[["1", "شهر"], ["3", "3 شهور"], ["6", "6 شهور"], ["12", "سنة"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button disabled={!sub.plan} onClick={activate} className={`${btnOutline} h-10`}>تفعيل</button>
        </div>
      )}
    </div>
  );
}

function PlansAdmin() {
  const q = usePlans();
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted-foreground">باقات مقدمي الخدمة منفصلة عن باقات الوسطاء. السعر الفاضي بيظهر «السعر قريبًا». لحد ما الدفع الأونلاين يشتغل، الباقة بتتفعّل من «مقدمين الخدمة».</p>
      <div className="grid gap-3 md:grid-cols-3">{q.data?.map((p) => <PlanEditor key={p.id} p={p} onSaved={() => q.refetch()} />)}</div>
    </div>
  );
}

function PlanEditor({ p, onSaved }: { p: Plan; onSaved: () => void }) {
  const [f, setF] = useState({ name: p.name, monthly: p.monthly_price != null ? String(p.monthly_price) : "", yearly: p.yearly_price != null ? String(p.yearly_price) : "", features: p.features.join("\n"), active: p.is_active });
  async function save() {
    const { error } = await supabase.from("service_plans").update({
      name: f.name.trim().slice(0, 60), monthly_price: f.monthly === "" ? null : Number(f.monthly), yearly_price: f.yearly === "" ? null : Number(f.yearly),
      features: f.features.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 15), is_active: f.active,
    }).eq("id", p.id);
    if (error) toast.error(error.message); else { toast.success("اتحفظت الباقة"); onSaved(); }
  }
  const digits = (v: string) => v.replace(/\D/g, "");
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-4">
      <Field label="اسم الباقة"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} /></Field>
      {p.code !== "free" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="شهري (ج.م)"><input className={inputCls} inputMode="numeric" placeholder="قريبًا" value={f.monthly} onChange={(e) => setF({ ...f, monthly: digits(e.target.value) })} /></Field>
          <Field label="سنوي (ج.م)"><input className={inputCls} inputMode="numeric" placeholder="قريبًا" value={f.yearly} onChange={(e) => setF({ ...f, yearly: digits(e.target.value) })} /></Field>
        </div>
      )}
      <Field label="المميزات (كل سطر ميزة)"><textarea className={`${inputCls} h-32 py-2 text-sm`} value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm font-bold text-primary"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />ظاهرة لمقدمي الخدمة</label>
      <button onClick={save} className={btnPrimary}>حفظ</button>
    </div>
  );
}

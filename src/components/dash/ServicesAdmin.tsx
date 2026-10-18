import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Plus, BadgeCheck, Phone, RefreshCw, Timer, ExternalLink, Eye, EyeOff, Pencil } from "lucide-react";
import { DeleteAccountButton, DeleteButton } from "@/components/dash/ManageActions";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { Field, Stat, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { cleanPhone } from "@/lib/phone";
import { PROVIDER_KIND, PROVIDER_STATUS, SERVICE_CATEGORIES, SERVICE_REQUEST_STATUS, formatDate, formatPrice, serviceRequestNo, starsText } from "@/components/site/data";

type Provider = Tables<"service_providers">;
type Plan = Tables<"service_plans">;
export type ServicesTab = "svc_requests" | "svc_providers" | "svc_plans" | "svc_reviews";

const useProviders = () => useQuery({
  queryKey: ["svc-providers"],
  queryFn: async () => { const { data, error } = await supabase.from("service_providers").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; },
});
const usePlans = () => useQuery({ queryKey: ["svc-plans-admin"], queryFn: async () => (await supabase.from("service_plans").select("*").order("sort_order")).data ?? [] });

/** Admin «الخدمات»: customer service requests, registered providers (join requests included) and provider plans. */
export function ServicesAdmin({ tab }: { tab: ServicesTab }) {
  // Before release 19 is applied the tables don't exist yet: say so instead of showing empty lists.
  const ready = useQuery({ queryKey: ["svc-ready"], queryFn: async () => { const { error } = await supabase.from("service_plans").select("id").limit(1); return !(error && (error.code === "PGRST205" || error.code === "42P01")); } });
  if (ready.data === false) return <p className="max-w-2xl rounded-2xl border border-dashed bg-card p-6 text-sm text-muted-foreground">قسم الخدمات محتاج تحديث قاعدة البيانات (إصدار 19) عشان يشتغل. لحد ما يتطبق، طلبات صفحة الخدمات بتتسجل في «طلبات العملاء» باسم «طلب خدمة»، وبتتنقل هنا لوحدها بعد التحديث.</p>;
  if (tab === "svc_providers") return <ProvidersAdmin />;
  if (tab === "svc_plans") return <PlansAdmin />;
  if (tab === "svc_reviews") return <ReviewsAdmin />;
  return <RequestsAdmin />;
}

function RequestsAdmin() {
  const q = useQuery({
    queryKey: ["svc-requests"],
    queryFn: async () => {
      // Offers whose 2 hours are over move on first (in case the scheduler is off).
      await supabase.rpc("run_service_offers");
      const { data, error } = await supabase.from("service_requests").select("*").order("created_at", { ascending: false }).limit(500); if (error) throw error; return data;
    },
  });
  const providers = useProviders();
  const [status, setStatus] = useState("");
  const [cat, setCat] = useState("");
  const list = (q.data ?? []).filter((r) => (!status || (status === "manual" ? r.needs_manual && !r.assigned_provider_id : status === "offered" ? !!r.offer_provider_id : r.status === status)) && (!cat || r.category === cat));
  const manual = (q.data ?? []).filter((r) => r.needs_manual && !r.assigned_provider_id).length;
  const count = (s: string) => (q.data ?? []).filter((r) => r.status === s).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="محتاج توزيع يدوي" value={formatPrice(manual)} hint={manual ? "مفيش مقدم خدمة متاح في التخصص والمنطقة" : undefined} />
        <Stat label="اتحوّل لمقدم خدمة" value={formatPrice(count("assigned"))} />
        <Stat label="اتنفّذ" value={formatPrice(count("done"))} />
        <Stat label="كل الطلبات" value={formatPrice(q.data?.length ?? 0)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="الحالة" className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option><option value="manual">محتاج توزيع يدوي</option><option value="offered">معروض على مقدم خدمة</option>{Object.entries(SERVICE_REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select aria-label="الخدمة" className={`${inputCls} w-auto`} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">كل الخدمات</option>{Object.entries(SERVICE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!q.isLoading && list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش طلبات خدمات.</p>}
      {list.map((r) => <RequestRow key={r.id} r={r} all={providers.data ?? []} providers={(providers.data ?? []).filter((p) => p.status === "approved" && p.category === r.category)} onChanged={() => q.refetch()} />)}
    </div>
  );
}

function RequestRow({ r, all, providers, onChanged }: { r: Tables<"service_requests">; all: Provider[]; providers: Provider[]; onChanged: () => void }) {
  const name = (id: string | null) => all.find((p) => p.id === id)?.name ?? "مقدم خدمة";
  const [notes, setNotes] = useState(r.notes ?? "");
  const [edit, setEdit] = useState<{ name: string; phone: string; details: string; area: string } | null>(null);
  async function save(patch: TablesUpdate<"service_requests">, ok = "اتحفظ") {
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
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
        {r.area && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-primary">{r.area}</span>}
        {r.target_provider_id && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-primary">العميل اختار: {name(r.target_provider_id)}</span>}
        {r.offer_provider_id && r.offer_expires_at && <span className="inline-flex items-center gap-1 rounded-full bg-[#f2b84b]/20 px-2.5 py-0.5 text-primary"><Timer className="size-3" />معروض على {name(r.offer_provider_id)} لحد {new Date(r.offer_expires_at).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })}</span>}
        {r.needs_manual && !r.assigned_provider_id && <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-destructive">محتاج توزيع يدوي</span>}
        {(r.declined_provider_ids ?? []).length > 0 && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground" title={r.declined_provider_ids.map(name).join("، ")}>اعتذر أو ماردّش: {(r.declined_provider_ids ?? []).length}</span>}
        {r.assigned_provider_id && <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-primary">مع: {name(r.assigned_provider_id)}{r.accepted_at ? ` من ${formatDate(r.accepted_at)}` : ""}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!r.assigned_provider_id && !["done", "closed"].includes(r.status) && (
          <button className={`${btnOutline} h-10`} title="يبدأ التوزيع التلقائي من الأول، وكل اللي اعتذروا ياخدوا فرصة تانية" onClick={async () => {
            const { data, error } = await supabase.rpc("reroute_service_request", { _req: r.id });
            if (error) toast.error(error.message); else { toast.success(data ? `اتعرض على ${name(data)}` : "مفيش مقدم خدمة متاح — حوّله بإيدك"); onChanged(); }
          }}><RefreshCw className="size-4" />وزّع تلقائي</button>
        )}
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
      {edit ? (
        <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
          <Field label="اسم طالب الخدمة"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={100} /></Field>
          <Field label="الموبايل"><input dir="ltr" className={inputCls} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="المنطقة"><input className={inputCls} value={edit.area} onChange={(e) => setEdit({ ...edit, area: e.target.value })} maxLength={60} /></Field>
          <div className="sm:col-span-2"><Field label="تفاصيل الطلب"><textarea className={`${inputCls} h-20 py-2`} value={edit.details} onChange={(e) => setEdit({ ...edit, details: e.target.value })} maxLength={2000} /></Field></div>
          <div className="flex gap-2 sm:col-span-2">
            <button className={btnPrimary} onClick={async () => { const ph = cleanPhone(edit.phone); if (edit.name.trim().length < 2 || !ph) { toast.error("اكتب الاسم ورقم صحيح"); return; } await save({ name: edit.name.trim(), phone: ph, area: edit.area.trim() || null, details: edit.details.trim() || null }, "اتحفظت بيانات الطلب"); setEdit(null); }}>حفظ</button>
            <button className="h-11 px-4 text-sm font-bold text-muted-foreground" onClick={() => setEdit(null)}>إلغاء</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={`${btnOutline} h-10`} onClick={() => setEdit({ name: r.name, phone: r.phone, details: r.details ?? "", area: r.area ?? "" })}><Pencil className="size-4" />تعديل الطلب</button>
          <DeleteButton kind="service_request" id={r.id} name={`طلب ${r.name}`} onDone={onChanged} />
          {r.customer_id && <DeleteAccountButton userId={r.customer_id} name={r.name} onDone={onChanged} />}
        </div>
      )}
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
  const [edit, setEdit] = useState<{ name: string; phone: string; contact_person: string; specialty: string; areas: string } | null>(null);
  const plan = plans.find((x) => x.id === p.plan_id);
  async function update(patch: TablesUpdate<"service_providers">, ok: string) {
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
          {p.status === "approved" && <Link to="/services/$id" params={{ id: p.id }} className={btnOutline}><ExternalLink className="size-4" />الملف العام</Link>}
          <button className={btnOutline} onClick={() => setEdit({ name: p.name, phone: p.phone, contact_person: p.contact_person ?? "", specialty: p.specialty ?? "", areas: p.areas.join("، ") })}><Pencil className="size-4" />تعديل</button>
          <DeleteButton kind="service_provider" id={p.id} name={p.name} extra="لو عليه طلبات أو باقة، هيتوقف بدل ما يتمسح." onDone={onChanged} />
          {p.user_id && <DeleteAccountButton userId={p.user_id} name={p.name} onDone={onChanged} />}
        </div>
      </div>
      {edit && (
        <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
          <Field label="الاسم"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={120} /></Field>
          <Field label="الموبايل"><input dir="ltr" className={inputCls} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="المسؤول"><input className={inputCls} value={edit.contact_person} onChange={(e) => setEdit({ ...edit, contact_person: e.target.value })} maxLength={100} /></Field>
          <Field label="التخصص"><input className={inputCls} value={edit.specialty} onChange={(e) => setEdit({ ...edit, specialty: e.target.value })} maxLength={120} /></Field>
          <div className="sm:col-span-2"><Field label="المناطق (مفصولة بـ «،»)"><input className={inputCls} value={edit.areas} onChange={(e) => setEdit({ ...edit, areas: e.target.value })} /></Field></div>
          <div className="flex gap-2 sm:col-span-2">
            <button className={btnPrimary} onClick={async () => { const ph = cleanPhone(edit.phone); if (edit.name.trim().length < 2 || !ph) { toast.error("اكتب الاسم ورقم صحيح"); return; } await update({ name: edit.name.trim(), phone: ph, contact_person: edit.contact_person.trim() || null, specialty: edit.specialty.trim() || null, areas: edit.areas.split(/[،,]/).map((x) => x.trim()).filter(Boolean).slice(0, 20) }, "اتحفظت بيانات مقدم الخدمة"); setEdit(null); }}>حفظ</button>
            <button className="h-11 px-4 text-sm font-bold text-muted-foreground" onClick={() => setEdit(null)}>إلغاء</button>
          </div>
        </div>
      )}
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
      <p className="max-w-3xl text-sm text-muted-foreground">باقات مقدمي الخدمة منفصلة عن باقات الوسطاء. «طلبات في الشهر» فاضية = من غير حد. الأولوية الأعلى بتاخد الطلبات الأول وبتظهر الأول في الدليل. السعر الفاضي بيظهر «السعر قريبًا». لحد ما الدفع الأونلاين يشتغل، الباقة بتتفعّل من «مقدمين الخدمة».</p>
      <div className="grid gap-3 md:grid-cols-3">{q.data?.map((p) => <PlanEditor key={p.id} p={p} onSaved={() => q.refetch()} />)}</div>
    </div>
  );
}

function PlanEditor({ p, onSaved }: { p: Plan; onSaved: () => void }) {
  const [f, setF] = useState({ name: p.name, monthly: p.monthly_price != null ? String(p.monthly_price) : "", yearly: p.yearly_price != null ? String(p.yearly_price) : "", features: p.features.join("\n"), active: p.is_active,
    requests: p.monthly_requests != null ? String(p.monthly_requests) : "", priority: String(p.priority ?? 0), photos: String(p.max_photos ?? 6) });
  async function save() {
    const { error } = await supabase.from("service_plans").update({
      name: f.name.trim().slice(0, 60), monthly_price: f.monthly === "" ? null : Number(f.monthly), yearly_price: f.yearly === "" ? null : Number(f.yearly),
      features: f.features.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 15), is_active: f.active,
      monthly_requests: f.requests === "" ? null : Number(f.requests), priority: Math.min(100, Number(f.priority || 0)), max_photos: Math.min(100, Number(f.photos || 0)),
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
      <div className="grid grid-cols-3 gap-2">
        <Field label="طلبات في الشهر"><input className={inputCls} inputMode="numeric" placeholder="من غير حد" value={f.requests} onChange={(e) => setF({ ...f, requests: digits(e.target.value) })} /></Field>
        <Field label="الأولوية"><input className={inputCls} inputMode="numeric" value={f.priority} onChange={(e) => setF({ ...f, priority: digits(e.target.value).slice(0, 3) })} /></Field>
        <Field label="صور الشغل"><input className={inputCls} inputMode="numeric" value={f.photos} onChange={(e) => setF({ ...f, photos: digits(e.target.value).slice(0, 3) })} /></Field>
      </div>
      <Field label="مميزات إضافية (كل سطر ميزة)"><textarea className={`${inputCls} h-32 py-2 text-sm`} value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm font-bold text-primary"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />ظاهرة لمقدمي الخدمة</label>
      <div className="flex flex-wrap gap-2">
        <button onClick={save} className={btnPrimary}>حفظ</button>
        {p.code !== "free" && <DeleteButton kind="service_plan" id={p.id} name={p.name} extra="لو فيه مشتركين عليها، هتتقفل للجديد بس." onDone={onSaved} />}
      </div>
    </div>
  );
}

/** Customers' ratings of providers: the admin hides abusive ones (hidden ones leave the profile and the average). */
function ReviewsAdmin() {
  const q = useQuery({ queryKey: ["svc-reviews"], queryFn: async () => (await supabase.from("service_reviews").select("*").order("created_at", { ascending: false }).limit(300)).data ?? [] });
  const providers = useProviders();
  const name = (id: string) => providers.data?.find((p) => p.id === id)?.name ?? "";
  if (!q.isLoading && !q.data?.length) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش تقييمات. العميل بيقيّم بعد ما مقدم الخدمة يخلّص طلبه.</p>;
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-sm text-muted-foreground">التقييمات من العملاء اللي طلبهم اتنفّذ بس (تقييم واحد لكل طلب). خبّي أي تقييم مسيء أو فيه بيانات شخصية.</p>
      {q.data?.map((r) => (
        <div key={r.id} className={`rounded-2xl border bg-card p-4 ${r.hidden ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-primary">{name(r.provider_id)} <span className="text-[#f2b84b]">{starsText(r.stars)}</span> <span className="text-xs font-semibold text-muted-foreground">· {r.customer_name} · {formatDate(r.created_at)}</span></p>
            <button className={btnOutline} onClick={async () => { const { error } = await supabase.from("service_reviews").update({ hidden: !r.hidden }).eq("id", r.id); if (error) toast.error(error.message); else { toast.success(r.hidden ? "التقييم رجع يظهر" : "التقييم اتخبّى"); q.refetch(); } }}>
              {r.hidden ? <><Eye className="size-4" />إظهار</> : <><EyeOff className="size-4" />إخفاء</>}
            </button>
          </div>
          {r.comment && <p className="mt-2 text-sm text-foreground/80">{r.comment}</p>}
          {r.reply && <p className="mt-2 rounded-xl bg-secondary p-3 text-sm text-foreground/80"><span className="font-bold text-primary">رد مقدم الخدمة: </span>{r.reply}</p>}
        </div>
      ))}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, MessageCircle, BadgeCheck, Clock, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { DashShell } from "@/components/dash/DashShell";
import { Stat, Tabs, Field, inputCls, btnPrimary, btnOutline, Avatar } from "@/components/site/ui";
import { AreaPicker } from "@/components/site/AreaPicker";
import { PROVIDER_KIND, PROVIDER_STATUS, SERVICE_CATEGORIES, SERVICE_REQUEST_STATUS, formatDate, formatPrice, serviceRequestNo, uploadImage, waLink } from "@/components/site/data";

type Provider = Tables<"service_providers">;
type Tab = "requests" | "plan" | "profile";

/** Dashboard of a service provider (company or technician): requests Value Aqar sends them, their plan, their profile. */
export function ProviderHome({ provider, refetch }: { provider: Provider; refetch: () => void }) {
  const [tab, setTab] = useState<Tab>("requests");
  const approved = provider.status === "approved";
  const reqs = useQuery({
    queryKey: ["provider-requests", provider.id], enabled: approved,
    queryFn: async () => { const { data, error } = await supabase.from("service_requests").select("*").eq("assigned_provider_id", provider.id).order("created_at", { ascending: false }); if (error) throw error; return data; },
  });
  const R = reqs.data ?? [];
  return (
    <DashShell title={`أهلًا، ${provider.name}`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-teal-soft px-3 py-1 text-xs font-bold text-primary">{PROVIDER_KIND[provider.kind]} · {SERVICE_CATEGORIES[provider.category]}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${PROVIDER_STATUS[provider.status]?.cls}`}>{PROVIDER_STATUS[provider.status]?.label}</span>
        {provider.verified && <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"><BadgeCheck className="size-3.5" />معتمد من فاليو عقار</span>}
      </div>
      {provider.status === "pending" && <p className="mb-4 flex items-start gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground"><Clock className="mt-0.5 size-4 shrink-0 text-teal" />طلب انضمامك قيد المراجعة من فاليو عقار. كمّل ملفك دلوقتي، وأول ما يتعتمد هيوصلك إشعار والطلبات هتبدأ توصلك.</p>}
      {provider.status === "rejected" && <p className="mb-4 rounded-2xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">طلب الانضمام ما اتقبلش{provider.review_note ? `: ${provider.review_note}` : "."} لو عندك استفسار كلّم فاليو عقار.</p>}
      {provider.status === "suspended" && <p className="mb-4 rounded-2xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">حسابك موقوف من الإدارة{provider.review_note ? `: ${provider.review_note}` : "."}</p>}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "requests", label: `الطلبات${R.filter((r) => r.status === "assigned").length ? ` (${R.filter((r) => r.status === "assigned").length})` : ""}` },
        { id: "plan", label: "باقتي" },
        { id: "profile", label: "ملفي" },
      ]} />
      {tab === "requests" && (
        !approved ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">الطلبات بتبدأ توصلك بعد اعتماد حسابك.</p> : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="طلبات جديدة" value={formatPrice(R.filter((r) => r.status === "assigned").length)} />
              <Stat label="اتنفّذت" value={formatPrice(R.filter((r) => r.status === "done").length)} />
              <Stat label="كل الطلبات" value={formatPrice(R.length)} />
            </div>
            {!reqs.isLoading && R.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش طلبات اتحولت ليك. أول ما فاليو عقار تحوّلك طلب هيوصلك إشعار.</p>}
            {R.map((r) => <RequestCard key={r.id} r={r} onChanged={() => reqs.refetch()} />)}
          </div>
        )
      )}
      {tab === "plan" && <ProviderPlan provider={provider} />}
      {tab === "profile" && <ProviderProfile provider={provider} onSaved={refetch} />}
    </DashShell>
  );
}

function RequestCard({ r, onChanged }: { r: Tables<"service_requests">; onChanged: () => void }) {
  const [notes, setNotes] = useState(r.notes ?? "");
  async function save(patch: { status?: string; notes?: string | null }) {
    const { error } = await supabase.from("service_requests").update(patch).eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success("اتحفظ"); onChanged(); }
  }
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">{r.name} <span className="text-xs font-semibold text-muted-foreground">· {SERVICE_CATEGORIES[r.category]}</span></p>
          <p className="text-xs text-muted-foreground"><span dir="ltr">{serviceRequestNo(r.request_no)}</span> · {formatDate(r.created_at)}{r.area ? ` · ${r.area}` : ""}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${SERVICE_REQUEST_STATUS[r.status]?.cls}`}>{SERVICE_REQUEST_STATUS[r.status]?.label}</span>
      </div>
      {r.details && <p className="mt-2 text-sm whitespace-pre-line text-foreground/80">{r.details}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${r.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary" dir="ltr"><Phone className="size-4" />{r.phone}</a>
        <a href={waLink(r.phone, `مرحبًا ${r.name}، معاك مقدم الخدمة من فاليو عقار`)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-whatsapp px-3 text-sm font-bold text-primary-foreground"><MessageCircle className="size-4" />واتساب</a>
        {r.status === "assigned" && <button onClick={() => save({ status: "done" })} className={btnPrimary}><Check className="size-4" />اتنفّذ</button>}
        {r.status === "assigned" && <button onClick={() => { if (confirm("قفل الطلب من غير تنفيذ؟")) save({ status: "closed" }); }} className={btnOutline}>اتقفل من غير تنفيذ</button>}
      </div>
      <div className="mt-3 flex gap-2">
        <input className={inputCls} placeholder="ملاحظاتك على الطلب (بتوصل لفاليو عقار)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        <button className={btnOutline} onClick={() => save({ notes: notes.trim() || null })}>حفظ</button>
      </div>
    </div>
  );
}

function ProviderPlan({ provider }: { provider: Provider }) {
  const plans = useQuery({ queryKey: ["service-plans"], queryFn: async () => (await supabase.from("service_plans").select("*").order("sort_order")).data ?? [] });
  const subs = useQuery({ queryKey: ["provider-subs", provider.id], queryFn: async () => (await supabase.from("service_subscriptions").select("*").eq("provider_id", provider.id).order("ends_at", { ascending: false })).data ?? [] });
  const current = plans.data?.find((p) => p.id === provider.plan_id);
  const price = (p: Tables<"service_plans">) => (p.monthly_price == null && p.yearly_price == null ? "السعر قريبًا"
    : [p.monthly_price != null ? `${formatPrice(Number(p.monthly_price))} ج.م / شهر` : null, p.yearly_price != null ? `${formatPrice(Number(p.yearly_price))} ج.م / سنة` : null].filter(Boolean).join(" · "));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">باقتك الحالية</p>
        <p className="mt-1 text-xl font-extrabold text-primary">{current?.name ?? "مجانية"}</p>
        {provider.plan_ends_at && <p className="text-sm text-muted-foreground">لحد {formatDate(provider.plan_ends_at)}</p>}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {plans.data?.map((p) => (
          <div key={p.id} className={`flex flex-col rounded-2xl border bg-card p-4 ${p.id === provider.plan_id ? "border-teal" : ""}`}>
            <p className="text-lg font-extrabold text-primary">{p.name}</p>
            <p className="text-sm font-bold text-teal">{price(p)}</p>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-foreground/80">{p.features.map((x) => <li key={x} className="flex items-start gap-1.5"><Check className="mt-0.5 size-4 shrink-0 text-teal" />{x}</li>)}</ul>
            {p.code !== "free" && p.id !== provider.plan_id && (
              <button className={`${btnOutline} mt-4`} disabled={provider.status !== "approved"} onClick={async () => {
                const { error } = await supabase.rpc("request_service_plan", { _plan: p.id });
                if (error) toast.error(error.message); else toast.success("طلبك وصل لفاليو عقار، وهنكلّمك عشان نفعّل الباقة");
              }}>اطلب الباقة دي</button>
            )}
          </div>
        ))}
      </div>
      {provider.status !== "approved" && <p className="text-xs text-muted-foreground">تقدر تطلب باقة بعد اعتماد حسابك.</p>}
      {(subs.data?.length ?? 0) > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2 font-bold text-primary">اشتراكاتك</p>
          <ul className="space-y-1 text-sm">{subs.data!.map((s) => <li key={s.id} className="text-foreground/80">{plans.data?.find((p) => p.id === s.plan_id)?.name ?? "باقة"} · {formatDate(s.starts_at)} ← {formatDate(s.ends_at)} · {s.status === "active" ? "سارية" : s.status === "expired" ? "خلصت" : "اتلغت"}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function ProviderProfile({ provider, onSaved }: { provider: Provider; onSaved: () => void }) {
  const [f, setF] = useState({ name: provider.name, contact_person: provider.contact_person ?? "", whatsapp: provider.whatsapp ?? "", specialty: provider.specialty ?? "", bio: provider.bio ?? "", photo_url: provider.photo_url ?? "", areas: provider.areas });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    if (f.name.trim().length < 2) { toast.error("الاسم مطلوب"); return; }
    setBusy(true);
    const { error } = await supabase.from("service_providers").update({
      name: f.name.trim().slice(0, 100), contact_person: f.contact_person.trim().slice(0, 100) || null, whatsapp: f.whatsapp.trim().slice(0, 20) || null,
      specialty: f.specialty.trim().slice(0, 120) || null, bio: f.bio.trim().slice(0, 1000) || null, photo_url: f.photo_url || null, areas: f.areas,
    }).eq("id", provider.id);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("اتحفظ ملفك"); onSaved(); }
  }
  return (
    <div className="max-w-2xl space-y-4 rounded-2xl border bg-card p-4 md:p-6">
      <div className="flex items-center gap-4">
        <Avatar name={f.name} url={f.photo_url} size="size-20" />
        <label className={`${btnOutline} cursor-pointer`}>{provider.kind === "company" ? "لوجو الشركة" : "صورتك"}<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const url = await uploadImage(file); setF((x) => ({ ...x, photo_url: url })); } catch (err) { toast.error((err as Error).message); } }} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={provider.kind === "company" ? "اسم الشركة" : "الاسم"}><input className={inputCls} value={f.name} onChange={set("name")} maxLength={100} /></Field>
        {provider.kind === "company" && <Field label="الشخص المسؤول"><input className={inputCls} value={f.contact_person} onChange={set("contact_person")} maxLength={100} /></Field>}
        <Field label="التخصص"><input className={inputCls} value={f.specialty} onChange={set("specialty")} maxLength={120} placeholder="مثال: تصوير عقاري ودرون" /></Field>
        <Field label="واتساب"><input className={inputCls} dir="ltr" value={f.whatsapp} onChange={set("whatsapp")} maxLength={20} /></Field>
        <Field label="رقم الدخول"><input className={inputCls} dir="ltr" value={provider.phone} readOnly disabled /></Field>
      </div>
      <Field label="نبذة عن شغلك"><textarea className={`${inputCls} h-28 py-2`} value={f.bio} onChange={set("bio")} maxLength={1000} /></Field>
      <div><p className="mb-2 text-sm font-bold text-primary">مناطق الشغل</p><AreaPicker value={f.areas} onChange={(areas) => setF({ ...f, areas })} /></div>
      <button disabled={busy} onClick={save} className={btnPrimary}>حفظ</button>
    </div>
  );
}

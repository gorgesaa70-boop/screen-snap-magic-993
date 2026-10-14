import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, MessageCircle, BadgeCheck, Clock, Check, X, Timer, ImagePlus, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { DashShell } from "@/components/dash/DashShell";
import { Stat, Tabs, Field, inputCls, btnPrimary, btnOutline, Avatar } from "@/components/site/ui";
import { AreaPicker } from "@/components/site/AreaPicker";
import { PROVIDER_KIND, PROVIDER_STATUS, SERVICE_CATEGORIES, SERVICE_REQUEST_STATUS, formatDate, formatPrice, servicePlanLines, serviceRequestNo, starsText, uploadImage, waLink } from "@/components/site/data";
import { useIsNativeApp } from "@/lib/native";

type Provider = Tables<"service_providers">;
type Tab = "requests" | "photos" | "reviews" | "plan" | "profile";
type Stats = { month: number; limit: number | null; max_photos: number; photos: number; rating: number | null; reviews: number; done: number };
type Bucket = "new" | "assigned" | "done" | "closed";

/**
 * Dashboard of a service provider (company or technician): requests offered to them (accept within 2 hours, without
 * the customer's contact details), the ones they took, work photos, ratings, their plan and profile.
 */
export function ProviderHome({ provider, refetch }: { provider: Provider; refetch: () => void }) {
  const [tab, setTab] = useState<Tab>("requests");
  const approved = provider.status === "approved";
  const offers = useQuery({
    queryKey: ["provider-offers", provider.id], enabled: approved, refetchInterval: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc("my_service_offers"); if (error) throw error; return data; },
  });
  const reqs = useQuery({
    queryKey: ["provider-requests", provider.id], enabled: approved,
    queryFn: async () => { const { data, error } = await supabase.from("service_requests").select("*").eq("assigned_provider_id", provider.id).order("created_at", { ascending: false }); if (error) throw error; return data; },
  });
  const stats = useQuery({ queryKey: ["provider-stats", provider.id], queryFn: async () => (await supabase.rpc("my_service_stats")).data as unknown as Stats | null });
  const reload = () => { offers.refetch(); reqs.refetch(); stats.refetch(); };
  const O = offers.data ?? [];
  const S = stats.data;
  return (
    <DashShell title={`أهلًا، ${provider.name}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-teal-soft px-3 py-1 text-xs font-bold text-primary">{PROVIDER_KIND[provider.kind]} · {SERVICE_CATEGORIES[provider.category]}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${PROVIDER_STATUS[provider.status]?.cls}`}>{PROVIDER_STATUS[provider.status]?.label}</span>
        {provider.verified && <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"><BadgeCheck className="size-3.5" />معتمد من فاليو عقار</span>}
        {approved && <Link to="/services/$id" params={{ id: provider.id }} className="flex items-center gap-1 text-xs font-bold text-primary hover:text-teal"><ExternalLink className="size-3.5" />ملفي العام في الدليل</Link>}
      </div>
      {provider.status === "pending" && <p className="mb-4 flex items-start gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground"><Clock className="mt-0.5 size-4 shrink-0 text-teal" />طلب انضمامك قيد المراجعة من فاليو عقار. كمّل ملفك وضيف صور شغلك دلوقتي، وأول ما يتعتمد هيوصلك إشعار وملفك يظهر في الدليل والطلبات تبدأ توصلك.</p>}
      {provider.status === "rejected" && <p className="mb-4 rounded-2xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">طلب الانضمام ما اتقبلش{provider.review_note ? `: ${provider.review_note}` : "."} لو عندك استفسار كلّم فاليو عقار.</p>}
      {provider.status === "suspended" && <p className="mb-4 rounded-2xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">حسابك موقوف من الإدارة{provider.review_note ? `: ${provider.review_note}` : "."}</p>}
      {S && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="طلبات الشهر ده" value={S.limit == null ? formatPrice(S.month) : `${formatPrice(S.month)} / ${formatPrice(S.limit)}`} hint={S.limit != null && S.month >= S.limit ? "وصلت لحد باقتك — الطلبات الجديدة بتروح لغيرك" : undefined} />
          <Stat label="التقييم" value={S.rating != null ? `${S.rating} ★` : "—"} hint={S.reviews ? `${formatPrice(S.reviews)} تقييم` : "لسه مفيش تقييمات"} />
          <Stat label="اتنفّذت" value={formatPrice(S.done)} />
          <Stat label="صور شغلي" value={`${formatPrice(S.photos)} / ${formatPrice(S.max_photos)}`} />
        </div>
      )}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "requests", label: `الطلبات${O.length ? ` (${O.length} جديد)` : ""}` },
        { id: "photos", label: "صور شغلي" },
        { id: "reviews", label: "التقييمات" },
        { id: "plan", label: "باقتي" },
        { id: "profile", label: "ملفي" },
      ]} />
      {tab === "requests" && (
        !approved ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">الطلبات بتبدأ توصلك بعد اعتماد حسابك.</p>
          : <ProviderRequests offers={O} list={reqs.data ?? []} loading={offers.isLoading || reqs.isLoading} onChanged={reload} />
      )}
      {tab === "photos" && <ProviderPhotos provider={provider} max={S?.max_photos ?? 6} onChanged={() => stats.refetch()} />}
      {tab === "reviews" && <ProviderReviews provider={provider} />}
      {tab === "plan" && <ProviderPlan provider={provider} />}
      {tab === "profile" && <ProviderProfile provider={provider} onSaved={refetch} />}
    </DashShell>
  );
}

type Offer = { id: string; request_no: number; category: string; area: string | null; details: string | null; created_at: string; offer_expires_at: string; chosen: boolean };

function ProviderRequests({ offers, list, loading, onChanged }: { offers: Offer[]; list: Tables<"service_requests">[]; loading: boolean; onChanged: () => void }) {
  const [bucket, setBucket] = useState<Bucket>("new");
  const by = (s: string) => list.filter((r) => r.status === s);
  const chips: [Bucket, string, number][] = [["new", "جديدة", offers.length], ["assigned", "شغّال عليها", by("assigned").length], ["done", "اتنفّذت", by("done").length], ["closed", "اتقفلت", by("closed").length]];
  // Open on what needs attention: new offers first, otherwise the ones in progress.
  useEffect(() => { if (!loading && offers.length === 0 && by("assigned").length > 0) setBucket("assigned"); }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {chips.map(([id, label, n]) => (
          <button key={id} type="button" aria-pressed={bucket === id} onClick={() => setBucket(id)}
            className={`h-10 rounded-full border px-4 text-sm font-bold transition ${bucket === id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{label}{n ? ` (${formatPrice(n)})` : ""}</button>
        ))}
      </div>
      {bucket === "new" && (
        <>
          <p className="text-xs text-muted-foreground">الطلبات الجديدة بتوصلك حسب تخصصك ومنطقتك. قدامك ساعتين تقبل أو تعتذر، وبعدها الطلب بيروح لغيرك. اسم العميل ورقمه بيظهروا بعد القبول.</p>
          {!loading && offers.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش طلبات جديدة دلوقتي. أول ما يجيلك طلب هيوصلك إشعار.</p>}
          {offers.map((o) => <OfferCard key={o.id} o={o} onChanged={onChanged} />)}
        </>
      )}
      {bucket !== "new" && (
        <>
          {!loading && by(bucket).length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش طلبات هنا.</p>}
          {by(bucket).map((r) => <RequestCard key={r.id} r={r} onChanged={onChanged} />)}
        </>
      )}
    </div>
  );
}

function Countdown({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const mins = Math.max(0, Math.round((new Date(at).getTime() - now) / 60_000));
  const text = mins <= 0 ? "الوقت خلص" : mins >= 60 ? `فاضل ${Math.floor(mins / 60)} ساعة${mins % 60 ? ` و${mins % 60} دقيقة` : ""}` : `فاضل ${mins} دقيقة`;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${mins <= 20 ? "bg-destructive/10 text-destructive" : "bg-[#f2b84b]/20 text-primary"}`}><Timer className="size-3.5" />{text}</span>;
}

function OfferCard({ o, onChanged }: { o: Offer; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function act(fn: "accept_service_offer" | "decline_service_offer", ok: string) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, { _req: o.id });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success(ok); onChanged(); }
  }
  return (
    <div className="rounded-2xl border-2 border-teal/40 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">{SERVICE_CATEGORIES[o.category]}{o.area ? ` · ${o.area}` : ""}</p>
          <p className="text-xs text-muted-foreground"><span dir="ltr">{serviceRequestNo(o.request_no)}</span> · {formatDate(o.created_at)}</p>
        </div>
        <Countdown at={o.offer_expires_at} />
      </div>
      {o.chosen && <p className="mt-2 inline-block rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-bold text-primary">العميل اختارك من الدليل</p>}
      {o.details && <p className="mt-2 text-sm whitespace-pre-line text-foreground/80">{o.details}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => act("accept_service_offer", "قبلت الطلب — بيانات العميل ظهرت في «شغّال عليها»")} className={btnPrimary}><Check className="size-4" />قبول</button>
        <button disabled={busy} onClick={() => { if (confirm("تعتذر عن الطلب ده؟ هيروح لمقدم خدمة تاني.")) act("decline_service_offer", "اعتذرت عن الطلب"); }} className={btnOutline}><X className="size-4" />اعتذار</button>
      </div>
    </div>
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
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${SERVICE_REQUEST_STATUS[r.status]?.cls}`}>{r.status === "assigned" ? "شغّال عليه" : SERVICE_REQUEST_STATUS[r.status]?.label}</span>
      </div>
      {r.details && <p className="mt-2 text-sm whitespace-pre-line text-foreground/80">{r.details}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${r.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary" dir="ltr"><Phone className="size-4" />{r.phone}</a>
        <a href={waLink(r.phone, `مرحبًا ${r.name}، معاك مقدم الخدمة من فاليو عقار`)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-whatsapp px-3 text-sm font-bold text-primary-foreground"><MessageCircle className="size-4" />واتساب</a>
        {r.status === "assigned" && <button onClick={() => save({ status: "done" })} className={btnPrimary}><Check className="size-4" />اتنفّذ</button>}
        {r.status === "assigned" && <button onClick={() => { if (confirm("قفل الطلب من غير تنفيذ؟")) save({ status: "closed" }); }} className={btnOutline}>اتقفل من غير تنفيذ</button>}
      </div>
      {r.status === "assigned" && <p className="mt-2 text-xs text-muted-foreground">لما تدوس «اتنفّذ» بيوصل للعميل إشعار يقيّمك، والتقييم بيظهر في ملفك العام.</p>}
      <div className="mt-3 flex gap-2">
        <input className={inputCls} placeholder="ملاحظاتك على الطلب (بتوصل لفاليو عقار)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        <button className={btnOutline} onClick={() => save({ notes: notes.trim() || null })}>حفظ</button>
      </div>
    </div>
  );
}

function ProviderPhotos({ provider, max, onChanged }: { provider: Provider; max: number; onChanged: () => void }) {
  const q = useQuery({
    queryKey: ["provider-photos", provider.id],
    queryFn: async () => (await supabase.from("service_provider_photos").select("*").eq("provider_id", provider.id).order("sort_order").order("created_at")).data ?? [],
  });
  const [busy, setBusy] = useState(false);
  const list = q.data ?? [];
  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    const room = max - list.length;
    if (files.length > room) toast.error(`باقتك بتسمح بـ ${max} صورة — هيترفع ${Math.max(0, room)} بس`);
    setBusy(true);
    let order = list.length;
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        const url = await uploadImage(file);
        const { error } = await supabase.from("service_provider_photos").insert({ provider_id: provider.id, url, sort_order: order++ });
        if (error) { toast.error(error.message); break; }
      } catch (err) { toast.error((err as Error).message); }
    }
    setBusy(false);
    q.refetch(); onChanged();
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">صور من شغلك اللي خلّصته بتظهر في ملفك العام في الدليل، وبتفرق جدًا مع العميل. ({formatPrice(list.length)} من {formatPrice(max)})</p>
      <label className={`${btnPrimary} cursor-pointer ${busy || list.length >= max ? "pointer-events-none opacity-60" : ""}`}><ImagePlus className="size-4" />{busy ? "بيترفع..." : "ضيف صور"}<input type="file" accept="image/*" multiple className="hidden" onChange={add} /></label>
      {!q.isLoading && list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش صور.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((p) => (
          <div key={p.id} className="group relative overflow-hidden rounded-2xl border bg-card">
            <img src={p.url} alt={p.caption ?? ""} loading="lazy" className="aspect-[4/3] w-full object-cover" />
            <button aria-label="حذف الصورة" onClick={async () => { if (!confirm("حذف الصورة؟")) return; const { error } = await supabase.from("service_provider_photos").delete().eq("id", p.id); if (error) toast.error(error.message); else { q.refetch(); onChanged(); } }}
              className="absolute top-2 end-2 grid size-9 place-items-center rounded-full bg-card/90 text-destructive shadow"><Trash2 className="size-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderReviews({ provider }: { provider: Provider }) {
  const q = useQuery({
    queryKey: ["provider-reviews", provider.id],
    queryFn: async () => (await supabase.from("service_reviews").select("*").eq("provider_id", provider.id).order("created_at", { ascending: false })).data ?? [],
  });
  if (!q.isLoading && !q.data?.length) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش تقييمات. العميل بيقدر يقيّمك بعد ما تدوس «اتنفّذ» على طلبه.</p>;
  return <div className="max-w-3xl space-y-3">{q.data?.map((r) => <ReviewCard key={r.id} r={r} onChanged={() => q.refetch()} />)}</div>;
}

function ReviewCard({ r, onChanged }: { r: Tables<"service_reviews">; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-primary">{r.customer_name} <span className="text-[#f2b84b]" aria-label={`${r.stars} من 5`}>{starsText(r.stars)}</span></p>
        <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}{r.hidden ? " · مخفي من الإدارة" : ""}</p>
      </div>
      {r.comment && <p className="mt-2 text-sm text-foreground/80">{r.comment}</p>}
      {r.reply ? <p className="mt-3 rounded-xl bg-secondary p-3 text-sm text-foreground/80"><span className="font-bold text-primary">ردّك: </span>{r.reply}</p> : (
        <div className="mt-3 flex gap-2">
          <input className={inputCls} placeholder="رد على التقييم (مرة واحدة، وبيظهر في ملفك)" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} />
          <button className={btnOutline} disabled={!reply.trim()} onClick={async () => { const { error } = await supabase.rpc("reply_service_review", { _review: r.id, _reply: reply }); if (error) toast.error(error.message); else { toast.success("ردّك اتنشر"); onChanged(); } }}>رد</button>
        </div>
      )}
    </div>
  );
}

function ProviderPlan({ provider }: { provider: Provider }) {
  const native = useIsNativeApp();
  const plans = useQuery({ queryKey: ["service-plans"], queryFn: async () => (await supabase.from("service_plans").select("*").order("sort_order")).data ?? [] });
  const subs = useQuery({ queryKey: ["provider-subs", provider.id], queryFn: async () => (await supabase.from("service_subscriptions").select("*").eq("provider_id", provider.id).order("ends_at", { ascending: false })).data ?? [] });
  const current = plans.data?.find((p) => p.id === provider.plan_id) ?? plans.data?.find((p) => p.code === "free");
  const price = (p: Tables<"service_plans">) => (p.monthly_price == null && p.yearly_price == null ? "السعر قريبًا"
    : [p.monthly_price != null ? `${formatPrice(Number(p.monthly_price))} ج.م / شهر` : null, p.yearly_price != null ? `${formatPrice(Number(p.yearly_price))} ج.م / سنة` : null].filter(Boolean).join(" · "));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">باقتك الحالية</p>
        <p className="mt-1 text-xl font-extrabold text-primary">{current?.name ?? "مجانية"}</p>
        {provider.plan_ends_at && <p className="text-sm text-muted-foreground">لحد {formatDate(provider.plan_ends_at)}</p>}
      </div>
      {native ? <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">لتغيير باقتك ادخل على موقع فاليو عقار من المتصفح.</p> : (
        <div className="grid gap-3 md:grid-cols-3">
          {plans.data?.map((p) => (
            <div key={p.id} className={`flex flex-col rounded-2xl border bg-card p-4 ${p.id === current?.id ? "border-teal" : ""}`}>
              <p className="text-lg font-extrabold text-primary">{p.name}</p>
              <p className="text-sm font-bold text-teal">{p.code === "free" ? "مجانًا" : price(p)}</p>
              <ul className="mt-3 flex-1 space-y-1 text-sm text-foreground/80">{servicePlanLines(p).map((x) => <li key={x} className="flex items-start gap-1.5"><Check className="mt-0.5 size-4 shrink-0 text-teal" />{x}</li>)}</ul>
              {p.code !== "free" && p.id !== current?.id && (
                <button className={`${btnOutline} mt-4`} disabled={provider.status !== "approved"} onClick={async () => {
                  const { error } = await supabase.rpc("request_service_plan", { _plan: p.id });
                  if (error) toast.error(error.message); else toast.success("طلبك وصل لفاليو عقار، وهنكلّمك عشان نفعّل الباقة");
                }}>اطلب الباقة دي</button>
              )}
            </div>
          ))}
        </div>
      )}
      {provider.status !== "approved" && !native && <p className="text-xs text-muted-foreground">تقدر تطلب باقة بعد اعتماد حسابك.</p>}
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
      <p className="text-xs text-muted-foreground">الاسم والصورة والتخصص والنبذة والمناطق بيظهروا في ملفك العام في الدليل. رقمك ما بيظهرش للعملاء — الطلبات بتوصلك من خلال فاليو عقار.</p>
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
      <div>
        <p className="mb-1 text-sm font-bold text-primary">مناطق الشغل</p>
        <p className="mb-2 text-xs text-muted-foreground">الطلبات بتوصلك من المناطق دي بس. لو ما اخترتش ولا منطقة، بتوصلك طلبات من كل المناطق.</p>
        <AreaPicker value={f.areas} onChange={(areas) => setF({ ...f, areas })} />
      </div>
      <button disabled={busy} onClick={save} className={btnPrimary}>حفظ</button>
    </div>
  );
}

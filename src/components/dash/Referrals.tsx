import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Timer, Handshake, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { STAGES, formatDate, formatPrice } from "@/components/site/data";

type View = "received" | "sent" | "money";

export const REFERRAL_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "مستنية رد", cls: "bg-[#f2b84b]/25 text-primary" },
  accepted: { label: "اتقبلت", cls: "bg-teal-soft text-primary" },
  declined: { label: "اترفضت", cls: "bg-destructive/10 text-destructive" },
  expired: { label: "ماترد عليهاش", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "اتلغت", cls: "bg-muted text-muted-foreground" },
};
export const PAYOUT_STATUS: Record<string, { label: string; cls: string }> = {
  expected: { label: "الصفقة لسه مفتوحة", cls: "bg-secondary text-primary" },
  due: { label: "مستحق", cls: "bg-[#f2b84b]/25 text-primary" },
  paid: { label: "اتدفع — مستني تأكيد الاستلام", cls: "bg-teal-soft text-primary" },
  confirmed: { label: "اتسلّم ✓", cls: "bg-primary text-primary-foreground" },
  cancelled: { label: "اتلغى", cls: "bg-muted text-muted-foreground" },
};
const KIND: Record<string, string> = { property: "عقار", compound: "كمبوند", project: "مشروع" };
export const refNo = (n: number) => `R-${String(n).padStart(6, "0")}`;

export function Countdown({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const mins = Math.max(0, Math.round((new Date(at).getTime() - now) / 60_000));
  const text = mins <= 0 ? "الوقت خلص" : mins >= 60 ? `فاضل ${Math.floor(mins / 60)} ساعة` : `فاضل ${mins} دقيقة`;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${mins <= 120 ? "bg-destructive/10 text-destructive" : "bg-[#f2b84b]/20 text-primary"}`}><Timer className="size-3.5" />{text}</span>;
}

/** «الإحالات»: buyers other brokers sent me, buyers I sent, and the shares to pay or receive. */
export function Referrals({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<View>(canManage ? "received" : "sent");
  const received = useQuery({ queryKey: ["received-referrals"], enabled: canManage, queryFn: async () => (await supabase.rpc("received_referrals")).data ?? [] });
  const pending = (received.data ?? []).filter((r) => r.status === "pending").length;
  const chips: [View, string][] = [
    ...(canManage ? [["received", `جاتلي${pending ? ` (${pending} مستنية رد)` : ""}`] as [View, string]] : []),
    ["sent", "بعتها"],
    ...(canManage ? [["money", "النصيب والفلوس"] as [View, string]] : []),
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {chips.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={`h-10 rounded-full border px-4 text-sm font-bold transition ${view === id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{label}</button>
          ))}
        </div>
        <Link to="/broker-network" className={btnOutline}><Handshake className="size-4" />سوق الوسطاء</Link>
      </div>
      {view === "received" && <Received list={received.data ?? []} loading={received.isLoading} onChanged={() => received.refetch()} />}
      {view === "sent" && <Sent />}
      {view === "money" && <Money />}
    </div>
  );
}

type ReceivedRow = { id: string; referral_no: number; referrer_name: string; target_kind: string; target_title: string; share_pct: number; note: string | null; status: string; respond_by: string; created_at: string; customer_name: string | null; customer_phone: string | null; lead_id: string | null; protected_until: string | null; decline_reason: string | null };

function Received({ list, loading, onChanged }: { list: ReceivedRow[]; loading: boolean; onChanged: () => void }) {
  if (!loading && list.length === 0) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش وسطاء بعتولك مشترين. افتح وحداتك للوسطاء من «عقاراتي» (نسبة القسمة) عشان تظهر في سوق الوسطاء.</p>;
  return <div className="space-y-3">{list.map((r) => <ReceivedCard key={r.id} r={r} onChanged={onChanged} />)}</div>;
}

function ReceivedCard({ r, onChanged }: { r: ReceivedRow; onChanged: () => void }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const st = REFERRAL_STATUS[r.status];
  async function accept() {
    setBusy(true);
    const { error } = await supabase.rpc("accept_referral", { _id: r.id });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("قبلت الإحالة — العميل ظهر عندك في العملاء"); onChanged(); }
  }
  async function decline() {
    setBusy(true);
    const { error } = await supabase.rpc("decline_referral", { _id: r.id, ...(reason.trim() ? { _reason: reason.trim() } : {}) });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("اترفضت، ووصل إشعار للوسيط"); onChanged(); }
  }
  return (
    <div className={`rounded-2xl border bg-card p-4 ${r.status === "pending" ? "border-2 border-teal/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-primary">{r.referrer_name} عنده مشتري <span className="text-xs font-semibold text-muted-foreground">· {KIND[r.target_kind]}: {r.target_title}</span></p>
          <p className="text-xs text-muted-foreground"><span dir="ltr">{refNo(r.referral_no)}</span> · {formatDate(r.created_at)} · نصيب الوسيط {r.share_pct}% من العمولة بعد نسبة فاليو عقار</p>
        </div>
        {r.status === "pending" ? <Countdown at={r.respond_by} /> : st && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>}
      </div>
      {r.note && <p className="mt-2 text-sm text-foreground/80">{r.note}</p>}
      {r.status === "accepted" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-bold text-primary">{r.customer_name}</span>
          {r.customer_phone && <a href={`tel:${r.customer_phone}`} dir="ltr" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary"><Phone className="size-4" />{r.customer_phone}</a>}
          {r.lead_id && <Link to="/leads/$id" params={{ id: r.lead_id }} className={btnOutline}>صفحة العميل</Link>}
          {r.protected_until && <span className="text-xs text-muted-foreground">محفوظ باسم {r.referrer_name} لحد {formatDate(r.protected_until)}</span>}
        </div>
      )}
      {r.status === "declined" && r.decline_reason && <p className="mt-2 text-xs text-muted-foreground">سبب الرفض: {r.decline_reason}</p>}
      {r.status === "pending" && (
        declining ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <input aria-label="سبب الرفض" className={`${inputCls} min-w-0 flex-1`} placeholder="السبب (بيوصل للوسيط) — مثال: الوحدة اتحجزت" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            <button disabled={busy} onClick={decline} className={btnOutline}>تأكيد الرفض</button>
            <button onClick={() => setDeclining(false)} className={btnOutline}>رجوع</button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy} onClick={accept} className={btnPrimary}><Check className="size-4" />قبول</button>
            <button disabled={busy} onClick={() => setDeclining(true)} className={btnOutline}><X className="size-4" />رفض</button>
            <p className="w-full text-xs text-muted-foreground">بيانات العميل بتظهر بعد القبول، وبيتسجل باسم الوسيط 90 يوم: أي وحدة يشتريها منك في المدة دي الوسيط ياخد نصيبه منها.</p>
          </div>
        )
      )}
    </div>
  );
}

function Sent() {
  const q = useQuery({ queryKey: ["sent-referrals"], queryFn: async () => (await supabase.rpc("sent_referrals")).data ?? [] });
  if (!q.isLoading && !q.data?.length) return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
      <p>لسه ما بعتش مشترين. عندك مشتري ومعندكش الوحدة؟ دوّر في سوق الوسطاء ودوس «عندي مشتري» على الوحدة.</p>
      <Link to="/broker-network" className={`${btnOutline} mt-3`}>سوق الوسطاء</Link>
    </div>
  );
  return (
    <div className="space-y-3">
      {q.data?.map((r) => {
        const st = REFERRAL_STATUS[r.status];
        return (
          <div key={r.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-primary">{r.customer_name} <span className="text-xs font-semibold text-muted-foreground">← {r.seller_name} · {KIND[r.target_kind]}: {r.target_title}</span></p>
                <p className="text-xs text-muted-foreground"><span dir="ltr">{refNo(r.referral_no)}</span> · {formatDate(r.created_at)} · نصيبك {r.share_pct}%</p>
              </div>
              {r.status === "pending" ? <Countdown at={r.respond_by} /> : st && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>}
            </div>
            {r.status === "accepted" && (
              <p className="mt-2 text-sm text-foreground/80">
                المرحلة: <span className="font-bold text-primary">{r.stage ? STAGES[r.stage] ?? r.stage : "—"}</span>
                {r.deal_status === "approved" ? " · البيع اتأكد ✓" : r.deal_status === "pending" ? " · البيع عند الإدارة للمراجعة" : ""}
                {r.protected_until ? ` · محفوظ باسمك لحد ${formatDate(r.protected_until)}` : ""}
              </p>
            )}
            {r.status === "declined" && r.decline_reason && <p className="mt-2 text-xs text-muted-foreground">السبب: {r.decline_reason}</p>}
            {r.status === "pending" && (
              <button className={`${btnOutline} mt-3`} onClick={async () => { const { error } = await supabase.rpc("cancel_referral", { _id: r.id }); if (error) toast.error(error.message); else { toast.success("اتلغت"); q.refetch(); } }}>إلغاء الإحالة</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Money() {
  const q = useQuery({ queryKey: ["referral-payouts"], queryFn: async () => (await supabase.rpc("my_referral_payouts")).data ?? [] });
  if (!q.isLoading && !q.data?.length) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش صفقات بإحالات لسه. لما بيع فيه إحالة يتأكد من الإدارة، النصيب بيظهر هنا.</p>;
  const money = (n: number | null) => (n == null ? "—" : `${formatPrice(Number(n))} ج.م`);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">النصيب = (إجمالي العمولة − عمولة فاليو عقار) × نسبة القسمة.</p>
      {q.data?.map((p) => {
        const st = PAYOUT_STATUS[p.status];
        return (
          <div key={p.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-primary">{p.side === "pay" ? `تدفع لـ ${p.other_name}` : `تستلم من ${p.other_name}`} <span className="text-xs font-semibold text-muted-foreground">· {p.customer_name} · {p.target_title}</span></p>
                <p className="text-xs text-muted-foreground"><span dir="ltr">{refNo(p.referral_no)}</span> · صفقة {p.deal_no}</p>
              </div>
              {st && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">إجمالي العمولة</dt><dd className="font-bold text-primary tabular-nums">{money(p.brokerage_total)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">عمولة فاليو عقار</dt><dd className="font-bold text-primary tabular-nums">{money(p.va_commission)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">نسبة القسمة</dt><dd className="font-bold text-primary tabular-nums">{p.share_pct}%</dd></div>
              <div><dt className="text-xs text-muted-foreground">النصيب</dt><dd className="font-extrabold text-teal tabular-nums">{money(p.amount)}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.side === "pay" && p.status === "due" && <button className={btnPrimary} onClick={async () => { const { error } = await supabase.rpc("mark_referral_paid", { _payout: p.id }); if (error) toast.error(error.message); else { toast.success("اتسجّل إنك دفعت، ووصل إشعار للوسيط"); q.refetch(); } }}>دفعت النصيب</button>}
              {p.side === "receive" && (p.status === "paid" || p.status === "due") && <button className={p.status === "paid" ? btnPrimary : btnOutline} onClick={async () => { const { error } = await supabase.rpc("confirm_referral_received", { _payout: p.id }); if (error) toast.error(error.message); else { toast.success("اتأكد الاستلام"); q.refetch(); } }}>استلمت نصيبي</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The share a seller gives a broker who brings the buyer (empty = closed to referrals). */
export function CoBrokeShare({ table, id, value, onSaved }: { table: "properties" | "compounds" | "projects"; id: string; value: number | null; onSaved?: () => void }) {
  const [v, setV] = useState(value != null ? String(value) : "");
  const [busy, setBusy] = useState(false);
  const dirty = v !== (value != null ? String(value) : "");
  async function save() {
    const n = v === "" ? null : Number(v);
    if (n != null && (!(n > 0) || n > 90)) { toast.error("النسبة من 1 لـ 90"); return; }
    setBusy(true);
    const { error } = await supabase.from(table).update({ co_broke_share: n }).eq("id", id);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success(n == null ? "اتقفلت للوسطاء" : `اتفتحت للوسطاء بـ ${n}%`); onSaved?.(); }
  }
  return (
    <div className="flex items-center gap-1.5" title="نسبة الوسيط اللي يجيب المشتري، من العمولة بعد نسبة فاليو عقار. فاضية = مقفولة للوسطاء.">
      <span className="text-xs font-bold text-muted-foreground">قسمة الوسطاء</span>
      <input aria-label="نسبة قسمة الوسطاء" className={`${inputCls} h-9 w-16 px-2 text-center text-sm`} inputMode="numeric" placeholder="—" value={v} onChange={(e) => setV(e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/[^\d.]/g, "").slice(0, 4))} />
      <span className="text-xs text-muted-foreground">%</span>
      {dirty && <button disabled={busy} onClick={save} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">حفظ</button>}
    </div>
  );
}

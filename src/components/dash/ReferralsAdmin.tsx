import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Field, Stat, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { formatDate, formatPrice } from "@/components/site/data";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { Countdown, PAYOUT_STATUS, REFERRAL_STATUS, refNo } from "@/components/dash/Referrals";

/** Admin «الإحالات»: every referral between brokers, the ones Value Aqar answers (owner listings), and the shares. */
export function ReferralsAdmin() {
  const q = useQuery({
    queryKey: ["admin-referrals"],
    queryFn: async () => {
      await supabase.rpc("run_referrals");
      const [r, b, p, d] = await Promise.all([
        supabase.from("referrals").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("brokers").select("id, name"),
        supabase.from("referral_payouts").select("*").order("created_at", { ascending: false }),
        supabase.from("deals").select("id, deal_no, broker_id, sale_value, brokerage_total"),
      ]);
      return { refs: r.data ?? [], brokers: b.data ?? [], payouts: p.data ?? [], deals: d.data ?? [] };
    },
  });
  const [status, setStatus] = useState("");
  const name = (id: string | null) => (id ? q.data?.brokers.find((b) => b.id === id)?.name ?? "" : "فاليو عقار");
  const refs = q.data?.refs ?? [];
  const list = refs.filter((r) => !status || r.status === status);
  const count = (s: string) => refs.filter((r) => r.status === s).length;
  const ours = refs.filter((r) => r.status === "pending" && !r.owner_id);
  const reload = () => q.refetch();
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-muted-foreground">وسيط عنده مشتري بيبعته لوحدة عند حد تاني. صاحب الوحدة قدامه 24 ساعة يقبل أو يرفض. بعد القبول العميل محفوظ باسم الوسيط 90 يوم مع نفس البايع. نصيب الوسيط = (إجمالي العمولة − عمولة فاليو عقار) × نسبة القسمة.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="مستنية رد" value={formatPrice(count("pending"))} />
        <Stat label="اتقبلت" value={formatPrice(count("accepted"))} />
        <Stat label="أنصبة مستحقة" value={formatPrice((q.data?.payouts ?? []).filter((p) => p.status === "due").length)} />
        <Stat label="كل الإحالات" value={formatPrice(refs.length)} />
      </div>
      <OwnerListingShare />
      {ours.length > 0 && (
        <section className="space-y-2">
          <p className="font-extrabold text-primary">على فاليو عقار (عروض ملاك) — ردّ عليها</p>
          {ours.map((r) => <AnswerRow key={r.id} r={r} referrer={name(r.referrer_id)} onChanged={reload} />)}
        </section>
      )}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-extrabold text-primary">كل الإحالات</p>
          <select aria-label="الحالة" className={`${inputCls} h-10 w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>{Object.entries(REFERRAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {!q.isLoading && list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">مفيش إحالات.</p>}
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary text-start text-xs text-muted-foreground"><tr>
              <th className="p-3 text-start">الرقم</th><th className="p-3 text-start">الوسيط</th><th className="p-3 text-start">البايع</th><th className="p-3 text-start">الوحدة</th>
              <th className="p-3 text-start">العميل</th><th className="p-3 text-start">النسبة</th><th className="p-3 text-start">الحالة</th>
            </tr></thead>
            <tbody>
              {list.map((r) => { const st = REFERRAL_STATUS[r.status]; return (
                <tr key={r.id} className="border-t">
                  <td className="p-3 tabular-nums" dir="ltr">{refNo(r.referral_no)}</td>
                  <td className="p-3 font-bold text-primary">{name(r.referrer_id)}</td>
                  <td className="p-3">{name(r.owner_id)}</td>
                  <td className="p-3">{r.target_title}</td>
                  <td className="p-3">{r.customer_name} <span className="text-xs text-muted-foreground" dir="ltr">{r.customer_phone}</span>{r.lead_id && <Link to="/leads/$id" params={{ id: r.lead_id }} className="ms-2 text-xs font-bold text-teal">صفحة العميل</Link>}</td>
                  <td className="p-3 tabular-nums">{r.share_pct}%</td>
                  <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st?.cls}`}>{st?.label}</span><span className="block text-[11px] text-muted-foreground">{formatDate(r.created_at)}{r.protected_until ? ` · محفوظ لحد ${formatDate(r.protected_until)}` : ""}</span></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      </section>
      <Payouts payouts={q.data?.payouts ?? []} refs={refs} deals={q.data?.deals ?? []} name={name} onChanged={reload} />
    </div>
  );
}

type Ref = { id: string; referral_no: number; target_title: string; share_pct: number; note: string | null; respond_by: string; customer_name: string };

function AnswerRow({ r, referrer, onChanged }: { r: Ref; referrer: string; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="rounded-2xl border-2 border-teal/40 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-bold text-primary">{referrer} عنده مشتري ({r.customer_name}) <span className="text-xs font-semibold text-muted-foreground">· {r.target_title} · {r.share_pct}%</span></p>
        <Countdown at={r.respond_by} />
      </div>
      {r.note && <p className="mt-2 text-sm text-foreground/80">{r.note}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={async () => { const { error } = await supabase.rpc("accept_referral", { _id: r.id }); if (error) toast.error(error.message); else { toast.success("اتقبلت، والعميل اتضاف"); onChanged(); } }}><Check className="size-4" />قبول</button>
        <input aria-label="سبب الرفض" className={`${inputCls} h-11 min-w-0 flex-1`} placeholder="سبب الرفض (اختياري)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <button className={btnOutline} onClick={async () => { const { error } = await supabase.rpc("decline_referral", { _id: r.id, ...(reason.trim() ? { _reason: reason.trim() } : {}) }); if (error) toast.error(error.message); else { toast.success("اترفضت"); onChanged(); } }}><X className="size-4" />رفض</button>
      </div>
    </div>
  );
}

/** One share for every owner listing (Value Aqar runs them); empty = owner listings closed to referrals. */
function OwnerListingShare() {
  const q = useQuery({ queryKey: ["owner-listing-share-admin"], queryFn: async () => (await supabase.from("app_settings").select("owner_listing_co_broke_share").eq("id", 1).maybeSingle()).data?.owner_listing_co_broke_share ?? null });
  const [v, setV] = useState<string | null>(null);
  const val = v ?? (q.data != null ? String(q.data) : "");
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-4">
      <Field label="قسمة الوسطاء على عروض الملاك (%)"><input className={`${inputCls} w-40`} inputMode="numeric" placeholder="فاضية = مقفولة" value={val} onChange={(e) => setV(e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/[^\d.]/g, "").slice(0, 4))} /></Field>
      <button className={btnPrimary} onClick={async () => {
        const n = val === "" ? null : Number(val);
        if (n != null && (!(n > 0) || n > 90)) { toast.error("النسبة من 1 لـ 90"); return; }
        const { error } = await supabase.from("app_settings").update({ owner_listing_co_broke_share: n }).eq("id", 1);
        if (error) toast.error(error.message); else { toast.success(n == null ? "عروض الملاك اتقفلت للوسطاء" : `عروض الملاك اتفتحت للوسطاء بـ ${n}%`); setV(null); q.refetch(); }
      }}>حفظ</button>
      <p className="w-full text-xs text-muted-foreground">الوسيط اللي يجيب مشتري لعرض مالك ياخد النسبة دي من العمولة بعد نسبة فاليو عقار. الوسطاء والمطوّرين بيحددوا نسبة وحداتهم بنفسهم.</p>
    </div>
  );
}

type Payout = { id: string; referral_id: string; deal_id: string; status: string; amount: number | null; paid_at: string | null; confirmed_at: string | null };

function Payouts({ payouts, refs, deals, name, onChanged }: { payouts: Payout[]; refs: (Ref & { id: string; referrer_id: string })[]; deals: { id: string; deal_no: number; broker_id: string | null; sale_value: number | null; brokerage_total: number | null }[]; name: (id: string | null) => string; onChanged: () => void }) {
  if (payouts.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="font-extrabold text-primary">أنصبة الإحالات</p>
      {payouts.map((p) => {
        const r = refs.find((x) => x.id === p.referral_id);
        const d = deals.find((x) => x.id === p.deal_id);
        const st = PAYOUT_STATUS[p.status];
        return <PayoutRow key={p.id} p={p} title={`${r ? refNo(r.referral_no) : ""} · ${r?.customer_name ?? ""} · صفقة ${d?.deal_no ?? ""}`} from={name(d?.broker_id ?? null)} to={r ? name(r.referrer_id) : ""} total={d?.brokerage_total ?? null} st={st} onChanged={onChanged} />;
      })}
    </section>
  );
}

function PayoutRow({ p, title, from, to, total, st, onChanged }: { p: Payout; title: string; from: string; to: string; total: number | null; st: { label: string; cls: string } | undefined; onChanged: () => void }) {
  const [amount, setAmount] = useState(p.amount != null ? String(p.amount) : "");
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-bold text-primary">{from} ← {to}</p><p className="text-xs text-muted-foreground" dir="auto">{title}{total != null ? ` · إجمالي العمولة ${formatPrice(Number(total))} ج.م` : " · إجمالي العمولة مش مكتوب"}</p></div>
        {st && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="النصيب (ج.م)"><input className={`${inputCls} w-40`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, ""))} /></Field>
        <button className={btnOutline} onClick={async () => { const { error } = await supabase.from("referral_payouts").update({ amount: amount === "" ? null : Number(amount), updated_at: new Date().toISOString() }).eq("id", p.id); if (error) toast.error(error.message); else { toast.success("اتحفظ"); onChanged(); } }}>حفظ المبلغ</button>
        {p.status === "due" && <button className={btnOutline} onClick={async () => { const { error } = await supabase.rpc("mark_referral_paid", { _payout: p.id }); if (error) toast.error(error.message); else { toast.success("اتسجّل إنه اتدفع"); onChanged(); } }}>اتدفع</button>}
        {(p.status === "due" || p.status === "paid") && <button className={btnOutline} onClick={async () => { const { error } = await supabase.rpc("confirm_referral_received", { _payout: p.id }); if (error) toast.error(error.message); else { toast.success("اتأكد الاستلام"); onChanged(); } }}>اتسلّم</button>}
      </div>
    </div>
  );
}

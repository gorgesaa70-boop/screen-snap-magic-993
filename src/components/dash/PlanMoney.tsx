import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Field, Stat, inputCls, btnOutline, btnPrimary } from "@/components/site/ui";
import { PLAN_MONTHS_LABEL, formatDate, formatPrice } from "@/components/site/data";
import { PAYMENT_METHODS } from "@/lib/finance";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

type Row = {
  kind: "account" | "owner"; id: string; holder: string; phone: string | null; account_type: string; plan_name: string; months: number | null;
  status: string; is_trial: boolean; starts_at: string; ends_at: string | null; amount: number | null; paid_amount: number; paid_at: string | null;
  payment_method: string | null; payment_note: string | null; renew_amount: number;
};
type Pay = "paid" | "partial" | "unpaid" | "free" | "unknown";
type Sub = "running" | "trial" | "ended" | "cancelled";

const PAY: Record<Pay, { label: string; cls: string }> = {
  paid: { label: "دفع", cls: "bg-teal/15 text-primary" },
  partial: { label: "دفع جزء", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  unpaid: { label: "مدفعش", cls: "bg-destructive/10 text-destructive" },
  free: { label: "مجاني", cls: "bg-secondary text-muted-foreground" },
  unknown: { label: "غير محدد", cls: "bg-muted text-muted-foreground" },
};
const SUB: Record<Sub, string> = { running: "شغالة", trial: "تجربة مجانية", ended: "خلصت", cancelled: "اتلغت" };
const METHODS: Record<string, string> = { ...PAYMENT_METHODS, plan_request: "طلب باقة", online: "دفع إلكتروني" };

const num = (x: string) => x.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "");
const money = (n: number) => `${formatPrice(Math.round(n))} ج.م`;
const left = (r: Row) => Math.max(Number(r.amount ?? 0) - Number(r.paid_amount), 0);
const payOf = (r: Row): Pay => r.amount == null ? "unknown" : Number(r.amount) === 0 ? "free" : Number(r.paid_amount) >= Number(r.amount) ? "paid" : Number(r.paid_amount) > 0 ? "partial" : "unpaid";
const subOf = (r: Row, now: number): Sub => r.status === "canceled" || r.status === "cancelled" ? "cancelled" : r.ends_at && Date.parse(r.ends_at) <= now ? "ended" : r.is_trial ? "trial" : "running";
const daysTo = (iso: string, now: number) => Math.ceil((Date.parse(iso) - now) / 86_400_000);

/** The plans page: who subscribed, who paid, when they renew, and the money collected, still owed and coming. Separate from commissions. */
export function PlanMoney({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({
    queryKey: ["admin-data", "plan-money"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_plan_finance");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const waiting = useQuery({
    queryKey: ["admin-data", "plan-money-requests"],
    queryFn: async () => (await supabase.from("plan_requests").select("amount").eq("status", "new")).data ?? [],
  });
  const [search, setSearch] = useState("");
  const [pay, setPay] = useState("");
  const [sub, setSub] = useState("");
  const [window, setWindow] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const now = Date.now();
  const all = q.data ?? [];

  // An early renewal stacks a new term after the current one: only the last term of a holder + plan renews.
  const renewing = useMemo(() => {
    const last = new Map<string, Row>();
    for (const r of all) {
      if (!r.ends_at || r.is_trial || subOf(r, now) !== "running") continue;
      const key = `${r.kind}:${r.holder}:${r.plan_name}`;
      const cur = last.get(key);
      if (!cur || Date.parse(r.ends_at) > Date.parse(cur.ends_at!)) last.set(key, r);
    }
    return [...last.values()];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const live = all.filter((r) => subOf(r, now) !== "cancelled");
  const collected = all.reduce((s, r) => s + Number(r.paid_amount), 0);
  const remaining = live.reduce((s, r) => s + left(r), 0);
  const coming30 = renewing.filter((r) => daysTo(r.ends_at!, now) <= 30);
  const trials = all.filter((r) => subOf(r, now) === "trial").length;
  const unknown = all.filter((r) => payOf(r) === "unknown").length;
  const requested = (waiting.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

  const rows = all.filter((r) => {
    const s = search.trim().toLowerCase();
    if (s && !r.holder.toLowerCase().includes(s) && !(r.phone ?? "").includes(s) && !r.plan_name.toLowerCase().includes(s)) return false;
    if (pay && payOf(r) !== pay) return false;
    if (sub && subOf(r, now) !== sub) return false;
    if (window) {
      if (!r.ends_at || !["running", "trial"].includes(subOf(r, now)) || daysTo(r.ends_at, now) > Number(window)) return false;
    }
    return true;
  }).sort((a, b) => (Date.parse(a.ends_at ?? "9999") - Date.parse(b.ends_at ?? "9999")));

  if (q.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (q.error) return <p className="rounded-2xl border bg-card p-6 text-sm text-destructive">تعذّر تحميل الباقات. لو دي أول مرة، لازم تحديث قاعدة البيانات (إصدار 50) يتطبق الأول.</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي التحصيل" value={money(collected)} hint="الفلوس اللي اتدفعت فعلًا" />
        <Stat label="الباقي" value={money(remaining)} hint={unknown ? `مستحق ولسه مادفعش، ومعاهم ${unknown} غير محدد` : "مستحق ولسه مادفعش"} />
        <Stat label="اللي جاي خلال 30 يوم" value={money(coming30.reduce((s, r) => s + Number(r.renew_amount), 0))} hint={`${coming30.length} تجديد بسعر الباقة الحالي`} />
        <Stat label="كل التجديدات الجاية" value={money(renewing.reduce((s, r) => s + Number(r.renew_amount), 0))} hint={`${renewing.length} باقة شغالة، و${trials} تجربة مجانية مش محسوبة`} />
      </div>
      {requested > 0 && <p className="rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-primary">فيه طلبات باقات لسه ماتفعّلتش بقيمة {money(requested)}، وهتلاقيها في «إعدادات الباقات».</p>}

      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="بحث" className={`${inputCls} ps-9`} placeholder="الاسم أو الموبايل أو الباقة" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select aria-label="الدفع" className={`${inputCls} lg:w-40`} value={pay} onChange={(e) => setPay(e.target.value)}>
          <option value="">كل حالات الدفع</option>{Object.entries(PAY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select aria-label="حالة الباقة" className={`${inputCls} lg:w-40`} value={sub} onChange={(e) => setSub(e.target.value)}>
          <option value="">كل الباقات</option>{Object.entries(SUB).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="ميعاد التجديد" className={`${inputCls} lg:w-44`} value={window} onChange={(e) => setWindow(e.target.value)}>
          <option value="">أي ميعاد تجديد</option><option value="7">خلال 7 أيام</option><option value="30">خلال 30 يوم</option><option value="90">خلال 3 شهور</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش باقات {all.length ? "مطابقة للفلاتر" : "لسه"}.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const p = payOf(r); const st = subOf(r, now); const key = `${r.kind}:${r.id}`;
            const d = r.ends_at ? daysTo(r.ends_at, now) : null;
            return (
              <li key={key} className="rounded-2xl border bg-card p-3 text-sm md:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-primary" dir={r.kind === "owner" ? "ltr" : undefined}>{r.holder}</b>
                  <span className="text-muted-foreground">{r.plan_name}{r.months ? ` · ${PLAN_MONTHS_LABEL[r.months] ?? `${r.months} شهور`}` : ""}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PAY[p].cls}`}>{PAY[p].label}</span>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">{SUB[st]}</span>
                  {canEdit && !r.is_trial && <button className={`${btnOutline} ms-auto h-9 px-3 text-xs`} onClick={() => setOpen(open === key ? null : key)}>{open === key ? "إغلاق" : "سجّل الدفع"}</button>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground md:grid-cols-4">
                  <span>المبلغ: <b className="text-foreground">{r.amount == null ? "—" : money(Number(r.amount))}</b></span>
                  <span>دخل: <b className="text-foreground">{money(Number(r.paid_amount))}</b>{r.payment_method ? ` · ${METHODS[r.payment_method] ?? r.payment_method}` : ""}</span>
                  <span>باقي: <b className="text-foreground">{r.amount == null ? "—" : money(left(r))}</b></span>
                  <span>التجديد: <b className={d != null && d >= 0 && d <= 7 ? "text-destructive" : "text-foreground"}>{r.ends_at ? formatDate(r.ends_at) : "—"}</b>{d != null && d >= 0 && st !== "cancelled" ? ` · بعد ${d} يوم` : ""}</span>
                </div>
                {r.payment_note && <p className="mt-1 text-xs text-muted-foreground">{r.payment_note}</p>}
                {open === key && <PaymentForm r={r} onDone={() => { setOpen(null); void q.refetch(); }} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PaymentForm({ r, onDone }: { r: Row; onDone: () => void }) {
  const [f, setF] = useState({ amount: r.amount == null ? String(Math.round(Number(r.renew_amount))) : String(Math.round(Number(r.amount))), paid: String(Math.round(Number(r.paid_amount))), method: r.payment_method && r.payment_method in PAYMENT_METHODS ? r.payment_method : "cash", note: r.payment_note ?? "" });
  const [busy, setBusy] = useState(false);
  const save = async (paid: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("admin_record_plan_payment", { _kind: r.kind, _id: r.id, _amount: Number(f.amount || 0), _paid: Number(paid || 0), _method: f.method, _note: f.note.trim() });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("الدفع اتسجل"); onDone(); }
  };
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label="قيمة الباقة (ج.م)"><input className={inputCls} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: num(e.target.value).slice(0, 9) })} /></Field>
        <Field label="إجمالي المدفوع (ج.م)"><input className={inputCls} inputMode="numeric" value={f.paid} onChange={(e) => setF({ ...f, paid: num(e.target.value).slice(0, 9) })} /></Field>
        <Field label="طريقة الدفع"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="ملاحظة"><input className={inputCls} maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={busy} onClick={() => save(f.paid)}>حفظ</button>
        <button className={btnOutline} disabled={busy} onClick={() => save(f.amount)}>دفع المبلغ كله</button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Gift, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { btnOutline, btnPrimary } from "@/components/site/ui";
import { PLAN_MONTHS, PLAN_MONTHS_LABEL, formatDate, formatPrice, listingPlanLines, planTermPrice, type ListingPlanInfo } from "@/components/site/data";
import { useIsNativeApp } from "@/lib/native";
import { PlanPerks } from "@/components/dash/PlanPerks";

export type MyListingPlan = {
  audience: "owner" | "owner_rent" | "owner_summer" | "individual" | "company" | "developer" | "broker"; plan_id: string; code: string; name: string; max: number; days: number | null;
  featured: number; ends_at: string | null; used: number; featured_used?: number; total?: number; trial: boolean; exempt: boolean;
  access_until: string | null; expired: boolean; hidden?: number; staff?: number | null; projects?: number | null; stats_level?: string; excel?: boolean;
  request: { id: string; plan_id: string; months: number; amount: number; created_at: string } | null;
  /** Owners: one entry per kind (selling / renting / summer), each with its own plan. */
  kind?: "sale" | "rent" | "summer"; has?: boolean; kinds?: MyListingPlan[];
};
const KIND_LABEL: Record<string, string> = { sale: "بيع", rent: "إيجار", summer: "مصيف" };

export const useMyListingPlan = () => useQuery({
  queryKey: ["my-listing-plan"],
  queryFn: async () => { const { data, error } = await supabase.rpc("my_listing_plan"); if (error) throw error; return data as unknown as MyListingPlan | null; },
});

export type PlanRow = ListingPlanInfo & { id: string; code: string; name: string; monthly_price: number; tier: number | null; sort_order: number };

/** The plans offered to one kind of account, in tier order. */
export const usePlans = (audience: string | undefined) => useQuery({
  queryKey: ["listing-plans", audience], enabled: !!audience,
  queryFn: async () => ((await supabase.from("plans").select("*").eq("audience", audience!).eq("is_active", true).order("sort_order")).data ?? []) as unknown as PlanRow[],
});

/** The term discounts and the free month length (set by the admin). */
export const usePlanSettings = () => useQuery({
  queryKey: ["plan-settings"], staleTime: 5 * 60_000,
  queryFn: async () => {
    const d = (await supabase.from("app_settings").select("plan_trial_days, plan_discount_3m, plan_discount_6m, plan_discount_12m").eq("id", 1).maybeSingle()).data;
    return { trialDays: d?.plan_trial_days ?? 30, discounts: { 1: 0, 3: d?.plan_discount_3m ?? 10, 6: d?.plan_discount_6m ?? 20, 12: d?.plan_discount_12m ?? 30 } as Record<number, number> };
  },
});

const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)) : null);

/** The term chooser: 1 / 3 / 6 / 12 months, with the discount on each. */
export function TermPicker({ months, onChange, discounts }: { months: number; onChange: (m: number) => void; discounts: Record<number, number> }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="مدة الاشتراك">
      {PLAN_MONTHS.map((m) => (
        <button key={m} role="radio" aria-checked={months === m} onClick={() => onChange(m)}
          className={`rounded-full border px-4 py-2 text-sm font-bold transition ${months === m ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-primary"}`}>
          {PLAN_MONTHS_LABEL[m]}{discounts[m] ? <span className={`ms-1.5 text-xs ${months === m ? "text-teal-soft" : "text-teal"}`}>−{discounts[m]}%</span> : null}
        </button>
      ))}
    </div>
  );
}

/** The 3 plan cards of one kind of account, priced for the chosen term. */
export function PlanCards({ plans, months, discounts, currentPlanId, action }: {
  plans: PlanRow[]; months: number; discounts: Record<number, number>; currentPlanId?: string | null;
  action?: ((p: PlanRow) => React.ReactNode) | undefined;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {plans.map((p) => {
        const total = planTermPrice(Number(p.monthly_price), months, discounts);
        const full = Number(p.monthly_price) * months;
        const popular = p.tier === 2;
        const current = p.id === currentPlanId;
        return (
          <div key={p.id} className={`relative flex flex-col rounded-2xl border bg-card p-4 ${popular ? "border-teal shadow-md" : ""} ${current ? "ring-2 ring-primary" : ""}`}>
            {popular && <span className="absolute -top-3 start-4 rounded-full bg-teal px-3 py-0.5 text-[11px] font-bold text-white">الأكثر طلبًا</span>}
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-extrabold text-primary">{p.name}</p>
              {current && <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-bold text-primary">باقتك</span>}
            </div>
            <p className="mt-1"><span className="text-2xl font-extrabold text-primary">{formatPrice(total)}</span> <span className="text-sm text-muted-foreground">ج.م / {PLAN_MONTHS_LABEL[months]}</span></p>
            {months > 1 && total < full && (
              <p className="text-xs font-bold text-teal">بدل {formatPrice(full)} — وفّرت {formatPrice(full - total)} ج.م ({formatPrice(Math.round(total / months))} في الشهر)</p>
            )}
            <ul className="mt-3 flex-1 space-y-1.5 text-sm text-foreground/80">
              {listingPlanLines(p).map((x) => <li key={x} className="flex items-start gap-1.5"><Check className="mt-0.5 size-4 shrink-0 text-teal" />{x}</li>)}
            </ul>
            {action?.(p)}
          </div>
        );
      })}
    </div>
  );
}

/** «باقتي» for brokers, companies, developers and owners: the plan in force, the free month, what's used, and asking for a plan. */
export function ListingPlan({ canRequest = true }: { canRequest?: boolean }) {
  const native = useIsNativeApp();
  const mine = useMyListingPlan();
  const root = mine.data;
  // Owners pick which of their plans to look at: selling, renting or summer.
  const [kind, setKind] = useState<string | null>(null);
  const m = root?.kinds?.length ? (root.kinds.find((k) => k.kind === (kind ?? root.kind)) ?? root) : root;
  const plans = usePlans(m?.audience === "broker" ? undefined : m?.audience);
  const settings = usePlanSettings();
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  if (mine.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (!m) return null;
  const discounts = settings.data?.discounts ?? { 1: 0, 3: 10, 6: 20, 12: 30 };
  const left = daysLeft(m.ends_at);
  const dev = m.audience === "developer";
  const full = !dev && m.used >= m.max;
  const asked = m.request ? plans.data?.find((p) => p.id === m.request!.plan_id) : null;

  const ask = async (p: PlanRow) => {
    setBusy(p.id);
    const { error } = await supabase.rpc("request_listing_plan", { _plan: p.id, _months: months });
    setBusy(null);
    if (error) toast.error(error.message);
    else { toast.success("طلبك وصل لفاليو عقار، وهنكلّمك عشان نفعّل الباقة"); mine.refetch(); }
  };

  return (
    <div className="space-y-4">
      {root?.kinds?.length ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="نوع الإعلان">
          {root.kinds.map((k) => (
            <button key={k.kind} role="tab" aria-selected={k.kind === m.kind} onClick={() => { setKind(k.kind ?? "sale"); setMonths(1); }}
              className={`rounded-xl border px-4 py-2 text-sm font-bold ${k.kind === m.kind ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary"}`}>
              باقة {KIND_LABEL[k.kind ?? "sale"]}{k.expired ? " ⚠️" : ""}
            </button>
          ))}
        </div>
      ) : null}
      {m.kind && !m.has ? (
        <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">مالكش إعلانات {KIND_LABEL[m.kind]} لسه. أول إعلان {KIND_LABEL[m.kind]} بتعرضه بياخد أول شهر مجانًا على باقة «{m.name}»، وبعدها تختار باقتك من هنا.</p>
      ) : (
      <div className={`rounded-2xl border bg-card p-4 ${m.expired ? "border-destructive" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">باقتك الحالية</p>
          {m.exempt ? <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">حساب من غير باقة</span>
            : m.expired ? <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-bold text-destructive">خلصت</span>
            : m.trial ? <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-bold text-primary"><Gift className="size-3.5" />أول شهر مجانًا</span> : null}
        </div>
        <p className="mt-1 text-xl font-extrabold text-primary">{m.name}</p>
        {!m.exempt && !m.expired && m.ends_at && (
          <p className="text-sm text-muted-foreground">{m.trial ? "المجاني" : "شغالة"} لحد {formatDate(m.ends_at)}{left != null && left <= 7 ? ` — فاضل ${left === 1 ? "يوم" : `${left} أيام`}` : ""}</p>
        )}
        {m.expired && (
          <p className="mt-2 rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">
            {m.trial ? "الشهر المجاني خلص" : "باقتك خلصت"}، وإعلاناتك مستخبية عن الزوار (مفيش حاجة اتمسحت). اختار باقة تحت وهترجع تظهر أول ما تتفعّل.
          </p>
        )}
        {m.trial && !m.expired && left != null && left <= 7 && (
          <p className="mt-2 rounded-xl bg-[#f2b84b]/20 p-3 text-sm font-bold text-primary">الشهر المجاني بيخلص قريب. اختار باقتك دلوقتي عشان إعلاناتك ماتستخباش.</p>
        )}
        {!dev && (
          <div className="mt-3">
            <div className="flex justify-between text-sm font-bold text-primary"><span>إعلانات ظاهرة دلوقتي</span><span>{formatPrice(m.used)} من {formatPrice(m.max)}</span></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${full ? "bg-destructive" : "bg-teal"}`} style={{ width: `${Math.min(100, (m.used / Math.max(1, m.max)) * 100)}%` }} /></div>
            {full && <p className="mt-2 text-xs font-bold text-destructive">وصلت لحد باقتك. عشان تنزّل إعلان جديد: احذف إعلان قديم، أو اطلب باقة أكبر.</p>}
            {(m.hidden ?? 0) > 0 && !m.expired && <p className="mt-2 text-xs font-bold text-destructive">{formatPrice(m.hidden!)} إعلان مستخبي لأنهم أكتر من حد الباقة. باقة أكبر بترجّعهم.</p>}
          </div>
        )}
        {dev && m.projects != null && <p className="mt-3 text-sm font-bold text-primary">باقتك بتسمح بـ {formatPrice(m.projects)} مشروع أو كمبوند، بوحدات من غير حد.</p>}
      </div>
      )}

      {m.request && (
        <div className="rounded-2xl border border-teal bg-teal-soft/40 p-4 text-sm text-primary">
          <p className="font-bold">طلبت باقة «{asked?.name ?? "جديدة"}» لمدة {PLAN_MONTHS_LABEL[m.request.months] ?? `${m.request.months} شهور`} — {formatPrice(Number(m.request.amount))} ج.م</p>
          <p className="mt-1 text-muted-foreground">فريق فاليو عقار هيكلّمك ويفعّلها. لو عايز تغيّر اختيارك، اطلب باقة تانية وهتحل محل الطلب ده.</p>
        </div>
      )}

      {!m.expired && !(m.kind && !m.has) && (() => {
        const current = plans.data?.find((p) => p.id === m.plan_id);
        return current ? <PlanPerks plan={current} owner={!!m.kind} /> : null;
      })()}

      {native ? (
        <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">لتغيير باقتك ادخل على موقع فاليو عقار من المتصفح.</p>
      ) : m.audience !== "broker" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 font-extrabold text-primary"><Sparkles className="size-5 text-teal" />اختار باقتك ومدتها{m.kind ? ` — ${KIND_LABEL[m.kind]}` : ""}</p>
            <TermPicker months={months} onChange={setMonths} discounts={discounts} />
          </div>
          <PlanCards plans={plans.data ?? []} months={months} discounts={discounts} currentPlanId={m.trial || m.expired ? null : m.plan_id}
            action={canRequest ? (p) => (
              <button className={`${p.tier === 2 ? btnPrimary : btnOutline} mt-4`} disabled={busy === p.id} onClick={() => ask(p)}>
                {p.id === m.plan_id && !m.trial && !m.expired ? `جدّد ${PLAN_MONTHS_LABEL[months]}` : "اطلب الباقة دي"}
              </button>
            ) : undefined} />
          {m.kind === "summer" && <p className="text-xs font-bold text-teal">للمصيف: اختار «3 شهور» وتبقى الموسم كله بخصم.</p>}
          <p className="text-xs text-muted-foreground">الدفع أونلاين قريب. لحد كده بعد ما تطلب، فريق فاليو عقار بيكلّمك ويفعّل الباقة. التجديد بدري بيبدأ من آخر يوم في باقتك، فمش بتخسر أيام.</p>
        </div>
      )}
      {!canRequest && !native && <p className="text-xs text-muted-foreground">صاحب الحساب بس اللي يقدر يطلب تغيير الباقة.</p>}
    </div>
  );
}

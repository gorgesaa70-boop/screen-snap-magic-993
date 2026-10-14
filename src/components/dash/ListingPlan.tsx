import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { btnOutline } from "@/components/site/ui";
import { formatDate, formatPrice, listingPlanLines } from "@/components/site/data";
import { useIsNativeApp } from "@/lib/native";

export type MyListingPlan = {
  audience: "broker" | "owner"; plan_id: string; code: string; name: string; max: number; days: number | null;
  featured: number; ends_at: string | null; used: number; featured_used?: number; total?: number;
};

export const useMyListingPlan = () => useQuery({
  queryKey: ["my-listing-plan"],
  queryFn: async () => { const { data, error } = await supabase.rpc("my_listing_plan"); if (error) throw error; return data as unknown as MyListingPlan | null; },
});

/** «باقتي» for brokers, companies and owners: the plan in force, what's used, and the other plans to ask for. */
export function ListingPlan({ canRequest = true }: { canRequest?: boolean }) {
  const native = useIsNativeApp();
  const mine = useMyListingPlan();
  const audience = mine.data?.audience;
  const plans = useQuery({
    queryKey: ["listing-plans", audience], enabled: !!audience,
    queryFn: async () => (await supabase.from("plans").select("*").eq("audience", audience!).eq("is_active", true).order("sort_order")).data ?? [],
  });
  const m = mine.data;
  if (mine.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (!m) return null;
  const price = (p: { monthly_price: number; yearly_price: number }) =>
    p.monthly_price > 0 || p.yearly_price > 0
      ? [p.monthly_price > 0 ? `${formatPrice(p.monthly_price)} ج.م / شهر` : null, p.yearly_price > 0 ? `${formatPrice(p.yearly_price)} ج.م / سنة` : null].filter(Boolean).join(" · ")
      : null;
  const full = m.used >= m.max;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">باقتك الحالية</p>
        <p className="mt-1 text-xl font-extrabold text-primary">{m.name}</p>
        {m.ends_at && <p className="text-sm text-muted-foreground">لحد {formatDate(m.ends_at)}</p>}
        <div className="mt-3">
          <div className="flex justify-between text-sm font-bold text-primary"><span>إعلانات ظاهرة دلوقتي</span><span>{formatPrice(m.used)} من {formatPrice(m.max)}</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${full ? "bg-destructive" : "bg-teal"}`} style={{ width: `${Math.min(100, (m.used / Math.max(1, m.max)) * 100)}%` }} /></div>
          {full && <p className="mt-2 text-xs font-bold text-destructive">وصلت لحد باقتك. عشان تنزّل إعلان جديد: استنى إعلان يخلص، أو احذف واحد، أو اطلب باقة أكبر.</p>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{m.days ? `كل إعلان بيفضل ظاهر ${m.days} يوم من يوم اعتماده. في آخر أسبوع بيوصلك إشعار وتقدر تجدّده بضغطة، ولو خلص بيستخبى (مش بيتمسح) لحد ما تجدّده.` : "إعلاناتك ظاهرة من غير مدة."}</p>
      </div>
      {native ? (
        <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">لتغيير باقتك ادخل على موقع فاليو عقار من المتصفح.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {plans.data?.map((p) => {
            const current = p.id === m.plan_id;
            const free = p.code === "free" || p.code === "owner_free";
            return (
              <div key={p.id} className={`flex flex-col rounded-2xl border bg-card p-4 ${current ? "border-teal" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-extrabold text-primary">{p.name}</p>
                  {current && <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-bold text-primary">باقتك</span>}
                </div>
                <p className="text-sm font-bold text-teal">{free ? "مجانًا" : price(p) ?? "السعر قريبًا"}</p>
                <ul className="mt-3 flex-1 space-y-1 text-sm text-foreground/80">
                  {listingPlanLines(p).map((x) => <li key={x} className="flex items-start gap-1.5"><Check className="mt-0.5 size-4 shrink-0 text-teal" />{x}</li>)}
                </ul>
                {!free && !current && canRequest && (
                  <button className={`${btnOutline} mt-4`} onClick={async () => {
                    const { error } = await supabase.rpc("request_listing_plan", { _plan: p.id });
                    if (error) toast.error(error.message); else toast.success("طلبك وصل لفاليو عقار، وهنكلّمك عشان نفعّل الباقة");
                  }}>اطلب الباقة دي</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!canRequest && !native && <p className="text-xs text-muted-foreground">صاحب الحساب بس اللي يقدر يطلب تغيير الباقة.</p>}
    </div>
  );
}

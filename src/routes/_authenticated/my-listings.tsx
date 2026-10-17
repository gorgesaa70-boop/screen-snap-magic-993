import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { HousePlus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "@/components/dash/DashShell";
import { ListingPlan, useMyListingPlan } from "@/components/dash/ListingPlan";
import { Tabs, btnOutline, btnPrimary } from "@/components/site/ui";
import { REVIEW, formatPrice, listingTerm } from "@/components/site/data";
import { thumb } from "@/lib/images";

export const Route = createFileRoute("/_authenticated/my-listings")({
  head: () => ({ meta: [{ title: "إعلاناتي | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: MyListingsPage,
});

/** An owner's listings sent from «اعرض عقارك» (matched by the phone they signed in with), with renewal and their plan. */
function MyListingsPage() {
  const [tab, setTab] = useState<"listings" | "plan">("listings");
  const q = useQuery({ queryKey: ["my-owner-listings"], queryFn: async () => { const { data, error } = await supabase.rpc("my_owner_listings"); if (error) throw error; return data; } });
  const plan = useMyListingPlan();
  const reload = () => { q.refetch(); plan.refetch(); };
  return (
    <DashShell title="إعلاناتي" customer>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "listings", label: "إعلاناتي" }, { id: "plan", label: "باقتي" }]} />
      {tab === "plan" ? <ListingPlan /> : (
        <div className="max-w-3xl space-y-3">
          {plan.data && <p className="text-sm text-muted-foreground">ظاهر دلوقتي {formatPrice(plan.data.used)} من {formatPrice(plan.data.max)} في باقتك ({plan.data.name}).</p>}
          <Link to="/sell" className={btnPrimary}><HousePlus className="size-4" />اعرض عقار جديد</Link>
          {q.isLoading ? <div className="h-32 animate-pulse rounded-2xl bg-muted" />
            : !q.data?.length ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش إعلانات مبعوتة من رقم موبايلك. لو بعت عقار برقم تاني، سجّل دخول بالرقم ده.</p>
            : q.data.map((p) => {
              const term = p.review_status === "approved" && !p.hidden_by_plan ? listingTerm(p.listed_until) : null;
              const review = REVIEW[p.review_status as keyof typeof REVIEW];
              return (
                <div key={p.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
                  <img src={thumb(p.image_url) || "/demo/p1.jpg"} alt="" loading="lazy" className="h-28 w-full rounded-xl object-cover sm:h-20 sm:w-28" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {review && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${review.cls}`}>{p.review_status === "pending" ? "بيتراجع من فاليو عقار" : review.label}</span>}
                      {term && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${term.cls}`}>{term.label}</span>}
                    </div>
                    <p className="mt-1 truncate font-bold text-primary">{p.title}</p>
                    <p className="text-sm text-muted-foreground">{formatPrice(Number(p.price))} ج.م · {p.status} · {p.area === p.city ? p.city : `${p.area}، ${p.city}`}</p>
                  </div>
                  <div className="flex gap-2">
                    {p.review_status === "approved" && !term?.ended && <Link to="/properties/$id" params={{ id: p.id }} className={btnOutline}>اعرض</Link>}
                    {term?.renewable && (
                      <button className={btnOutline} onClick={async () => {
                        const { error } = await supabase.rpc("renew_listing", { _property: p.id });
                        if (error) toast.error(error.message); else { toast.success("الإعلان اتجدّد"); reload(); }
                      }}><RefreshCw className="size-4" />جدّد</button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </DashShell>
  );
}

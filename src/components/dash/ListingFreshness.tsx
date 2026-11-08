import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { btnPrimary, btnOutline } from "@/components/site/ui";
import { formatDate } from "@/components/site/data";

const KEY = ["my-listing-freshness"];
const CONFIRM_AFTER_DAYS = 20;

export function useListingFreshness() {
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await supabase.rpc("my_listing_freshness")).data ?? [] });
  return new Map((q.data ?? []).map((r) => [r.id, r]));
}

/** «لسه متاح؟»: one tap keeps a listing visible, or brings back one hidden for not being confirmed. */
export function ConfirmListing({ id, row, onDone }: { id: string; row?: { confirmed_at: string; stale_hidden_at: string | null } | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  if (!row) return null;
  const old = Date.now() - Date.parse(row.confirmed_at) > CONFIRM_AFTER_DAYS * 86_400_000;
  if (!old && !row.stale_hidden_at) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={`text-xs font-bold ${row.stale_hidden_at ? "text-destructive" : "text-muted-foreground"}`}>{row.stale_hidden_at ? "مستخبي لعدم التأكيد" : `آخر تأكيد ${formatDate(row.confirmed_at)}`}</span>
      <button className={row.stale_hidden_at ? btnPrimary : btnOutline} onClick={async () => {
        const { error } = await supabase.rpc("confirm_listing", { _id: id });
        if (error) toast.error(error.message); else { toast.success("اتأكد، والإعلان ظاهر"); void qc.invalidateQueries({ queryKey: KEY }); onDone(); }
      }}><CheckCircle2 className="size-4" />لسه متاح</button>
    </span>
  );
}

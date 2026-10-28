import { useQuery } from "@tanstack/react-query";
import { dbx } from "@/lib/dbx";

/**
 * Plan perks the public pages need. Each read fails quietly (an older database without these columns just shows
 * no badge, 6 pins and no «عرض للكل»), so a page never breaks over a perk.
 */

/** Accounts whose plan gives «متحقق ✓» right now. */
export function useBadgeAccounts() {
  const q = useQuery({
    queryKey: ["plan-badges"], staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await dbx.from("brokers").select("id").eq("is_active", true).eq("plan_badge", true);
      return error ? [] : ((data ?? []) as { id: string }[]).map((r) => r.id);
    },
  });
  return new Set(q.data ?? []);
}

/** How many pinned listings the homepage shows at once (set by the admin). */
export function useHomePins() {
  const q = useQuery({
    queryKey: ["plan-home-pins"], staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await dbx.from("app_settings").select("plan_home_pins").eq("id", 1).maybeSingle();
      return error || !data ? 6 : Number(data.plan_home_pins) || 6;
    },
  });
  return q.data ?? 6;
}

export type Spotlight = { id: string; title: string; price: number; status: string; area: string; city: string; image_url: string | null };

/** Today's «عرض للكل» listing, if an account booked today. */
export function useTodaySpotlight() {
  return useQuery({
    queryKey: ["today-spotlight"], staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await dbx.rpc("today_spotlight");
      return error ? null : (((data ?? []) as Spotlight[])[0] ?? null);
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { Building2, Home, Users, ArrowLeftRight, Inbox, Tag, PencilLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/components/site/data";

const ICON: Record<string, typeof Home> = {
  created: Building2, details: PencilLine, unit_added: Home, unit_removed: Home, unit_status: Tag, unit_price: Tag, team: Users, handover: ArrowLeftRight, lead: Inbox,
};

/** Everything that changed on the compound: who did it and when (written by the database, nobody can edit it). */
export function CompoundActivity({ compoundId }: { compoundId: string }) {
  const q = useQuery({
    queryKey: ["compound-activity", compoundId],
    queryFn: async () => {
      const { data, error } = await supabase.from("compound_activity").select("*").eq("compound_id", compoundId).order("created_at", { ascending: false }).limit(300);
      if (error) throw error; return data;
    },
  });
  if (q.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (!q.data?.length) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش تغييرات متسجلة.</p>;
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {q.data.map((a) => {
        const Icon = ICON[a.kind] ?? PencilLine;
        return (
          <li key={a.id} className="flex items-start gap-3 p-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary"><Icon className="size-4 text-teal" /></span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-primary">{a.summary}</p>
              <p className="text-xs text-muted-foreground">{a.actor_label ?? "النظام"} · {formatDate(a.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

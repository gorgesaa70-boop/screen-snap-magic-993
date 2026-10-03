import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useAuth";

export type Notification = {
  id: string; user_id: string; title: string; message: string; type: string;
  related_id: string | null; related_url: string | null; is_read: boolean; created_at: string;
};

export const NOTIF_TYPES: Record<string, string> = {
  saved_search_match: "عقار مطابق لبحثك",
  new_inquiry: "استفسار جديد",
  new_request: "طلب عقاري",
  broker_reply: "رد الوسيط",
  request_status: "تحديث حالة",
  admin: "إداري",
};

/** Notifications of the signed-in user, kept live via Realtime. RLS limits rows to the owner. */
export function useNotifications(limit = 50) {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const key = ["notifications", user?.id, limit];
  const q = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notifications-${user.id}-${limit}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc, limit]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  const markRead = async (id: string) => { await supabase.from("notifications").update({ is_read: true }).eq("id", id); refresh(); };
  const markAll = async () => { if (user) await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false); refresh(); };
  const remove = async (id: string) => { await supabase.from("notifications").delete().eq("id", id); refresh(); };
  const items = q.data ?? [];
  return { user, items, unread: items.filter((n) => !n.is_read).length, loading: q.isLoading, markRead, markAll, remove };
}

export function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  return new Date(iso).toLocaleDateString("ar-EG");
}

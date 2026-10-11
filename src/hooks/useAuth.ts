import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useSessionUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

/** owner = account holder; manager / sales / broker = a company team member working inside the company's account. */
export type MemberRole = "owner" | "manager" | "sales" | "broker";

/** Roles + linked broker row for the signed-in user. Real enforcement lives in RLS/server. */
export function useMe() {
  const { user, loading } = useSessionUser();
  const q = useQuery({
    queryKey: ["me", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [roles, own, adminExists] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
        supabase.from("brokers").select("*").eq("user_id", user!.id).maybeSingle(),
        supabase.rpc("admin_exists"),
      ]);
      const list = (roles.data ?? []).map((r) => r.role);
      let broker = own.data;
      let memberRole: MemberRole | null = broker ? "owner" : null;
      let memberName: string | null = null;
      if (!broker) {
        const m = (await supabase.rpc("my_membership")).data?.[0];
        if (m) {
          broker = (await supabase.from("brokers").select("*").eq("id", m.company_id).maybeSingle()).data;
          if (broker) { memberRole = m.role as MemberRole; memberName = m.member_name; }
        }
      }
      return {
        isAdmin: list.includes("admin"), isStaff: list.includes("staff"), isBroker: list.includes("broker"),
        broker, memberRole, memberName, adminExists: !!adminExists.data,
      };
    },
  });
  return { user, loading: loading || (!!user && q.isLoading), me: q.data, refetch: q.refetch };
}

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbx } from "@/lib/dbx";

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
        supabase.rpc("my_account"),
        supabase.rpc("admin_exists"),
      ]);
      const list = (roles.data ?? []).map((r) => r.role);
      // my_account(): the user's own account (any status) or the company they work for — full row incl. contacts.
      const account = own.data?.[0] ?? null;
      let broker = account && account.user_id === user!.id ? account : null;
      let memberRole: MemberRole | null = broker ? "owner" : null;
      let memberName: string | null = null;
      if (!broker && account) {
        const m = (await dbx.rpc("my_membership")).data?.[0];
        if (m && m.company_id === account.id) { broker = account; memberRole = m.role as MemberRole; memberName = m.member_name; }
      }
      return {
        isAdmin: list.includes("admin"), isStaff: list.includes("staff"), isBroker: list.includes("broker"),
        broker, memberRole, memberName, adminExists: !!adminExists.data,
      };
    },
  });
  return { user, loading: loading || (!!user && q.isLoading), me: q.data, refetch: q.refetch };
}

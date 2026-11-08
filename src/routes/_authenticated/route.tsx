import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

let firstCheck = true;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const first = firstCheck;
    firstCheck = false;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // On a first page load a router redirect crashes React while it hydrates the empty ssr:false shell.
      if (first) { window.location.replace("/auth"); await new Promise(() => {}); }
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});

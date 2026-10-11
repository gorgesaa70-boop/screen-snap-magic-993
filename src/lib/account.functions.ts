import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { userId: string };

/**
 * In-app account deletion (Apple 5.1.1(v), Google Play): the signed-in user deletes their own account.
 * prepare_account_deletion() clears / unlinks their data, then the login is deleted. Admins are refused
 * (the platform must keep an admin).
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("امسح") }).parse(d))
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("prepare_account_deletion", { _uid: userId });
    if (error) { console.error("account deletion: cleanup failed", error.code); return { ok: false as const, error: "server" }; }
    if (data === "admin") return { ok: false as const, error: "admin" };
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) { console.error("account deletion: auth delete failed", delErr.status); return { ok: false as const, error: "server" }; }
    return { ok: true as const };
  });

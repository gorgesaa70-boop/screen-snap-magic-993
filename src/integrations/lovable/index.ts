import { createLovableAuth, type OAuthProvider } from "@lovable.dev/cloud-auth-js";
import { supabase } from "../supabase/client";

/** Google / Apple sign-in through Lovable Cloud's managed OAuth broker; the result is a normal Supabase session. */
const lovableAuth = createLovableAuth();

export const lovable = {
  auth: {
    async signInWithOAuth(provider: OAuthProvider, opts?: { redirect_uri?: string }) {
      const result = await lovableAuth.signInWithOAuth(provider, { redirect_uri: opts?.redirect_uri ?? window.location.origin });
      if (result.redirected) return { redirected: true as const, error: null };
      if (result.error) return { redirected: false as const, error: result.error };
      const { error } = await supabase.auth.setSession(result.tokens);
      return { redirected: false as const, error: error ?? null };
    },
  },
};

import type { User } from "@supabase/supabase-js";

type Meta = { profile_done?: boolean; full_name?: string; name?: string };

/** Every account fills «كمّل بياناتك» once, whatever the sign-in method (WhatsApp, Google, Apple, e-mail). */
export const needsProfile = (u: User | null | undefined) => !!u && !(u.user_metadata as Meta | undefined)?.profile_done;

/** Name already known from the provider (Google/Apple) or e-mail sign-up, used to pre-fill the form. */
export const knownName = (u: User | null | undefined) => {
  const m = u?.user_metadata as Meta | undefined;
  return (m?.full_name || m?.name || "").trim();
};

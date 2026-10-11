import { supabase } from "@/integrations/supabase/client";

/**
 * Temporary untyped accessor for tables and functions added by the 2026-10-11 release
 * (deals, deal_documents, company_members, app_settings, lead_alerts, my_membership, ...).
 * The generated types in src/integrations/supabase/types.ts only know them after the
 * release migration is applied and the types are regenerated — then replace dbx with
 * the typed `supabase` client again.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const dbx = supabase as any;

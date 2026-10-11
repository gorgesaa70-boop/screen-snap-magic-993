import { supabase } from "@/integrations/supabase/client";

/**
 * Client for tables added by the 2026-10-11 releases (deals, commissions, company_members, …).
 * It is the typed `supabase` client: src/integrations/supabase/types.ts already describes those
 * tables (hand-maintained until the database is migrated and Lovable regenerates the file).
 */
export const dbx = supabase;

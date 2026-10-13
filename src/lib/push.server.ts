import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateVapidKeys, sendPush, type VapidKeys } from "@/lib/webpush";

type Db = SupabaseClient<Database>;

/** The site's VAPID keys, created once on first use and kept in push_config (server-only). */
export async function siteVapid(db: Db): Promise<VapidKeys & { subject: string }> {
  const { data, error } = await db.from("push_config").select("vapid_public, vapid_private, vapid_subject").eq("id", 1).single();
  if (error) throw new Error(error.message);
  if (data.vapid_public && data.vapid_private) {
    return { publicKey: data.vapid_public, privateJwk: data.vapid_private as JsonWebKey, subject: data.vapid_subject };
  }
  const keys = await generateVapidKeys();
  // Only the first writer wins, so two requests at the same moment can't end up with different keys.
  await db.from("push_config").update({ vapid_public: keys.publicKey, vapid_private: keys.privateJwk as never, updated_at: new Date().toISOString() })
    .eq("id", 1).is("vapid_public", null);
  return siteVapid(db);
}

/** Constant-time comparison of the database's call secret. */
export async function pushSecretOk(db: Db, given: string | null) {
  if (!given) return false;
  const { data } = await db.from("push_config").select("secret").eq("id", 1).single();
  const want = data?.secret ?? "";
  if (want.length !== given.length || !want) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

const safePath = (u: string | null) => (u && u.startsWith("/") && !u.startsWith("//") ? u : "/notifications");

/**
 * Sends pending pushes: one notification (called by the database right after it is created) or, without an id,
 * any still pending from the last day (called by the scheduled dispatch as a safety net).
 */
export async function dispatchPush(db: Db, id?: string) {
  let q = db.from("notifications").select("id, user_id, title, message, related_id, related_url").eq("push_status", "pending");
  q = id ? q.eq("id", id) : q.gt("created_at", new Date(Date.now() - 864e5).toISOString()).order("created_at").limit(50);
  const { data: items, error } = await q;
  if (error) throw new Error(error.message);
  if (!items?.length) return { sent: 0, failed: 0 };

  const vapid = await siteVapid(db);
  let sent = 0, failed = 0;
  for (const n of items) {
    // Claim it first so a parallel run doesn't send it twice.
    const { data: claimed } = await db.from("notifications").update({ push_status: "sent", push_sent_at: new Date().toISOString() })
      .eq("id", n.id).eq("push_status", "pending").select("id");
    if (!claimed?.length) continue;
    const { data: devices } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, failed_count").eq("user_id", n.user_id);
    let delivered = 0;
    for (const d of devices ?? []) {
      let status = 0;
      try {
        status = await sendPush(d, { title: n.title, body: n.message, url: safePath(n.related_url), tag: n.related_id ?? n.id }, vapid, vapid.subject);
      } catch {
        status = 0;
      }
      if (status >= 200 && status < 300) {
        delivered++;
        await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString(), failed_count: 0 }).eq("id", d.id);
      } else if (status === 404 || status === 410 || d.failed_count >= 4) {
        // The browser dropped this subscription (or it keeps failing): forget the device.
        await db.from("push_subscriptions").delete().eq("id", d.id);
      } else {
        await db.from("push_subscriptions").update({ failed_count: d.failed_count + 1 }).eq("id", d.id);
      }
    }
    if (delivered) sent++;
    else {
      failed++;
      await db.from("notifications").update({ push_status: devices?.length ? "failed" : "skipped" }).eq("id", n.id);
    }
  }
  return { sent, failed };
}

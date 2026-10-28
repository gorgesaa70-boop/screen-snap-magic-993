/**
 * IndexNow: tells Bing, Yandex and the other IndexNow engines about new or changed public pages (Google reads the
 * sitemap instead). Sends only pages changed since the last send — the same pages again and again count as spam (429).
 * `minGapMs` keeps automatic sends (after approvals, when the sitemap is read) to one per gap.
 */
export async function sendIndexNow({ minGapMs = 0 }: { minGapMs?: number } = {}) {
  const { INDEXNOW_KEY, absoluteUrl, publicPages } = await import("@/lib/site-urls");
  const { SITE_URL } = await import("@/lib/seo");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin.from("app_settings").select("id, indexnow_sent_at").limit(1).maybeSingle();
  const since = settings?.indexnow_sent_at ? new Date(settings.indexnow_sent_at).getTime() : 0;
  if (minGapMs && since && Date.now() - since < minGapMs) return { ok: true, status: 0, count: 0, sentAt: settings?.indexnow_sent_at ?? null, skipped: true };
  // Pages without a date (home, lists, brokers…) go only on the first send.
  const urlList = (await publicPages())
    .filter((e) => !since || (e.lastmod != null && new Date(e.lastmod).getTime() > since))
    .map((e) => absoluteUrl(e.path)).slice(0, 10000);
  if (!urlList.length) return { ok: true, status: 0, count: 0, sentAt: settings?.indexnow_sent_at ?? null };
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE_URL).host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList }),
  });
  // 200 = accepted, 202 = accepted while the key is being checked.
  const ok = res.status === 200 || res.status === 202;
  const sentAt = ok ? new Date().toISOString() : settings?.indexnow_sent_at ?? null;
  if (ok && settings?.id != null) await supabaseAdmin.from("app_settings").update({ indexnow_sent_at: sentAt }).eq("id", settings.id);
  return { ok, status: res.status, count: urlList.length, sentAt };
}

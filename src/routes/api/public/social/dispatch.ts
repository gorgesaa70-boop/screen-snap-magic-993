import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** How many listings one run handles (each draws a card and makes up to 3 Buffer calls). */
const BATCH = 3;
const MAX_ATTEMPTS = 3;
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

type Results = Record<string, { id?: string; dueAt?: string | null; error?: string }>;

/**
 * Social auto-post (release 45). The database calls this every 2 minutes when a newly approved listing is due
 * (secret from push_config). For each one: draw the card, store it in the media bucket, write the caption and add
 * the post to the Facebook / Instagram / TikTok queues in Buffer. Newest listings first.
 */
export const Route = createFileRoute("/api/public/social/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { pushSecretOk } = await import("@/lib/push.server");
        if (!(await pushSecretOk(db, request.headers.get("x-push-secret")))) {
          const denied = await authenticateCronRequest(request);
          if (denied) return denied;
        }
        const key = process.env["BUFFER_API_KEY"];
        if (!key) return Response.json({ configured: false });

        const { data: settings } = await db.from("app_settings")
          .select("social_autopost, social_channels, android_url, ios_url").eq("id", 1).single();
        if (!settings?.social_autopost) return Response.json({ configured: true, enabled: false });

        const { data: claimed, error: claimError } = await db.rpc("social_claim", { _n: BATCH });
        if (claimError) return Response.json({ error: claimError.message }, { status: 500 });
        if (!claimed?.length) return Response.json({ configured: true, done: 0 });

        const { bufferChannels, bufferPost, isQueueFull } = await import("@/lib/buffer.server");
        const { caption, cardFields, shortTitle } = await import("@/lib/social-post");
        const { renderCard } = await import("@/lib/social-card.server");
        const origin = new URL(request.url).origin;
        const appUrl = settings.android_url || settings.ios_url ? "https://valueaqar.com/app" : null;

        let channels: Awaited<ReturnType<typeof bufferChannels>> = [];
        try {
          channels = (await bufferChannels(key)).filter((c) => settings.social_channels.includes(c.service) && !c.isQueuePaused);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          for (const row of claimed) await db.rpc("social_finish", { _id: row.id, _status: "pending", _results: row.results, _error: msg, _retry_minutes: 30 });
          return Response.json({ error: msg }, { status: 502 });
        }

        const summary: Record<string, string> = {};
        // Claimed newest first; posting the oldest of the batch first with «share next» leaves the newest at the front.
        for (const row of [...claimed].reverse()) {
          const results: Results = { ...((row.results as Results | null) ?? {}) };
          try {
            const { data: l } = await db.from("properties")
              .select("id, listing_no, title, description, type, status, city, area, size, rooms, baths, price, price_unit, finishing, payment_method, down_payment, installment_years, images, image_url, review_status, availability, is_demo")
              .eq("id", row.property_id).maybeSingle();
            if (!l || l.review_status !== "approved" || (l.availability ?? "available") !== "available" || l.is_demo) {
              await db.rpc("social_finish", { _id: row.id, _status: "skipped", _results: results, _error: "العقار مبقاش متاح" });
              summary[row.id] = "skipped";
              continue;
            }

            let cardUrl = row.card_url;
            if (!cardUrl) {
              const jpeg = await renderCard(cardFields(l), origin);
              const path = `social/${l.id}.jpg`;
              const up = await db.storage.from("media").upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
              if (up.error) throw new Error(`upload: ${up.error.message}`);
              const signed = await db.storage.from("media").createSignedUrl(path, TEN_YEARS);
              if (signed.error || !signed.data) throw new Error(`signed url: ${signed.error?.message}`);
              cardUrl = signed.data.signedUrl;
            }
            const text = row.caption || caption(l, { appUrl });

            let queueFull = false, failed = false;
            for (const ch of channels) {
              if (results[ch.service]?.id) continue;
              try {
                const post = await bufferPost(key, ch, { text, imageUrl: cardUrl, title: shortTitle(l) });
                results[ch.service] = { id: post.id, dueAt: post.dueAt };
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (isQueueFull(msg)) queueFull = true; else failed = true;
                results[ch.service] = { error: msg.slice(0, 300) };
              }
            }
            const allDone = channels.length > 0 && channels.every((c) => results[c.service]?.id);
            const errors = Object.entries(results).filter(([, r]) => r.error).map(([s, r]) => `${s}: ${r.error}`).join(" | ") || null;
            const status = allDone ? "posted"
              : queueFull && !failed ? "partial"
              : row.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
            await db.rpc("social_finish", {
              _id: row.id, _status: status, _results: results, _error: channels.length ? (errors ?? "") : "مفيش قنوات مربوطة في Buffer",
              _card_url: cardUrl, _caption: text, _retry_minutes: queueFull ? 60 : 15,
            });
            summary[row.id] = status;
          } catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
            console.error("social dispatch", msg);
            await db.rpc("social_finish", { _id: row.id, _status: row.attempts >= MAX_ATTEMPTS ? "failed" : "pending", _results: results, _error: msg, _retry_minutes: 15 });
            summary[row.id] = `error: ${msg}`;
          }
        }
        return Response.json({ configured: true, channels: channels.map((c) => c.service), summary });
      },
    },
  },
});

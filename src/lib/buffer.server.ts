// Buffer GraphQL API (https://developers.buffer.com): find the connected channels and add posts to their queues.
// The key is the BUFFER_API_KEY secret (Buffer → Settings → API); it never reaches the browser.
const API = "https://api.buffer.com";

export type BufferChannel = { id: string; service: string; displayName: string | null; isQueuePaused: boolean };

async function gql<T>(key: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const r = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await r.text();
  let body: { data?: T; errors?: { message: string }[] };
  try { body = JSON.parse(text); } catch { throw new Error(`Buffer ${r.status}: ${text.slice(0, 200)}`); }
  if (!r.ok || body.errors?.length) throw new Error(`Buffer ${r.status}: ${body.errors?.map((e) => e.message).join("; ") || text.slice(0, 200)}`);
  return body.data as T;
}

/** Every channel in every organization of the key's account (Free plan: one organization, up to 3 channels). */
export async function bufferChannels(key: string): Promise<BufferChannel[]> {
  const { account } = await gql<{ account: { organizations: { id: string }[] } }>(key, "query { account { organizations { id } } }");
  const all: BufferChannel[] = [];
  for (const org of account.organizations) {
    const { channels } = await gql<{ channels: BufferChannel[] }>(key,
      "query($org: OrganizationId!) { channels(input: { organizationId: $org }) { id service displayName isQueuePaused } }", { org: org.id });
    all.push(...channels);
  }
  return all;
}

/** Metadata each network needs for a single-image feed post. */
function metadata(service: string, title: string) {
  if (service === "instagram") return { instagram: { type: "post", shouldShareToFeed: true } };
  if (service === "facebook") return { facebook: { type: "post" } };
  if (service === "tiktok") return { tiktok: { title } };
  return undefined;
}

/**
 * Schedules one image post on the channel at an exact time (dueAt, ISO), the same time for every channel; without
 * one it goes to the front of the channel's queue («share next»). Returns the post id and when Buffer will publish
 * it, or throws with Buffer's message (e.g. the queue is full).
 */
export async function bufferPost(key: string, ch: BufferChannel, p: { text: string; imageUrl: string; title: string; dueAt?: string | null }) {
  const res = await gql<{ createPost: { post?: { id: string; dueAt: string | null }; message?: string } }>(key,
    `mutation($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id dueAt } }
        ... on MutationError { message }
      }
    }`,
    { input: {
      channelId: ch.id, text: p.text, schedulingType: "automatic",
      ...(p.dueAt ? { mode: "customScheduled", dueAt: p.dueAt } : { mode: "shareNext" }),
      assets: [{ image: { url: p.imageUrl } }],
      metadata: metadata(ch.service, p.title),
    } });
  if (!res.createPost.post) throw new Error(res.createPost.message || "Buffer refused the post");
  return res.createPost.post;
}

/** Buffer's way of saying the free plan's 10-posts-per-channel queue is full: try again later instead of failing. */
export const isQueueFull = (msg: string) => /limit|queue.*full|maximum|upgrade/i.test(msg);

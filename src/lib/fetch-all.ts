/**
 * Item 38: the database API returns at most 1,000 rows per request, so a plain select silently drops the rest.
 * fetchAll asks page by page (the query must have a stable order) until a short page comes back.
 */
export const PAGE = 1000;
const CAP = 50_000;

export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; out.length < CAP; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

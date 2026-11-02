import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { dbx } from "@/lib/dbx";
import { listingCode, formatDate } from "@/components/site/data";

const when = (d: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(d));

const CHANNELS: { id: string; label: string }[] = [{ id: "facebook", label: "فيسبوك" }, { id: "instagram", label: "إنستجرام" }, { id: "tiktok", label: "تيك توك" }];
const CATEGORIES: { id: string; label: string }[] = [{ id: "residential", label: "العقارات" }, { id: "mall", label: "وحدات المولات" }, { id: "industrial", label: "الصناعي" }];
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "مستني دوره", cls: "bg-secondary text-primary" },
  processing: { label: "بيتنشر دلوقتي", cls: "bg-teal-soft text-primary" },
  posted: { label: "اتنشر", cls: "bg-primary text-primary-foreground" },
  partial: { label: "طابور Buffer مليان — هيتبعت تاني", cls: "bg-[#f2b84b]/25 text-primary" },
  failed: { label: "فشل", cls: "bg-destructive/10 text-destructive" },
  skipped: { label: "مش هيتنشر", cls: "bg-muted text-muted-foreground" },
};

type Settings = { social_autopost: boolean; social_since: string | null; social_channels: string[]; social_categories: string[]; social_slots: number[]; social_lookahead: number };
type Row = {
  id: string; status: string; results: Record<string, { id?: string; dueAt?: string | null; error?: string }>; error: string | null;
  card_url: string | null; created_at: string; posted_at: string | null; next_attempt_at: string; scheduled_for: string | null;
  properties: { id: string; title: string; listing_no: number | null } | null;
};

/** لوحة الإدارة ← الإعدادات ← النشر على السوشيال: every newly approved listing goes to Facebook / Instagram / TikTok by itself. */
export function SocialAutopostAdmin() {
  const qc = useQueryClient();
  const s = useQuery({
    queryKey: ["social-settings"],
    queryFn: async () => (await dbx.from("app_settings").select("social_autopost, social_since, social_channels, social_categories, social_slots, social_lookahead").eq("id", 1).maybeSingle()).data as Settings | null,
  });
  const posts = useQuery({
    queryKey: ["social-posts"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await dbx.from("social_posts")
        .select("id, status, results, error, card_url, created_at, posted_at, next_attempt_at, scheduled_for, properties(id, title, listing_no)")
        .order("updated_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  // How many are still waiting (new + the existing listings queued with «انشر العقارات الموجودة»).
  const waiting = useQuery({
    queryKey: ["social-waiting"],
    refetchInterval: 60_000,
    queryFn: async () => (await dbx.from("social_posts").select("id", { count: "exact", head: true }).in("status", ["pending", "partial"])).count ?? 0,
  });

  async function backfill() {
    if (!confirm("هيتحط في الطابور كل العقارات المتاحة اللي على الموقع ولسه ماتنشرتش، من الأحدث للأقدم، وتنزل في مواعيد النشر. أي عقار جديد بياخد أول ميعاد قبلهم. نكمّل؟")) return;
    const { data, error } = await dbx.rpc("social_backfill");
    if (error) { toast.error(/social_backfill/.test(error.message) ? "محتاجة تحديث قاعدة البيانات (إصدار 46)" : error.message); return; }
    toast.success(`اتحط ${data ?? 0} عقار في الطابور`);
    qc.invalidateQueries({ queryKey: ["social-waiting"] });
    qc.invalidateQueries({ queryKey: ["social-posts"] });
  }

  async function save(patch: Partial<Settings>) {
    if (patch.social_autopost && !confirm("من دلوقتي، كل عقار جديد يتوافق عليه هيتنشر لوحده على السوشيال بعد 10 دقايق. نكمّل؟")) return;
    const { error } = await dbx.from("app_settings").update(patch).eq("id", 1);
    if (error) { toast.error(/social_/.test(error.message) ? "محتاجة تحديث قاعدة البيانات (إصدار 46)" : error.message); return; }
    qc.invalidateQueries({ queryKey: ["social-settings"] });
  }
  async function setStatus(id: string, status: "skipped" | "pending") {
    const { error } = await dbx.from("social_posts").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "skipped" ? "البوست ده مش هيتنشر" : "هيتنشر في خلال دقيقتين");
    qc.invalidateQueries({ queryKey: ["social-posts"] });
  }
  const toggle = <T,>(list: T[], id: T) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const pill = (on: boolean) => `h-9 rounded-full border px-4 text-xs font-bold transition ${on ? "border-teal bg-teal-soft text-primary" : "bg-card text-muted-foreground"}`;

  if (s.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (!s.data) return <p className="rounded-2xl border bg-card p-6 text-sm">النشر على السوشيال محتاج تحديث قاعدة البيانات (إصدار 46).</p>;
  const st = s.data;
  return (
    <div className="max-w-4xl space-y-4">
      <div className={`rounded-2xl border p-4 md:p-6 ${st.social_autopost ? "border-teal/50 bg-teal-soft/40" : "bg-card"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-primary">النشر التلقائي: {st.social_autopost ? <span className="text-teal">شغّال</span> : <span className="text-muted-foreground">متوقف</span>}</p>
          <button type="button" onClick={() => save({ social_autopost: !st.social_autopost })}
            className={`h-10 rounded-xl px-5 text-sm font-bold ${st.social_autopost ? "border text-primary" : "bg-primary text-primary-foreground"}`}>
            {st.social_autopost ? "وقّف النشر" : "شغّل النشر"}
          </button>
          {st.social_autopost && st.social_since && <span className="text-xs text-muted-foreground">شغّال من {formatDate(st.social_since)} — العقارات اللي قبل كده مش هتتنشر.</span>}
        </div>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          كل عقار جديد يتوافق عليه بيتعمله صورة بشكل فاليو عقار (الصورة والسعر والمساحة والكود) ونص كامل بالهاشتاجات، وينزل على كل القنوات المختارة في نفس الميعاد من مواعيد النشر.
          بيستنى 10 دقايق علشان تقدر تدوس «ماتنشرش». أقرب ميعادين بس بيتحجزوا، فالعقار الجديد دايمًا بياخد أول ميعاد فاضي قبل القديم.
          محتاج مفتاح <span dir="ltr">BUFFER_API_KEY</span> في Secrets.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold text-primary">القنوات:</span>
          {CHANNELS.map((c) => <button key={c.id} type="button" className={pill(st.social_channels.includes(c.id))} onClick={() => save({ social_channels: toggle(st.social_channels, c.id) })}>{c.label}</button>)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold text-primary">يتنشر:</span>
          {CATEGORIES.map((c) => <button key={c.id} type="button" className={pill(st.social_categories.includes(c.id))} onClick={() => save({ social_categories: toggle(st.social_categories, c.id) })}>{c.label}</button>)}
        </div>
        <div className="mt-4">
          <p className="text-sm font-bold text-primary">مواعيد النشر (بتوقيت مصر) — {st.social_slots.length} في اليوم</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Array.from({ length: 24 }, (_, h) => {
              const on = st.social_slots.includes(h);
              const label = h === 0 ? "12 ص" : h < 12 ? `${h} ص` : h === 12 ? "12 م" : `${h - 12} م`;
              return <button key={h} type="button" className={`h-8 min-w-12 rounded-lg border px-2 text-xs font-bold ${on ? "border-teal bg-teal-soft text-primary" : "bg-card text-muted-foreground"}`}
                onClick={() => { const next = toggle(st.social_slots, h).sort((a, b) => a - b); if (next.length) save({ social_slots: next }); }}>{label}</button>;
            })}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
          <button type="button" onClick={backfill} className="h-10 rounded-xl border border-primary px-4 text-sm font-bold text-primary">انشر العقارات الموجودة</button>
          <span className="text-xs text-muted-foreground">
            في الطابور دلوقتي: {waiting.data ?? 0}{st.social_slots.length && waiting.data ? ` — بيخلصوا في حوالي ${Math.ceil(waiting.data / st.social_slots.length)} يوم` : ""}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <p className="border-b px-4 py-3 text-sm font-bold text-primary">آخر البوستات</p>
        {!posts.data?.length ? <p className="p-4 text-sm text-muted-foreground">لسه مفيش بوستات. أول عقار جديد يتوافق عليه بعد التشغيل (أو بعد «انشر العقارات الموجودة») هيظهر هنا.</p> : (
          <ul className="divide-y">
            {posts.data.map((r) => {
              const badge = STATUS[r.status] ?? STATUS["pending"]!;
              const p = r.properties;
              return (
                <li key={r.id} className="flex flex-wrap items-start gap-3 p-4">
                  {r.card_url ? <a href={r.card_url} target="_blank" rel="noreferrer"><img src={r.card_url} alt="" className="size-16 rounded-lg border object-cover" /></a> : <div className="size-16 rounded-lg bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-primary">
                      {p ? <a href={`/properties/${p.id}`} target="_blank" rel="noreferrer" className="hover:underline">{p.listing_no != null ? `${listingCode(p.listing_no)} · ` : ""}{p.title}</a> : "عقار اتمسح"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2.5 py-1 font-bold ${badge.cls}`}>{badge.label}</span>
                      {r.scheduled_for && <span className="font-bold text-primary">{r.status === "posted" ? "ميعاد النشر" : "هينزل"}: {when(r.scheduled_for)}</span>}
                      {CHANNELS.map((c) => {
                        const x = r.results?.[c.id];
                        if (!x) return null;
                        return <span key={c.id} className={x.id ? "text-teal" : "text-destructive"}>{c.label}: {x.id ? "✓" : "خطأ"}</span>;
                      })}
                    </div>
                    {r.error && r.status !== "posted" && <p className="mt-1 break-words text-xs text-destructive">{r.error}</p>}
                  </div>
                  <div className="flex gap-2">
                    {["pending", "partial", "failed"].includes(r.status) && <button type="button" onClick={() => setStatus(r.id, "skipped")} className="h-9 rounded-xl border px-3 text-xs font-bold text-primary">ماتنشرش</button>}
                    {["failed", "skipped", "partial"].includes(r.status) && <button type="button" onClick={() => setStatus(r.id, "pending")} className="h-9 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">انشر تاني</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

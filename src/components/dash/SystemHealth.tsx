import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportBackup, notifySearchEngines } from "@/lib/admin.functions";
import { btnOutline, btnPrimary } from "@/components/site/ui";
import { formatDate, storeImage } from "@/components/site/data";
import { THUMB_SIDE, extensionFor, hasThumb, prepareImage, withThumb } from "@/lib/images";

/** Item 37: website / server errors of the last 30 days, and the data backup download. */
export function SystemHealth() {
  const errors = useQuery({ queryKey: ["app-errors"], queryFn: async () => (await supabase.from("app_errors").select("*").order("last_seen", { ascending: false }).limit(200)).data ?? [] });
  const settings = useQuery({ queryKey: ["app-settings-backup"], queryFn: async () => (await supabase.from("app_settings").select("last_backup_at").eq("id", 1).maybeSingle()).data });
  const backup = useServerFn(exportBackup);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const last = settings.data?.last_backup_at ?? null;
  const stale = !last || Date.now() - new Date(last).getTime() > 7 * 864e5;

  async function download() {
    setBusy(true);
    const r = await backup().catch(() => null);
    setBusy(false);
    if (!r?.ok) { toast.error("تعذّر تجهيز النسخة"); return; }
    const url = URL.createObjectURL(new Blob([r.json], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `valueaqar-backup-${r.at.slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
    toast.success(r.missing.length ? `اتنزلت النسخة (ناقص: ${r.missing.join("، ")})` : "اتنزلت النسخة الاحتياطية ✓ احفظها في مكان آمن");
    settings.refetch();
  }
  async function clear() {
    if (!confirm("تمسح كل الأخطاء المسجلة؟")) return;
    const { error } = await supabase.from("app_errors").delete().not("id", "is", null);
    if (error) toast.error("تعذّر المسح"); else errors.refetch();
  }

  return (
    <div className="space-y-6">
      <DemoData />
      <SearchEngines />
      <CardPhotos />
      <section className={`rounded-2xl border p-5 ${stale ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            {stale ? <AlertTriangle className="size-6 shrink-0 text-destructive" /> : <CheckCircle2 className="size-6 shrink-0 text-teal" />}
            <div>
              <p className="font-bold text-primary">النسخة الاحتياطية</p>
              <p className="text-sm text-muted-foreground">{last ? `آخر نسخة: ${formatDate(last)}` : "لسه متنزّلتش أي نسخة."} {stale && "يُفضّل تنزّل نسخة كل أسبوع وتحفظها على جهازك أو Google Drive."}</p>
              <p className="mt-1 text-xs text-muted-foreground">بتشمل كل بيانات المنصة (الحسابات، العقارات، العملاء، الصفقات، العمولات…). الصور والمستندات مش جواها.</p>
            </div>
          </div>
          <button disabled={busy} onClick={download} className={btnPrimary}><Download className="size-4" />{busy ? "بيتجهز..." : "نزّل نسخة دلوقتي"}</button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-primary">أخطاء الموقع</h2>
            <p className="text-sm text-muted-foreground">أي مشكلة بتحصل لزائر أو في السيرفر بتتسجل هنا تلقائي (آخر 30 يوم). الخطأ المتكرر بيتجمّع في سطر واحد بعدد مراته.</p>
          </div>
          {!!errors.data?.length && <button onClick={clear} className={btnOutline}><Trash2 className="size-4" />مسح الكل</button>}
        </div>
        {errors.isLoading ? <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          : !errors.data?.length ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش أخطاء متسجلة ✓</p> : (
          <ul className="space-y-2">
            {errors.data.map((e) => (
              <li key={e.id} className="rounded-2xl border bg-card p-4">
                <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full flex-wrap items-start justify-between gap-2 text-start">
                  <span className="min-w-0">
                    <span className="block font-bold break-words text-primary" dir="ltr">{e.message}</span>
                    <span className="text-xs text-muted-foreground">{e.kind === "server" ? "السيرفر" : "المتصفح"} · {e.path ?? "—"} · آخر مرة {new Date(e.last_seen).toLocaleString("ar-EG")}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">×{e.count}</span>
                </button>
                {open === e.id && (e.stack || e.user_agent) && (
                  <pre className="mt-3 max-h-60 overflow-auto rounded-xl bg-secondary p-3 text-[11px] whitespace-pre-wrap" dir="ltr">{[e.stack, e.user_agent].filter(Boolean).join("\n\n")}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Item 32: hide the demo brokers / listings from the public (reversible), or delete them for good. */
function DemoData() {
  const q = useQuery({
    queryKey: ["demo-data"],
    queryFn: async () => {
      const [s, p, b] = await Promise.all([
        supabase.from("app_settings").select("show_demo").eq("id", 1).maybeSingle(),
        supabase.from("properties").select("id", { count: "exact", head: true }).eq("is_demo", true),
        supabase.from("brokers").select("id", { count: "exact", head: true }).eq("is_demo", true),
      ]);
      return { show: s.data?.show_demo ?? true, properties: p.count ?? 0, brokers: b.count ?? 0 };
    },
  });
  if (!q.data || (q.data.properties === 0 && q.data.brokers === 0)) return null;
  const { show, properties, brokers } = q.data;
  async function toggle() {
    const { error } = await supabase.from("app_settings").update({ show_demo: !show }).eq("id", 1);
    if (error) toast.error("تعذّر الحفظ"); else { toast.success(show ? "البيانات التجريبية اختفت من الموقع" : "البيانات التجريبية رجعت تظهر"); q.refetch(); }
  }
  async function remove() {
    if (!confirm(`هيتمسح ${properties} عقار تجريبي و${brokers} وسيط تجريبي نهائيًا. متأكد؟`)) return;
    const { data, error } = await supabase.rpc("delete_demo_data");
    if (error) { toast.error(error.message); return; }
    const r = data as { properties: number; brokers: number };
    toast.success(`اتمسح ${r.properties} عقار و${r.brokers} وسيط تجريبي`);
    q.refetch();
  }
  return (
    <section className="rounded-2xl border bg-card p-5">
      <p className="font-bold text-primary">البيانات التجريبية</p>
      <p className="mt-1 text-sm text-muted-foreground">فيه {properties} عقار و{brokers} وسيط تجريبي. {show ? "ظاهرين دلوقتي للزوار بعلامة «إعلان تجريبي»." : "مخفيين عن الزوار (إنت بس اللي شايفهم)."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={toggle} className={show ? btnPrimary : btnOutline}>{show ? "إخفاء البيانات التجريبية من الموقع" : "إظهارها تاني"}</button>
        {!show && <button onClick={remove} className="h-11 rounded-xl px-4 text-sm font-bold text-destructive hover:bg-destructive/10">مسحها نهائيًا</button>}
      </div>
    </section>
  );
}

/** Push every public page to Bing/Yandex (IndexNow). Google picks pages up from the sitemap in Search Console. */
function SearchEngines() {
  const notify = useServerFn(notifySearchEngines);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  useEffect(() => {
    supabase.from("app_settings").select("indexnow_sent_at").limit(1).maybeSingle().then(({ data }) => setSentAt(data?.indexnow_sent_at ?? null));
  }, []);
  async function run() {
    setBusy(true);
    const r = await notify().catch(() => null);
    setBusy(false);
    if (r) setSentAt(r.sentAt ?? null);
    if (r?.ok && r.count === 0) toast.info("مفيش صفحات جديدة أو متعدلة من آخر مرة");
    else if (r?.ok) toast.success(`اتبعت ${r.count} صفحة جديدة أو متعدلة ✓`);
    else if (r?.status === 429) toast.error("محركات البحث شايفة إننا بعتنا كتير — جرّب بعد ساعة");
    else toast.error(r ? `محركات البحث رفضت الطلب (كود ${r.status})` : "تعذّر الإرسال");
  }
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-primary">محركات البحث</p>
          <p className="text-sm text-muted-foreground">بيبلّغ Bing وYandex بالصفحات الجديدة أو اللي اتعدلت من آخر مرة (أول مرة بيبعت كل الصفحات) عشان تتفهرس بسرعة. اضغطه بعد ما تنزل عقارات جديدة. جوجل بيقرا خريطة الموقع من Search Console.</p>
          {sentAt && <p className="mt-1 text-xs font-semibold text-muted-foreground">آخر إرسال: {new Date(sentAt).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}</p>}
        </div>
        <button disabled={busy} onClick={run} className={btnOutline}>{busy ? "بيتبعت..." : "بلّغ محركات البحث"}</button>
      </div>
    </section>
  );
}

/** One pass over older listings: each uploaded photo gets a 640px card copy (new uploads get one automatically). */
function CardPhotos() {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const needs = (u: string | null | undefined): u is string => !!u && u.includes("/storage/v1/") && !hasThumb(u);

  async function run() {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) { toast.error("سجّل دخول تاني"); return; }
    setBusy(true);
    let photos = 0, failed = 0;
    try {
      const { data: rows, error } = await supabase.from("properties").select("id, image_url, images");
      if (error) throw error;
      const todo = (rows ?? []).filter((r) => needs(r.image_url) || r.images.some(needs));
      for (const [n, r] of todo.entries()) {
        setStep(`${n + 1} من ${todo.length}`);
        const done = new Map<string, string>();
        const fix = async (u: string | null) => {
          if (!needs(u)) return u;
          if (!done.has(u)) {
            try {
              const res = await fetch(u);
              if (!res.ok) throw new Error(String(res.status));
              const blob = await res.blob();
              const small = await prepareImage(new File([blob], "photo", { type: blob.type || "image/jpeg" }), THUMB_SIDE, 0.75);
              const path = `${uid}/cards/${r.id}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(small.type)}`;
              done.set(u, withThumb(u, await storeImage(path, small)));
              photos++;
            } catch {
              failed++;
              done.set(u, u);
            }
          }
          return done.get(u)!;
        };
        const images: string[] = [];
        for (const u of r.images) images.push((await fix(u))!);
        const image_url = await fix(r.image_url);
        if (image_url !== r.image_url || images.some((u, i) => u !== r.images[i])) {
          const { error: e2 } = await supabase.from("properties").update({ images, image_url }).eq("id", r.id);
          if (e2) failed++;
        }
      }
      if (!todo.length) toast.info("كل الصور متصغرة خلاص");
      else if (failed) toast.warning(`اتصغرت ${photos} صورة، و${failed} ماتصغرتش (هتفضل تظهر بحجمها الكامل) — ممكن تضغط تاني`);
      else toast.success(`اتصغرت ${photos} صورة ✓`);
    } catch {
      toast.error("تعذّر تحميل الإعلانات — جرّب تاني");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-primary">تصغير صور الإعلانات القديمة</p>
          <p className="text-sm text-muted-foreground">بيعمل نسخة صغيرة من كل صورة اترفعت قبل كده، عشان الكروت تفتح أسرع على الموبايل. الصور الجديدة بتتصغر لوحدها. سيب الصفحة مفتوحة لحد ما يخلص.</p>
        </div>
        <button disabled={busy} onClick={run} className={btnOutline}>{busy ? `بيصغّر... ${step}` : "صغّر الصور"}</button>
      </div>
    </section>
  );
}

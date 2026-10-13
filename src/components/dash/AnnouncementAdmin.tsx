import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { dbx } from "@/lib/dbx";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { AnnouncementBarView, isLive, useAnnouncement, type Announcement } from "@/components/site/SiteAnnouncement";

/** datetime-local works in local time without a zone; the database keeps UTC. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const EMPTY: Announcement = { on: false, ar: "", en: "", url: "", popup: false, startsAt: null, endsAt: null };

/** Admin writes the pinned message every visitor sees: a bar over the site header, and optionally a one-time popup. */
export function AnnouncementAdmin() {
  const q = useAnnouncement();
  const qc = useQueryClient();
  const [f, setF] = useState<Announcement>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);

  if (q.isSuccess && q.data === null) {
    return <p className="max-w-2xl rounded-2xl border bg-card p-6 text-sm">رسالة التثبيت محتاجة تحديث قاعدة البيانات (إصدار 20) الأول.</p>;
  }

  async function save(next: Announcement) {
    const ar = next.ar.trim(); const en = next.en.trim(); const url = next.url.trim();
    if (next.on && ar.length < 2) { toast.error("اكتب نص الرسالة بالعربي الأول"); return; }
    if (url && !/^(https:\/\/|\/)\S*$/.test(url)) { toast.error("الرابط لازم يبدأ بـ https:// أو / (صفحة جوه الموقع)"); return; }
    if (next.startsAt && next.endsAt && Date.parse(next.endsAt) <= Date.parse(next.startsAt)) { toast.error("ميعاد النهاية لازم يكون بعد ميعاد البداية"); return; }
    setBusy(true);
    const { error } = await dbx.from("app_settings").update({
      announce_on: next.on, announce_ar: ar || null, announce_en: en || null, announce_url: url || null,
      announce_popup: next.popup, announce_starts_at: next.startsAt, announce_ends_at: next.endsAt,
    }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(next.on ? "الرسالة اتثبتت على الموقع" : "الرسالة اتشالت من الموقع");
    qc.invalidateQueries({ queryKey: ["site-announcement"] });
  }

  const preview = { ...f, ar: f.ar.trim() || "اكتب الرسالة عشان تشوف شكلها هنا" };
  const live = isLive(q.data);
  const scheduled = q.data?.on && !live && q.data.startsAt && Date.parse(q.data.startsAt) > Date.now();

  return (
    <div className="max-w-2xl space-y-4 rounded-2xl border bg-card p-4 md:p-6">
      <p className="text-sm text-muted-foreground">
        الرسالة دي بتظهر لأي حد يفتح الموقع، في كل الصفحات، على الكمبيوتر والموبايل وجوه تطبيق الآيفون والأندرويد.
        بتظهر كشريط فوق الهيدر مكان شريط الأخبار. الزائر يقدر يقفلها، ولو غيّرت النص هتظهر له تاني.
      </p>
      <p className={`rounded-xl px-3 py-2 text-sm font-bold ${live ? "bg-teal/15 text-primary" : "bg-muted text-muted-foreground"}`}>
        الحالة دلوقتي: {live ? "ظاهرة على الموقع" : scheduled ? "متجدولة، هتظهر في ميعاد البداية" : "مش ظاهرة"}
      </p>

      <Field label="نص الرسالة بالعربي">
        <textarea className={`${inputCls} min-h-20 py-2`} value={f.ar} maxLength={300} onChange={(e) => setF({ ...f, ar: e.target.value })}
          placeholder="مثال: افتتاح مكتب فاليو عقار في برج العرب، وخصم 10% على عمولة أول 50 عميل" />
        <span className="text-xs text-muted-foreground">{f.ar.length}/300</span>
      </Field>
      <Field label="نص الرسالة بالإنجليزي (اختياري، لو فاضي هيظهر العربي)">
        <textarea dir="ltr" className={`${inputCls} min-h-20 py-2`} value={f.en} maxLength={300} onChange={(e) => setF({ ...f, en: e.target.value })} />
        <span className="text-xs text-muted-foreground">{f.en.length}/300</span>
      </Field>
      <Field label="رابط «التفاصيل» (اختياري)">
        <input dir="ltr" className={inputCls} value={f.url} maxLength={300} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="/compounds أو https://..." />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="تبدأ من (اختياري)">
          <input type="datetime-local" className={inputCls} value={toLocalInput(f.startsAt)} onChange={(e) => setF({ ...f, startsAt: fromLocalInput(e.target.value) })} />
        </Field>
        <Field label="تخلص في (اختياري)">
          <input type="datetime-local" className={inputCls} value={toLocalInput(f.endsAt)} onChange={(e) => setF({ ...f, endsAt: fromLocalInput(e.target.value) })} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={f.popup} onChange={(e) => setF({ ...f, popup: e.target.checked })} />
        <span><b>كمان نافذة منبثقة</b> تظهر مرة واحدة لكل زائر. استخدمها للإعلانات الكبيرة بس (افتتاح، عرض لفترة محدودة، نزول التطبيق).</span>
      </label>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-bold text-primary">شكل الشريط على الموقع</p>
        <div className="overflow-hidden rounded-xl border"><AnnouncementBarView a={preview} /></div>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <button disabled={busy} onClick={() => save({ ...f, on: true })} className={btnPrimary}>{q.data?.on ? "حفظ التعديل" : "تثبيت الرسالة"}</button>
        {q.data?.on && (
          <button disabled={busy} onClick={() => save({ ...f, on: false })} className="h-11 rounded-full border border-destructive/40 px-5 text-sm font-bold text-destructive">إيقاف الرسالة</button>
        )}
      </div>
    </div>
  );
}

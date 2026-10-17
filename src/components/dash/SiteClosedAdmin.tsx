import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { dbx } from "@/lib/dbx";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { SiteClosedPage, useSiteClosed } from "@/components/site/SiteClosed";

/** لوحة الإدارة ← الإعدادات ← غلق الموقع: close or open the site for visitors, with the message they see. */
export function SiteClosedAdmin() {
  const q = useSiteClosed();
  const qc = useQueryClient();
  const [f, setF] = useState({ closed: false, message: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setF({ closed: q.data.closed, message: q.data.message }); }, [q.data]);

  async function save(closed: boolean) {
    if (closed && !confirm("متأكد إنك عايز تقفل الموقع؟ كل الزوار هيشوفوا صفحة «تم غلق الموقع» بس.")) return;
    setBusy(true);
    const { error } = await dbx.from("app_settings").update({ site_closed: closed, site_closed_message: f.message.trim().slice(0, 500) || null }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(/site_closed/.test(error.message) ? "غلق الموقع محتاج تحديث قاعدة البيانات (إصدار 32)" : error.message); return; }
    toast.success(closed ? "الموقع اتقفل للزوار" : "الموقع اتفتح للزوار");
    qc.invalidateQueries({ queryKey: ["site-closed"] });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className={`rounded-2xl border p-4 md:p-6 ${f.closed ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
        <p className="text-sm font-bold text-primary">الحالة دلوقتي: {q.data?.closed ? <span className="text-destructive">مقفول للزوار</span> : <span className="text-teal">مفتوح</span>}</p>
        <p className="mt-1 text-xs text-muted-foreground">لما الموقع يتقفل، أي زائر يفتح أي صفحة يشوف صفحة «تم غلق الموقع» بس (وكمان في التطبيق). إنت وفريق فاليو عقار بتشوفوا الموقع عادي، وصفحة تسجيل الدخول بتفضل شغالة.</p>
        <div className="mt-4">
          <Field label="الرسالة اللي هتظهر للزوار (اختياري)">
            <textarea className={`${inputCls} h-24 py-2`} maxLength={500} placeholder="الموقع مغلق مؤقتًا. هنرجع قريب إن شاء الله." value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {q.data?.closed ? (
            <>
              <button disabled={busy} onClick={() => save(false)} className={btnPrimary}>افتح الموقع</button>
              <button disabled={busy} onClick={() => save(true)} className="h-11 rounded-xl border px-4 text-sm font-bold text-primary">حفظ الرسالة</button>
            </>
          ) : (
            <button disabled={busy} onClick={() => save(true)} className="h-11 rounded-xl bg-destructive px-5 text-sm font-bold text-destructive-foreground">اقفل الموقع</button>
          )}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-bold text-primary">شكل الصفحة اللي الزوار هيشوفوها</p>
        <div className="overflow-hidden rounded-2xl border [&_main]:min-h-0 [&_main]:py-6"><SiteClosedPage message={f.message} /></div>
      </div>
    </div>
  );
}

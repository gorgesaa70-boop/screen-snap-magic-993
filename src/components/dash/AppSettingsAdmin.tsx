import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { APP_DOWNLOAD_URL, StoreButton, useAppLinks } from "@/components/site/AppDownload";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";

/** Admin edits the App Store / Google Play links once the app is published; empty = "coming soon" on the site. */
export function AppSettingsAdmin() {
  const q = useAppLinks();
  const qc = useQueryClient();
  const [f, setF] = useState({ ios: "", android: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setF({ ios: q.data.ios ?? "", android: q.data.android ?? "" }); }, [q.data]);

  async function save() {
    const ios = f.ios.trim(); const android = f.android.trim();
    if (ios && !ios.startsWith("https://apps.apple.com/")) { toast.error("رابط App Store لازم يبدأ بـ https://apps.apple.com/"); return; }
    if (android && !android.startsWith("https://play.google.com/store/apps/")) { toast.error("رابط Google Play لازم يبدأ بـ https://play.google.com/store/apps/"); return; }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types regenerate after the release migration applies
    const { error } = await (supabase as any).from("app_settings").update({ ios_url: ios || null, android_url: android || null }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ روابط التطبيق");
    qc.invalidateQueries({ queryKey: ["app-links"] });
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-2xl border bg-card p-4 md:p-6">
      <p className="text-sm text-muted-foreground">لما التطبيق يتنشر على المتاجر، حط الروابط هنا. لو الخانة فاضية، الموقع بيكتب "قريبًا" بدل زرار مش شغال.</p>
      <Field label="رابط App Store (آيفون)"><input className={inputCls} dir="ltr" placeholder="https://apps.apple.com/app/..." value={f.ios} onChange={(e) => setF({ ...f, ios: e.target.value })} maxLength={300} /></Field>
      <Field label="رابط Google Play (أندرويد)"><input className={inputCls} dir="ltr" placeholder="https://play.google.com/store/apps/details?id=com.valueaqar.app" value={f.android} onChange={(e) => setF({ ...f, android: e.target.value })} maxLength={300} /></Field>
      <button disabled={busy} onClick={save} className={btnPrimary}>حفظ</button>
      <div className="border-t pt-4">
        <p className="mb-2 text-sm font-bold text-primary">شكل الأزرار على الموقع دلوقتي</p>
        <div className="flex flex-wrap gap-3"><StoreButton store="ios" url={q.data?.ios ?? null} /><StoreButton store="android" url={q.data?.android ?? null} /></div>
      </div>
      <div className="flex items-center gap-4 border-t pt-4">
        <img src="/app-qr.svg" alt="QR" className="size-24" />
        <div className="text-sm text-muted-foreground">
          <p>كود الـ QR ثابت وبيفتح <a href={APP_DOWNLOAD_URL} target="_blank" rel="noreferrer" className="font-bold text-primary underline" dir="ltr">valueaqar.com/app</a>، فمش محتاج يتغير لما الروابط تتحط.</p>
          <a href="/app-qr.svg" download="value-aqar-app-qr.svg" className="mt-1 inline-block font-bold text-primary underline">تنزيل الكود للطباعة</a>
        </div>
      </div>
    </div>
  );
}

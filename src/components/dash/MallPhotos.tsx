import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadImage } from "@/components/site/data";
import { btnPrimary } from "@/components/site/ui";
import { thumb } from "@/lib/images";
import { mallImages } from "@/components/site/malls";

export const MAX_MALL_IMAGES = 10;

export { mallImages };

/** Photo list editor: add several at once (up to 10), reorder, delete. The first photo is the cover. */
export function MallPhotosEditor({ images, onChange, disabled }: { images: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const [uploading, setUploading] = useState(0);
  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, MAX_MALL_IMAGES - images.length);
    e.target.value = "";
    if (!files.length) return;
    let next = images;
    setUploading(files.length);
    for (const file of files) {
      try { next = [...next, await uploadImage(file)].slice(0, MAX_MALL_IMAGES); onChange(next); }
      catch (err) { toast.error((err as Error).message); }
      setUploading((n) => n - 1);
    }
  }
  const move = (i: number, d: -1 | 1) => { const n = [...images]; [n[i], n[i + d]] = [n[i + d]!, n[i]!]; onChange(n); };
  const full = images.length >= MAX_MALL_IMAGES;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-primary">صور المول ({images.length}/{MAX_MALL_IMAGES}) — أول صورة هي الغلاف</p>
        <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-bold text-primary ${disabled || full || uploading ? "pointer-events-none opacity-50" : "hover:border-teal"}`}>
          <ImagePlus className="size-4" />{uploading ? `بيترفع ${uploading}...` : "ضيف صور"}
          <input type="file" accept="image/*" multiple className="sr-only" disabled={disabled || full || !!uploading} onChange={add} />
        </label>
      </div>
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {images.map((url, i) => (
            <div key={url} className="relative aspect-square overflow-hidden rounded-xl border bg-secondary">
              <img src={thumb(url)} alt={`صورة ${i + 1}`} className="size-full object-cover" loading="lazy" />
              {i === 0 && <span className="absolute start-1 top-1 rounded-full bg-primary/85 px-2 py-0.5 text-[10px] font-bold text-primary-foreground">الغلاف</span>}
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  {i > 0 && <button type="button" aria-label="قدّم الصورة" disabled={disabled} onClick={() => move(i, -1)} className="grid size-6 place-items-center rounded-full bg-background/90 text-primary"><ArrowRight className="size-3.5" /></button>}
                  {i < images.length - 1 && <button type="button" aria-label="أخّر الصورة" disabled={disabled} onClick={() => move(i, 1)} className="grid size-6 place-items-center rounded-full bg-background/90 text-primary"><ArrowLeft className="size-3.5" /></button>}
                </div>
                <button type="button" aria-label="حذف الصورة" disabled={disabled} onClick={() => onChange(images.filter((u) => u !== url))} className="rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold text-destructive">حذف</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">لسه مفيش صور — ضيف صور الواجهة والممرات والمحلات.</p>
      )}
    </div>
  );
}

/** For the mall's developer (account owner or manager): edit and save the photos only, through set_mall_images. */
export function MallPhotosForDeveloper({ mall, onSaved, onClose }: { mall: { id: string; name: string; images?: string[] | null; logo_url: string | null }; onSaved: () => void; onClose: () => void }) {
  const [images, setImages] = useState(() => mallImages(mall));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("set_mall_images", { _mall: mall.id, _images: images });
    setBusy(false);
    if (error) { toast.error(error.code === "42501" ? "تعديل صور المول لصاحب الحساب أو المدير بس" : error.code === "PGRST202" ? "معرض الصور محتاج تحديث قاعدة البيانات (إصدار 29)" : "الحفظ ماتمش، جرّب تاني"); return; }
    toast.success("اتحفظت صور المول");
    onSaved(); onClose();
  }
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="font-extrabold text-primary">صور {mall.name}</p>
      <MallPhotosEditor images={images} onChange={setImages} disabled={busy} />
      <div className="flex gap-2">
        <button disabled={busy} onClick={save} className={btnPrimary}>{busy ? "..." : "حفظ الصور"}</button>
        <button onClick={onClose} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </div>
  );
}

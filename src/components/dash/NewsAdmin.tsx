import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";

type News = { id: string; text_ar: string; text_en: string | null; is_active: boolean; sort_order: number };

/** The admin writes the news lines shown one after another over the site header. */
export function NewsAdmin({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-data", "site-news"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_news").select("id, text_ar, text_en, is_active, sort_order").order("sort_order").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as News[];
    },
  });
  const [f, setF] = useState({ ar: "", en: "" });
  const [busy, setBusy] = useState(false);
  const list = q.data ?? [];
  const done = () => { void q.refetch(); void qc.invalidateQueries({ queryKey: ["site-news"] }); };

  const add = async () => {
    if (f.ar.trim().length < 2) { toast.error("اكتب الخبر بالعربي الأول"); return; }
    setBusy(true);
    const top = list.reduce((m, n) => Math.min(m, n.sort_order), 1);
    const { error } = await supabase.from("site_news").insert({ text_ar: f.ar.trim(), text_en: f.en.trim() || null, sort_order: top - 1 });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("الخبر اتنشر في الشريط"); setF({ ar: "", en: "" }); done(); }
  };
  const update = async (id: string, patch: Partial<News>) => {
    const { error } = await supabase.from("site_news").update(patch).eq("id", id);
    if (error) toast.error(error.message); else done();
  };
  const move = async (i: number, by: -1 | 1) => {
    const a = list[i]; const b = list[i + by];
    if (!a || !b) return;
    // Equal numbers can't swap, so the whole order is rewritten.
    const next = [...list]; next[i] = b; next[i + by] = a;
    const results = await Promise.all(next.map((n, sort_order) => supabase.from("site_news").update({ sort_order }).eq("id", n.id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) toast.error(failed.error.message); else done();
  };
  const remove = async (id: string) => {
    if (!confirm("مسح الخبر ده؟")) return;
    const { error } = await supabase.from("site_news").delete().eq("id", id);
    if (error) toast.error(error.message); else done();
  };

  if (q.error) return <p className="max-w-2xl rounded-2xl border bg-card p-6 text-sm">شريط الأخبار محتاج تحديث قاعدة البيانات (إصدار 50) الأول.</p>;
  return (
    <div className="max-w-3xl space-y-4">
      {canEdit && (
        <div className="space-y-3 rounded-2xl border bg-card p-4 md:p-6">
          <p className="text-sm text-muted-foreground">الأخبار المفعّلة بتظهر ورا بعض في الشريط اللي فوق الموقع، بالترتيب اللي هنا. أول ما تضيف خبر بيظهر للزوار.</p>
          <Field label="الخبر بالعربي"><textarea className={`${inputCls} h-20 py-2`} maxLength={200} value={f.ar} onChange={(e) => setF({ ...f, ar: e.target.value })} /></Field>
          <Field label="الخبر بالإنجليزي (اختياري)"><textarea className={`${inputCls} h-20 py-2`} dir="ltr" maxLength={200} value={f.en} onChange={(e) => setF({ ...f, en: e.target.value })} /></Field>
          <button className={btnPrimary} disabled={busy} onClick={add}>نشر الخبر</button>
        </div>
      )}
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش أخبار، والشريط بيعرض «أخبار برج العرب قريبًا».</p>
      ) : (
        <ul className="space-y-2">
          {list.map((n, i) => (
            <li key={n.id} className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 text-sm">
              <div className="min-w-0 flex-1 basis-56">
                <p className={`font-bold ${n.is_active ? "text-primary" : "text-muted-foreground line-through"}`}>{n.text_ar}</p>
                {n.text_en && <p className="text-xs text-muted-foreground" dir="ltr">{n.text_en}</p>}
              </div>
              {canEdit && (
                <span className="flex items-center gap-1">
                  <button aria-label="لفوق" className={`${btnOutline} h-9 px-2.5`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></button>
                  <button aria-label="لتحت" className={`${btnOutline} h-9 px-2.5`} disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></button>
                  <button className={`${btnOutline} h-9 px-3 text-xs`} onClick={() => update(n.id, { is_active: !n.is_active })}>{n.is_active ? "إيقاف" : "تفعيل"}</button>
                  <button aria-label="مسح" className="grid size-9 place-items-center rounded-lg text-destructive hover:bg-destructive/10" onClick={() => remove(n.id)}><Trash2 className="size-4" /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

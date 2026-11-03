import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/components/site/data";
import { btnOutline } from "@/components/site/ui";

const KIND: Record<string, string> = {
  property: "عقار", mall: "مول", compound: "كمبوند", project: "مشروع", industrial: "صناعي",
  investment: "فرصة استثمارية", broker: "صفحة وسيط", provider: "مقدم خدمة",
};

/** «البلاغات»: reports from the «إبلاغ» button on public pages. Open first; closing one keeps a short note. */
export function ContentReportsAdmin() {
  const [show, setShow] = useState<"open" | "done">("open");
  const q = useQuery({
    queryKey: ["content-reports", show],
    queryFn: async () => {
      const { data, error } = await supabase.from("content_reports").select("*").eq("status", show).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  async function resolve(id: string) {
    const note = window.prompt("عملت إيه؟ (مثلًا: الإعلان اتشال، الحساب اتوقف، البلاغ مش صحيح)");
    if (note === null) return;
    const { error } = await supabase.rpc("resolve_content_report", { _report: id, _note: note });
    if (error) toast.error(error.message); else { toast.success("البلاغ اتقفل"); void q.refetch(); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">البلاغات اللي الزوار بعتوها من زرار «إبلاغ» في صفحات العقارات والوسطاء والخدمات. راجع الصفحة، واتصرف (إخفاء الإعلان أو التقييم، أو إيقاف الحساب)، وبعدين اقفل البلاغ.</p>
      <div className="flex gap-2">
        {(["open", "done"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setShow(s)} aria-pressed={show === s}
            className={`h-9 rounded-full border px-4 text-sm font-bold ${show === s ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary"}`}>{s === "open" ? "مفتوحة" : "اتقفلت"}</button>
        ))}
      </div>
      {q.isLoading ? <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        : !q.data?.length ? <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{show === "open" ? "مفيش بلاغات مفتوحة." : "مفيش بلاغات مقفولة."}</p>
        : q.data.map((r) => (
          <div key={r.id} className="rounded-2xl border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">{KIND[r.kind] ?? r.kind}</span>
              <span className="font-bold text-primary">{r.title ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
            </div>
            <p className="mt-1.5 whitespace-pre-line">{r.reason}</p>
            {r.note && <p className="mt-1 text-xs text-muted-foreground">اللي اتعمل: {r.note}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" className={btnOutline}><ExternalLink className="size-4" />افتح الصفحة</a>}
              {r.status === "open" && <button type="button" onClick={() => resolve(r.id)} className={btnOutline}><CheckCircle2 className="size-4" />اقفل البلاغ</button>}
            </div>
          </div>
        ))}
    </div>
  );
}

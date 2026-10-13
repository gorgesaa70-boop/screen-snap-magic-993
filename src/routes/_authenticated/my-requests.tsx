import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "@/components/dash/DashShell";
import { LEAD_KINDS, formatDate, formatPrice, leadNo, leadKindLabel } from "@/components/site/data";

export const Route = createFileRoute("/_authenticated/my-requests")({
  head: () => ({ meta: [{ title: "طلباتي | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: MyRequestsPage,
});

/** Customer-facing wording of the pipeline (internal stages stay hidden). */
function customerStage(stage: string, purpose: string | null) {
  switch (stage) {
    case "new": return { label: "وصل طلبك", cls: "bg-secondary text-primary" };
    case "contacted": case "qualified": return { label: "بنتابع معاك", cls: "bg-teal-soft text-primary" };
    case "visit_scheduled": return { label: "اتحدد ميعاد معاينة", cls: "bg-teal-soft text-primary" };
    case "visited": return { label: "تمت المعاينة", cls: "bg-teal-soft text-primary" };
    case "reserved": case "contracted": return { label: "تم الحجز", cls: "bg-primary text-primary-foreground" };
    case "sold": return { label: purpose === "rent" || purpose === "summer" ? "تم الإيجار ✓" : "تم البيع ✓", cls: "bg-primary text-primary-foreground" };
    case "postponed": return { label: "مؤجل", cls: "bg-secondary text-muted-foreground" };
    default: return { label: "مقفول", cls: "bg-secondary text-muted-foreground" };
  }
}

function MyRequestsPage() {
  const q = useQuery({ queryKey: ["my-requests"], queryFn: async () => (await supabase.rpc("my_requests")).data ?? [] });
  return (
    <DashShell title="طلباتي" customer>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">كل الطلبات والاستفسارات اللي بعتها من حسابك أو من نفس رقم موبايلك. أول ما طلبك يتحرك خطوة هيوصلك إشعار، وتقدر تراسل الشركة اللي ماسكة طلبك من «رسايل الطلب».</p>
      {q.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        : !q.data?.length ? (
          <div className="max-w-3xl rounded-2xl border border-dashed bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">لسه مبعتش طلبات.</p>
            <a href="/#request" className="mt-3 inline-block text-sm font-bold text-teal">اطلب عقارك دلوقتي</a>
          </div>
        ) : (
          <ul className="max-w-3xl space-y-2">
            {q.data.map((r) => {
              const st = customerStage(r.stage, r.purpose);
              return (
                <li key={r.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-primary">{leadKindLabel(r)} <span className="text-xs text-muted-foreground" dir="ltr">{leadNo(r.lead_no)}</span></p>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  </div>
                  {r.property_id && r.property_title && <Link to="/properties/$id" params={{ id: r.property_id }} className="mt-1 block text-sm font-bold text-teal hover:underline">{r.property_title}</Link>}
                  <p className="mt-1 text-sm text-foreground/80">{[r.property_type, r.area, r.budget && `ميزانية ${formatPrice(Number(r.budget))} ج.م`].filter(Boolean).join(" · ")}</p>
                  {r.details && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground whitespace-pre-line">{r.details}</p>}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">اتبعت {formatDate(r.created_at)}</p>
                    {(r.kind === "request" || r.kind === "inquiry") && !(r.details ?? "").startsWith("دليل الخدمات") && (
                      <Link to="/messages" search={{ lead: r.id }} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold text-primary hover:bg-teal-soft">
                        <MessageCircle className="size-4" />رسايل الطلب
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </DashShell>
  );
}

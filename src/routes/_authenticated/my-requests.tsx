import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "@/components/dash/DashShell";
import { LEAD_KINDS, SERVICE_CATEGORIES, formatDate, formatPrice, leadNo, leadKindLabel, serviceRequestNo, starsText } from "@/components/site/data";
import { inputCls, btnPrimary } from "@/components/site/ui";

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
      <MyServiceRequests />
    </DashShell>
  );
}

type ServiceRow = { id: string; request_no: number; category: string; details: string | null; area: string | null; status: string; created_at: string; provider_id: string | null; provider_name: string | null; waiting: boolean; stars: number | null };

/** Requests from the services directory: who took them, and rating the provider once the work is done. */
function MyServiceRequests() {
  const q = useQuery({ queryKey: ["my-service-requests"], queryFn: async () => { const { data, error } = await supabase.rpc("my_service_requests"); return error ? [] : (data as ServiceRow[]); } });
  if (!q.data?.length) return null;
  const label = (r: ServiceRow) => r.status === "done" ? { t: "اتنفّذت ✓", c: "bg-primary text-primary-foreground" } : r.status === "closed" ? { t: "اتقفل", c: "bg-secondary text-muted-foreground" }
    : r.provider_id ? { t: "مقدم الخدمة هيتواصل معاك", c: "bg-teal-soft text-primary" } : { t: "بندوّر على أنسب مقدم خدمة", c: "bg-secondary text-primary" };
  return (
    <section className="mt-8 max-w-3xl">
      <h2 className="mb-3 text-lg font-extrabold text-primary">طلبات الخدمات</h2>
      <ul className="space-y-2">
        {q.data.map((r) => { const st = label(r); return (
          <li key={r.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-primary">{SERVICE_CATEGORIES[r.category]} <span className="text-xs text-muted-foreground" dir="ltr">{serviceRequestNo(r.request_no)}</span></p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${st.c}`}>{st.t}</span>
            </div>
            {r.provider_id && r.provider_name && <Link to="/services/$id" params={{ id: r.provider_id }} className="mt-1 block text-sm font-bold text-teal hover:underline">{r.provider_name}</Link>}
            {(r.details || r.area) && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{[r.area, r.details].filter(Boolean).join(" · ")}</p>}
            <p className="mt-2 text-[11px] text-muted-foreground">اتبعت {formatDate(r.created_at)}</p>
            {r.status === "done" && r.provider_id && (r.stars ? <p className="mt-2 text-sm font-bold text-primary">تقييمك: <span className="text-[#f2b84b]">{starsText(r.stars)}</span></p> : <RateForm id={r.id} onDone={() => q.refetch()} />)}
          </li>
        ); })}
      </ul>
    </section>
  );
}

function RateForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-secondary/60 p-3">
      <p className="text-sm font-bold text-primary">قيّم الخدمة</p>
      <div className="flex gap-1" role="radiogroup" aria-label="عدد النجوم">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} من 5`} onClick={() => setStars(n)} className="grid size-10 place-items-center">
            <Star className={`size-7 ${n <= stars ? "fill-[#f2b84b] text-[#f2b84b]" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      <textarea className={`${inputCls} h-20 py-2`} placeholder="رأيك في الشغل (اختياري — بيظهر في ملف مقدم الخدمة باسمك الأول بس)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      <button disabled={!stars || busy} className={btnPrimary} onClick={async () => {
        setBusy(true);
        const { error } = await supabase.rpc("rate_service_request", { _req: id, _stars: stars, ...(comment.trim() ? { _comment: comment.trim() } : {}) });
        setBusy(false);
        if (error) toast.error(error.message); else { toast.success("شكرًا على تقييمك"); onDone(); }
      }}>ابعت التقييم</button>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Star, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Tabs, btnOutline, btnPrimary } from "@/components/site/ui";
import { formatDate, formatPrice } from "@/components/site/data";
import { DEAL_KINDS, OPP_KINDS, investmentRange, oppNo } from "@/lib/investments";

const STATUS: Record<string, [string, string]> = {
  pending: ["بانتظار المراجعة", "bg-teal-soft text-primary"], approved: ["منشورة", "bg-primary text-primary-foreground"],
  rejected: ["مرفوضة", "bg-destructive/10 text-destructive"], closed: ["مقفولة", "bg-muted text-muted-foreground"],
};

/** Admin / staff: review investment opportunities, grant investors access to details, see registered investors. */
export function InvestmentsAdmin({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<"opps" | "requests" | "investors">("opps");
  return (
    <div className="space-y-3">
      <Tabs<typeof tab> value={tab} onChange={setTab} tabs={[{ id: "opps", label: "الفرص" }, { id: "requests", label: "طلبات المستثمرين" }, { id: "investors", label: "المستثمرين المسجلين" }]} />
      {tab === "opps" && <Opportunities isAdmin={isAdmin} />}
      {tab === "requests" && <Requests />}
      {tab === "investors" && <Investors />}
    </div>
  );
}

function Opportunities({ isAdmin }: { isAdmin: boolean }) {
  const q = useQuery({ queryKey: ["admin-opportunities"], queryFn: async () => { const r = await supabase.rpc("admin_opportunities"); if (r.error) throw r.error; return r.data ?? []; } });
  const [status, setStatus] = useState("pending");
  const [open, setOpen] = useState<string | null>(null);
  const upd = async (id: string, patch: TablesUpdate<"investment_opportunities">, msg: string) => {
    const { error } = await supabase.from("investment_opportunities").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(msg); q.refetch(); }
  };
  const list = (q.data ?? []).filter((o) => !status || o.review_status === status);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {[["pending", "بانتظار المراجعة"], ["approved", "منشورة"], ["rejected", "مرفوضة"], ["closed", "مقفولة"], ["", "الكل"]].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k!)} className={`h-9 rounded-full border px-3 text-xs font-bold ${status === k ? "border-primary bg-primary text-primary-foreground" : "text-primary"}`}>
            {l} ({(q.data ?? []).filter((o) => !k || o.review_status === k).length})
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش فرص هنا.</p>}
      {list.map((o) => (
        <div key={o.id} className="rounded-2xl border bg-card">
          <button onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-4 text-start">
            <span className="font-bold text-primary" dir="ltr">{oppNo(o.opp_no)}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS[o.review_status]?.[1]}`}>{STATUS[o.review_status]?.[0]}</span>
            {o.is_featured && <span className="rounded-full bg-[#f2b84b] px-2 py-0.5 text-[11px] font-bold text-primary">مميزة</span>}
            <span className="font-bold">{o.title}</span>
            <span className="text-xs text-muted-foreground">{OPP_KINDS[o.kind]} · {o.activity} · {investmentRange(o)} · {formatDate(o.created_at)}</span>
          </button>
          {open === o.id && <OpportunityReview id={o.id} o={o} isAdmin={isAdmin} upd={upd} />}
        </div>
      ))}
    </div>
  );
}

type Opp = NonNullable<Awaited<ReturnType<typeof supabase.rpc<"admin_opportunities">>>["data"]>[number];

function OpportunityReview({ id, o, isAdmin, upd }: { id: string; o: Opp; isAdmin: boolean; upd: (id: string, patch: TablesUpdate<"investment_opportunities">, msg: string) => void }) {
  const docs = useQuery({ queryKey: ["opp-docs", id], queryFn: async () => (await supabase.storage.from("investment-docs").list(id)).data ?? [] });
  async function openDoc(name: string) {
    const { data, error } = await supabase.storage.from("investment-docs").createSignedUrl(`${id}/${name}`, 300);
    if (error || !data) { toast.error("تعذّر فتح المستند"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <div className="space-y-3 border-t p-4 text-sm">
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <p><b>الصفقة:</b> {DEAL_KINDS[o.deal_kind]}{o.offered_share ? ` — ${o.offered_share}%` : ""}</p>
        <p><b>المكان:</b> {o.area}، {o.city}</p>
        {o.land_area && <p><b>الأرض:</b> {formatPrice(Number(o.land_area))} م²</p>}
        {o.expected_return && <p><b>عائد تقريبي:</b> {o.expected_return}%</p>}
      </div>
      <p className="whitespace-pre-line text-foreground/80"><b>الملخص العام:</b> {o.teaser}</p>
      <div className="rounded-xl border border-teal/40 p-3">
        <p className="mb-1 font-bold text-primary">🔒 السرّي</p>
        {o.location_note && <p><b>الموقع:</b> {o.location_note}</p>}
        {o.licenses && <p><b>التراخيص:</b> {o.licenses}</p>}
        {o.details && <p className="whitespace-pre-line text-foreground/80">{o.details}</p>}
        {docs.data?.map((d) => <button key={d.name} onClick={() => openDoc(d.name)} className="me-3 inline-flex items-center gap-1 font-bold text-primary underline"><FileText className="size-4 text-teal" />{d.name.replace(/^\d+-/, "")}</button>)}
      </div>
      {o.review_note && <p className="text-destructive">ملاحظة: {o.review_note}</p>}
      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          {o.review_status !== "approved" && <button onClick={() => upd(o.id, { review_status: "approved", review_note: null }, "اتنشرت الفرصة")} className={btnPrimary}>نشر</button>}
          {o.review_status !== "rejected" && <button onClick={() => { const n = prompt("سبب الرفض (هيوصل لصاحب الفرصة):"); if (n?.trim()) upd(o.id, { review_status: "rejected", review_note: n.trim().slice(0, 500) }, "اترفضت"); }} className={btnOutline}>رفض</button>}
          {o.review_status === "approved" && <button onClick={() => upd(o.id, { review_status: "closed" }, "اتقفلت الفرصة")} className={btnOutline}>قفل (اتباعت / خلصت)</button>}
          <button onClick={() => upd(o.id, { is_featured: !o.is_featured }, o.is_featured ? "اتشال التمييز" : "اتميزت")} className={`grid size-11 place-items-center rounded-xl border ${o.is_featured ? "bg-[#f2b84b] text-primary" : "text-primary"}`} aria-label="تمييز"><Star className="size-4" /></button>
          {o.review_status === "approved" && <Link to="/investments/$id" params={{ id: o.id }} className={btnOutline}>صفحة الفرصة</Link>}
        </div>
      ) : <p className="text-xs text-muted-foreground">النشر والرفض من الأدمن.</p>}
    </div>
  );
}

function Requests() {
  const q = useQuery({
    queryKey: ["investment-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investment_requests").select("*, investment_opportunities(title, opp_no)").order("created_at", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  });
  const decide = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("investment_requests").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(status === "approved" ? "اتفتحت التفاصيل للمستثمر" : "اترفض الطلب"); q.refetch(); }
  };
  const list = q.data ?? [];
  if (!q.isLoading && list.length === 0) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش طلبات لسه.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">اتكلم مع المستثمر الأول (من صفحة العميل)، ولما تتأكد إنه جاد افتحله التفاصيل.</p>
      {list.map((r) => (
        <div key={r.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-sm md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-primary">{r.name} {r.budget ? <span className="text-xs text-muted-foreground">· ميزانية {formatPrice(Number(r.budget))} ج.م</span> : null}</p>
            <p className="text-xs text-muted-foreground">{oppNo(r.investment_opportunities?.opp_no)} — {r.investment_opportunities?.title} · {formatDate(r.created_at)}</p>
            {r.message && <p className="mt-1 text-foreground/80">{r.message}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {r.lead_id && <Link to="/leads/$id" params={{ id: r.lead_id }} className={btnOutline}>صفحة العميل</Link>}
            {r.status === "pending" ? <>
              <button onClick={() => decide(r.id, "approved")} className={btnPrimary}>افتح التفاصيل</button>
              <button onClick={() => decide(r.id, "rejected")} className={btnOutline}>رفض</button>
            </> : <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.status === "approved" ? "bg-teal-soft text-primary" : "bg-destructive/10 text-destructive"}`}>{r.status === "approved" ? "التفاصيل مفتوحة" : "مرفوض"}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Investors() {
  const q = useQuery({ queryKey: ["investors"], queryFn: async () => (await supabase.from("investor_profiles").select("*").order("created_at", { ascending: false })).data ?? [] });
  const list = q.data ?? [];
  if (!q.isLoading && list.length === 0) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش مستثمرين مسجلين لسه. رابط التسجيل: صفحة «فرص استثمارية» ← «سجّل كمستثمر».</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary text-primary"><tr>{["المستثمر", "الميزانية", "مهتم بـ", "المناطق", "الإشعارات", "اتسجل"].map((h) => <th key={h} className="p-3 text-start font-bold">{h}</th>)}</tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.user_id} className="border-t">
              <td className="p-3 font-bold text-primary">{p.name}</td>
              <td className="p-3">{p.budget_min || p.budget_max ? `${p.budget_min ? formatPrice(Number(p.budget_min)) : "—"} – ${p.budget_max ? formatPrice(Number(p.budget_max)) : "—"}` : "مفتوحة"}</td>
              <td className="p-3">{p.kinds.length ? p.kinds.map((k) => OPP_KINDS[k] ?? k).join("، ") : "الكل"}</td>
              <td className="p-3">{p.areas.length ? p.areas.join("، ") : "الكل"}</td>
              <td className="p-3">{p.notify ? "✓" : "—"}</td>
              <td className="p-3 text-muted-foreground">{formatDate(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

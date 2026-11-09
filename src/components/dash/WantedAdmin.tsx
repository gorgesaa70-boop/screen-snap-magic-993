import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ExternalLink, Eye, EyeOff, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Stat, inputCls, btnOutline, btnPrimary } from "@/components/site/ui";
import { formatDate, formatPrice } from "@/components/site/data";

const PURPOSES: Record<string, string> = { sale: "شراء", rent: "إيجار", summer: "مصيف" };
const SPECIAL = /^(دليل الخدمات|سكن مشترك|سوق الوسطاء|طلب تقييم)/;
const COLS = "id, lead_no, name, phone, purpose, property_type, area, budget, details, stage, created_at, wanted_public, wanted_until, wanted_note, wanted_lead_id";
const code = (n: number) => `VA-${String(n).padStart(6, "0")}`;

/** «صفحة المطلوب» in the admin: what shows on the page, its public description, and the offers on each request. */
export function WantedAdmin({ canEdit }: { canEdit: boolean }) {
  const requests = useQuery({
    queryKey: ["admin-data", "wanted-requests"],
    queryFn: async () => { const { data, error } = await supabase.from("leads").select(COLS).eq("kind", "request").order("wanted_public", { ascending: false }).order("created_at", { ascending: false }).limit(300); if (error) throw error; return data.filter((r) => !SPECIAL.test(r.details ?? "")); },
  });
  const offers = useQuery({
    queryKey: ["admin-data", "wanted-offers"],
    queryFn: async () => { const { data, error } = await supabase.from("leads").select(COLS).not("wanted_lead_id", "is", null).order("created_at", { ascending: false }).limit(500); if (error) throw error; return data; },
  });
  if (requests.error) return <p className="max-w-2xl rounded-2xl border bg-card p-6 text-sm">صفحة المطلوب محتاجة تحديث قاعدة البيانات (إصدار 54) الأول.</p>;
  const list = requests.data ?? [];
  const live = (r: (typeof list)[number]) => r.wanted_public && !!r.wanted_until && new Date(r.wanted_until) > new Date() && !["reserved", "sold", "lost"].includes(String(r.stage));
  const all = offers.data ?? [];
  return (
    <fieldset disabled={!canEdit} className="contents">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="ظاهر على الصفحة" value={formatPrice(list.filter(live).length)} />
          <Stat label="كل الطلبات" value={formatPrice(list.length)} />
          <Stat label="العروض" value={formatPrice(all.length)} />
        </div>
        {list.length === 0 && !requests.isLoading && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش طلبات.</p>}
        {list.map((r) => <Row key={r.id} r={r} isLive={live(r)} offers={all.filter((o) => o.wanted_lead_id === r.id)} reload={() => void requests.refetch()} />)}
      </div>
    </fieldset>
  );
}

type L = { id: string; lead_no: number; name: string; phone: string; purpose: string | null; property_type: string | null; area: string | null; budget: number | null; details: string | null; stage: string; created_at: string; wanted_public: boolean; wanted_until: string | null; wanted_note: string | null };

function Row({ r, isLive, offers, reload }: { r: L; isLive: boolean; offers: L[]; reload: () => void }) {
  const [note, setNote] = useState(r.wanted_note ?? "");
  const [busy, setBusy] = useState(false);
  async function save(show: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_wanted", { _lead: r.id, _show: show, _note: note.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(show ? "الطلب ظاهر" : "الطلب اتخفى");
    reload();
  }
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-extrabold text-primary">{[PURPOSES[r.purpose ?? ""], r.property_type, r.area].filter(Boolean).join(" · ") || "طلب عقار"}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${isLive ? "bg-teal/15 text-primary" : "bg-secondary text-muted-foreground"}`}>{isLive ? `ظاهر لحد ${formatDate(r.wanted_until!)}` : "مش ظاهر"}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground"><span dir="ltr">{code(r.lead_no)}</span> · {formatDate(r.created_at)}{r.budget != null ? ` · ${formatPrice(Number(r.budget))} ج.م` : ""}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm"><span className="font-bold">{r.name}</span><a href={`tel:${r.phone}`} dir="ltr" className="inline-flex items-center gap-1 text-primary"><Phone className="size-3.5" />{r.phone}</a><span className="text-xs text-muted-foreground">(مش بيظهر للزوار)</span></p>
      {r.details && <p className="mt-1 text-sm text-foreground/75">{r.details}</p>}
      <input className={`${inputCls} mt-3`} placeholder="وصف يظهر للزوار (اختياري) — من غير اسم أو رقم" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={btnPrimary} onClick={() => void save(true)}><Eye className="size-4" />{isLive ? "حفظ الوصف" : "إظهار على الصفحة"}</button>
        {isLive && <button type="button" disabled={busy} className={btnOutline} onClick={() => void save(false)}><EyeOff className="size-4" />إخفاء</button>}
        <Link to="/leads/$id" params={{ id: r.id }} className={btnOutline}><ExternalLink className="size-4" />فتح الطلب</Link>
      </div>
      {offers.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t pt-3">
          <p className="text-sm font-extrabold text-primary">العروض ({offers.length})</p>
          {offers.map((o) => (
            <Link key={o.id} to="/leads/$id" params={{ id: o.id }} className="block rounded-xl bg-secondary/60 p-2.5 text-sm hover:bg-secondary">
              <span className="font-bold">{o.name}</span> · <span dir="ltr">{o.phone}</span> · <span className="text-xs text-muted-foreground">{formatDate(o.created_at)}</span>
              {o.details && <span className="mt-0.5 block text-xs text-foreground/75">{o.details}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

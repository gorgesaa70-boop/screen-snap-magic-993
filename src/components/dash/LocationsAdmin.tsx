import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, GitMerge, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import type { Tables } from "@/integrations/supabase/types";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";

type Loc = Tables<"locations">;
const label = (l: Loc) => (l.area ? `${l.area}، ${l.city}` : l.city);
const SOURCE: Record<string, string> = { properties: "عقار", compounds: "كمبوند", projects: "مشروع", existing: "عقار قديم", seed: "أساسي", admin: "الأدمن" };

/** «المناطق»: places people typed wait here; the admin approves, merges a misspelling into an approved place, or rejects. */
export function LocationsAdmin() {
  const q = useQuery({
    queryKey: ["admin-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("*").order("status").order("sort").order("city").order("area");
      if (error) throw error;
      const counts = new Map<string, number>();
      const props = await fetchAll((a, b) => supabase.from("properties").select("city, area, id").order("id").range(a, b));
      for (const p of props) { const k = `${p.city}|${p.area}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
      return { locs: data, counts };
    },
  });
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  const [mergeTo, setMergeTo] = useState("");
  const [add, setAdd] = useState({ city: "", area: "", city_en: "", area_en: "" });
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  if (!q.data) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  const { locs, counts } = q.data;
  const approved = locs.filter((l) => l.status === "approved");
  const listingsOf = (l: Loc) => counts.get(`${l.city}|${l.area ?? l.city}`) ?? 0;
  const list = locs.filter((l) => l.status === filter);
  const pending = locs.filter((l) => l.status === "pending").length;

  async function upd(id: string, patch: Partial<Loc>, done: string) {
    const { error } = await supabase.from("locations").update({ ...patch, reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(done); q.refetch(); }
  }
  async function merge() {
    if (!mergeFrom || !mergeTo) return;
    const { data, error } = await supabase.rpc("merge_location", { _from: mergeFrom, _to: mergeTo });
    if (error) { toast.error(error.message); return; }
    toast.success(`تم الدمج — اتنقل ${data ?? 0} إعلان`);
    setMergeFrom(null); setMergeTo(""); q.refetch();
  }
  async function create() {
    const city = add.city.trim(), area = add.area.trim();
    if (city.length < 2) { toast.error("اكتب اسم المدينة"); return; }
    const { error } = await supabase.from("locations").insert({
      city, area: area && area !== city ? area : null, city_en: add.city_en.trim() || null, area_en: add.area_en.trim() || null,
      status: "approved", source: "admin", reviewed_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.code === "23505" ? "المنطقة دي موجودة بالفعل" : error.message); return; }
    toast.success("اتضافت — هتظهر في البحث والقوايم");
    setAdd({ city: "", area: "", city_en: "", area_en: "" }); q.refetch();
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-secondary p-3 text-xs font-semibold text-primary">
        لما حد يضيف عقار أو كمبوند أو مشروع في مدينة أو منطقة مش عندنا، الإعلان بيتحفظ بيها والمنطقة بتستنى هنا. «اعتماد» بيظهرها في البحث والقوايم للكل. «دمج» لو مكتوبة غلط أو مكررة (زي «سموحه» و«سموحة»): الإعلانات بتتنقل للاسم الصح. «رفض» بيسيب الإعلانات زي ما هي من غير ما المنطقة تظهر في الفلاتر.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
            className={`h-9 rounded-full border px-4 text-sm font-bold ${filter === s ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary"}`}>
            {s === "pending" ? `مستنية اعتماد${pending ? ` (${pending})` : ""}` : s === "approved" ? "معتمدة" : "مرفوضة"}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">مفيش مناطق هنا.</p>}
      <div className="space-y-2">
        {list.map((l) => (
          <div key={l.id} className="rounded-2xl border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-primary">{label(l)}</p>
                <p className="text-xs text-muted-foreground">{listingsOf(l)} إعلان{l.source ? ` · من ${SOURCE[l.source] ?? l.source}` : ""}{l.city_en ? ` · ${l.area_en ?? ""}${l.area_en ? ", " : ""}${l.city_en}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {l.status !== "approved" && <button className={btnPrimary} onClick={() => upd(l.id, { status: "approved" }, "اتعتمدت")}><Check className="size-4" />اعتماد</button>}
                {l.status !== "approved" && <button className={btnOutline} onClick={() => { setMergeFrom(l.id); setMergeTo(""); }}><GitMerge className="size-4" />دمج</button>}
                {l.status === "pending" && <button className={btnOutline} onClick={() => upd(l.id, { status: "rejected" }, "اترفضت")}><X className="size-4" />رفض</button>}
                {l.status === "approved" && l.source !== "seed" && <button className={btnOutline} onClick={() => upd(l.id, { status: "pending" }, "اتشالت من الفلاتر")}>إخفاء من الفلاتر</button>}
              </div>
            </div>
            {l.status !== "rejected" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input className={inputCls} placeholder="اسم المدينة بالإنجليزي (اختياري)" defaultValue={l.city_en ?? ""} maxLength={60}
                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== l.city_en) upd(l.id, { city_en: v }, "اتحفظ"); }} />
                {l.area && <input className={inputCls} placeholder="اسم المنطقة بالإنجليزي (اختياري)" defaultValue={l.area_en ?? ""} maxLength={60}
                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== l.area_en) upd(l.id, { area_en: v }, "اتحفظ"); }} />}
              </div>
            )}
            {mergeFrom === l.id && (
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                <div className="min-w-56 flex-1">
                  <Field label={`دمج «${label(l)}» في:`}>
                    <select className={inputCls} value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
                      <option value="">اختار منطقة معتمدة</option>
                      {approved.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
                    </select>
                  </Field>
                </div>
                <button className={btnPrimary} disabled={!mergeTo} onClick={merge}>تأكيد الدمج</button>
                <button className="h-11 px-3 text-sm font-bold text-muted-foreground" onClick={() => setMergeFrom(null)}>إلغاء</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-3 flex items-center gap-1.5 font-extrabold text-primary"><Plus className="size-4" />إضافة مدينة أو منطقة</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="المدينة"><input className={inputCls} list="va-cities" value={add.city} maxLength={60} onChange={(e) => setAdd({ ...add, city: e.target.value })} placeholder="مثال: الإسكندرية" /></Field>
          <Field label="المنطقة (سيبها فاضية لو المدينة من غير أحياء)"><input className={inputCls} value={add.area} maxLength={60} onChange={(e) => setAdd({ ...add, area: e.target.value })} placeholder="مثال: سموحة" /></Field>
          <Field label="المدينة بالإنجليزي (اختياري)"><input className={inputCls} dir="ltr" value={add.city_en} maxLength={60} onChange={(e) => setAdd({ ...add, city_en: e.target.value })} /></Field>
          <Field label="المنطقة بالإنجليزي (اختياري)"><input className={inputCls} dir="ltr" value={add.area_en} maxLength={60} onChange={(e) => setAdd({ ...add, area_en: e.target.value })} /></Field>
        </div>
        <datalist id="va-cities">{[...new Set(approved.map((a) => a.city))].map((c) => <option key={c} value={c} />)}</datalist>
        <button className={`${btnPrimary} mt-3`} onClick={create}>إضافة</button>
      </div>
    </div>
  );
}

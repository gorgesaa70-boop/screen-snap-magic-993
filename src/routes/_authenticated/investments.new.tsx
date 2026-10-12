import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "@/components/dash/DashShell";
import { useMe } from "@/hooks/useAuth";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { CITY_NAMES, DEFAULT_CITY, areasOf, uploadImage, formatDate } from "@/components/site/data";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";
import { ACTIVITIES, DEAL_KINDS, OPP_KINDS, investmentRange, oppNo } from "@/lib/investments";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

export const Route = createFileRoute("/_authenticated/investments/new")({
  head: () => ({ meta: [{ title: "اعرض فرصة استثمارية | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: NewOpportunityPage,
});

const STATUS: Record<string, string> = { pending: "بانتظار مراجعة فاليو عقار", approved: "منشورة", rejected: "مرفوضة", closed: "مقفولة" };

function NewOpportunityPage() {
  const { me } = useMe();
  const mine = useQuery({ queryKey: ["my-opportunities"], queryFn: async () => (await supabase.rpc("my_opportunities")).data ?? [] });
  const blank = {
    title: "", kind: "development_land", activity: "", deal_kind: "full_sale", city: DEFAULT_CITY, area: areasOf(DEFAULT_CITY)[0]!,
    land_area: "", built_area: "", investment_min: "", investment_max: "", offered_share: "", expected_return: "",
    teaser: "", details: "", location_note: "", licenses: "",
  };
  const [f, setF] = useState(blank);
  const [images, setImages] = useState<string[]>([]);
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const digits = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/٫/g, ".").replace(/[^\d.]/g, "") });
  const num = (v: string) => (v === "" ? null : Number(v));

  async function addImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, 8 - images.length); e.target.value = "";
    setBusy(true);
    for (const file of files) { try { const url = await uploadImage(file); setImages((x) => [...x, url].slice(0, 8)); } catch (err) { toast.error((err as Error).message); } }
    setBusy(false);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.title.trim().length < 5 || f.activity.trim().length < 2 || f.teaser.trim().length < 20) { toast.error("اكتب العنوان والنشاط وملخص لا يقل عن 20 حرف"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("investment_opportunities").insert({
      title: f.title.trim(), kind: f.kind, activity: f.activity.trim(), deal_kind: f.deal_kind, city: f.city,
      area: areasOf(f.city).includes(f.area) ? f.area : areasOf(f.city)[0]!, land_area: num(f.land_area), built_area: num(f.built_area),
      investment_min: num(f.investment_min), investment_max: num(f.investment_max), offered_share: num(f.offered_share), expected_return: num(f.expected_return),
      teaser: f.teaser.trim(), details: f.details.trim() || null, location_note: f.location_note.trim() || null, licenses: f.licenses.trim() || null, images, lat: loc?.lat ?? null, lng: loc?.lng ?? null,
    }).select("id").single();
    if (error || !data) { setBusy(false); toast.error(error?.message ?? "تعذّر الحفظ"); return; }
    for (const d of docs) {
      const up = await supabase.storage.from("investment-docs").upload(`${data.id}/${Date.now()}-${d.name.replace(/[^\w.-]+/g, "_").slice(-80)}`, d, { contentType: d.type });
      if (up.error) toast.error(`${d.name}: ${up.error.message}`);
    }
    setBusy(false);
    toast.success("اتبعتت الفرصة لمراجعة فاليو عقار ✓");
    setF(blank); setImages([]); setDocs([]); setLoc(null); mine.refetch();
  }

  return (
    <DashShell title="اعرض فرصة استثمارية" isAdmin={!!me?.isAdmin}>
      <form onSubmit={submit} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 md:p-6">
        <p className="text-sm text-muted-foreground sm:col-span-2">الملخص والصور بيظهروا للناس. التفاصيل الكاملة والموقع بالتحديد والمستندات <b>سرّية</b>، وبتتبعت بس للمستثمر اللي فاليو عقار توافق على طلبه. كل فرصة بتتراجع قبل النشر.</p>
        <div className="sm:col-span-2"><Field label="عنوان الفرصة"><input className={inputCls} value={f.title} onChange={set("title")} maxLength={150} placeholder="مثال: أرض لمول طبي على الطريق الرئيسي" /></Field></div>
        <Field label="نوع الفرصة"><select className={inputCls} value={f.kind} onChange={set("kind")}>{Object.entries(OPP_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="النشاط"><input className={inputCls} list="activities" value={f.activity} onChange={set("activity")} maxLength={60} placeholder="مول، بنزينة، كمبوند…" /><datalist id="activities">{ACTIVITIES.map((a) => <option key={a} value={a} />)}</datalist></Field>
        <Field label="نوع الصفقة"><select className={inputCls} value={f.deal_kind} onChange={set("deal_kind")}>{Object.entries(DEAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="النسبة المعروضة % (للحصة أو الشراكة)"><input className={inputCls} inputMode="decimal" value={f.offered_share} onChange={digits("offered_share")} /></Field>
        <Field label="المدينة"><select className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value, area: areasOf(e.target.value)[0]! })}>{CITY_NAMES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="المنطقة"><select className={inputCls} value={f.area} onChange={set("area")}>{areasOf(f.city).map((a) => <option key={a}>{a}</option>)}</select></Field>
        <Field label="مساحة الأرض (م²)"><input className={inputCls} inputMode="numeric" value={f.land_area} onChange={digits("land_area")} /></Field>
        <Field label="المساحة المبنية (م²)"><input className={inputCls} inputMode="numeric" value={f.built_area} onChange={digits("built_area")} /></Field>
        <Field label="حجم الاستثمار من (ج.م) — فاضي = عند التواصل"><input className={inputCls} inputMode="numeric" value={f.investment_min} onChange={digits("investment_min")} /></Field>
        <Field label="لحد (ج.م)"><input className={inputCls} inputMode="numeric" value={f.investment_max} onChange={digits("investment_max")} /></Field>
        <Field label="عائد سنوي تقريبي % (اختياري)"><input className={inputCls} inputMode="decimal" value={f.expected_return} onChange={digits("expected_return")} /></Field>
        <div className="sm:col-span-2"><Field label="الملخص اللي بيظهر للناس"><textarea className={`${inputCls} h-24 py-2`} value={f.teaser} onChange={set("teaser")} maxLength={800} /></Field></div>
        <div className="sm:col-span-2 rounded-xl border border-teal/40 p-3">
          <p className="mb-2 text-sm font-bold text-primary">🔒 الجزء السرّي</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="التفاصيل الكاملة (السعر النهائي، الشروط، حالة النشاط…)"><textarea className={`${inputCls} h-28 py-2`} value={f.details} onChange={set("details")} maxLength={8000} /></Field></div>
            <Field label="الموقع بالتحديد"><input className={inputCls} value={f.location_note} onChange={set("location_note")} maxLength={300} /></Field>
            <div className="sm:col-span-2"><Field label="الموقع على الخريطة (سرّي — بيظهر للمستثمر بعد الموافقة بس)"><MapPicker value={loc} onChange={setLoc} /></Field></div>
            <Field label="التراخيص والموافقات"><input className={inputCls} value={f.licenses} onChange={set("licenses")} maxLength={1000} /></Field>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-primary sm:col-span-2"><Upload className="size-4" />مستندات (PDF أو صور) — {docs.length} ملف<input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => setDocs([...(e.target.files ?? [])].filter((x) => x.size <= 10 * 1024 * 1024).slice(0, 10))} /></label>
          </div>
        </div>
        <div className="sm:col-span-2">
          <Field label={`صور للعرض العام (${images.length}/8)`}><input type="file" accept="image/*" multiple disabled={busy || images.length >= 8} onChange={addImages} className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:font-bold file:text-primary" /></Field>
          {images.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{images.map((u) => <img key={u} src={u} alt="" className="h-20 w-28 rounded-lg object-cover" />)}</div>}
        </div>
        <button disabled={busy} className={`${btnPrimary} sm:col-span-2`}>{busy ? "..." : "إرسال للمراجعة"}</button>
      </form>

      {(mine.data?.length ?? 0) > 0 && (
        <section className="mt-6 space-y-2">
          <h2 className="font-extrabold text-primary">فرصي</h2>
          {mine.data!.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card p-3 text-sm">
              <span className="font-bold text-primary" dir="ltr">{oppNo(o.opp_no)}</span>
              {o.review_status === "approved" ? <Link to="/investments/$id" params={{ id: o.id }} className="font-bold text-primary underline">{o.title}</Link> : <span className="font-bold">{o.title}</span>}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-primary">{STATUS[o.review_status] ?? o.review_status}</span>
              <span className="text-xs text-muted-foreground">{investmentRange(o)} · {formatDate(o.created_at)}</span>
              {o.review_note && <span className="w-full text-xs text-destructive">ملاحظة الإدارة: {o.review_note}</span>}
            </div>
          ))}
        </section>
      )}
    </DashShell>
  );
}

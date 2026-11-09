import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Field, Stat, inputCls, btnOutline, btnPrimary } from "@/components/site/ui";
import { SHARED_GENDER, SHARED_KIND, SHARED_STAGES, SHARED_WHO, formatDate, formatPrice, uploadImage } from "@/components/site/data";
import { PAYMENT_METHODS } from "@/lib/finance";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { cleanPhone } from "@/lib/phone";

type Unit = Tables<"shared_units">;
type Req = Tables<"shared_requests">;
type Resident = Tables<"shared_residents">;
export type SharedTab = "shared_units" | "shared_requests" | "shared_residents";

const num = (x: string) => x.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "");
const money = (n: number) => `${formatPrice(Math.round(n))} ج.م`;
const useUnits = () => useQuery({
  queryKey: ["admin-data", "shared-units"],
  queryFn: async () => { const { data, error } = await supabase.from("shared_units").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; },
});
const useResidents = () => useQuery({
  queryKey: ["admin-data", "shared-residents"],
  queryFn: async () => { const { data, error } = await supabase.from("shared_residents").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; },
});

/** «السكن المشترك» in the admin: the units, the booking requests, and who lives where with their rent. */
export function SharedHousingAdmin({ tab, canEdit }: { tab: SharedTab; canEdit: boolean }) {
  const ready = useUnits();
  if (ready.error) return <p className="max-w-2xl rounded-2xl border bg-card p-6 text-sm">السكن المشترك محتاج تحديث قاعدة البيانات (إصدار 52) الأول.</p>;
  return (
    <fieldset disabled={!canEdit} className="contents">
      {tab === "shared_units" ? <Units /> : tab === "shared_requests" ? <Requests /> : <Residents />}
    </fieldset>
  );
}

const EMPTY = { title: "", kind: "bed", gender: "men", area: "", near: "", address: "", description: "", monthly_price: "", total_places: "1", owner_name: "", owner_phone: "", photos: [] as string[], is_active: true };

function Units() {
  const q = useUnits();
  const residents = useResidents();
  const [form, setForm] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const taken = (id: string) => (residents.data ?? []).filter((r) => r.unit_id === id && !r.left_on).length;
  const list = q.data ?? [];
  const edit = (u: Unit) => setForm({ id: u.id, title: u.title, kind: u.kind, gender: u.gender, area: u.area ?? "", near: u.near ?? "", address: u.address ?? "", description: u.description ?? "", monthly_price: String(u.monthly_price), total_places: String(u.total_places), owner_name: u.owner_name ?? "", owner_phone: u.owner_phone ?? "", photos: u.photos, is_active: u.is_active });
  const places = list.filter((u) => u.is_active).reduce((s, u) => s + u.total_places, 0);
  const used = list.filter((u) => u.is_active).reduce((s, u) => s + Math.min(taken(u.id), u.total_places), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="وحدات معروضة" value={formatPrice(list.filter((u) => u.is_active).length)} />
        <Stat label="كل الأماكن" value={formatPrice(places)} />
        <Stat label="مشغول" value={formatPrice(used)} />
        <Stat label="فاضي" value={formatPrice(places - used)} />
      </div>
      {form ? <UnitForm f={form} setF={setForm} onDone={() => { setForm(null); void q.refetch(); }} /> : <button className={btnPrimary} onClick={() => setForm({ ...EMPTY })}><Plus className="size-4" />إضافة وحدة</button>}
      {list.length === 0 && !q.isLoading && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش وحدات. طول ما مفيش وحدات مفعّلة، صفحة السكن بتعرض «قريبًا».</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((u) => (
          <li key={u.id} className="rounded-2xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-primary">{u.title}</b>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">{SHARED_KIND[u.kind]} · {SHARED_GENDER[u.gender]}</span>
              {!u.is_active && <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">موقوفة</span>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{[u.area, u.near].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 font-bold text-primary">{money(Number(u.monthly_price))} في الشهر · فاضي {formatPrice(Math.max(u.total_places - taken(u.id), 0))} من {formatPrice(u.total_places)}</p>
            {u.owner_phone && <a href={`tel:${u.owner_phone}`} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary" dir="ltr"><Phone className="size-3" />{u.owner_phone}</a>}
            <div className="mt-2 flex gap-2">
              <button className={`${btnOutline} h-9 px-3 text-xs`} onClick={() => edit(u)}><Pencil className="size-3.5" />تعديل</button>
              <button className={`${btnOutline} h-9 px-3 text-xs`} onClick={async () => { const { error } = await supabase.from("shared_units").update({ is_active: !u.is_active }).eq("id", u.id); if (error) toast.error(error.message); else void q.refetch(); }}>{u.is_active ? "إيقاف" : "تفعيل"}</button>
              <button aria-label="مسح" className="grid size-9 place-items-center rounded-lg text-destructive hover:bg-destructive/10" onClick={async () => {
                if (taken(u.id)) { toast.error("فيها ساكنين، سجّل خروجهم الأول أو أوقف الوحدة"); return; }
                if (!confirm("مسح الوحدة دي؟")) return;
                const { error } = await supabase.from("shared_units").delete().eq("id", u.id);
                if (error) toast.error("الوحدة ليها سجل ساكنين قدام، أوقفها بدل المسح"); else void q.refetch();
              }}><Trash2 className="size-4" /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnitForm({ f, setF, onDone }: { f: typeof EMPTY & { id?: string }; setF: (x: (typeof EMPTY & { id?: string }) | null) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof EMPTY>) => setF({ ...f, ...p });
  const addPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].filter((x) => x.type.startsWith("image/")).slice(0, 12 - f.photos.length);
    e.target.value = "";
    setBusy(true);
    const urls = [...f.photos];
    try { for (const file of files) urls.push(await uploadImage(file)); } catch (err) { toast.error(err instanceof Error ? err.message : "الصورة ماترفعتش"); }
    setBusy(false);
    setF({ ...f, photos: urls });
  };
  const save = async () => {
    if (f.title.trim().length < 3) { toast.error("اكتب اسم الوحدة"); return; }
    if (!f.monthly_price) { toast.error("اكتب الإيجار الشهري"); return; }
    const row = { title: f.title.trim(), kind: f.kind, gender: f.gender, area: f.area.trim() || null, near: f.near.trim() || null, address: f.address.trim() || null, description: f.description.trim() || null, monthly_price: Number(f.monthly_price), total_places: Math.max(1, Number(f.total_places || 1)), owner_name: f.owner_name.trim() || null, owner_phone: f.owner_phone ? cleanPhone(f.owner_phone) : null, photos: f.photos, is_active: f.is_active };
    setBusy(true);
    const { error } = f.id ? await supabase.from("shared_units").update(row).eq("id", f.id) : await supabase.from("shared_units").insert(row);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("الوحدة اتحفظت"); onDone(); }
  };
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="اسم الوحدة"><input className={inputCls} maxLength={120} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="النوع"><select className={inputCls} value={f.kind} onChange={(e) => set({ kind: e.target.value })}>{Object.entries(SHARED_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="السكن لـ"><select className={inputCls} value={f.gender} onChange={(e) => set({ gender: e.target.value })}>{Object.entries(SHARED_GENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <Field label="المنطقة"><input className={inputCls} maxLength={100} value={f.area} onChange={(e) => set({ area: e.target.value })} /></Field>
        <Field label="قريب من (مصنع، جامعة...)"><input className={inputCls} maxLength={120} value={f.near} onChange={(e) => set({ near: e.target.value })} /></Field>
        <Field label="الإيجار الشهري للمكان (ج.م)"><input className={inputCls} inputMode="numeric" value={f.monthly_price} onChange={(e) => set({ monthly_price: num(e.target.value).slice(0, 7) })} /></Field>
        <Field label="عدد الأماكن"><input className={inputCls} inputMode="numeric" value={f.total_places} onChange={(e) => set({ total_places: num(e.target.value).slice(0, 3) })} /></Field>
        <Field label="العنوان بالتفصيل (للإدارة بس)"><input className={inputCls} maxLength={300} value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="اسم المالك (للإدارة بس)"><input className={inputCls} maxLength={100} value={f.owner_name} onChange={(e) => set({ owner_name: e.target.value })} /></Field>
          <Field label="موبايل المالك"><input className={inputCls} dir="ltr" inputMode="tel" maxLength={20} value={f.owner_phone} onChange={(e) => set({ owner_phone: e.target.value })} /></Field>
        </div>
      </div>
      <Field label="الوصف"><textarea className={`${inputCls} h-20 py-2`} maxLength={2000} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <div className="flex flex-wrap items-center gap-2">
        {f.photos.map((u) => <button key={u} type="button" title="شيل الصورة" onClick={() => set({ photos: f.photos.filter((x) => x !== u) })}><img src={u} alt="" className="size-16 rounded-lg object-cover" /></button>)}
        {f.photos.length < 12 && <label className={`${btnOutline} cursor-pointer`}><ImagePlus className="size-4" />صور<input type="file" accept="image/*" multiple className="sr-only" onChange={addPhotos} /></label>}
      </div>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy} onClick={save}>{busy ? "..." : "حفظ"}</button>
        <button className={btnOutline} onClick={() => setF(null)}>إلغاء</button>
      </div>
    </div>
  );
}

function Requests() {
  const q = useQuery({
    queryKey: ["admin-data", "shared-requests"],
    queryFn: async () => { const { data, error } = await supabase.from("shared_requests").select("*").order("created_at", { ascending: false }).limit(500); if (error) throw error; return data; },
  });
  const units = useUnits();
  const old = useQuery({
    queryKey: ["admin-data", "shared-old-leads"],
    queryFn: async () => (await supabase.from("leads").select("id, name, phone, details, created_at").like("details", "سكن مشترك%").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const [stage, setStage] = useState("");
  const all = q.data ?? [];
  const list = all.filter((r) => !stage || r.stage === stage);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Object.entries(SHARED_STAGES).map(([k, v]) => <button key={k} type="button" aria-pressed={stage === k} onClick={() => setStage(stage === k ? "" : k)} className={`h-10 shrink-0 rounded-full border px-4 text-sm font-bold ${stage === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{v} ({formatPrice(all.filter((r) => r.stage === k).length)})</button>)}
      </div>
      {list.length === 0 && !q.isLoading && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش طلبات {all.length ? "في المرحلة دي" : "لسه"}.</p>}
      {list.map((r) => <RequestRow key={r.id} r={r} units={units.data ?? []} onChanged={() => void q.refetch()} />)}
      {(old.data?.length ?? 0) > 0 && (
        <details className="rounded-2xl border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-bold text-primary">اللي سجلوا اهتمامهم قبل الفتح ({formatPrice(old.data!.length)})</summary>
          <ul className="mt-2 divide-y">{old.data!.map((l) => <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><b className="text-primary">{l.name}</b> · <span className="text-xs text-muted-foreground">{l.details} · {formatDate(l.created_at)}</span></span><a href={`tel:${l.phone}`} className="text-xs font-bold text-primary" dir="ltr">{l.phone}</a></li>)}</ul>
        </details>
      )}
    </div>
  );
}

function RequestRow({ r, units, onChanged }: { r: Req; units: Unit[]; onChanged: () => void }) {
  const [notes, setNotes] = useState(r.admin_notes ?? "");
  const save = async (patch: Partial<Omit<Req, "request_no">>, ok = "اتحفظ") => {
    const { error } = await supabase.from("shared_requests").update(patch).eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success(ok); onChanged(); }
  };
  const unit = units.find((u) => u.id === r.unit_id);
  return (
    <div className="rounded-2xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">{r.name} <span className="text-xs font-semibold text-muted-foreground">· {SHARED_WHO[r.who]}{r.gender ? ` · ${SHARED_GENDER[r.gender]}` : ""}</span></p>
          <p className="text-xs text-muted-foreground"><span dir="ltr">H-{String(r.request_no).padStart(6, "0")}</span> · {formatDate(r.created_at)}{r.people ? ` · ${formatPrice(r.people)} فرد` : ""}{r.near ? ` · قريب من ${r.near}` : ""}{r.budget ? ` · ميزانية ${money(Number(r.budget))}` : ""}</p>
        </div>
        <select aria-label="المرحلة" className={`${inputCls} h-10 w-auto text-xs`} value={r.stage} onChange={(e) => save({ stage: e.target.value })}>{Object.entries(SHARED_STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={`tel:${r.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary" dir="ltr"><Phone className="size-4" />{r.phone}</a>
        <select aria-label="الوحدة" className={`${inputCls} h-10 w-auto min-w-48 text-xs`} value={r.unit_id ?? ""} onChange={(e) => save({ unit_id: e.target.value || null })}>
          <option value="">{unit ? "شيل الوحدة" : "اختار وحدة…"}</option>{units.map((u) => <option key={u.id} value={u.id}>{u.title} · {SHARED_GENDER[u.gender]}</option>)}
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <input className={inputCls} placeholder="ملاحظات داخلية" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className={btnOutline} onClick={() => save({ admin_notes: notes.trim() || null })}>حفظ</button>
      </div>
    </div>
  );
}

const payState = (r: Resident, today: string) => (r.left_on ? "left" : r.paid_until && r.paid_until >= today ? "paid" : "unpaid");

function Residents() {
  const q = useResidents();
  const units = useUnits();
  const pays = useQuery({ queryKey: ["admin-data", "shared-payments"], queryFn: async () => (await supabase.from("shared_rent_payments").select("amount, created_at")).data ?? [] });
  const [show, setShow] = useState("");
  const [adding, setAdding] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const all = q.data ?? [];
  const current = all.filter((r) => !r.left_on);
  const unpaid = current.filter((r) => payState(r, today) === "unpaid");
  const month = today.slice(0, 7);
  const list = all.filter((r) => !show || (show === "due" ? payState(r, today) === "unpaid" : show === "soon" ? !r.left_on && !!r.paid_until && r.paid_until >= today && r.paid_until <= soon : payState(r, today) === show));
  const unitName = (id: string) => units.data?.find((u) => u.id === id)?.title ?? "—";
  const reload = () => { void q.refetch(); void pays.refetch(); };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="ساكنين حاليًا" value={formatPrice(current.length)} />
        <Stat label="محصّل الشهر ده" value={money((pays.data ?? []).filter((p) => p.created_at.slice(0, 7) === month).reduce((s, p) => s + Number(p.amount), 0))} />
        <Stat label="مدفعوش" value={formatPrice(unpaid.length)} hint={unpaid.length ? `${money(unpaid.reduce((s, r) => s + Number(r.monthly_rent), 0))} في الشهر` : undefined} />
        <Stat label="إجمالي الإيجار الشهري" value={money(current.reduce((s, r) => s + Number(r.monthly_rent), 0))} />
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="الحالة" className={`${inputCls} w-auto`} value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="">الكل</option><option value="due">مدفعش</option><option value="paid">دفع</option><option value="soon">تجديد خلال 7 أيام</option><option value="left">خرجوا</option>
        </select>
        {!adding && <button className={btnPrimary} onClick={() => setAdding(true)}><Plus className="size-4" />تسكين ساكن</button>}
      </div>
      {adding && <ResidentForm units={units.data ?? []} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
      {list.length === 0 && !q.isLoading && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش ساكنين هنا.</p>}
      {list.map((r) => <ResidentRow key={r.id} r={r} unit={unitName(r.unit_id)} today={today} onChanged={reload} />)}
    </div>
  );
}

function ResidentForm({ units, onDone, onCancel }: { units: Unit[]; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ unit: "", name: "", phone: "", place: "", rent: "", start: new Date().toISOString().slice(0, 10) });
  return (
    <div className="grid gap-2 rounded-2xl border bg-card p-4 sm:grid-cols-3">
      <Field label="الوحدة"><select className={inputCls} value={f.unit} onChange={(e) => { const u = units.find((x) => x.id === e.target.value); setF({ ...f, unit: e.target.value, rent: u ? String(u.monthly_price) : f.rent }); }}><option value="">اختار</option>{units.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}</select></Field>
      <Field label="الاسم"><input className={inputCls} maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="الموبايل"><input className={inputCls} dir="ltr" inputMode="tel" maxLength={20} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="رقم السرير أو الأوضة"><input className={inputCls} maxLength={40} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></Field>
      <Field label="الإيجار الشهري"><input className={inputCls} inputMode="numeric" value={f.rent} onChange={(e) => setF({ ...f, rent: num(e.target.value).slice(0, 7) })} /></Field>
      <Field label="ميعاد الدخول"><input type="date" className={inputCls} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
      <div className="flex gap-2 sm:col-span-3">
        <button className={btnPrimary} onClick={async () => {
          if (!f.unit || f.name.trim().length < 2 || !f.rent) { toast.error("اختار الوحدة واكتب الاسم والإيجار"); return; }
          const { error } = await supabase.from("shared_residents").insert({ unit_id: f.unit, name: f.name.trim(), phone: f.phone ? cleanPhone(f.phone) : null, place_label: f.place.trim() || null, monthly_rent: Number(f.rent), starts_on: f.start });
          if (error) toast.error(error.message); else { toast.success("الساكن اتسجل"); onDone(); }
        }}>حفظ</button>
        <button className={btnOutline} onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}

function ResidentRow({ r, unit, today, onChanged }: { r: Resident; unit: string; today: string; onChanged: () => void }) {
  const [pay, setPay] = useState<{ months: string; amount: string; method: string } | null>(null);
  const st = payState(r, today);
  return (
    <div className="rounded-2xl border bg-card p-3 text-sm md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-primary">{r.name}</b>
        <span className="text-xs text-muted-foreground">{unit}{r.place_label ? ` · ${r.place_label}` : ""}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st === "paid" ? "bg-teal/15 text-primary" : st === "unpaid" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{st === "paid" ? "دفع" : st === "unpaid" ? "مدفعش" : "خرج"}</span>
        {!r.left_on && (
          <span className="ms-auto flex gap-1.5">
            <button className={`${btnOutline} h-9 px-3 text-xs`} onClick={() => setPay(pay ? null : { months: "1", amount: String(r.monthly_rent), method: "cash" })}>سجّل دفع</button>
            <button className={`${btnOutline} h-9 px-3 text-xs`} onClick={async () => { if (!confirm("تسجيل خروج الساكن؟ مكانه هيرجع فاضي.")) return; const { error } = await supabase.from("shared_residents").update({ left_on: today }).eq("id", r.id); if (error) toast.error(error.message); else onChanged(); }}>خروج</button>
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground md:grid-cols-4">
        <span>الإيجار: <b className="text-foreground">{money(Number(r.monthly_rent))}</b></span>
        <span>دخل: <b className="text-foreground">{formatDate(r.starts_on)}</b></span>
        <span>مدفوع لحد / التجديد: <b className="text-foreground">{r.paid_until ? formatDate(r.paid_until) : "—"}</b></span>
        {r.phone && <a href={`tel:${r.phone}`} className="font-bold text-primary" dir="ltr">{r.phone}</a>}
      </div>
      {pay && (
        <div className="mt-3 grid grid-cols-2 items-end gap-2 border-t pt-3 sm:grid-cols-4">
          <Field label="عدد الشهور"><input className={inputCls} inputMode="numeric" value={pay.months} onChange={(e) => { const m = num(e.target.value).slice(0, 2); setPay({ ...pay, months: m, amount: String(Number(m || 0) * Number(r.monthly_rent)) }); }} /></Field>
          <Field label="المبلغ"><input className={inputCls} inputMode="numeric" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: num(e.target.value).slice(0, 8) })} /></Field>
          <Field label="الطريقة"><select className={inputCls} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <button className={btnPrimary} onClick={async () => {
            const { error } = await supabase.rpc("admin_record_shared_rent", { _resident: r.id, _months: Number(pay.months || 0), _amount: Number(pay.amount || 0), _method: pay.method });
            if (error) toast.error(error.message); else { toast.success("الدفع اتسجل"); setPay(null); onChanged(); }
          }}>حفظ</button>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileSpreadsheet, LayoutGrid, Table2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/components/site/data";
import { UNIT_STATUS, UNIT_TYPES, type CompoundUnitRow } from "@/components/site/compounds";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { UnitsImport } from "@/components/dash/UnitsImport";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

const STATUS_DOT: Record<string, string> = {
  available: "border-teal bg-teal-soft text-primary",
  reserved: "border-[#f2b84b] bg-[#f2b84b]/25 text-primary",
  sold: "border-primary bg-primary text-primary-foreground",
  unavailable: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** Units of a compound: a map by building and floor (colour = status) or a table. Sales only change status and notes. */
export function CompoundUnits({ compoundId, units, canEdit, reload }: { compoundId: string; units: CompoundUnitRow[]; canEdit: boolean; reload: () => void }) {
  const [view, setView] = useState<"map" | "table">("map");
  const [editing, setEditing] = useState<CompoundUnitRow | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState("");
  const shown = units.filter((u) => !status || u.status === status);

  // Building → floor → units, floors sorted numerically when they are numbers.
  const map = useMemo(() => {
    const b = new Map<string, Map<string, CompoundUnitRow[]>>();
    for (const u of shown) {
      const bk = u.building || "بدون عمارة", fk = u.floor || "—";
      if (!b.has(bk)) b.set(bk, new Map());
      const floors = b.get(bk)!;
      floors.set(fk, [...(floors.get(fk) ?? []), u]);
    }
    const floorKey = (f: string) => (/^\d+$/.test(f) ? Number(f) : f === "الأرضي" ? 0 : 999);
    return [...b.entries()].sort(([a], [c]) => a.localeCompare(c, "ar")).map(([bk, floors]) =>
      [bk, [...floors.entries()].sort(([a], [c]) => floorKey(c) - floorKey(a))] as const);
  }, [shown]);

  async function setUnitStatus(u: CompoundUnitRow, s: string) {
    const { error } = await supabase.from("compound_units").update({ status: s }).eq("id", u.id);
    if (error) toast.error(error.message); else { toast.success("تم تحديث الحالة"); reload(); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border bg-card p-1">
          <button onClick={() => setView("map")} className={`flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold ${view === "map" ? "bg-primary text-primary-foreground" : "text-primary"}`}><LayoutGrid className="size-4" />خريطة الوحدات</button>
          <button onClick={() => setView("table")} className={`flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold ${view === "table" ? "bg-primary text-primary-foreground" : "text-primary"}`}><Table2 className="size-4" />جدول</button>
        </div>
        <select aria-label="حالة الوحدة" className={`${inputCls} h-11 w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات ({units.length})</option>
          {Object.entries(UNIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label} ({units.filter((u) => u.status === k).length})</option>)}
        </select>
        {canEdit && (
          <div className="ms-auto flex flex-wrap gap-2">
            <button onClick={() => setImporting(!importing)} className={btnOutline}><FileSpreadsheet className="size-4" />رفع من Excel</button>
            <button onClick={() => setEditing("new")} className={btnPrimary}><Plus className="size-4" />إضافة وحدة</button>
          </div>
        )}
      </div>
      {importing && <UnitsImport compoundId={compoundId} existingCodes={units.map((u) => u.code).filter((c): c is string => !!c)} onDone={() => { setImporting(false); reload(); }} />}
      {editing && <UnitForm compoundId={compoundId} initial={editing === "new" ? null : editing} canEdit={canEdit} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      {units.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش وحدات في الكمبوند ده.{canEdit ? " ضيفها واحدة واحدة أو من ملف Excel." : ""}</p>}

      {view === "map" && shown.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-xs font-bold text-muted-foreground">
            {Object.entries(UNIT_STATUS).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className={`size-3 rounded border ${STATUS_DOT[k]}`} />{v.label}</span>)}
            <span>· اضغط على أي وحدة لتفاصيلها</span>
          </div>
          {map.map(([building, floors]) => (
            <div key={building} className="rounded-2xl border bg-card p-3">
              <p className="mb-2 font-extrabold text-primary">{building === "بدون عمارة" ? building : `عمارة ${building}`}</p>
              <div className="space-y-1.5">
                {floors.map(([floor, list]) => (
                  <div key={floor} className="flex items-start gap-2">
                    <span className="w-16 shrink-0 pt-2 text-xs font-bold text-muted-foreground">{floor === "—" ? "—" : `دور ${floor}`}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((u) => (
                        <button key={u.id} onClick={() => setEditing(u)} title={`${u.unit_type} · ${formatPrice(Number(u.size))} م² · ${u.price != null ? `${formatPrice(Number(u.price))} ج.م` : "بدون سعر"} · ${UNIT_STATUS[u.status]?.label}`}
                          className={`min-w-14 rounded-lg border px-2 py-1.5 text-start text-[11px] font-bold leading-tight transition hover:-translate-y-0.5 ${STATUS_DOT[u.status]}`}>
                          <span className="block" dir="ltr">{u.code || u.unit_type}</span>
                          <span className="block font-semibold opacity-80">{formatPrice(Number(u.size))} م²</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "table" && shown.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-secondary text-primary"><tr>{["الكود", "النوع", "العمارة / الدور", "المساحة", "الغرف", "السعر", "الحالة", ""].map((h, i) => <th key={i} className="p-3 text-start font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className="border-t align-middle">
                  <td className="p-3" dir="ltr">{u.code ?? "—"}</td>
                  <td className="p-3 font-bold text-primary">{u.unit_type}</td>
                  <td className="p-3">{[u.building, u.floor].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="p-3">{formatPrice(Number(u.size))} م²</td>
                  <td className="p-3">{u.rooms ?? "—"}</td>
                  <td className="p-3">{u.price != null ? `${formatPrice(Number(u.price))} ج.م` : "—"}</td>
                  <td className="p-3">
                    <select aria-label="حالة الوحدة" value={u.status} onChange={(e) => setUnitStatus(u, e.target.value)} className={`${inputCls} h-9 w-auto text-xs`}>
                      {Object.entries(UNIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button aria-label="تفاصيل" onClick={() => setEditing(u)} className="grid size-9 place-items-center rounded-lg border text-primary hover:bg-secondary"><Pencil className="size-4" /></button>
                      {canEdit && <button aria-label="حذف" onClick={async () => { if (!confirm("حذف الوحدة؟")) return; const { error } = await supabase.from("compound_units").delete().eq("id", u.id); if (error) toast.error(error.message); else reload(); }} className="grid size-9 place-items-center rounded-lg border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UnitForm({ compoundId, initial, canEdit, onDone, onCancel }: { compoundId: string; initial: CompoundUnitRow | null; canEdit: boolean; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    code: initial?.code ?? "", building: initial?.building ?? "", floor: initial?.floor ?? "", unit_type: initial?.unit_type ?? UNIT_TYPES[0]!,
    size: initial ? String(initial.size) : "", rooms: initial?.rooms != null ? String(initial.rooms) : "", baths: initial?.baths != null ? String(initial.baths) : "",
    price: initial?.price != null ? String(initial.price) : "", finishing: initial?.finishing ?? "", status: initial?.status ?? "available", notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const digits = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") });
  const num = (v: string) => (v === "" ? null : Number(v));
  const ro = !canEdit;

  async function save() {
    if (canEdit && !f.size) { toast.error("اكتب مساحة الوحدة"); return; }
    setBusy(true);
    const full = {
      code: f.code.trim().slice(0, 50) || null, building: f.building.trim().slice(0, 50) || null, floor: f.floor.trim().slice(0, 50) || null,
      unit_type: f.unit_type, size: Number(f.size), rooms: num(f.rooms), baths: num(f.baths), price: num(f.price),
      finishing: f.finishing.trim().slice(0, 50) || null, status: f.status, notes: f.notes.trim().slice(0, 1000) || null,
    };
    // Sales only send what they may change; the database ignores anything else from them anyway.
    const res = initial
      ? await supabase.from("compound_units").update(canEdit ? full : { status: full.status, notes: full.notes }).eq("id", initial.id)
      : await supabase.from("compound_units").insert({ ...full, compound_id: compoundId });
    setBusy(false);
    if (res.error) { toast.error(res.error.code === "23505" ? "فيه وحدة تانية بنفس الكود في الكمبوند ده" : res.error.message); return; }
    toast.success("تم حفظ الوحدة");
    onDone();
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-3 font-bold text-primary">{initial ? `الوحدة ${initial.code ?? initial.unit_type}` : "وحدة جديدة"}</p>
      {ro && <p className="mb-3 rounded-xl bg-secondary p-2 text-xs font-semibold text-primary">تقدر تغيّر الحالة (حجز / بيع) والملاحظات بس. باقي البيانات بيعدلها مدير الكمبوند.</p>}
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="كود الوحدة"><input className={inputCls} dir="ltr" value={f.code} onChange={set("code")} maxLength={50} disabled={ro} /></Field>
        <Field label="العمارة"><input className={inputCls} value={f.building} onChange={set("building")} maxLength={50} disabled={ro} placeholder="مثال: A" /></Field>
        <Field label="الدور"><input className={inputCls} value={f.floor} onChange={set("floor")} maxLength={50} disabled={ro} placeholder="مثال: 3 أو الأرضي" /></Field>
        <Field label="النوع"><select className={inputCls} value={f.unit_type} onChange={set("unit_type")} disabled={ro}>{UNIT_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="المساحة (م²)"><input className={inputCls} inputMode="numeric" value={f.size} onChange={digits("size")} disabled={ro} /></Field>
        <Field label="الغرف"><input className={inputCls} inputMode="numeric" value={f.rooms} onChange={digits("rooms")} disabled={ro} /></Field>
        <Field label="الحمامات"><input className={inputCls} inputMode="numeric" value={f.baths} onChange={digits("baths")} disabled={ro} /></Field>
        <Field label="التشطيب"><input className={inputCls} value={f.finishing} onChange={set("finishing")} maxLength={50} disabled={ro} placeholder="مثال: نص تشطيب" /></Field>
        <Field label="السعر (ج.م) — فاضي = اسأل"><input className={inputCls} inputMode="numeric" value={f.price} onChange={digits("price")} disabled={ro} /></Field>
        <Field label="الحالة"><select className={inputCls} value={f.status} onChange={set("status")}>{Object.entries(UNIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="ملاحظات"><input className={inputCls} value={f.notes} onChange={set("notes")} maxLength={1000} placeholder="مثال: محجوزة لعميل VA-000123" /></Field></div>
      </div>
      <div className="mt-4 flex gap-2">
        <button disabled={busy} onClick={save} className={btnPrimary}>حفظ الوحدة</button>
        <button onClick={onCancel} className={btnOutline}>إلغاء</button>
      </div>
    </div>
  );
}

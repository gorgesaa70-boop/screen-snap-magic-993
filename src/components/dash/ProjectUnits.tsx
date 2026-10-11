import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, History, FileSpreadsheet } from "lucide-react";
import { UnitsImport } from "@/components/dash/UnitsImport";
import { supabase } from "@/integrations/supabase/client";
import { dbx } from "@/lib/dbx";
import { formatPrice, formatDate } from "@/components/site/data";
import { UNIT_STATUS, UNIT_TYPES, type ProjectRow, type UnitRow } from "@/components/site/projects";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";

/** Units table for one project: add/edit/delete, quick status change, and price/status history. */
export function ProjectUnits({ project, onBack }: { project: ProjectRow; onBack: () => void }) {
  const q = useQuery({
    queryKey: ["project-units", project.id],
    queryFn: async () => {
      const { data, error } = await dbx.from("project_units").select("*").eq("project_id", project.id).order("unit_type").order("code");
      if (error) throw error; return data;
    },
  });
  const [editing, setEditing] = useState<UnitRow | "new" | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const U = q.data ?? [];
  const count = (s: string) => U.filter((u) => u.status === s).length;

  async function setStatus(u: UnitRow, status: string) {
    const { error } = await dbx.from("project_units").update({ status }).eq("id", u.id);
    if (error) toast.error(error.message); else { toast.success("تم تحديث الحالة"); q.refetch(); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button onClick={onBack} className="text-xs font-bold text-muted-foreground hover:text-primary">→ كل المشروعات</button>
          <h3 className="text-lg font-extrabold text-primary">وحدات {project.name}</h3>
          <p className="text-xs text-muted-foreground">{Object.entries(UNIT_STATUS).map(([k, v]) => `${v.label}: ${count(k)}`).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setImporting(!importing)} className={btnOutline}><FileSpreadsheet className="size-4" />رفع من Excel</button>
          <button onClick={() => setEditing("new")} className={btnPrimary}><Plus className="size-4" />إضافة وحدة</button>
        </div>
      </div>
      {importing && <UnitsImport projectId={project.id} existingCodes={U.map((u) => u.code).filter((c): c is string => !!c)} onDone={() => { setImporting(false); q.refetch(); }} />}
      {editing && <UnitForm projectId={project.id} initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); q.refetch(); }} />}
      {!q.isLoading && U.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش وحدات في المشروع ده.</p>}
      {U.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary text-primary"><tr>{["الكود", "النوع", "المساحة", "الغرف", "الدور", "السعر", "الحالة", ""].map((h, i) => <th key={i} className="p-3 text-start font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {U.map((u) => (
                <tr key={u.id} className="border-t align-middle">
                  <td className="p-3" dir="ltr">{u.code ?? "—"}</td>
                  <td className="p-3 font-bold text-primary">{u.unit_type}</td>
                  <td className="p-3">{formatPrice(Number(u.size))} م²</td>
                  <td className="p-3">{u.rooms ?? "—"}</td>
                  <td className="p-3">{u.floor ?? "—"}</td>
                  <td className="p-3">{u.price != null ? `${formatPrice(Number(u.price))} ج.م` : "—"}</td>
                  <td className="p-3">
                    <select aria-label="حالة الوحدة" value={u.status} onChange={(e) => setStatus(u, e.target.value)} className={`${inputCls} h-9 w-auto text-xs`}>
                      {Object.entries(UNIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button aria-label="سجل التغييرات" onClick={() => setHistoryOf(historyOf === u.id ? null : u.id)} className="grid size-9 place-items-center rounded-lg border text-primary hover:bg-secondary"><History className="size-4" /></button>
                      <button aria-label="تعديل" onClick={() => setEditing(u)} className="grid size-9 place-items-center rounded-lg border text-primary hover:bg-secondary"><Pencil className="size-4" /></button>
                      <button aria-label="حذف" onClick={async () => { if (!confirm("حذف الوحدة؟")) return; const { error } = await dbx.from("project_units").delete().eq("id", u.id); if (error) toast.error(error.message); else q.refetch(); }} className="grid size-9 place-items-center rounded-lg border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {historyOf && <UnitHistory unitId={historyOf} />}
    </div>
  );
}

function UnitHistory({ unitId }: { unitId: string }) {
  const q = useQuery({
    queryKey: ["unit-history", unitId],
    queryFn: async () => {
      const { data, error } = await dbx.from("project_unit_history").select("*").eq("unit_id", unitId).order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
  const st = (s: string | null) => (s ? UNIT_STATUS[s]?.label ?? s : "—");
  const pr = (n: number | null) => (n != null ? `${formatPrice(Number(n))} ج.م` : "—");
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-2 font-bold text-primary">سجل تغييرات السعر والحالة</p>
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground">مفيش تغييرات متسجلة.</p>}
      <ul className="space-y-1 text-sm">
        {q.data?.map((h) => (
          <li key={h.id} className="text-foreground/80">
            <span className="text-xs text-muted-foreground">{formatDate(h.created_at)}: </span>
            {h.old_status !== h.new_status && <>الحالة {st(h.old_status)} ← {st(h.new_status)}. </>}
            {h.old_price !== h.new_price && <>السعر {pr(h.old_price)} ← {pr(h.new_price)}.</>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnitForm({ projectId, initial, onDone, onCancel }: { projectId: string; initial: UnitRow | null; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    code: initial?.code ?? "", unit_type: initial?.unit_type ?? UNIT_TYPES[0]!, size: initial ? String(initial.size) : "",
    rooms: initial?.rooms != null ? String(initial.rooms) : "", baths: initial?.baths != null ? String(initial.baths) : "",
    floor: initial?.floor ?? "", price: initial?.price != null ? String(initial.price) : "", status: initial?.status ?? "available", notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const digits = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "") });
  const num = (v: string) => (v === "" ? null : Number(v));

  async function save() {
    if (!f.size) { toast.error("اكتب مساحة الوحدة"); return; }
    setBusy(true);
    const payload = {
      code: f.code.trim().slice(0, 50) || null, unit_type: f.unit_type, size: Number(f.size), rooms: num(f.rooms), baths: num(f.baths),
      floor: f.floor.trim().slice(0, 50) || null, price: num(f.price), status: f.status, notes: f.notes.trim().slice(0, 1000) || null,
    };
    const res = initial
      ? await dbx.from("project_units").update(payload).eq("id", initial.id)
      : await dbx.from("project_units").insert({ ...payload, project_id: projectId });
    setBusy(false);
    if (res.error) { toast.error(res.error.code === "23505" ? "فيه وحدة تانية بنفس الكود في المشروع ده" : res.error.message); return; }
    toast.success("تم حفظ الوحدة");
    onDone();
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="كود الوحدة (اختياري)"><input className={inputCls} dir="ltr" value={f.code} onChange={set("code")} maxLength={50} /></Field>
        <Field label="النوع"><select className={inputCls} value={f.unit_type} onChange={set("unit_type")}>{UNIT_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="الحالة"><select className={inputCls} value={f.status} onChange={set("status")}>{Object.entries(UNIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Field label="المساحة (م²)"><input className={inputCls} inputMode="numeric" value={f.size} onChange={digits("size")} /></Field>
        <Field label="الغرف"><input className={inputCls} inputMode="numeric" value={f.rooms} onChange={digits("rooms")} /></Field>
        <Field label="الحمامات"><input className={inputCls} inputMode="numeric" value={f.baths} onChange={digits("baths")} /></Field>
        <Field label="الدور"><input className={inputCls} value={f.floor} onChange={set("floor")} maxLength={50} /></Field>
        <Field label="السعر (ج.م) — فاضي = اسأل عن السعر"><input className={inputCls} inputMode="numeric" value={f.price} onChange={digits("price")} /></Field>
        <Field label="ملاحظات"><input className={inputCls} value={f.notes} onChange={set("notes")} maxLength={1000} /></Field>
      </div>
      <div className="mt-4 flex gap-2">
        <button disabled={busy} onClick={save} className={btnPrimary}>حفظ الوحدة</button>
        <button onClick={onCancel} className={btnOutline}>إلغاء</button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileText, Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { STAGES, formatDate, formatPrice } from "@/components/site/data";
import { Field, inputCls, btnOutline, btnPrimary } from "@/components/site/ui";

type Lead = Tables<"leads">;
type Deal = Tables<"deals">;

const FLOW = ["new", "contacted", "qualified", "visit_scheduled", "visited", "reserved", "contracted", "sold"];
const LOST_REASONS = ["السعر مش مناسب", "اشترى من مكان تاني", "مش جاد / بيستفسر بس", "مش بيرد", "المنطقة مش مناسبة", "التمويل / التقسيط"];
export const DEAL_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-secondary text-primary" },
  pending: { label: "بانتظار مراجعة الإدارة", cls: "bg-teal-soft text-primary" },
  approved: { label: "معتمدة", cls: "bg-primary text-primary-foreground" },
  rejected: { label: "مرفوضة", cls: "bg-destructive/10 text-destructive" },
  needs_info: { label: "محتاجة بيانات", cls: "bg-destructive/10 text-destructive" },
};
const DOC_KINDS: Record<string, string> = { reservation: "مستند الحجز", contract: "العقد", sale: "مستند البيع (عقد نهائي / إيصال سداد)", payment: "إثبات دفع", other: "مستند آخر" };
export const dealNo = (n: number | null | undefined) => (n ? `D-${String(n).padStart(6, "0")}` : "D-—");

/** Progress bar over the main flow; lost / postponed shown as a side state. */
export function PipelineSteps({ stage }: { stage: string }) {
  const at = FLOW.indexOf(stage);
  return (
    <div>
      <ol className="flex gap-1 overflow-x-auto pb-1">
        {FLOW.map((s, i) => (
          <li key={s} className={`min-w-[78px] flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-bold ${i < at ? "bg-teal-soft text-primary" : i === at ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {i < at && <Check className="mx-auto mb-0.5 size-3" />}{STAGES[s]}
          </li>
        ))}
      </ol>
      {(stage === "lost" || stage === "postponed") && <p className="mt-2 inline-block rounded-full bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">{STAGES[stage]}</p>}
    </div>
  );
}

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** Change stage; stages that need data show their fields first. Database rules make the final check. */
export function StageChanger({ lead, initial, isAdmin, onChanged }: { lead: Lead; initial?: string | undefined; isAdmin: boolean; onChanged: () => void }) {
  const [target, setTarget] = useState(initial && initial !== lead.stage ? initial : "");
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (initial && initial !== lead.stage) setTarget(initial); }, [initial, lead.stage]);
  const locked = lead.stage === "sold" && !isAdmin;

  async function apply() {
    if (!target) return;
    const patch: TablesUpdate<"leads"> = { stage: target };
    if (target === "lost") { if (!reason.trim()) { toast.error("اختار أو اكتب سبب عدم الاكتمال"); return; } patch.lost_reason = reason.trim().slice(0, 300); }
    if (target === "postponed") { if (!when) { toast.error("حدد ميعاد المتابعة"); return; } patch.follow_up_at = new Date(when).toISOString(); }
    if (target === "visit_scheduled") { if (!when) { toast.error("حدد ميعاد الزيارة"); return; } patch.visit_at = new Date(when).toISOString(); }
    setBusy(true);
    const { error } = await dbx.from("leads").update(patch).eq("id", lead.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`العميل اتنقل لمرحلة «${STAGES[target]}»`);
    setTarget(""); setReason(""); setWhen(""); onChanged();
  }

  if (locked) return <p className="text-sm text-muted-foreground">البيع اتأكد من الإدارة، والمرحلة مقفولة.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="نقل العميل لمرحلة">
          <select className={`${inputCls} w-auto`} value={target} onChange={(e) => { setTarget(e.target.value); setWhen(e.target.value === "visit_scheduled" ? toLocalInput(lead.visit_at) : ""); }}>
            <option value="">— اختار —</option>
            {Object.entries(STAGES).filter(([k]) => k !== lead.stage && k !== "sold").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {target && <button disabled={busy} onClick={apply} className={btnPrimary}>{busy ? "..." : "تأكيد"}</button>}
      </div>
      {target === "lost" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">{LOST_REASONS.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full border px-3 py-1 text-xs font-bold ${reason === r ? "border-primary bg-primary text-primary-foreground" : "text-primary"}`}>{r}</button>)}</div>
          <input className={inputCls} placeholder="سبب عدم الاكتمال" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </div>
      )}
      {(target === "postponed" || target === "visit_scheduled") && (
        <Field label={target === "postponed" ? "ميعاد المتابعة الجاي" : "ميعاد الزيارة"}>
          <input type="datetime-local" className={`${inputCls} w-auto`} value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      )}
      {(target === "reserved" || target === "contracted") && (
        <p className="rounded-xl bg-teal-soft p-3 text-xs font-semibold text-primary">
          {target === "reserved" ? "الحجز محتاج: تاريخ الحجز ومبلغه، ومستند الحجز مرفوع في الصفقة تحت." : "العقد محتاج: تاريخ العقد وقيمته، والعقد مرفوع في الصفقة تحت."}
        </p>
      )}
      {lead.stage === "lost" && lead.lost_reason && <p className="text-xs text-muted-foreground">سبب عدم الاكتمال: {lead.lost_reason}</p>}
      {lead.visit_at && <p className="text-xs text-muted-foreground">ميعاد الزيارة: {new Date(lead.visit_at).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}</p>}
      <p className="text-xs text-muted-foreground">«بيع مؤكد» بيتسجل لوحده لما الإدارة تعتمد الصفقة.</p>
    </div>
  );
}

/** Reservation / contract / sale data with documents; the sale goes to admin review. */
export function DealPanel({ lead, isAdmin, onChanged }: { lead: Lead; isAdmin: boolean; onChanged: () => void }) {
  const q = useQuery({
    queryKey: ["deal", lead.id],
    queryFn: async () => {
      const { data: deal, error } = await dbx.from("deals").select("*").eq("lead_id", lead.id).maybeSingle();
      if (error) throw error;
      const docs = deal ? (await dbx.from("deal_documents").select("*").eq("deal_id", deal.id).order("created_at")).data ?? [] : [];
      return { deal, docs };
    },
  });
  const deal = q.data?.deal ?? null;
  const reload = () => { q.refetch(); onChanged(); };

  async function open() {
    const { error } = await dbx.from("deals").insert({ lead_id: lead.id });
    if (error) toast.error(error.message); else { toast.success("اتفتحت صفقة للعميل"); reload(); }
  }
  if (q.isLoading) return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
  if (!deal) return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">لما العميل يوصل للحجز، افتح صفقة وسجّل فيها بيانات الحجز والعقد والبيع ومستنداتها.</p>
      <button onClick={open} className={btnOutline}>فتح صفقة</button>
    </div>
  );
  return <DealForm deal={deal} docs={q.data?.docs ?? []} isAdmin={isAdmin} reload={reload} />;
}

function DealForm({ deal, docs, isAdmin, reload }: { deal: Deal; docs: Tables<"deal_documents">[]; isAdmin: boolean; reload: () => void }) {
  const locked = deal.review_status === "approved" || (deal.review_status === "pending" && !isAdmin);
  const [f, setF] = useState({
    unit_desc: deal.unit_desc ?? "", reservation_date: deal.reservation_date ?? "", reservation_amount: deal.reservation_amount?.toString() ?? "",
    contract_date: deal.contract_date ?? "", contract_value: deal.contract_value?.toString() ?? "", sale_date: deal.sale_date ?? "", sale_value: deal.sale_value?.toString() ?? "",
  });
  const [kind, setKind] = useState("reservation");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const money = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "") });
  const num = (v: string) => (v === "" ? null : Number(v));
  const payload = () => ({
    unit_desc: f.unit_desc.trim().slice(0, 300) || null, reservation_date: f.reservation_date || null, reservation_amount: num(f.reservation_amount),
    contract_date: f.contract_date || null, contract_value: num(f.contract_value), sale_date: f.sale_date || null, sale_value: num(f.sale_value),
  });

  async function save(extra?: TablesUpdate<"deals">, msg = "تم حفظ بيانات الصفقة") {
    setBusy(true);
    const { error } = await dbx.from("deals").update({ ...payload(), ...extra }).eq("id", deal.id);
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(msg); reload(); return true;
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("حجم الملف أكبر من 10 ميجا"); return; }
    if (!/^(application\/pdf|image\/)/.test(file.type)) { toast.error("ارفع PDF أو صورة"); return; }
    setBusy(true);
    const path = `${deal.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
    const up = await supabase.storage.from("deal-docs").upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(false); toast.error(up.error.message); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await dbx.from("deal_documents").insert({ deal_id: deal.id, kind, file_path: path, file_name: file.name.slice(0, 200), uploaded_by: u.user?.id ?? null });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("اترفع المستند"); reload(); }
  }
  async function view(path: string) {
    const { data, error } = await supabase.storage.from("deal-docs").createSignedUrl(path, 300);
    if (error || !data) { toast.error("تعذّر فتح المستند"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function review(status: "approved" | "rejected" | "needs_info") {
    let note: string | null = null;
    if (status !== "approved") { note = prompt(status === "rejected" ? "سبب الرفض:" : "إيه البيانات أو المستندات الناقصة؟"); if (!note?.trim()) return; }
    const { error } = await dbx.from("deals").update({ review_status: status, review_note: note?.trim().slice(0, 500) ?? null }).eq("id", deal.id);
    if (error) toast.error(error.message); else { toast.success(status === "approved" ? "اتعتمدت الصفقة والبيع اتأكد" : "اتسجلت المراجعة"); reload(); }
  }

  const st = DEAL_STATUS[deal.review_status] ?? DEAL_STATUS["draft"]!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-primary" dir="ltr">{dealNo(deal.deal_no)}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
        {deal.sale_requested_at && <span className="text-xs text-muted-foreground">اتبعت للمراجعة {formatDate(deal.sale_requested_at)}</span>}
      </div>
      {deal.review_note && deal.review_status !== "approved" && <p className="rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">ملاحظة الإدارة: {deal.review_note}</p>}

      <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="الوحدة / العقار"><input className={inputCls} value={f.unit_desc} onChange={set("unit_desc")} maxLength={300} placeholder="مثال: شقة 120م — الحي الأول — عمارة 5" /></Field></div>
        <Field label="تاريخ الحجز"><input type="date" className={inputCls} value={f.reservation_date} onChange={set("reservation_date")} /></Field>
        <Field label="مبلغ الحجز (ج.م)"><input className={inputCls} inputMode="numeric" value={f.reservation_amount} onChange={money("reservation_amount")} /></Field>
        <Field label="تاريخ العقد"><input type="date" className={inputCls} value={f.contract_date} onChange={set("contract_date")} /></Field>
        <Field label="قيمة العقد (ج.م)"><input className={inputCls} inputMode="numeric" value={f.contract_value} onChange={money("contract_value")} /></Field>
        <Field label="تاريخ البيع"><input type="date" className={inputCls} value={f.sale_date} onChange={set("sale_date")} /></Field>
        <Field label="قيمة البيع (ج.م)"><input className={inputCls} inputMode="numeric" value={f.sale_value} onChange={money("sale_value")} /></Field>
      </fieldset>
      {!locked && <button disabled={busy} onClick={() => save()} className={btnOutline}>حفظ البيانات</button>}

      <div className="border-t pt-3">
        <p className="mb-2 text-sm font-bold text-primary">المستندات</p>
        {docs.length === 0 && <p className="text-xs text-muted-foreground">لسه مفيش مستندات.</p>}
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0 text-teal" />
              <button onClick={() => view(d.file_path)} className="truncate font-semibold text-primary underline">{d.file_name}</button>
              <span className="shrink-0 text-xs text-muted-foreground">{DOC_KINDS[d.kind] ?? d.kind} · {formatDate(d.created_at)}</span>
              {["draft", "rejected", "needs_info"].includes(deal.review_status) && (
                <button aria-label="حذف" onClick={async () => { if (!confirm("حذف المستند من الصفقة؟")) return; const { error } = await dbx.from("deal_documents").delete().eq("id", d.id); if (error) toast.error(error.message); else reload(); }} className="ms-auto text-destructive"><Trash2 className="size-4" /></button>
              )}
            </li>
          ))}
        </ul>
        {deal.review_status !== "approved" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select aria-label="نوع المستند" className={`${inputCls} h-10 w-auto`} value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(DOC_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <label className={`${btnOutline} cursor-pointer`}><Upload className="size-4" />رفع مستند (PDF أو صورة)<input type="file" accept="application/pdf,image/*" className="hidden" disabled={busy} onChange={upload} /></label>
          </div>
        )}
      </div>

      {["draft", "rejected", "needs_info"].includes(deal.review_status) && (
        <div className="rounded-xl bg-secondary/60 p-3">
          <p className="text-xs text-muted-foreground">لما البيع يتم: اكتب تاريخ وقيمة البيع، وارفع «مستند البيع»، وابعت الصفقة للإدارة. البيع بيتأكد بعد الاعتماد.</p>
          <button disabled={busy} onClick={() => save({ review_status: "pending" }, "اتبعتت الصفقة لمراجعة الإدارة")} className={`${btnPrimary} mt-2`}>إرسال البيع للمراجعة</button>
        </div>
      )}
      {isAdmin && deal.review_status === "pending" && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-primary/30 p-3">
          <p className="w-full text-sm font-bold text-primary">مراجعة الإدارة{deal.sale_value != null && ` — قيمة البيع ${formatPrice(Number(deal.sale_value))} ج.م`}</p>
          <button onClick={() => review("approved")} className={btnPrimary}><Check className="size-4" />اعتماد البيع</button>
          <button onClick={() => review("needs_info")} className={btnOutline}>محتاجة بيانات</button>
          <button onClick={() => review("rejected")} className={btnOutline}>رفض</button>
        </div>
      )}
    </div>
  );
}

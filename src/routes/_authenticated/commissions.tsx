import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Upload } from "lucide-react";
import { dbx } from "@/lib/dbx";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { dealNo } from "@/components/dash/LeadPipeline";
import { Stat, Tabs, Field, inputCls, btnOutline, btnPrimary } from "@/components/site/ui";
import { formatPrice, leadNo } from "@/components/site/data";
import {
  COMMISSION_STATUS, PAYMENT_METHODS, commissionNo, displayStatus, remaining,
  type AgreementRow, type CommissionRow, type DealRow, type PaymentRow,
} from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/commissions")({
  head: () => ({ meta: [{ title: "العمولات | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: CommissionsPage,
});

type Row = CommissionRow & {
  brokers: { name: string } | null;
  deals: (Pick<DealRow, "deal_no" | "lead_id" | "sale_value" | "sale_date"> & { leads: { name: string; lead_no: number } | null }) | null;
};
const money = (n: number | null | undefined) => (n == null ? "—" : `${formatPrice(Number(n))} ج.م`);
const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("ar-EG", { dateStyle: "medium" }) : "—");

function CommissionsPage() {
  const { me, loading } = useMe();
  const isAdmin = !!me?.isAdmin;
  const seeAll = isAdmin || !!me?.isStaff;
  const isCompanyLead = me?.memberRole === "owner" || me?.memberRole === "manager";
  const allowed = seeAll || isCompanyLead;
  const [tab, setTab] = useState<"list" | "agreements">("list");

  if (loading) return <DashShell title="العمولات"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;
  if (!allowed) return <DashShell title="العمولات"><p className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">الصفحة دي للإدارة ولصاحب الشركة ومديريها.</p></DashShell>;
  return (
    <DashShell title="العمولات" isAdmin={isAdmin}>
      {seeAll && <Tabs<"list" | "agreements"> value={tab} onChange={setTab} tabs={[{ id: "list", label: "العمولات والتحصيل" }, { id: "agreements", label: "اتفاقيات الشركات" }]} />}
      {tab === "list" ? <CommissionsList isAdmin={isAdmin} seeAll={seeAll} /> : <Agreements isAdmin={isAdmin} />}
    </DashShell>
  );
}

function CommissionsList({ isAdmin, seeAll }: { isAdmin: boolean; seeAll: boolean }) {
  const q = useQuery({
    queryKey: ["commissions"],
    queryFn: async () => {
      const { data, error } = await dbx.from("commissions")
        .select("*, brokers(name), deals(deal_no, lead_id, sale_value, sale_date, leads(name, lead_no))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const all = q.data ?? [];
  const companies = useMemo(() => [...new Map(all.filter((c) => c.broker_id).map((c) => [c.broker_id!, c.brokers?.name ?? "—"])).entries()], [all]);
  const rows = all.filter((c) => (!status || displayStatus(c) === status) && (!company || c.broker_id === company));
  const live = rows.filter((c) => c.status !== "cancelled");
  const sum = (f: (c: Row) => number) => live.reduce((s, c) => s + f(c), 0);
  const committed = live.filter((c) => !["expected", "pending_review"].includes(c.status));

  if (q.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (q.error) return <p className="rounded-2xl border bg-card p-6 text-sm text-destructive">تعذّر تحميل العمولات.</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="عمولات متوقعة (لسه)" value={money(sum((c) => (["expected", "pending_review"].includes(c.status) ? Number(c.expected_amount ?? 0) : 0)))} />
        <Stat label="عمولات معتمدة" value={money(committed.reduce((s, c) => s + Number(c.expected_amount ?? 0), 0))} />
        <Stat label="إيرادات محصّلة" value={money(sum((c) => Number(c.paid_amount)))} hint="إيراد فاليو عقار الفعلي" />
        <Stat label="المتبقي للتحصيل" value={money(committed.reduce((s, c) => s + remaining(c), 0))} />
        <Stat label="مستحقة ومتأخرة" value={rows.filter((c) => displayStatus(c) === "due").length} />
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="الحالة" className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>{Object.entries(COMMISSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {seeAll && (
          <select aria-label="الشركة" className={`${inputCls} w-auto`} value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">كل الشركات</option>{companies.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش عمولات {all.length ? "مطابقة" : "لسه"} — العمولة بتتعمل لوحدها مع كل صفقة.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            const st = COMMISSION_STATUS[displayStatus(c)];
            return (
              <div key={c.id} className="rounded-2xl border bg-card">
                <button onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-start">
                  <span className="font-bold text-primary" dir="ltr">{commissionNo(c.commission_no)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                  <span className="text-sm">{c.deals?.leads?.name ?? "—"} · {c.brokers?.name ?? "—"}</span>
                  <span className="ms-auto text-sm font-bold text-primary">{money(c.expected_amount)}</span>
                  <span className="text-xs text-muted-foreground">محصّل {money(c.paid_amount)} · الاستحقاق {day(c.due_date)}</span>
                </button>
                {open === c.id && <CommissionDetail c={c} isAdmin={isAdmin} reload={() => q.refetch()} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommissionDetail({ c, isAdmin, reload }: { c: Row; isAdmin: boolean; reload: () => void }) {
  const pays = useQuery({
    queryKey: ["commission-payments", c.id],
    queryFn: async () => ((await dbx.from("commission_payments").select("*").eq("commission_id", c.id).order("paid_on")).data ?? []) as PaymentRow[],
  });
  const editable = ["expected", "pending_review", "disputed"].includes(c.status);
  const [f, setF] = useState({ basis: c.basis_value?.toString() ?? c.deals?.sale_value?.toString() ?? "", rate: c.rate?.toString() ?? "", fixed: c.fixed_amount?.toString() ?? "", due: c.due_date ?? "" });
  const [pay, setPay] = useState({ amount: "", paid_on: new Date().toISOString().slice(0, 10), method: "transfer", reference: "", notes: "" });
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v === "" ? null : Number(v));

  async function update(patch: TablesUpdate<"commissions">, msg: string) {
    setBusy(true);
    const { error } = await dbx.from("commissions").update(patch).eq("id", c.id);
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(msg); reload(); return true;
  }
  async function saveTerms() {
    if (f.rate && f.fixed) { toast.error("اختار نسبة أو مبلغ ثابت، مش الاتنين"); return; }
    await update({ basis_value: num(f.basis), rate: num(f.rate), fixed_amount: num(f.fixed), due_date: f.due || null }, "اتحفظت بيانات العمولة");
  }
  async function withNote(status: "disputed" | "cancelled", ask: string) {
    const note = prompt(ask); if (!note?.trim()) return;
    await update({ status, status_note: note.trim().slice(0, 500) }, status === "disputed" ? "العمولة اتحوّلت لمتنازع عليها" : "العمولة اتلغت");
  }
  async function recordPayment() {
    const amount = Number(pay.amount);
    if (!amount || amount <= 0) { toast.error("اكتب المبلغ"); return; }
    setBusy(true);
    let proof_path: string | null = null;
    if (proof) {
      if (proof.size > 10 * 1024 * 1024 || !/^(application\/pdf|image\/)/.test(proof.type)) { setBusy(false); toast.error("الإثبات لازم PDF أو صورة أقل من 10 ميجا"); return; }
      proof_path = `${c.id}/${Date.now()}-${proof.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
      const up = await supabase.storage.from("commission-docs").upload(proof_path, proof, { contentType: proof.type });
      if (up.error) { setBusy(false); toast.error(up.error.message); return; }
    }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await dbx.from("commission_payments").insert({
      commission_id: c.id, amount, paid_on: pay.paid_on, method: pay.method, reference: pay.reference.trim() || null, notes: pay.notes.trim() || null, proof_path, recorded_by: u.user?.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("اتسجلت الدفعة"); setPay({ ...pay, amount: "", reference: "", notes: "" }); setProof(null); pays.refetch(); reload();
  }
  async function viewProof(path: string) {
    const { data, error } = await supabase.storage.from("commission-docs").createSignedUrl(path, 300);
    if (error || !data) { toast.error("تعذّر فتح الإثبات"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div className="space-y-4 border-t p-4">
      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <p><span className="text-muted-foreground">الصفقة: </span>{c.deals && <Link to="/leads/$id" params={{ id: c.deals.lead_id }} className="font-bold text-primary underline" dir="ltr">{dealNo(c.deals.deal_no)} · {leadNo(c.deals.leads?.lead_no)}</Link>}</p>
        <p><span className="text-muted-foreground">قيمة البيع: </span><b>{money(c.deals?.sale_value)}</b> · {day(c.deals?.sale_date)}</p>
        <p><span className="text-muted-foreground">أساس الحساب: </span><b>{money(c.basis_value)}</b> · {c.fixed_amount != null ? `مبلغ ثابت ${money(c.fixed_amount)}` : c.rate != null ? `نسبة ${c.rate}%` : "مفيش اتفاقية"}</p>
        <p><span className="text-muted-foreground">المتبقي: </span><b>{money(remaining(c))}</b></p>
        {c.approved_at && <p><span className="text-muted-foreground">اتعتمدت: </span>{day(c.approved_at)}</p>}
        {c.status_note && <p className="text-destructive">ملاحظة: {c.status_note}</p>}
      </div>

      {isAdmin && editable && (
        <div className="space-y-3 rounded-xl bg-secondary/60 p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="أساس الحساب (ج.م)"><input className={inputCls} inputMode="numeric" value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
            <Field label="النسبة %"><input className={inputCls} inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.]/g, ""), fixed: "" })} /></Field>
            <Field label="أو مبلغ ثابت (ج.م)"><input className={inputCls} inputMode="numeric" value={f.fixed} onChange={(e) => setF({ ...f, fixed: e.target.value.replace(/[^\d.]/g, ""), rate: "" })} /></Field>
            <Field label="ميعاد الاستحقاق"><input type="date" className={inputCls} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={saveTerms} className={btnOutline}>حفظ</button>
            {["pending_review", "disputed"].includes(c.status) && <button disabled={busy} onClick={async () => { if (await update({ basis_value: num(f.basis), rate: num(f.rate), fixed_amount: num(f.fixed), due_date: f.due || null }, "اتحفظت")) await update({ status: "approved" }, "العمولة اتعتمدت واتبعت للشركة"); }} className={btnPrimary}>اعتماد العمولة</button>}
            {c.status === "expected" && <p className="text-xs text-muted-foreground">بتتعتمد بعد ما الإدارة تعتمد البيع في الصفقة.</p>}
          </div>
        </div>
      )}
      {isAdmin && !["paid", "cancelled"].includes(c.status) && (
        <div className="flex flex-wrap gap-2">
          {c.status !== "disputed" && <button onClick={() => withNote("disputed", "سبب النزاع:")} className={btnOutline}>متنازع عليها</button>}
          {Number(c.paid_amount) === 0 && <button onClick={() => withNote("cancelled", "سبب الإلغاء:")} className={btnOutline}>إلغاء العمولة</button>}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-bold text-primary">الدفعات</p>
        {pays.data?.length === 0 && <p className="text-xs text-muted-foreground">مفيش دفعات لسه.</p>}
        <ul className="space-y-1 text-sm">
          {pays.data?.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <b>{money(p.amount)}</b><span className="text-muted-foreground">{day(p.paid_on)} · {PAYMENT_METHODS[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
              {p.proof_path && <button onClick={() => viewProof(p.proof_path!)} className="inline-flex items-center gap-1 text-xs font-bold text-primary underline"><FileText className="size-3.5" />الإثبات</button>}
            </li>
          ))}
        </ul>
        {isAdmin && ["approved", "partially_paid", "disputed"].includes(c.status) && (
          <div className="mt-3 grid gap-2 rounded-xl border p-3 sm:grid-cols-3">
            <Field label={`المبلغ (المتبقي ${money(remaining(c))})`}><input className={inputCls} inputMode="numeric" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
            <Field label="تاريخ الدفع"><input type="date" className={inputCls} value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} /></Field>
            <Field label="طريقة الدفع"><select className={inputCls} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="رقم العملية / الشيك"><input className={inputCls} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} maxLength={100} /></Field>
            <Field label="ملاحظات"><input className={inputCls} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} maxLength={300} /></Field>
            <label className={`${btnOutline} mt-auto cursor-pointer`}><Upload className="size-4" />{proof ? proof.name.slice(0, 24) : "إثبات الدفع"}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setProof(e.target.files?.[0] ?? null)} /></label>
            <button disabled={busy} onClick={recordPayment} className={`${btnPrimary} sm:col-span-3`}>تسجيل الدفعة</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Agreements({ isAdmin }: { isAdmin: boolean }) {
  const q = useQuery({
    queryKey: ["agreements"],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        dbx.from("company_agreements").select("*").order("effective_from", { ascending: false }),
        supabase.from("brokers").select("id, name, account_type, is_active").order("name"),
      ]);
      if (a.error) throw a.error;
      return { list: (a.data ?? []) as AgreementRow[], brokers: b.data ?? [] };
    },
  });
  const [f, setF] = useState({ broker_id: "", kind: "rate", value: "", from: new Date().toISOString().slice(0, 10), notes: "" });
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const name = (id: string) => q.data?.brokers.find((b) => b.id === id)?.name ?? "—";
  const active = (a: AgreementRow) => a.effective_from <= today && (!a.effective_to || a.effective_to >= today);

  async function add() {
    const v = Number(f.value);
    if (!f.broker_id || !v) { toast.error("اختار الشركة واكتب النسبة أو المبلغ"); return; }
    if (f.kind === "rate" && v > 100) { toast.error("النسبة لازم تكون من 100 أو أقل"); return; }
    setBusy(true);
    const { error } = await dbx.from("company_agreements").insert({
      broker_id: f.broker_id, rate: f.kind === "rate" ? v : null, fixed_amount: f.kind === "fixed" ? v : null, effective_from: f.from, notes: f.notes.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("اتضافت الاتفاقية"); setF({ ...f, value: "", notes: "" }); q.refetch();
  }
  async function close(a: AgreementRow) {
    const end = prompt("آخر يوم في الاتفاقية (YYYY-MM-DD):", today); if (!end) return;
    const { error } = await dbx.from("company_agreements").update({ effective_to: end }).eq("id", a.id);
    if (error) toast.error(error.message); else { toast.success("اتقفلت الاتفاقية"); q.refetch(); }
  }

  if (q.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">نسبة العمولة حسب اتفاقية كل شركة. شروط الاتفاقية مابتتعدّلش بعد ما تتسجل — لو اتغيّرت، اقفل القديمة وأضف واحدة جديدة، فالعمولات القديمة تفضل بشروطها.</p>
      {isAdmin && (
        <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="الشركة"><select className={inputCls} value={f.broker_id} onChange={(e) => setF({ ...f, broker_id: e.target.value })}><option value="">— اختار —</option>{q.data?.brokers.filter((b) => b.is_active && b.account_type !== "owner").map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="النوع"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="rate">نسبة من قيمة البيع</option><option value="fixed">مبلغ ثابت لكل صفقة</option></select></Field>
          <Field label={f.kind === "rate" ? "النسبة %" : "المبلغ (ج.م)"}><input className={inputCls} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
          <Field label="ساري من"><input type="date" className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="ملاحظات"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} /></Field>
          <button disabled={busy} onClick={add} className={`${btnPrimary} lg:col-span-5`}>إضافة الاتفاقية</button>
        </div>
      )}
      {q.data?.list.length === 0 ? <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش اتفاقيات لسه. من غير اتفاقية، العمولة بتستنى الإدارة تحدد قيمتها.</p> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-primary"><tr>{["الشركة", "العمولة", "ساري من", "لحد", "اتسجلت", "ملاحظات", ""].map((h, i) => <th key={i} className="p-3 text-start font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {q.data?.list.map((a) => (
                <tr key={a.id} className={`border-t ${active(a) ? "" : "text-muted-foreground"}`}>
                  <td className="p-3 font-bold">{name(a.broker_id)} {active(a) && <span className="ms-1 rounded-full bg-teal-soft px-2 text-[10px] font-bold text-primary">سارية</span>}</td>
                  <td className="p-3">{a.rate != null ? `${a.rate}%` : money(a.fixed_amount)}</td>
                  <td className="p-3">{day(a.effective_from)}</td>
                  <td className="p-3">{a.effective_to ? day(a.effective_to) : "مفتوحة"}</td>
                  <td className="p-3">{day(a.approved_at)}</td>
                  <td className="p-3">{a.notes ?? "—"}</td>
                  <td className="p-3">{isAdmin && !a.effective_to && <button onClick={() => close(a)} className="text-xs font-bold text-primary underline">قفل</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

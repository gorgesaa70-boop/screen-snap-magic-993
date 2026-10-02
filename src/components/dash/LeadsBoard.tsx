import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { draftWhatsappReply, analyzeInquiry, type LeadAnalysis } from "@/lib/ai-reply.functions";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, MessageCircle, Search, X, Download, Bell, Sparkles, Copy, History, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Stat, inputCls, btnOutline } from "@/components/site/ui";
import { STAGES, formatPrice, formatDate, waLink, type BrokerRow } from "@/components/site/data";

export type LeadWithProp = {
  id: string;
  name: string;
  phone: string;
  kind: string;
  details: string | null;
  property_type: string | null;
  area: string | null;
  budget: number | null;
  stage: string;
  notes: string | null;
  created_at: string;
  assigned_broker_id: string | null;
  follow_up_at?: string | null;
  properties: { title: string } | null;
};

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const isDue = (l: LeadWithProp, now: number) => !!l.follow_up_at && new Date(l.follow_up_at).getTime() <= now && !["won", "lost"].includes(l.stage);

function exportCsv(rows: LeadWithProp[], brokers?: BrokerRow[]) {
  const esc = (v: unknown) => { const t = v == null ? "" : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ["الاسم", "الهاتف", "النوع", "المرحلة", "العقار", "نوع العقار", "المنطقة", "الميزانية", "التفاصيل", "الملاحظات", "موعد المتابعة", "الوسيط", "تاريخ الطلب"];
  const lines = rows.map((l) => [
    l.name, l.phone, l.kind === "inquiry" ? "استفسار" : "طلب", STAGES[l.stage as keyof typeof STAGES] ?? l.stage,
    l.properties?.title, l.property_type, l.area, l.budget, l.details, l.notes,
    l.follow_up_at ? new Date(l.follow_up_at).toLocaleString("ar-EG") : "",
    brokers?.find((b) => b.id === l.assigned_broker_id)?.name ?? "", new Date(l.created_at).toLocaleString("ar-EG"),
  ].map(esc).join(","));
  const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function AiReply({ l }: { l: LeadWithProp }) {
  const draft = useServerFn(draftWhatsappReply);
  const [inquiry, setInquiry] = useState(l.details ?? "");
  const [prop, setProp] = useState([l.properties?.title, l.property_type, l.area, l.budget ? `السعر/الميزانية: ${formatPrice(Number(l.budget))} ج.م` : null].filter(Boolean).join("\n"));
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (inquiry.trim().length < 3) { toast.error("اكتب نص استفسار العميل"); return; }
    setBusy(true);
    try {
      const r = await draft({ data: { inquiry, property: prop, customerName: l.name } });
      if (r.ok) setReply(r.text); else toast.error(r.error);
    } catch { toast.error("تعذر صياغة الرد حاليًا"); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-secondary/60 p-3">
      <textarea aria-label="نص استفسار العميل" className={`${inputCls} h-auto min-h-20 py-2`} placeholder="نص استفسار العميل" value={inquiry} onChange={(e) => setInquiry(e.target.value)} maxLength={2000} />
      <textarea aria-label="معلومات العقار" className={`${inputCls} h-auto min-h-20 py-2`} placeholder="معلومات العقار (السعر، المساحة، الموقع، المميزات…)" value={prop} onChange={(e) => setProp(e.target.value)} maxLength={2000} />
      <button className={btnOutline} onClick={run} disabled={busy}><Sparkles className="size-4" />{busy ? "جاري الصياغة…" : "صياغة الرد"}</button>
      {reply && (
        <>
          <textarea aria-label="الرد المقترح" className={`${inputCls} h-auto min-h-28 py-2`} value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <a onClick={() => logActivity(l.id, "whatsapp", reply.slice(0, 1000))} href={waLink(l.phone, reply)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-whatsapp px-3 text-sm font-bold text-primary-foreground"><MessageCircle className="size-4" />إرسال عبر واتساب</a>
            <button className={btnOutline} onClick={() => { navigator.clipboard.writeText(reply); toast.success("تم النسخ"); }}><Copy className="size-4" />نسخ</button>
          </div>
        </>
      )}
    </div>
  );
}

const ACT: Record<string, string> = { call: "مكالمة", whatsapp: "واتساب", status: "تغيير المرحلة", note: "ملاحظة", follow_up: "موعد متابعة", assign: "إسناد" };
const stageName = (k: string) => STAGES[k as keyof typeof STAGES] ?? k;
const logActivity = async (lead_id: string, kind: "call" | "whatsapp" | "note", summary: string) => {
  const { data: u } = await supabase.auth.getUser();
  await supabase.from("lead_activities").insert({ lead_id, kind, summary, actor_id: u.user?.id ?? null });
};

function Timeline({ leadId }: { leadId: string }) {
  const q = useQuery({
    queryKey: ["lead_activities", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_activities").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const [note, setNote] = useState("");
  const add = async () => {
    if (!note.trim()) return;
    await logActivity(leadId, "note", note.trim());
    setNote(""); q.refetch();
  };
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-secondary/60 p-3">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="أضف ملاحظة للسجل" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        <button className={btnOutline} onClick={add}>إضافة</button>
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">جاري التحميل…</p> : !q.data?.length ? (
        <p className="text-sm text-muted-foreground">لا يوجد نشاط مسجل بعد.</p>
      ) : (
        <ol className="space-y-2 border-s-2 border-primary/20 ps-3">
          {q.data.map((a) => (
            <li key={a.id} className="text-sm">
              <span className="font-bold text-primary">{ACT[a.kind] ?? a.kind}</span>{" — "}
              <span className="text-foreground/80">{a.kind === "status" ? a.summary.split(" → ").map(stageName).join(" ← ") : a.summary}</span>
              <span className="block text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("ar-EG")}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const INTENT: Record<LeadAnalysis["intent"], string> = { buy: "شراء", rent: "إيجار", sell: "بيع", invest: "استثمار", info: "استعلام", other: "أخرى" };
const URG: Record<LeadAnalysis["urgency"], [string, string]> = { high: ["عاجل", "bg-destructive/10 text-destructive"], medium: ["متوسط", "bg-teal-soft text-primary"], low: ["منخفض", "bg-secondary text-primary"] };

function AiAnalysis({ l, onFollowUp }: { l: LeadWithProp; onFollowUp: (iso: string) => void }) {
  const analyze = useServerFn(analyzeInquiry);
  const [inquiry, setInquiry] = useState(l.details ?? "");
  const [prop, setProp] = useState([l.properties?.title, l.property_type, l.area, l.budget ? `السعر/الميزانية: ${formatPrice(Number(l.budget))} ج.م` : null].filter(Boolean).join("\n"));
  const [res, setRes] = useState<LeadAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (inquiry.trim().length < 3) { toast.error("اكتب نص استفسار العميل"); return; }
    setBusy(true);
    try {
      const r = await analyze({ data: { inquiry, property: prop, customerName: l.name } });
      if (r.ok) setRes(r.analysis); else toast.error(r.error);
    } catch { toast.error("تعذر التحليل حاليًا"); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-secondary/60 p-3">
      <textarea aria-label="نص استفسار العميل" className={`${inputCls} h-auto min-h-20 py-2`} placeholder="نص استفسار العميل" value={inquiry} onChange={(e) => setInquiry(e.target.value)} maxLength={2000} />
      <textarea aria-label="معلومات العقار" className={`${inputCls} h-auto min-h-20 py-2`} placeholder="معلومات العقار" value={prop} onChange={(e) => setProp(e.target.value)} maxLength={2000} />
      <button className={btnOutline} onClick={run} disabled={busy}><Brain className="size-4" />{busy ? "جاري التحليل…" : "تحليل الاستفسار"}</button>
      {res && (
        <div className="space-y-1.5 rounded-xl border bg-card p-3 text-sm">
          <p className="flex flex-wrap gap-2">
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-primary">النية: {INTENT[res.intent]}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${URG[res.urgency][1]}`}>العجلة: {URG[res.urgency][0]}</span>
          </p>
          <p className="text-foreground/80">{res.reason}</p>
          <p><span className="font-bold text-primary">الإجراء التالي: </span>{res.next_action}</p>
          <button className={btnOutline} onClick={() => onFollowUp(new Date(Date.now() + res.follow_up_in_hours * 3600000).toISOString())}>
            تحديد موعد متابعة بعد {res.follow_up_in_hours} ساعة
          </button>
        </div>
      )}
    </div>
  );
}

function LeadCard({ l, onStage, onNotes, onAssign, brokers, onFollowUp, due }: {
  l: LeadWithProp;
  due: boolean;
  onFollowUp: (iso: string | null) => void;
  onStage: (s: string) => void;
  onNotes?: (n: string) => void;
  onAssign?: ((brokerId: string | null) => void) | undefined;
  brokers?: BrokerRow[] | undefined;
}) {
  const [notes, setNotes] = useState(l.notes ?? "");
  const [fu, setFu] = useState(toLocalInput(l.follow_up_at));
  const [ai, setAi] = useState(false);
  const [tl, setTl] = useState(false);
  const [an, setAn] = useState(false);
  return (
    <div className={`rounded-2xl border bg-card p-4 ${due ? "border-destructive ring-1 ring-destructive" : ""}`}>
      {due && <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive"><Bell className="size-3.5" />حان موعد المتابعة</p>}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-primary">
            {l.name}{" "}
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${l.kind === "inquiry" ? "bg-teal-soft text-primary" : "bg-secondary text-primary"}`}>
              {l.kind === "inquiry" ? "استفسار عقار" : "طلب عقار"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(l.created_at)}</p>
        </div>
        <select aria-label="مرحلة المتابعة" value={l.stage} onChange={(e) => onStage(e.target.value)} className={`${inputCls} h-10 w-auto`}>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="mt-2 space-y-1 text-sm text-foreground/80">
        {l.properties?.title && <p>العقار: {l.properties.title}</p>}
        {(l.property_type || l.area || l.budget) && <p>{[l.property_type, l.area, l.budget ? `${formatPrice(Number(l.budget))} ج.م` : null].filter(Boolean).join(" · ")}</p>}
        {l.details && <p className="whitespace-pre-line">{l.details}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a onClick={() => logActivity(l.id, "call", "اتصال بالعميل")} href={`tel:${l.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary" dir="ltr"><Phone className="size-4" />{l.phone}</a>
        <a onClick={() => logActivity(l.id, "whatsapp", "رسالة واتساب")} href={waLink(l.phone, `مرحبًا ${l.name}، معك وسيط فاليو عقار`)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-whatsapp px-3 text-sm font-bold text-primary-foreground"><MessageCircle className="size-4" />واتساب</a>
        {onAssign && brokers && (
          <select aria-label="إسناد لوسيط" className={`${inputCls} h-10 w-auto`} value={l.assigned_broker_id ?? ""} onChange={(e) => onAssign(e.target.value || null)}>
            <option value="">غير مُسند</option>
            {brokers.filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-sm font-bold text-primary" htmlFor={`fu-${l.id}`}>موعد المتابعة</label>
        <input id={`fu-${l.id}`} type="datetime-local" className={`${inputCls} h-10 w-auto`} value={fu} onChange={(e) => setFu(e.target.value)} />
        <button className={btnOutline} onClick={() => onFollowUp(fu ? new Date(fu).toISOString() : null)}>حفظ الموعد</button>
        {l.follow_up_at && <button className={btnOutline} onClick={() => { setFu(""); onFollowUp(null); }}>إلغاء</button>}
        <button className={btnOutline} onClick={() => setAi((v) => !v)} aria-expanded={ai}><Sparkles className="size-4" />رد ذكي</button>
      </div>
        <button className={btnOutline} onClick={() => setAn((v) => !v)} aria-expanded={an}><Brain className="size-4" />تحليل ذكي</button>
        <button className={btnOutline} onClick={() => setTl((v) => !v)} aria-expanded={tl}><History className="size-4" />سجل النشاط</button>
      </div>
      <div>
      {ai && <AiReply l={l} />}
      {an && <AiAnalysis l={l} onFollowUp={(iso) => { setFu(toLocalInput(iso)); onFollowUp(iso); }} />}
      {tl && <Timeline leadId={l.id} />}
      {onNotes && (
        <div className="mt-3 flex gap-2">
          <input className={inputCls} placeholder="ملاحظات المتابعة" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          <button className={btnOutline} onClick={() => onNotes(notes)}>حفظ</button>
        </div>
      )}
    </div>
  );
}

export function LeadsBoard({ list, brokers, reload }: { list: LeadWithProp[]; brokers?: BrokerRow[] | undefined; reload: () => void }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "request" | "inquiry">("all");
  const [stage, setStage] = useState<string>("all");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const dueList = useMemo(() => list.filter((l) => isDue(l, now)), [list, now]);
  const [notified, setNotified] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const fresh = dueList.filter((l) => !notified.has(l.id));
    if (!fresh.length) return;
    fresh.forEach((l) => toast.warning(`تذكير: حان موعد متابعة ${l.name}`, { duration: 10000 }));
    setNotified((p) => new Set([...p, ...fresh.map((l) => l.id)]));
  }, [dueList, notified]);

  const filtered = useMemo(() => {
    const s = search.trim();
    return list.filter((l) =>
      (kind === "all" || l.kind === kind) &&
      (stage === "all" || l.stage === stage) &&
      (!s || l.name.includes(s) || l.phone.includes(s) || (l.details ?? "").includes(s) || (l.properties?.title ?? "").includes(s))
    );
  }, [list, search, kind, stage]);

  const upd = async (id: string, patch: TablesUpdate<"leads">) => {
    const { error } = await supabase.from("leads").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم التحديث"); reload(); }
  };

  const hasFilter = search || kind !== "all" || stage !== "all";
  const open = list.filter((l) => !["won", "lost"].includes(l.stage)).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="كل الطلبات والاستفسارات" value={list.length} />
        <Stat label="طلبات عقار" value={list.filter((l) => l.kind !== "inquiry").length} />
        <Stat label="استفسارات" value={list.filter((l) => l.kind === "inquiry").length} />
        <Stat label="قيد المتابعة" value={open} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 sm:min-w-56">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="بحث بالاسم أو الهاتف" className={`${inputCls} ps-9`} placeholder="بحث بالاسم أو الهاتف أو العقار…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select aria-label="نوع الطلب" className={`${inputCls} sm:w-40`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">الكل</option>
          <option value="request">طلبات عقار</option>
          <option value="inquiry">استفسارات</option>
        </select>
        <select aria-label="المرحلة" className={`${inputCls} sm:w-40`} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="all">كل المراحل</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {hasFilter && (
          <button className={btnOutline} onClick={() => { setSearch(""); setKind("all"); setStage("all"); }}>
            <X className="size-4" />مسح الفلاتر
          </button>
        )}
      </div>

      {dueList.length > 0 && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl border border-destructive bg-destructive/10 p-3 text-sm font-bold text-destructive">
          <Bell className="size-4" />لديك {dueList.length} عميل حان موعد متابعته: {dueList.map((l) => l.name).join("، ")}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-muted-foreground">{filtered.length} نتيجة</p>
        <button className={btnOutline} disabled={!filtered.length} onClick={() => exportCsv(filtered, brokers)}><Download className="size-4" />تصدير CSV</button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {hasFilter ? "لا توجد نتائج مطابقة — جرّب مسح الفلاتر." : "لا توجد طلبات أو استفسارات حاليًا."}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((l) => (
            <LeadCard
              key={l.id}
              l={l}
              onStage={(s) => upd(l.id, { stage: s as NonNullable<TablesUpdate<"leads">["stage"]> })}
              onNotes={(n) => upd(l.id, { notes: n })}
              onAssign={brokers ? (bid) => upd(l.id, { assigned_broker_id: bid }) : undefined}
              brokers={brokers}
              due={isDue(l, now)}
              onFollowUp={(iso) => upd(l.id, { follow_up_at: iso })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

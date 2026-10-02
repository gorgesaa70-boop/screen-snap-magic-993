import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Phone, MessageCircle, Search, X } from "lucide-react";
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
  properties: { title: string } | null;
};

function LeadCard({ l, onStage, onNotes, onAssign, brokers }: {
  l: LeadWithProp;
  onStage: (s: string) => void;
  onNotes?: (n: string) => void;
  onAssign?: ((brokerId: string | null) => void) | undefined;
  brokers?: BrokerRow[] | undefined;
}) {
  const [notes, setNotes] = useState(l.notes ?? "");
  return (
    <div className="rounded-2xl border bg-card p-4">
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
        <a href={`tel:${l.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary" dir="ltr"><Phone className="size-4" />{l.phone}</a>
        <a href={waLink(l.phone, `مرحبًا ${l.name}، معك وسيط فاليو عقار`)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-whatsapp px-3 text-sm font-bold text-primary-foreground"><MessageCircle className="size-4" />واتساب</a>
        {onAssign && brokers && (
          <select aria-label="إسناد لوسيط" className={`${inputCls} h-10 w-auto`} value={l.assigned_broker_id ?? ""} onChange={(e) => onAssign(e.target.value || null)}>
            <option value="">غير مُسند</option>
            {brokers.filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
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

      <p className="text-sm font-bold text-muted-foreground">{filtered.length} نتيجة</p>

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
              onStage={(s) => upd(l.id, { stage: s })}
              onNotes={(n) => upd(l.id, { notes: n })}
              onAssign={brokers ? (bid) => upd(l.id, { assigned_broker_id: bid }) : undefined}
              brokers={brokers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

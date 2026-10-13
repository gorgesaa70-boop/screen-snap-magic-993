import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlarmClock, CalendarCheck } from "lucide-react";
import { STAGES, formatDate, formatPrice, leadNo, stageLabel } from "@/components/site/data";
import type { CompoundUnitRow } from "@/components/site/compounds";
import { inputCls } from "@/components/site/ui";

export type CompoundLead = {
  id: string; lead_no: number; name: string; stage: string; purpose: string | null; property_type: string | null; budget: number | null;
  assigned_broker_id: string | null; assigned_member_id: string | null; assigned_staff_id: string | null; compound_unit_id: string | null;
  follow_up_at: string | null; visit_at: string | null; created_at: string; updated_at: string;
};
export const COMPOUND_LEAD_COLS = "id,lead_no,name,stage,purpose,property_type,budget,assigned_broker_id,assigned_member_id,assigned_staff_id,compound_unit_id,follow_up_at,visit_at,created_at,updated_at";

const FUNNEL = ["new", "contacted", "qualified", "visit_scheduled", "visited", "reserved", "contracted", "sold"];
const CLOSED = ["sold", "lost"];

/** Requests on the compound (those the viewer may see): the pipeline by stage, follow-ups due, and visits coming up. */
export function CompoundLeads({ leads, units, names }: { leads: CompoundLead[]; units: CompoundUnitRow[]; names: (l: CompoundLead) => string }) {
  const [stage, setStage] = useState("");
  const now = Date.now();
  const late = leads.filter((l) => !CLOSED.includes(l.stage) && l.follow_up_at && new Date(l.follow_up_at).getTime() < now);
  const visits = leads.filter((l) => l.visit_at && new Date(l.visit_at).getTime() >= now).sort((a, b) => a.visit_at!.localeCompare(b.visit_at!));
  const shown = leads.filter((l) => !stage || l.stage === stage);
  const unitName = (id: string | null) => { const u = units.find((x) => x.id === id); return u ? `${u.unit_type}${u.code ? ` ${u.code}` : ""}` : null; };

  if (leads.length === 0) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش طلبات على الكمبوند ده. طلبات العملاء من صفحة الكمبوند بتوصل فاليو عقار الأول، وبعدها بتتوزع على فريق الكمبوند.</p>;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FUNNEL.map((s) => {
          const n = leads.filter((l) => l.stage === s).length;
          return (
            <button key={s} onClick={() => setStage(stage === s ? "" : s)} className={`min-w-24 shrink-0 rounded-xl border p-2 text-center transition ${stage === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-teal"}`}>
              <p className="text-lg font-extrabold">{formatPrice(n)}</p><p className="text-[11px] font-bold opacity-80">{STAGES[s]}</p>
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-1.5 font-bold text-destructive"><AlarmClock className="size-4" />متابعات متأخرة ({late.length})</p>
          {late.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">مفيش متابعات متأخرة 👌</p> : (
            <ul className="mt-2 space-y-1 text-sm">{late.slice(0, 6).map((l) => <li key={l.id}><Link to="/leads/$id" params={{ id: l.id }} className="font-bold text-primary hover:text-teal">{l.name}</Link> <span className="text-xs text-muted-foreground">· كان المفروض {formatDate(l.follow_up_at!)} · {names(l)}</span></li>)}</ul>
          )}
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-1.5 font-bold text-primary"><CalendarCheck className="size-4 text-teal" />زيارات جاية ({visits.length})</p>
          {visits.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">مفيش زيارات متحددة.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{visits.slice(0, 6).map((l) => <li key={l.id}><Link to="/leads/$id" params={{ id: l.id }} className="font-bold text-primary hover:text-teal">{l.name}</Link> <span className="text-xs text-muted-foreground">· {formatDate(l.visit_at!)} · {names(l)}</span></li>)}</ul>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-primary">{stage ? STAGES[stage] : "كل الطلبات"} ({shown.length})</p>
        <select aria-label="المرحلة" className={`${inputCls} h-10 w-auto`} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">كل المراحل</option>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-secondary text-primary"><tr>{["الطلب", "العميل", "الوحدة", "المرحلة", "المسؤول", "آخر تحديث"].map((h) => <th key={h} className="p-3 text-start font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-3" dir="ltr"><Link to="/leads/$id" params={{ id: l.id }} className="font-bold text-primary hover:text-teal">{leadNo(l.lead_no)}</Link></td>
                <td className="p-3 font-bold text-primary">{l.name}</td>
                <td className="p-3">{unitName(l.compound_unit_id) ?? l.property_type ?? "—"}</td>
                <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${l.stage === "sold" ? "bg-primary text-primary-foreground" : l.stage === "lost" ? "bg-destructive/10 text-destructive" : "bg-teal-soft text-primary"}`}>{stageLabel(l.stage, l.purpose)}</span></td>
                <td className="p-3 text-xs">{names(l)}</td>
                <td className="p-3 text-xs text-muted-foreground">{formatDate(l.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

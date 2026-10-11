import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, MessageCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dbx } from "@/lib/dbx";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { Timeline, logActivity } from "@/components/dash/LeadsBoard";
import { MEMBER_ROLES } from "@/components/dash/CompanyTeam";
import { Field, inputCls, btnOutline, btnPrimary } from "@/components/site/ui";
import { LEAD_KINDS, LEAD_SOURCES, STAGES, formatDate, formatPrice, leadNo, waLink } from "@/components/site/data";
import { staffDirectory } from "@/lib/admin.functions";
import { DealPanel, PipelineSteps, StageChanger } from "@/components/dash/LeadPipeline";
import { ReferralProof } from "@/components/dash/ReferralProof";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  validateSearch: (s: Record<string, unknown>): { stage?: string } => (typeof s["stage"] === "string" ? { stage: s["stage"] } : {}),
  head: () => ({ meta: [{ title: "تفاصيل العميل | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: LeadPage,
});

type Patch = TablesUpdate<"leads">;
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function LeadPage() {
  const { id } = Route.useParams();
  const { stage: wanted } = Route.useSearch();
  const { me, loading } = useMe();
  const q = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*, properties(title)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const l = q.data;
  const seeAll = !!me?.isAdmin || !!me?.isStaff;
  const canTeam = me?.memberRole === "owner" || me?.memberRole === "manager";
  const companyId = l?.assigned_broker_id ?? null;

  const brokers = useQuery({
    queryKey: ["lead-brokers"], enabled: seeAll,
    queryFn: async () => (await supabase.from("brokers").select("id, name, is_active").order("name")).data ?? [],
  });
  const companyName = useQuery({
    queryKey: ["broker-name", companyId], enabled: !!companyId && !seeAll,
    queryFn: async () => (await supabase.from("brokers").select("name").eq("id", companyId!).maybeSingle()).data?.name ?? null,
  });
  const team = useQuery({
    queryKey: ["lead-team", companyId], enabled: !!companyId && (seeAll || canTeam),
    queryFn: async () => (await dbx.from("company_members").select("id, name, role, is_active").eq("company_id", companyId!).order("name")).data ?? [],
  });
  const listStaff = useServerFn(staffDirectory);
  const staff = useQuery({
    queryKey: ["staff-directory"], enabled: seeAll,
    queryFn: async () => { const r = await listStaff(); return r.ok ? r.staff : []; },
  });
  const dups = useQuery({
    queryKey: ["lead-dups", l?.phone_norm, id], enabled: !!l?.phone_norm,
    queryFn: async () => (await supabase.from("leads").select("id, lead_no, name, stage, created_at").eq("phone_norm", l!.phone_norm!).neq("id", id).order("created_at")).data ?? [],
  });

  const [notes, setNotes] = useState<string | null>(null);
  const [fu, setFu] = useState<string | null>(null);
  const [src, setSrc] = useState<{ source: string; note: string } | null>(null);

  async function upd(patch: Patch, msg = "تم التحديث") {
    const { error } = await supabase.from("leads").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(msg); q.refetch();
  }

  if (loading || q.isLoading) return <DashShell title="تفاصيل العميل"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;
  if (!l) return (
    <DashShell title="تفاصيل العميل" isAdmin={!!me?.isAdmin}>
      <p className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">العميل ده مش موجود أو مش مسموح لك تشوفه. <Link to="/inquiries" className="font-bold text-primary underline">كل الطلبات</Link></p>
    </DashShell>
  );

  const card = "rounded-2xl border bg-card p-4 md:p-5";
  const h2 = "mb-3 font-extrabold text-primary";
  return (
    <DashShell title={`${leadNo(l.lead_no)} · ${l.name}`} isAdmin={!!me?.isAdmin}>
      <Link to="/inquiries" className="mb-3 inline-block text-xs font-bold text-muted-foreground hover:text-primary">→ كل الطلبات</Link>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xl font-extrabold text-primary">{l.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span dir="ltr">{leadNo(l.lead_no)}</span> · {LEAD_KINDS[l.kind] ?? l.kind} · {formatDate(l.created_at)}
                </p>
              </div>
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">{STAGES[l.stage] ?? l.stage}</span>
            </div>
            <div className="mt-3"><PipelineSteps stage={l.stage} /></div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a onClick={() => logActivity(l.id, "call", "اتصال بالعميل")} href={`tel:${l.phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary" dir="ltr"><Phone className="size-4" />{l.phone}</a>
              <a onClick={() => logActivity(l.id, "whatsapp", "رسالة واتساب")} href={waLink(l.phone, `مرحبًا ${l.name}، معك فريق فاليو عقار`)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-whatsapp px-3 text-sm font-bold text-primary-foreground"><MessageCircle className="size-4" />واتساب</a>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {l.properties?.title && <Row k="العقار" v={l.properties.title} />}
              {l.property_type && <Row k="نوع العقار" v={l.property_type} />}
              {l.area && <Row k="المنطقة" v={l.area} />}
              {l.budget != null && <Row k="الميزانية" v={`${formatPrice(Number(l.budget))} ج.م`} />}
              {l.kind === "listing" && <Row k="الغرض" v={l.purpose === "rent" ? "إيجار" : "بيع"} />}
              {l.asking_price != null && <Row k="السعر المطلوب" v={`${formatPrice(Number(l.asking_price))} ج.م`} />}
              {l.size_m2 != null && <Row k="المساحة" v={`${formatPrice(Number(l.size_m2))} م²`} />}
              {l.kind === "listing" && <Row k="الرقم" v={l.phone_verified ? "✓ مؤكَّد بكود واتساب" : "غير مؤكَّد"} />}
            </dl>
            {l.details && <p className="mt-3 whitespace-pre-line rounded-xl bg-secondary/60 p-3 text-sm text-foreground/80">{l.details}</p>}
          </section>

          {(dups.data?.length ?? 0) > 0 && (
            <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
              <p className="flex items-center gap-1.5 font-bold text-destructive"><Users className="size-4" />نفس رقم التليفون موجود في {dups.data!.length} طلب تاني</p>
              <p className="mt-1 text-xs text-muted-foreground">مفيش دمج تلقائي — راجعهم وقرّر.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {dups.data!.map((d) => (
                  <li key={d.id}><Link to="/leads/$id" params={{ id: d.id }} className="font-bold text-primary underline" dir="ltr">{leadNo(d.lead_no)}</Link> · {d.name} · {STAGES[d.stage] ?? d.stage} · {formatDate(d.created_at)}</li>
                ))}
              </ul>
            </section>
          )}

          <section className={card}>
            <h2 className={h2}>مسار العميل</h2>
            <StageChanger lead={l} initial={wanted} isAdmin={!!me?.isAdmin} onChanged={() => q.refetch()} />
          </section>

          <section className={card}>
            <h2 className={h2}>الصفقة (الحجز والعقد والبيع)</h2>
            <DealPanel lead={l} isAdmin={!!me?.isAdmin} onChanged={() => q.refetch()} />
          </section>

          <section className={card}>
            <h2 className={h2}>المتابعة</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-bold text-primary" htmlFor="fu">موعد المتابعة</label>
              <input id="fu" type="datetime-local" className={`${inputCls} h-10 w-auto`} value={fu ?? toLocalInput(l.follow_up_at)} onChange={(e) => setFu(e.target.value)} />
              <button className={btnOutline} onClick={() => { upd({ follow_up_at: fu ? new Date(fu).toISOString() : (fu === "" ? null : l.follow_up_at) }, "تم حفظ الموعد"); setFu(null); }}>حفظ الموعد</button>
            </div>
            <div className="mt-3 flex gap-2">
              <input className={inputCls} placeholder="ملاحظات المتابعة" value={notes ?? l.notes ?? ""} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
              <button className={btnOutline} onClick={() => { if (notes !== null) upd({ notes }, "تم حفظ الملاحظة"); setNotes(null); }}>حفظ</button>
            </div>
          </section>

          <section className={card}>
            <h2 className={h2}>سجل النشاط</h2>
            <Timeline leadId={l.id} />
          </section>
        </div>

        <aside className="space-y-4">
          {seeAll && (
            <section className={card}>
              <h2 className={h2}>إثبات مصدر العميل</h2>
              <ReferralProof lead={l} brokerNames={new Map((brokers.data ?? []).map((b) => [b.id, b.name]))} />
            </section>
          )}
          <section className={card}>
            <h2 className={h2}>المصدر</h2>
            <dl className="space-y-1.5 text-sm">
              <Row k="المصدر الحالي" v={LEAD_SOURCES[l.source] ?? l.source} />
              <Row k="المصدر الأصلي" v={`${LEAD_SOURCES[l.original_source] ?? l.original_source} (ثابت)`} />
              {l.source_note && <Row k="تفاصيل" v={l.source_note} />}
            </dl>
            {me?.isAdmin && (src ? (
              <div className="mt-3 space-y-2 border-t pt-3">
                <select aria-label="المصدر" className={inputCls} value={src.source} onChange={(e) => setSrc({ ...src, source: e.target.value })}>
                  {Object.entries(LEAD_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input className={inputCls} placeholder="سبب التغيير / اسم الحملة أو المُرشِّح" value={src.note} onChange={(e) => setSrc({ ...src, note: e.target.value })} maxLength={200} />
                <div className="flex gap-2">
                  <button className={btnPrimary} onClick={() => { if (!src.note.trim()) { toast.error("اكتب سبب التغيير"); return; } upd({ source: src.source, source_note: src.note.trim() }, "تم تغيير المصدر وتسجيله"); setSrc(null); }}>حفظ</button>
                  <button className={btnOutline} onClick={() => setSrc(null)}>إلغاء</button>
                </div>
              </div>
            ) : <button className={`${btnOutline} mt-3`} onClick={() => setSrc({ source: l.source, note: "" })}>تغيير المصدر</button>)}
          </section>

          <section className={card}>
            <h2 className={h2}>المسؤول</h2>
            {seeAll ? (
              <div className="space-y-3">
                <Field label="الشركة / الوسيط">
                  <select className={inputCls} value={l.assigned_broker_id ?? ""} onChange={(e) => upd({ assigned_broker_id: e.target.value || null }, "تم الإسناد")}>
                    <option value="">غير مُسند</option>
                    {(brokers.data ?? []).filter((b) => b.is_active || b.id === l.assigned_broker_id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
                <Field label="موظف فاليو عقار">
                  <select className={inputCls} value={l.assigned_staff_id ?? ""} onChange={(e) => upd({ assigned_staff_id: e.target.value || null }, "تم الإسناد")}>
                    <option value="">بدون</option>
                    {(staff.data ?? []).map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
                  </select>
                </Field>
              </div>
            ) : (
              <p className="text-sm"><span className="text-muted-foreground">الشركة: </span><span className="font-bold text-primary">{companyName.data ?? "—"}</span></p>
            )}
            {companyId && (seeAll || canTeam) && (
              <div className="mt-3">
                <Field label="عضو الفريق المسؤول">
                  <select className={inputCls} value={l.assigned_member_id ?? ""} onChange={(e) => upd({ assigned_member_id: e.target.value || null }, "تم الإسناد")}>
                    <option value="">كل فريق الشركة (المدير والمالك)</option>
                    {(team.data ?? []).filter((m) => m.is_active || m.id === l.assigned_member_id).map((m) => <option key={m.id} value={m.id}>{m.name} — {MEMBER_ROLES[m.role]?.label ?? m.role}</option>)}
                  </select>
                </Field>
                {team.data?.length === 0 && <p className="mt-1 text-xs text-muted-foreground">الشركة ملهاش فريق مسجّل.</p>}
              </div>
            )}
          </section>
        </aside>
      </div>
    </DashShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2"><dt className="shrink-0 text-muted-foreground">{k}:</dt><dd className="font-semibold text-foreground/90">{v}</dd></div>;
}

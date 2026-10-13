import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, CalendarClock, Wallet, ExternalLink, Pencil, CheckCircle2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { CompoundForm } from "@/components/dash/CompoundForm";
import { CompoundUnits } from "@/components/dash/CompoundUnits";
import { CompoundTeam } from "@/components/dash/CompoundTeam";
import { CompoundLeads, COMPOUND_LEAD_COLS, type CompoundLead } from "@/components/dash/CompoundLeads";
import { CompoundActivity } from "@/components/dash/CompoundActivity";
import { useAssignable } from "@/components/dash/Tasks";
import { Stat, Tabs, btnOutline, btnPrimary } from "@/components/site/ui";
import { formatPrice } from "@/components/site/data";
import { COMPOUND_ROLE_LABEL, UNIT_STATUS, compoundCover, compoundWhere, isReady, type CompoundRole } from "@/components/site/compounds";

export const Route = createFileRoute("/_authenticated/my-compounds/$id")({
  head: () => ({ meta: [{ title: "لوحة الكمبوند | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: CompoundDashboard,
});

type Tab = "overview" | "units" | "team" | "leads" | "activity";

/** Everything about one compound in one place: details, units, team, requests and the change log. */
function CompoundDashboard() {
  const { id } = Route.useParams();
  const { me } = useMe();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const c = useQuery({
    queryKey: ["compound-dash", id],
    queryFn: async () => {
      const [row, role] = await Promise.all([
        supabase.from("compounds").select("*, developer:brokers!compounds_developer_id_fkey(id,name,slug)").eq("id", id).maybeSingle(),
        supabase.rpc("compound_role", { _compound: id }),
      ]);
      if (row.error) throw row.error;
      return { compound: row.data, role: (role.data ?? null) as CompoundRole | null };
    },
  });
  const units = useQuery({
    queryKey: ["compound-dash-units", id], enabled: !!c.data?.role,
    queryFn: async () => fetchAll((a, b) => supabase.from("compound_units").select("*").eq("compound_id", id).order("building").order("floor").order("code").order("id").range(a, b)),
  });
  const leads = useQuery({
    queryKey: ["compound-dash-leads", id], enabled: !!c.data?.role,
    queryFn: async () => (await fetchAll((a, b) => supabase.from("leads").select(COMPOUND_LEAD_COLS).eq("compound_id", id).order("created_at", { ascending: false }).order("id").range(a, b))) as unknown as CompoundLead[],
  });
  const compound = c.data?.compound;
  const role = c.data?.role ?? null;
  // Names for the person following each request (developer's team for owners/managers, Value Aqar staff for admins/staff).
  const team = useQuery({
    queryKey: ["compound-dash-team", compound?.developer_id], enabled: !!compound?.developer_id && (role === "owner" || role === "manager" || role === "admin"),
    queryFn: async () => (await supabase.from("company_members").select("id, name").eq("company_id", compound!.developer_id!)).data ?? [],
  });
  const people = useAssignable();
  const names = (l: CompoundLead) =>
    l.assigned_member_id ? team.data?.find((m) => m.id === l.assigned_member_id)?.name ?? "فريق المطور"
    : l.assigned_staff_id ? people.data?.find((p) => p.user_id === l.assigned_staff_id)?.label ?? "موظف فاليو عقار"
    : l.assigned_broker_id ? (l.assigned_broker_id === compound?.developer_id ? "المطور (لسه ماتوزعش على الفريق)" : "شركة تسويق")
    : "فاليو عقار (لسه ماتوزعش)";

  if (c.isLoading) return <DashShell title="لوحة الكمبوند" isAdmin={!!me?.isAdmin}><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;
  if (!compound || !role) return (
    <DashShell title="لوحة الكمبوند" isAdmin={!!me?.isAdmin}>
      <div className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        <p>الكمبوند ده مش متاح ليك. لو المفروض تكون على فريقه، اطلب من صاحب الحساب يعيّنك عليه.</p>
        <Link to="/dashboard" className={`${btnOutline} mt-4`}>لوحتي</Link>
      </div>
    </DashShell>
  );

  const canEdit = role === "admin" || role === "owner" || role === "manager";
  const canStaff = role === "admin" || (!!compound.developer_id && (role === "owner" || (role === "manager" && me?.memberRole === "manager")));
  const U = units.data ?? [];
  const L = leads.data ?? [];
  const n = (s: string) => U.filter((u) => u.status === s).length;
  const soldValue = U.filter((u) => u.status === "sold" && u.price != null).reduce((a, u) => a + Number(u.price), 0);
  const reservedValue = U.filter((u) => u.status === "reserved" && u.price != null).reduce((a, u) => a + Number(u.price), 0);
  const openLeads = L.filter((l) => !["sold", "lost"].includes(l.stage)).length;
  const dev = (compound as typeof compound & { developer: { name: string; slug: string } | null }).developer;
  const visible = compound.is_active && compound.review_status === "approved";

  if (editing) return (
    <DashShell title={`تعديل ${compound.name}`} isAdmin={!!me?.isAdmin}>
      <CompoundForm initial={compound} developerId={compound.developer_id ?? undefined}
        onCancel={() => setEditing(false)} onDone={() => { setEditing(false); c.refetch(); }} />
    </DashShell>
  );

  return (
    <DashShell title={compound.name} isAdmin={!!me?.isAdmin}>
      <div className="mb-4 flex flex-col gap-4 rounded-2xl border bg-card p-4 md:flex-row">
        <img src={compoundCover(compound)} alt="" className="h-36 w-full rounded-xl object-cover md:h-28 md:w-44" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-bold text-primary">{COMPOUND_ROLE_LABEL[role]}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${visible ? "bg-secondary text-primary" : "bg-destructive/10 text-destructive"}`}>{visible ? "ظاهر على الموقع" : compound.review_status === "rejected" ? "مخفي من الإدارة" : compound.review_status === "pending" ? "قيد المراجعة" : "مخفي"}</span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">{dev ? `المطور: ${dev.name}` : `تديره فاليو عقار${compound.developer_name ? ` لـ ${compound.developer_name}` : ""}`}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {compoundWhere(compound) && <span className="flex items-center gap-1"><MapPin className="size-4 text-teal" />{compoundWhere(compound)}</span>}
            {(compound.delivery_date || isReady(compound)) && <span className="flex items-center gap-1"><CalendarClock className="size-4 text-teal" />{isReady(compound) ? "استلام فوري" : `الاستلام ${compound.delivery_date}`}</span>}
            {compound.down_payment_pct != null && <span className="flex items-center gap-1"><Wallet className="size-4 text-teal" />مقدم {Number(compound.down_payment_pct)}%{compound.installment_years ? ` · ${compound.installment_years} سنين` : ""}</span>}
          </div>
          {compound.review_note && <p className="mt-2 text-xs font-bold text-destructive">ملاحظة الإدارة: {compound.review_note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {canEdit && <button onClick={() => setEditing(true)} className={btnPrimary}><Pencil className="size-4" />تعديل البيانات</button>}
            {visible && <Link to="/compounds/$id" params={{ id: compound.id }} className={btnOutline}><ExternalLink className="size-4" />الصفحة على الموقع</Link>}
          </div>
        </div>
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "overview", label: "نظرة عامة" },
        { id: "units", label: `الوحدات (${U.length})` },
        { id: "team", label: "الفريق" },
        { id: "leads", label: `المتابعة (${openLeads})` },
        { id: "activity", label: "السجل" },
      ]} />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="كل الوحدات" value={formatPrice(U.length)} />
            <Stat label={UNIT_STATUS["available"]!.label} value={formatPrice(n("available"))} />
            <Stat label={UNIT_STATUS["reserved"]!.label} value={formatPrice(n("reserved"))} hint={reservedValue ? `${formatPrice(reservedValue)} ج.م` : undefined} />
            <Stat label={UNIT_STATUS["sold"]!.label} value={formatPrice(n("sold"))} hint={soldValue ? `${formatPrice(soldValue)} ج.م` : undefined} />
            <Stat label="كل الطلبات" value={formatPrice(L.length)} />
            <Stat label="طلبات بتتابع" value={formatPrice(openLeads)} />
            <Stat label="طلبات جديدة" value={formatPrice(L.filter((l) => l.stage === "new").length)} />
            <Stat label="نسبة البيع" value={U.length ? `${Math.round((n("sold") / U.length) * 100)}%` : "—"} />
          </div>
          {U.length > 0 && (
            <div className="rounded-2xl border bg-card p-4">
              <p className="mb-2 font-bold text-primary">حالة الوحدات</p>
              <div className="flex h-4 overflow-hidden rounded-full bg-secondary">
                {(["sold", "reserved", "available", "unavailable"] as const).map((s) => n(s) > 0 && (
                  <div key={s} title={`${UNIT_STATUS[s]!.label}: ${n(s)}`} style={{ width: `${(n(s) / U.length) * 100}%` }}
                    className={s === "sold" ? "bg-primary" : s === "reserved" ? "bg-[#f2b84b]" : s === "available" ? "bg-teal" : "bg-destructive/40"} />
                ))}
              </div>
              <TypeBreakdown units={U} />
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border bg-card p-4">
              <p className="font-bold text-primary">عن الكمبوند</p>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-foreground/80">{compound.description || "لسه مفيش وصف."}</p>
              {compound.amenities.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{compound.amenities.map((a) => <span key={a} className="flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-bold text-primary"><CheckCircle2 className="size-3" />{a}</span>)}</div>}
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="font-bold text-primary">أنظمة التقسيط</p>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-foreground/80">{compound.payment_plans || "لسه مش مكتوبة."}</p>
              {!compound.images.length && canEdit && <p className="mt-3 flex items-center gap-1 text-xs font-bold text-destructive"><Building2 className="size-4" />ضيف صور للكمبوند — الصفحة من غير صور بتجيب طلبات أقل.</p>}
            </div>
          </div>
        </div>
      )}
      {tab === "units" && <CompoundUnits compoundId={compound.id} units={U} canEdit={canEdit} reload={() => units.refetch()} />}
      {tab === "team" && <CompoundTeam compound={compound} canStaff={canStaff} leads={L} />}
      {tab === "leads" && <CompoundLeads leads={L} units={U} names={names} />}
      {tab === "activity" && <CompoundActivity compoundId={compound.id} />}
    </DashShell>
  );
}

function TypeBreakdown({ units }: { units: { unit_type: string; status: string; price: number | null }[] }) {
  const types = [...new Set(units.map((u) => u.unit_type))];
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-xs text-muted-foreground"><tr>{["النوع", "الكل", "متاحة", "محجوزة", "مباعة", "يبدأ من"].map((h) => <th key={h} className="py-1 text-start font-bold">{h}</th>)}</tr></thead>
        <tbody>
          {types.map((t) => {
            const list = units.filter((u) => u.unit_type === t);
            const prices = list.filter((u) => u.status === "available" && u.price != null).map((u) => Number(u.price));
            const c = (s: string) => list.filter((u) => u.status === s).length;
            return (
              <tr key={t} className="border-t">
                <td className="py-1.5 font-bold text-primary">{t}</td><td>{list.length}</td><td>{c("available")}</td><td>{c("reserved")}</td><td>{c("sold")}</td>
                <td>{prices.length ? `${formatPrice(Math.min(...prices))} ج.م` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

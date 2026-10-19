import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { btnPrimary } from "@/components/site/ui";
import { SECTION_GROUPS, TEMPLATES, type Perms } from "@/lib/permissions";

// staff_permissions comes from release 38 (not in the generated types until the database is migrated).
const db = supabase as unknown as SupabaseClient<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const LEVELS: { v: "" | "view" | "edit"; label: string }[] = [
  { v: "", label: "🚫 مخفي" }, { v: "view", label: "👁️ يشوف" }, { v: "edit", label: "✏️ يعدّل" },
];

/** One employee's permissions: hidden / view / edit per section, with ready templates. Admin only (RLS). */
export function StaffPermissions({ userId, name, isBroker = false }: { userId: string; name: string; isBroker?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["staff-perms", userId],
    queryFn: async () => {
      const { data, error } = await db.from("staff_permissions").select("perms").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return ((data?.perms ?? {}) as Perms);
    },
  });
  const [perms, setPerms] = useState<Perms>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setPerms(q.data); }, [q.data]);

  const set = (key: string, v: string) => setPerms((p) => { const n = { ...p }; if (v) n[key] = v; else delete n[key]; return n; });
  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("staff_permissions").upsert({ user_id: userId, perms, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null });
    setBusy(false);
    if (error) { toast.error(/staff_permissions/.test(error.message) ? "محتاجة تحديث قاعدة البيانات (إصدار 38)" : error.message); return; }
    toast.success(`اتحفظت صلاحيات ${name || "الموظف"}. هتشتغل عنده أول ما يفتح الصفحة تاني.`);
    qc.invalidateQueries({ queryKey: ["staff-perms", userId] });
  }

  if (q.isError) return <p className="text-sm text-destructive">الصلاحيات محتاجة تحديث قاعدة البيانات (إصدار 38).</p>;
  const granted = Object.entries(perms).filter(([k, v]) => k !== "leads_scope" && v).length;
  // A broker / company working as an employee: warn before giving them competitors' customers or the routing controls.
  const risky = isBroker ? [
    perms["leads"] && perms["leads_scope"] === "all" ? "«طلبات العملاء: كل العملاء» (هيشوف عملاء الشركات المنافسة)" : "",
    perms["routing"] === "edit" ? "«قواعد التوزيع: يعدّل» (يقدر يوجّه العملاء لنفسه)" : "",
    perms["brokers"] === "edit" ? "«الحسابات والشركات: يعدّل» (يقدر يغيّر حسابات المنافسين)" : "",
  ].filter(Boolean) : [];
  return (
    <div className="mt-3 space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-primary">قالب جاهز:</span>
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" onClick={() => setPerms({ ...t.perms })} className="h-9 rounded-full border px-3 text-xs font-bold text-primary hover:border-teal">{t.label}</button>
        ))}
        <button type="button" onClick={() => setPerms({})} className="h-9 rounded-full border px-3 text-xs font-bold text-destructive">مسح الكل</button>
        <span className="ms-auto text-xs text-muted-foreground">{granted} قسم مفتوح</span>
      </div>
      {isBroker && (
        <p className="rounded-xl border border-teal/40 bg-teal-soft px-3 py-2 text-xs font-bold text-primary">
          ده موظف وفي نفس الوقت وسيط/شركة. الأنسب: «طلبات العملاء: بتوعه بس»، ومن غير «قواعد التوزيع» و«الحسابات والشركات».
        </p>
      )}
      {risky.length > 0 && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">⚠️ انتبه: {risky.join("، ")}.</p>
      )}
      {SECTION_GROUPS.map((g) => (
        <fieldset key={g.label} className="rounded-xl border p-3">
          <legend className="px-1 text-sm font-extrabold text-primary">{g.label}</legend>
          <div className="divide-y">
            {g.sections.map((s) => {
              const cur = perms[s.key] ?? "";
              return (
                <div key={s.key} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-bold text-primary">{s.label}</p>
                    {(s.hint || s.viewOnly) && <p className="text-xs text-muted-foreground">{s.viewOnly ? "الموظف يشوف بس، والتعديل للأدمن دايماً" : s.hint}</p>}
                  </div>
                  <div role="radiogroup" aria-label={s.label} className="flex gap-1">
                    {LEVELS.filter((l) => !(s.viewOnly && l.v === "edit")).map((l) => (
                      <button key={l.v} type="button" role="radio" aria-checked={cur === l.v} onClick={() => set(s.key, l.v)}
                        className={`h-8 rounded-lg border px-2.5 text-xs font-bold transition ${cur === l.v ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-teal"}`}>{l.label}</button>
                    ))}
                  </div>
                  {s.key === "leads" && cur && (
                    <div role="radiogroup" aria-label="أنهي عملاء" className="flex w-full gap-1 ps-1">
                      {([["mine", "اللي متوزعين عليه بس"], ["all", "كل العملاء"]] as const).map(([v, label]) => (
                        <button key={v} type="button" role="radio" aria-checked={(perms["leads_scope"] ?? "mine") === v} onClick={() => set("leads_scope", v)}
                          className={`h-8 rounded-lg border px-2.5 text-xs font-bold transition ${(perms["leads_scope"] ?? "mine") === v ? "border-teal bg-teal-soft text-primary" : "text-muted-foreground hover:border-teal"}`}>{label}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-muted-foreground">«فريق فاليو عقار» (إضافة الموظفين وصلاحياتهم) للأدمن بس، ومش بيتدي لحد.</p>
      <button disabled={busy || q.isLoading} onClick={save} className={btnPrimary}>{busy ? "..." : "حفظ الصلاحيات"}</button>
    </div>
  );
}

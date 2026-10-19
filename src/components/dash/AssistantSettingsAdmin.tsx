import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";

type Floating = "assistant" | "whatsapp" | "both" | "none";
const FLOATING: [Floating, string, string][] = [
  ["assistant", "«فاليو عقار» بس", "زرار واحد، والواتساب جوه الشات (الأنضف)."],
  ["whatsapp", "الواتساب بس", "زرار الواتساب الأخضر زي الأول، من غير المساعد."],
  ["both", "الاتنين", "زرار «فاليو عقار» في ناحية والواتساب في الناحية التانية."],
  ["none", "ولا حاجة", "مافيش زراير عايمة (الواتساب فاضل في الفوتر وصفحات العقارات)."],
];

// assistant_settings comes from release 37 (not in the generated types until the database is migrated).
const db = supabase as unknown as SupabaseClient<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const EXAMPLE = `مثال:
- مواعيد الشغل من 10 الصبح لـ 10 بالليل، والجمعة إجازة.
- مكتبنا في عمارات المستثمرين، برج العرب الجديدة.
- عندنا عرض: أول إعلانين لأصحاب العقارات مجانًا.
- ماتتكلمش عن أسعار السوق العامة أو التمويل البنكي، حوّلها للفريق.
- خليك ودود ومختصر، واستخدم إيموجي قليل.`;

/** لوحة الإدارة ← الإعدادات ← المساعد الذكي: what the AI knows and how it talks (WhatsApp bot + the site's assistant). */
export function AssistantSettingsAdmin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["assistant-settings"],
    queryFn: async () => {
      const { data, error } = await db.from("assistant_settings").select("instructions, welcome, floating").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as { instructions: string; welcome: string; floating: Floating } | null;
    },
  });
  const [instructions, setInstructions] = useState("");
  const [welcome, setWelcome] = useState("");
  const [floating, setFloating] = useState<Floating>("assistant");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setInstructions(q.data.instructions ?? ""); setWelcome(q.data.welcome ?? ""); setFloating(q.data.floating ?? "assistant");
  }, [q.data]);

  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("assistant_settings")
      .update({ instructions: instructions.trim(), welcome: welcome.trim(), floating, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null })
      .eq("id", 1);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("اتحفظت. الموقع والمساعد هيمشوا عليها خلال دقيقة.");
    qc.invalidateQueries({ queryKey: ["assistant-settings"] });
  }

  if (q.isError) return <p className="rounded-2xl border bg-card p-6 text-sm">الصفحة دي محتاجة تحديث قاعدة البيانات (إصدار 37).</p>;
  return (
    <div className="max-w-3xl space-y-4 rounded-2xl border bg-card p-4 md:p-6">
      <p className="text-sm text-muted-foreground">
        اللي هتكتبه هنا بيمشي عليه <b>بوت الواتساب</b> و<b>زرار «فاليو عقار» العايم في الموقع</b>. القواعد الأساسية ثابتة ومش بتتغير من هنا:
        ماينفعش يألّف عقارات أو أسعار، وماينفعش يدي أرقام وسطاء أو ملاك، وبيحوّل للفريق لما يتطلب منه.
      </p>
      <fieldset className="rounded-xl border p-3">
        <legend className="px-1 text-sm font-bold text-primary">الزرار العايم في الموقع</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FLOATING.map(([v, label, hint]) => (
            <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition ${floating === v ? "border-teal bg-teal-soft" : "hover:border-teal/50"}`}>
              <input type="radio" name="floating" className="mt-1 size-4" checked={floating === v} onChange={() => setFloating(v)} />
              <span><span className="block font-bold text-primary">{label}</span><span className="text-xs text-muted-foreground">{hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="رسالة الترحيب (اختياري — لو فاضية بتظهر الرسالة الأساسية)">
        <textarea className={`${inputCls} min-h-20`} maxLength={600} value={welcome} onChange={(e) => setWelcome(e.target.value)}
          placeholder="أهلاً بيك في فاليو عقار 👋 قولّي بتدوّر على إيه وأنا أدوّرلك في العقارات المتاحة." />
      </Field>
      <Field label={`تعليمات المساعد (${instructions.length}/4000)`}>
        <textarea className={`${inputCls} min-h-56`} maxLength={4000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={EXAMPLE} />
      </Field>
      <button disabled={busy || q.isLoading} onClick={save} className={btnPrimary}>{busy ? "..." : "حفظ"}</button>
    </div>
  );
}

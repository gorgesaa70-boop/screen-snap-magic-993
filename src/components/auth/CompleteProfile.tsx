import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { t, useLang } from "@/lib/i18n";

export type ProfileRole = "customer" | "broker";

/**
 * One-time step after sign-in for every account (WhatsApp, Google, Apple, e-mail) until it is filled. Saves the name
 * as auth user_metadata.full_name (the field e-mail sign-up and the admin use) and marks profile_done.
 */
export function CompleteProfile({ askRole, initialName, onDone }: { askRole: boolean; initialName: string; onDone: (role: ProfileRole) => void }) {
  useLang();
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState<ProfileRole>("customer");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const full = name.trim().replace(/\s+/g, " ");
    if (full.length < 2) { toast.error(t("اكتب اسمك")); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: full.slice(0, 100), profile_done: true } });
    setBusy(false);
    if (error) { toast.error(t("حدث خطأ، حاول مرة أخرى")); return; }
    toast.success(t("أهلًا {n} 👋", { n: full.split(" ")[0]! }));
    onDone(askRole ? role : "customer");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">{t("كمّل بياناتك")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("دخلت ✓ فاضل اسمك بس، علشان نعرف نخدمك.")}</p>
      </div>
      <Field label={t("الاسم")}>
        <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
      </Field>
      {askRole && (
        <div>
          <span className="mb-1.5 block text-sm font-bold text-primary">{t("إنت")}</span>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {(["customer", "broker"] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)}
                className={`h-11 rounded-xl border text-sm font-bold transition ${role === r ? "border-teal bg-teal/10 text-primary" : "border-border text-muted-foreground hover:border-teal/50"}`}>
                {r === "customer" ? t("عميل بدوّر على عقار") : t("وسيط أو شركة")}
              </button>
            ))}
          </div>
        </div>
      )}
      <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : t("حفظ ومتابعة")}</button>
    </form>
  );
}

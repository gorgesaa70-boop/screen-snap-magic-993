import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useAuth";
import { t, useLang } from "@/lib/i18n";

export type ReportKind = "property" | "mall" | "compound" | "project" | "industrial" | "investment" | "broker" | "provider";

/** «إبلاغ» under public content (store rules for user content): the reason goes to Value Aqar's team as a bell notification. */
export function ReportButton({ kind, id, title }: { kind: ReportKind; id: string; title: string }) {
  useLang();
  const { user } = useSessionUser();
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  async function report() {
    if (!user) { toast.info(t("سجّل دخولك الأول عشان تبلّغ")); void navigate({ to: "/auth" }); return; }
    const reason = window.prompt(t("إيه المشكلة؟ (مثلًا: بيانات غلط، محتوى مسيء، احتيال)"));
    if (reason === null) return;
    if (!reason.trim()) { toast.error(t("اكتب سبب البلاغ")); return; }
    const { error } = await supabase.rpc("report_content", { _kind: kind, _target: id, _reason: reason, _title: title, _url: window.location.pathname });
    if (error) { toast.error(error.message); return; }
    setSent(true);
    toast.success(t("البلاغ وصل لفاليو عقار، وهنراجعه"));
  }
  return (
    <div className="mx-auto mt-6 max-w-6xl px-4 text-center md:px-6">
      <button type="button" onClick={report} disabled={sent}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-muted-foreground hover:text-destructive disabled:opacity-60">
        <Flag className="size-3.5" />{sent ? t("اتبلّغ عنها") : t("إبلاغ عن محتوى مخالف")}
      </button>
    </div>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inputCls, btnPrimary } from "@/components/site/ui";
import { t, useLang } from "@/lib/i18n";

/** Inquiry from a broker's page: recorded on the platform and routed to that broker (contact details stay private). */
export function BrokerInquiry({ brokerId, brokerName }: { brokerId: string; brokerName: string }) {
  useLang();
  const [f, setF] = useState({ name: "", phone: "", details: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2 || !/^[0-9+\s]{8,20}$/.test(f.phone.trim())) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({ name: f.name.trim(), phone: f.phone.trim(), details: f.details.trim().slice(0, 1000) || null, via_broker_id: brokerId, kind: "inquiry" });
    setBusy(false);
    if (error) { toast.error(t("تعذّر الإرسال")); return; }
    setDone(true);
  }
  if (done) return <p className="rounded-xl bg-teal-soft p-3 text-center text-sm font-bold text-primary">{t("تم إرسال استفسارك ✓ وهيتواصلوا معاك قريب")}</p>;
  return (
    <form onSubmit={submit} className="space-y-2 border-t pt-4">
      <p className="text-sm font-bold text-primary">{t("تواصل مع {name}", { name: brokerName })}</p>
      <input className={inputCls} placeholder={t("الاسم")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} required />
      <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} required />
      <textarea className={`${inputCls} h-20 py-2`} placeholder={t("رسالتك (اختياري)")} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} maxLength={1000} />
      <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? t("جارٍ الإرسال...") : t("إرسال")}</button>
    </form>
  );
}

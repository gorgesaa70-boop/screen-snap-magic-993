import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useAuth";

const CUSTOMER_TYPES = [
  { id: "broker_reply", label: "رد الوسيط عليّ" },
  { id: "request_status", label: "تحديث حالة طلبي" },
  { id: "saved_search_match", label: "عقار جديد مطابق لبحثي" },
];
const BROKER_TYPES = [
  { id: "new_inquiry", label: "استفسار جديد عن عقار" },
  { id: "new_request", label: "طلب عقاري جديد" },
];

/** Per-user WhatsApp delivery preferences. Brokers/admins see broker types, everyone else customer types. */
export function WhatsappPrefs({ isBroker }: { isBroker: boolean }) {
  const { user } = useSessionUser();
  const types = isBroker ? BROKER_TYPES : CUSTOMER_TYPES;
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState("");
  const [sel, setSel] = useState<string[]>(["new_inquiry", "broker_reply"]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!user) return;
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      setEnabled(data.whatsapp_enabled); setPhone(data.whatsapp_phone ?? ""); setSel(data.whatsapp_types);
    });
  }, [user]);
  async function save() {
    if (!user) return;
    let d = phone.replace(/\D/g, "");
    if (/^01\d{9}$/.test(d)) d = "2" + d;
    if (d && !/^\d{8,15}$/.test(d)) { toast.error("رقم واتساب غير صحيح"); return; }
    setSaving(true);
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, whatsapp_enabled: enabled, whatsapp_phone: d || null, whatsapp_types: sel });
    setSaving(false);
    if (error) toast.error("تعذر الحفظ"); else { setPhone(d); toast.success("تم حفظ إعدادات واتساب"); }
  }
  return (
    <div className="mb-5 rounded-2xl border bg-background p-4">
      <label className="flex items-center gap-2 font-bold text-primary">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-teal" />
        <MessageCircle className="size-5 text-teal" /> استلام الإشعارات على واتساب
      </label>
      {enabled && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder={isBroker ? "رقم واتساب (اختياري — يُستخدم رقم ملفك)" : "رقم واتساب مثل 01012345678"} className="h-11 rounded-xl border bg-background px-3 text-sm" />
          <div className="flex flex-wrap gap-3">
            {types.map((t) => (
              <label key={t.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={sel.includes(t.id)} onChange={(e) => setSel(e.target.checked ? [...sel, t.id] : sel.filter((x) => x !== t.id))} />
                {t.label}
              </label>
            ))}
          </div>
        </div>
      )}
      <button onClick={save} disabled={saving} className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">{saving ? "جارٍ الحفظ…" : "حفظ"}</button>
    </div>
  );
}

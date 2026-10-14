import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Handshake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { cleanPhone } from "@/lib/phone";
import { inputCls, btnPrimary, btnOutline } from "@/components/site/ui";

/**
 * «عندي مشتري» on a unit, for brokers only: send a buyer to the unit's seller through Value Aqar. Shown when the seller
 * opened the unit for referrals (owner listings use the admin's share). The seller sees the customer only after accepting.
 */
export function ReferButton({ kind, targetId, share, ownerId, ownerListing = false }: { kind: "property" | "compound" | "project"; targetId: string; share: number | null | undefined; ownerId: string | null | undefined; ownerListing?: boolean }) {
  const { me } = useMe();
  const ownerShare = useQuery({
    queryKey: ["owner-listing-share"], enabled: ownerListing && share == null,
    queryFn: async () => (await supabase.from("app_settings").select("owner_listing_co_broke_share").eq("id", 1).maybeSingle()).data?.owner_listing_co_broke_share ?? null,
  });
  const pct = share ?? (ownerListing ? ownerShare.data : null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const broker = me?.broker;
  if (!broker || !broker.is_active || pct == null || (ownerId && ownerId === broker.id)) return null;
  async function send() {
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error("اكتب اسم العميل ورقم موبايله"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("create_referral", { _kind: kind, _target: targetId, _name: f.name.trim(), _phone: phone, ...(f.note.trim() ? { _note: f.note.trim() } : {}) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setSent(true); setOpen(false);
  }
  return (
    <div className="rounded-2xl border-2 border-dashed border-teal/50 bg-card p-4">
      <p className="flex items-center gap-2 font-extrabold text-primary"><Handshake className="size-5 text-teal" />مفتوحة للوسطاء — نصيبك {pct}%</p>
      <p className="mt-1 text-xs text-muted-foreground">{pct}% من العمولة بعد نسبة فاليو عقار. العميل بيتسجل باسمك 90 يوم بعد القبول.</p>
      {sent ? (
        <p className="mt-3 text-sm font-bold text-teal">الإحالة اتبعتت ✓ — صاحب الوحدة قدامه 24 ساعة يرد. تابعها من <Link to="/dashboard" className="underline">«الإحالات»</Link>.</p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${btnPrimary} mt-3 w-full`}>عندي مشتري</button>
      ) : (
        <div className="mt-3 space-y-2">
          <input aria-label="اسم العميل" className={inputCls} placeholder="اسم العميل" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} />
          <input aria-label="موبايل العميل" className={inputCls} dir="ltr" inputMode="tel" placeholder="موبايل العميل" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} />
          <textarea aria-label="ملاحظة" className={`${inputCls} h-20 py-2`} placeholder="ملاحظة لصاحب الوحدة (اختياري): الميزانية، ميعاد المعاينة..." value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} />
          <p className="text-xs text-muted-foreground">صاحب الوحدة مش هيشوف اسم العميل ولا رقمه غير لما يقبل الإحالة.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={send} className={btnPrimary}>{busy ? "..." : "ابعت الإحالة"}</button>
            <button type="button" onClick={() => setOpen(false)} className={btnOutline}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}

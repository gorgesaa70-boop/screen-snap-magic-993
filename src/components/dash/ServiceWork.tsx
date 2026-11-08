import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { Field, inputCls, btnOutline } from "@/components/site/ui";
import { SERVICE_STAGES, formatDate, formatPrice } from "@/components/site/data";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

type Save = (patch: TablesUpdate<"service_requests">, ok?: string) => void | Promise<void>;

/** The agreed price and the date: written by Value Aqar or by the provider. */
export function ServiceWorkFields({ r, save }: { r: Tables<"service_requests">; save: Save }) {
  const [price, setPrice] = useState(r.agreed_price == null ? "" : String(r.agreed_price));
  const [day, setDay] = useState(r.scheduled_for ?? "");
  const changed = price !== (r.agreed_price == null ? "" : String(r.agreed_price)) || day !== (r.scheduled_for ?? "");
  return (
    <div className="mt-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <Field label="السعر المتفق عليه (ج.م)"><input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "").slice(0, 9))} /></Field>
      <Field label="ميعاد الشغل"><input type="date" className={inputCls} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      <button className={`${btnOutline} col-span-2 sm:col-span-1`} disabled={!changed} onClick={() => save({ agreed_price: price ? Number(price) : null, scheduled_for: day || null })}>حفظ السعر والميعاد</button>
    </div>
  );
}

const describe = (e: Tables<"service_request_events">) => {
  if (e.kind === "stage") return `المرحلة: ${SERVICE_STAGES[e.new_value ?? ""]?.label ?? e.new_value}`;
  if (e.kind === "provider") return `مقدم الخدمة: ${e.new_value}`;
  if (e.kind === "price") return e.new_value ? `السعر: ${formatPrice(Number(e.new_value))} ج.م` : "اتشال السعر";
  return e.new_value ? `الميعاد: ${formatDate(e.new_value)}` : "اتشال الميعاد";
};

/** Who changed what on a request; loads when opened. */
export function ServiceHistory({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["service-history", id], enabled: open,
    queryFn: async () => (await supabase.from("service_request_events").select("*").eq("request_id", id).order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="mt-3 text-xs">
      <button className="font-bold text-primary underline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "إخفاء السجل" : "سجل التغييرات"}</button>
      {open && (
        q.data?.length ? (
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {q.data.map((e) => <li key={e.id}>{new Date(e.created_at).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })} · <b className="text-foreground">{describe(e)}</b> · {e.actor_label}</li>)}
          </ul>
        ) : !q.isLoading && <p className="mt-2 text-muted-foreground">لسه مفيش تغييرات مسجلة.</p>
      )}
    </div>
  );
}

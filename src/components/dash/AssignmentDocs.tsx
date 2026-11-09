import { useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** «صورة العقد» for the review team: opens each private contract file through a short signed link. */
export function AssignmentDocs({ propertyId }: { propertyId: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const { data, error } = await supabase.from("property_assignment_docs").select("path").eq("property_id", propertyId).order("created_at");
    if (error || !data?.length) { setBusy(false); toast.error(error ? error.message : "مفيش صورة عقد مرفوعة"); return; }
    for (const d of data) {
      const { data: s } = await supabase.storage.from("assignment-docs").createSignedUrl(d.path, 300);
      if (s?.signedUrl) window.open(s.signedUrl, "_blank", "noopener");
    }
    setBusy(false);
  }
  return <button type="button" disabled={busy} onClick={() => void open()} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[#e76f51] px-3 text-sm font-bold text-[#e76f51]"><FileText className="size-4" />{busy ? "..." : "صورة العقد"}</button>;
}

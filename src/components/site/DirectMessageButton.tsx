import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { startDirectThread } from "@/lib/messages";

/** «راسل»: opens (or starts) the direct conversation with an account and goes to it in «الرسايل». */
export function DirectMessageButton({ brokerId, className, children }: { brokerId: string; className: string; children?: ReactNode }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const id = await startDirectThread(brokerId);
      void navigate({ to: "/messages", search: { dm: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر فتح المحادثة");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={open} disabled={busy} className={className}>
      {children ?? <><MessageCircle className="size-4" />راسل</>}
    </button>
  );
}

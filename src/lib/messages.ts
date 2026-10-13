import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

/** Messages inside the platform: one conversation per request, between the customer, the company and Value Aqar. */
export type ChatMessage = Tables<"lead_messages">;
export type ChatSide = "customer" | "company" | "platform";

export const MESSAGES_BUCKET = "lead-messages";
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** Uploads a photo or PDF into the conversation's folder; the database checks who may write there. */
export async function uploadAttachment(leadId: string, file: File) {
  const isPdf = file.type === "application/pdf";
  if (!isPdf && !IMAGE_TYPES.includes(file.type)) throw new Error("ينفع صور (JPG / PNG / WEBP) أو ملفات PDF بس");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("الملف أكبر من 5 ميجا");
  const ext = isPdf ? "pdf" : (file.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
  const path = `${leadId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MESSAGES_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return { path, name: file.name.slice(0, 150), type: isPdf ? ("pdf" as const) : ("image" as const) };
}

export async function attachmentUrl(path: string) {
  const { data, error } = await supabase.storage.from(MESSAGES_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/** The signed-in user's unread message count, refreshed live when a message they can see arrives. */
export function useUnreadMessages() {
  const { user } = useSessionUser();
  // Each caller gets its own channel: two channels with the same name would share one subscription and crash.
  const uid = useId();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["unread-messages", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_unread_messages");
      // Before release-21 is applied the function doesn't exist: no badge.
      return error ? 0 : (data ?? 0);
    },
  });
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`messages-unread-${user.id}-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["unread-messages", user.id] });
        qc.invalidateQueries({ queryKey: ["conversations", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc, uid]);
  return { user, unread: q.data ?? 0 };
}

export function useConversations() {
  const { user } = useSessionUser();
  return useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_conversations");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function chatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, FileText, Flag, Lock, LockOpen, Paperclip, Send, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useAuth";
import { attachmentUrl, chatTime, uploadAttachment, type ChatMessage, type ChatSide } from "@/lib/messages";

const SIDE_LABEL: Record<ChatSide, string> = { customer: "العميل", company: "الشركة", platform: "فاليو عقار" };
const OPEN_STAGES = ["reserved", "contracted", "sold"];

function Attachment({ m }: { m: ChatMessage }) {
  const url = useQuery({ queryKey: ["chat-file", m.attachment_path], enabled: !!m.attachment_path, staleTime: 50 * 60_000, queryFn: () => attachmentUrl(m.attachment_path!) });
  if (!m.attachment_path) return null;
  if (m.attachment_type === "image") {
    return url.data
      ? <a href={url.data} target="_blank" rel="noreferrer"><img src={url.data} alt={m.attachment_name ?? "صورة"} className="mt-1 max-h-60 w-auto max-w-full rounded-xl object-cover" loading="lazy" /></a>
      : <div className="mt-1 h-32 w-48 animate-pulse rounded-xl bg-muted" />;
  }
  return (
    <a href={url.data ?? "#"} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2 text-xs font-bold underline-offset-2 hover:underline">
      <FileText className="size-4 shrink-0" /><span className="truncate">{m.attachment_name ?? "ملف PDF"}</span>
    </a>
  );
}

/**
 * The conversation of one request. `closed` and `stage` come from the page that opens it
 * (the lead file for the company and Value Aqar, the inbox for the customer).
 */
export function LeadChat({ leadId, closed = false, stage, className = "" }: { leadId: string; closed?: boolean; stage?: string | null; className?: string }) {
  const { user } = useSessionUser();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [isClosed, setIsClosed] = useState(closed);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  useEffect(() => setIsClosed(closed), [closed]);

  const side = useQuery({
    queryKey: ["chat-side", leadId, user?.id], enabled: !!user,
    queryFn: async () => ((await supabase.rpc("lead_chat_side", { _lead: leadId })).data ?? null) as ChatSide | null,
  });
  const msgs = useQuery({
    queryKey: ["chat", leadId], enabled: !!side.data,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_messages").select("*").eq("lead_id", leadId).order("created_at").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const reads = useQuery({
    queryKey: ["chat-reads", leadId], enabled: !!side.data,
    queryFn: async () => (await supabase.from("lead_message_reads").select("user_id, side, last_read_at").eq("lead_id", leadId)).data ?? [],
  });

  // Live: new messages and read marks of this conversation.
  useEffect(() => {
    if (!side.data) return;
    const ch = supabase
      .channel(`chat-${leadId}-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_messages", filter: `lead_id=eq.${leadId}` },
        () => qc.invalidateQueries({ queryKey: ["chat", leadId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_message_reads", filter: `lead_id=eq.${leadId}` },
        () => qc.invalidateQueries({ queryKey: ["chat-reads", leadId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [leadId, side.data, qc, uid]);

  // Reading the conversation marks it read (and its bell notifications), and scrolls to the newest message.
  const count = msgs.data?.length ?? 0;
  useEffect(() => {
    if (!side.data || !count) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    void supabase.rpc("mark_lead_messages_read", { _lead: leadId }).then(() => {
      qc.invalidateQueries({ queryKey: ["unread-messages"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    });
  }, [count, side.data, leadId, qc]);

  if (!user || side.isLoading) return <div className={`h-64 animate-pulse rounded-2xl bg-muted ${className}`} />;
  if (!side.data) return <p className={`rounded-2xl border bg-card p-4 text-sm text-muted-foreground ${className}`}>الرسايل مش متاحة على الطلب ده.</p>;
  const mySide = side.data;
  const masking = mySide !== "platform" && !OPEN_STAGES.includes(stage ?? "");

  // "Seen" under my last message when someone on another side has read past it.
  const mine = (msgs.data ?? []).filter((m) => m.sender_id === user.id);
  const lastMine = mine[mine.length - 1];
  const seen = !!lastMine && (reads.data ?? []).some((r) => r.side !== mySide && r.last_read_at >= lastMine.created_at);

  async function send() {
    const body = text.trim();
    if (!body && !file) return;
    setBusy(true);
    try {
      const att = file ? await uploadAttachment(leadId, file) : null;
      const { error } = await supabase.rpc("send_lead_message", {
        _lead: leadId, _body: body || "", _attachment_path: att?.path ?? "", _attachment_name: att?.name ?? "", _attachment_type: att?.type ?? "",
      });
      if (error) throw new Error(error.message);
      setText(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["chat", leadId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "الرسالة ماتبعتتش، جرّب تاني");
    } finally {
      setBusy(false);
    }
  }

  async function report(m: ChatMessage) {
    const reason = window.prompt("إيه المشكلة في الرسالة دي؟ (اختياري)");
    if (reason === null) return;
    const { error } = await supabase.rpc("report_lead_message", { _message: m.id, _reason: reason });
    if (error) toast.error(error.message);
    else { toast.success("البلاغ وصل لفاليو عقار"); qc.invalidateQueries({ queryKey: ["chat", leadId] }); }
  }

  async function toggleClosed() {
    const next = !isClosed;
    if (next && !window.confirm("تقفل المحادثة؟ العميل والشركة مش هيقدروا يبعتوا رسايل، بس هيشوفوا اللي فات.")) return;
    const { error } = await supabase.rpc("set_lead_chat_closed", { _lead: leadId, _closed: next });
    if (error) { toast.error(error.message); return; }
    setIsClosed(next);
    toast.success(next ? "المحادثة اتقفلت" : "المحادثة اتفتحت تاني");
  }

  const canWrite = !isClosed || mySide === "platform";
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border bg-card ${className}`}>
      {masking && (
        <p className="flex items-start gap-1.5 border-b bg-teal-soft/60 px-3 py-2 text-[11px] leading-relaxed text-primary">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          لأمانك، أرقام التليفون ولينكات واتساب بتتخفي لحد مرحلة الحجز، والتواصل بيفضل من خلال فاليو عقار.
        </p>
      )}
      {mySide === "platform" && (
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs">
          <span className="text-muted-foreground">انت بتكتب باسم «فاليو عقار»، والأرقام مش بتتخفي.</span>
          <button type="button" onClick={toggleClosed} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 font-bold text-primary hover:bg-secondary">
            {isClosed ? <><LockOpen className="size-3.5" />فتح المحادثة</> : <><Lock className="size-3.5" />قفل المحادثة</>}
          </button>
        </div>
      )}

      <div ref={listRef} className="flex max-h-[60vh] min-h-56 flex-1 flex-col gap-2 overflow-y-auto p-3" aria-live="polite">
        {msgs.isLoading ? <div className="h-20 animate-pulse rounded-xl bg-muted" />
          : count === 0 ? <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">لسه مفيش رسايل. اكتب أول رسالة وهتوصل على طول.</p>
          : msgs.data!.map((m) => {
            const own = m.sender_id === user.id;
            const platform = m.sender_side === "platform";
            return (
              <div key={m.id} className={`flex max-w-[85%] flex-col ${own ? "self-end items-end" : "self-start items-start"}`}>
                {!own && (
                  <span className={`mb-0.5 px-1 text-[11px] font-bold ${platform ? "text-teal" : "text-muted-foreground"}`}>
                    {m.sender_label}{!platform && ` · ${SIDE_LABEL[m.sender_side as ChatSide] ?? ""}`}
                  </span>
                )}
                <div className={`rounded-2xl px-3 py-2 text-sm ${own ? "bg-primary text-primary-foreground" : platform ? "border border-teal/50 bg-teal-soft text-primary" : "bg-secondary text-foreground"}`}>
                  {m.body && <p className="whitespace-pre-line break-words">{m.body}</p>}
                  <Attachment m={m} />
                </div>
                <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
                  {chatTime(m.created_at)}
                  {m.masked && " · اتخبى رقم أو لينك"}
                  {own && m.id === lastMine?.id && seen && <><CheckCheck className="size-3 text-teal" />اتقرت</>}
                  {!own && !m.reported_at && (
                    <button type="button" onClick={() => report(m)} aria-label="إبلاغ عن الرسالة" title="إبلاغ" className="ms-1 rounded p-0.5 hover:text-destructive">
                      <Flag className="size-3" />
                    </button>
                  )}
                  {m.reported_at && " · اتبلّغ عنها"}
                </span>
              </div>
            );
          })}
      </div>

      {canWrite ? (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="border-t p-2">
          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-secondary px-3 py-1.5 text-xs">
              <Paperclip className="size-3.5" /><span className="flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label="شيل الملف"><X className="size-3.5" /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="إرفاق صورة أو PDF" title="صورة أو PDF (لحد 5 ميجا)"
              className="grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-secondary"><Paperclip className="size-5" /></button>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={1} placeholder="اكتب رسالتك…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); void send(); } }}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/30" />
            <button type="submit" disabled={busy || (!text.trim() && !file)} aria-label="إرسال"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-teal text-accent-foreground transition disabled:opacity-50"><Send className="size-5 rtl:-scale-x-100" /></button>
          </div>
        </form>
      ) : (
        <p className="border-t bg-secondary/60 px-3 py-3 text-center text-xs font-bold text-muted-foreground">المحادثة دي اتقفلت من فاليو عقار.</p>
      )}
    </div>
  );
}

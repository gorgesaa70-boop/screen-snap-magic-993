import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Bot, BotOff, Check, CheckCheck, Send, UserRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { inputCls, btnPrimary } from "@/components/site/ui";
import { replyOnWhatsapp, setWhatsappBot } from "@/lib/whatsapp-inbox.functions";
import { OWNER_SILENCE_MS } from "@/lib/wa-owner";

// The inbox tables come from release 36 (not in the generated types until the database is migrated).
const db = supabase as unknown as SupabaseClient<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Conv = {
  phone: string; name: string | null; last_message: string | null; last_inbound_at: string | null; unread: number; bot_paused_until: string | null; handoff_at: string | null; updated_at: string; lead_id: string | null;
  // Release 39: the listing owner the bot handed the chat to.
  owner_broker_id?: string | null; owner_assigned_at?: string | null; owner_replied_at?: string | null; owner?: { name: string } | null;
};
type Msg = { id: string; direction: "in" | "out"; sender: "customer" | "bot" | "staff" | "owner"; body: string; status: string | null; created_at: string };

const time = (d: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(d));
const paused = (c: Conv) => !!c.bot_paused_until && new Date(c.bot_paused_until) > new Date();
const windowOpen = (c: Conv) => !!c.last_inbound_at && Date.now() - new Date(c.last_inbound_at).getTime() < 24 * 3_600_000;
/** With an owner who hasn't answered for half an hour since the hand-over. */
const ownerSilent = (c: Conv) => !!c.owner_broker_id && !c.owner_replied_at && !!c.owner_assigned_at && Date.now() - new Date(c.owner_assigned_at).getTime() > OWNER_SILENCE_MS;

/** Bot on/off and AI on/off (app_settings, admin only). */
function BotSwitches() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["wa-bot-settings"], queryFn: async () => (await db.from("app_settings").select("wa_bot_enabled, wa_bot_ai").eq("id", 1).maybeSingle()).data as { wa_bot_enabled: boolean; wa_bot_ai: boolean } | null });
  async function set(patch: Record<string, boolean>) {
    const { error } = await db.from("app_settings").update(patch).eq("id", 1);
    if (error) { toast.error(/wa_bot/.test(error.message) ? "محتاجة تحديث قاعدة البيانات (إصدار 36)" : error.message); return; }
    qc.invalidateQueries({ queryKey: ["wa-bot-settings"] });
  }
  if (!q.data) return null;
  const pill = (on: boolean) => `h-9 rounded-full border px-4 text-xs font-bold transition ${on ? "border-teal bg-teal-soft text-primary" : "bg-card text-muted-foreground"}`;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-bold text-primary">الرد الآلي:</span>
      <button type="button" className={pill(q.data.wa_bot_enabled)} onClick={() => set({ wa_bot_enabled: !q.data!.wa_bot_enabled })}>{q.data.wa_bot_enabled ? "شغّال" : "متوقف"}</button>
      <span className="ms-2 font-bold text-primary">الذكاء الاصطناعي:</span>
      <button type="button" className={pill(q.data.wa_bot_ai)} onClick={() => set({ wa_bot_ai: !q.data!.wa_bot_ai })}>{q.data.wa_bot_ai ? "شغّال" : "متوقف"}</button>
      <span className="text-xs text-muted-foreground">لما موظف يرد، البوت بيسكت في المحادثة دي 12 ساعة.</span>
    </div>
  );
}

function Thread({ conv, onBack }: { conv: Conv; onBack: () => void }) {
  const qc = useQueryClient();
  const reply = useServerFn(replyOnWhatsapp);
  const toggle = useServerFn(setWhatsappBot);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ["wa-thread", conv.phone], refetchInterval: 8000,
    queryFn: async () => ((await db.from("wa_messages").select("id, direction, sender, body, status, created_at").eq("phone", conv.phone).order("created_at", { ascending: false }).limit(200)).data ?? []).reverse() as Msg[],
  });
  useEffect(() => { void db.rpc("wa_mark_read", { _phone: conv.phone }).then(() => qc.invalidateQueries({ queryKey: ["wa-convs"] })); }, [conv.phone, q.data?.length, qc]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [q.data?.length]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await reply({ data: { phone: conv.phone, body: text.trim() } }).catch(() => ({ ok: false as const, error: "حصلت مشكلة، جرّب تاني." }));
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setText("");
    qc.invalidateQueries({ queryKey: ["wa-thread", conv.phone] });
    qc.invalidateQueries({ queryKey: ["wa-convs"] });
  }
  async function flipBot() {
    await toggle({ data: { phone: conv.phone, paused: !paused(conv) } });
    qc.invalidateQueries({ queryKey: ["wa-convs"] });
  }
  async function takeBack() {
    const { error } = await db.rpc("wa_release_owner", { _phone: conv.phone });
    if (error) { toast.error("ماقدرناش نرجّع المحادثة."); return; }
    toast.success("المحادثة رجعت للفريق.");
    qc.invalidateQueries({ queryKey: ["wa-convs"] });
  }

  const label = { customer: "العميل", bot: "البوت", staff: "الفريق", owner: conv.owner?.name ? `صاحب الإعلان (${conv.owner.name})` : "صاحب الإعلان" } as const;
  return (
    <div className="flex min-h-[28rem] flex-col rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <button type="button" onClick={onBack} className="grid size-9 place-items-center rounded-lg border md:hidden" aria-label="رجوع"><ArrowRight className="size-4" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-primary">{conv.name || "عميل واتساب"}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">+{conv.phone}</p>
        </div>
        {conv.owner_broker_id && (
          <button type="button" onClick={takeBack} className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold text-primary" title={`المحادثة مع ${conv.owner?.name ?? "صاحب الإعلان"}`}>
            رجّعها للفريق
          </button>
        )}
        <button type="button" onClick={flipBot} className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold text-primary">
          {paused(conv) ? <><Bot className="size-4" /> شغّل البوت هنا</> : <><BotOff className="size-4" /> وقّف البوت هنا</>}
        </button>
      </div>
      <div className="max-h-[60vh] flex-1 space-y-2 overflow-y-auto p-3">
        {(q.data ?? []).map((m) => (
          <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.direction === "in" ? "bg-secondary text-primary" : m.sender === "bot" ? "bg-teal-soft text-primary" : "bg-primary text-primary-foreground"}`}>
              <p className="mb-0.5 text-[11px] font-bold opacity-70">{label[m.sender]}</p>
              {m.body}
              <p className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                {time(m.created_at)}
                {m.direction === "out" && (m.status === "read" ? <CheckCheck className="size-3 text-sky-400" /> : m.status === "delivered" ? <CheckCheck className="size-3" /> : m.status === "sent" ? <Check className="size-3" /> : <span className="text-destructive">ماتبعتتش</span>)}
              </p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="border-t p-3">
        {windowOpen(conv) ? (
          <div className="flex gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} placeholder="اكتب ردك…" className={`${inputCls} min-h-11 flex-1 resize-y`}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send(); }} />
            <button type="button" disabled={busy || !text.trim()} onClick={send} className={`${btnPrimary} shrink-0`} aria-label="ابعت"><Send className="size-4" /></button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">عدّى أكتر من 24 ساعة من آخر رسالة من العميل، فواتساب مش بيسمح برسالة عادية. كلّمه تليفون أو استنى لما يبعت تاني.</p>
        )}
      </div>
    </div>
  );
}

/** لوحة الإدارة ← العملاء ← محادثات الواتساب: the API number's chats (customer, bot and team messages). */
export function WhatsappInbox() {
  const [phone, setPhone] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("phone"));
  const q = useQuery({
    queryKey: ["wa-convs"], refetchInterval: 10000,
    queryFn: async () => {
      const withOwner = await db.from("wa_conversations").select("*, owner:brokers!wa_conversations_owner_broker_id_fkey(name)").order("updated_at", { ascending: false }).limit(150);
      if (!withOwner.error) return withOwner.data as Conv[];
      // Before release 39 there's no owner column to join.
      const { data, error } = await db.from("wa_conversations").select("*").order("updated_at", { ascending: false }).limit(150);
      if (error) throw error;
      return data as Conv[];
    },
  });
  if (q.isError) return <p className="rounded-2xl border bg-card p-6 text-sm">صندوق المحادثات محتاج تحديث قاعدة البيانات (إصدار 36).</p>;
  const list = q.data ?? [];
  const current = list.find((c) => c.phone === phone) ?? null;
  return (
    <div>
      <BotSwitches />
      <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
        <div className={`${current ? "hidden md:block" : ""} max-h-[75vh] overflow-y-auto rounded-2xl border bg-card`}>
          {q.isLoading && <div className="m-3 h-20 animate-pulse rounded-xl bg-muted" />}
          {!q.isLoading && !list.length && <p className="p-6 text-center text-sm text-muted-foreground">لسه مافيش محادثات. أول ما عميل يبعت على رقم الواتساب هتظهر هنا.</p>}
          {list.map((c) => (
            <button key={c.phone} type="button" onClick={() => setPhone(c.phone)}
              className={`flex w-full items-start gap-3 border-b p-3 text-start transition hover:bg-secondary ${c.phone === phone ? "bg-secondary" : ""}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-soft text-primary"><UserRound className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold text-primary">{c.name || `+${c.phone}`}</span>
                  {c.unread > 0 && <span className="rounded-full bg-teal px-2 text-[11px] font-bold text-accent-foreground">{c.unread}</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{c.last_message}</span>
                <span className="mt-1 flex flex-wrap gap-1 text-[10px]">
                  <span className="text-muted-foreground">{time(c.updated_at)}</span>
                  {paused(c) && c.handoff_at && c.unread > 0 && <span className="rounded bg-destructive/10 px-1.5 font-bold text-destructive">طلب موظف</span>}
                  {paused(c) && !(c.handoff_at && c.unread > 0) && !c.owner_broker_id && <span className="rounded bg-secondary px-1.5 font-bold text-primary">البوت متوقف</span>}
                  {c.owner_broker_id && <span className="rounded bg-teal-soft px-1.5 font-bold text-primary">مع {c.owner?.name ?? "صاحب الإعلان"}</span>}
                  {ownerSilent(c) && <span className="rounded bg-destructive/10 px-1.5 font-bold text-destructive">مارّدش</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
        {current ? <Thread key={current.phone} conv={current} onBack={() => setPhone(null)} />
          : <div className="hidden place-items-center rounded-2xl border border-dashed bg-card p-10 text-sm text-muted-foreground md:grid">اختار محادثة.</div>}
      </div>
    </div>
  );
}

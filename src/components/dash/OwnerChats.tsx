import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Check, CheckCheck, Lock, Send, UserRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { inputCls, btnPrimary } from "@/components/site/ui";
import { replyAsOwner } from "@/lib/whatsapp-inbox.functions";
import { contactLeak } from "@/lib/wa-owner";

// The owner inbox comes from release 39 (not in the generated types until the database is migrated).
const db = supabase as unknown as SupabaseClient<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type OwnerThread = {
  id: string; name: string | null; phone_tail: string; property_id: string | null; property_code: number | null; property_title: string | null;
  last_message: string; last_at: string; unread: number; is_current: boolean; can_reply: boolean;
};
type Msg = { id: string; direction: "in" | "out"; sender: "customer" | "bot" | "staff" | "owner"; body: string; status: string | null; created_at: string };

const time = (d: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(d));
const who = (t: OwnerThread) => `${t.name || "عميل"} · …${t.phone_tail}`;

export function useOwnerThreads() {
  return useQuery({
    queryKey: ["owner-wa-threads"], refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await db.rpc("wa_owner_threads");
      if (error) throw error;
      return (data ?? []) as OwnerThread[];
    },
  });
}

function Thread({ t, onBack }: { t: OwnerThread; onBack: () => void }) {
  const qc = useQueryClient();
  const reply = useServerFn(replyAsOwner);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ["owner-wa-thread", t.id], refetchInterval: 8000,
    queryFn: async () => (((await db.rpc("wa_owner_messages", { _id: t.id })).data ?? []) as Msg[]).reverse(),
  });
  useEffect(() => { void qc.invalidateQueries({ queryKey: ["owner-wa-threads"] }); }, [q.data?.length, qc]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [q.data?.length]);
  const leak = contactLeak(text);

  async function send() {
    if (!text.trim() || leak) return;
    setBusy(true);
    const r = await reply({ data: { id: t.id, body: text.trim() } }).catch(() => ({ ok: false as const, error: "حصلت مشكلة، جرّب تاني." }));
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setText("");
    qc.invalidateQueries({ queryKey: ["owner-wa-thread", t.id] });
    qc.invalidateQueries({ queryKey: ["owner-wa-threads"] });
  }

  const label = { customer: "العميل", bot: "بوت فاليو عقار", staff: "فريق فاليو عقار", owner: "إنت" } as const;
  return (
    <div className="flex min-h-[28rem] flex-col rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b p-3">
        <button type="button" onClick={onBack} className="grid size-9 place-items-center rounded-lg border md:hidden" aria-label="رجوع"><ArrowRight className="size-4" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-primary">{who(t)}</p>
          {t.property_id && (
            <a href={`/properties/${t.property_id}`} target="_blank" rel="noreferrer" className="block truncate text-xs font-bold text-teal hover:underline">
              {t.property_code != null ? `VA-${t.property_code} · ` : ""}{t.property_title}
            </a>
          )}
        </div>
      </div>
      <div className="max-h-[60vh] flex-1 space-y-2 overflow-y-auto p-3">
        {(q.data ?? []).map((m) => (
          <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.direction === "in" ? "bg-secondary text-primary" : m.sender === "owner" ? "bg-primary text-primary-foreground" : "bg-teal-soft text-primary"}`}>
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
        {t.can_reply ? (
          <>
            <div className="flex gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="اكتب ردك للعميل…" className={`${inputCls} min-h-11 flex-1 resize-y`}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send(); }} />
              <button type="button" disabled={busy || !text.trim() || leak} onClick={send} className={`${btnPrimary} shrink-0`} aria-label="ابعت"><Send className="size-4" /></button>
            </div>
            <p className={`mt-2 flex items-center gap-1 text-xs ${leak ? "font-bold text-destructive" : "text-muted-foreground"}`}>
              <Lock className="size-3" />
              {leak ? "شيل رقم التليفون أو اللينك من الرسالة — التواصل مع العميل بيكون من خلال المنصة." : "ردك بيوصل للعميل من رقم فاليو عقار وعليه اسمك. ماتبعتش أرقام تليفونات."}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t.is_current ? "عدّى أكتر من 24 ساعة من آخر رسالة من العميل، فواتساب مش بيسمح برسالة. أول ما يبعت تاني تقدر ترد." : "المحادثة دي رجعت لفريق فاليو عقار. تقدر تشوف اللي اتقال بس."}
          </p>
        )}
      </div>
    </div>
  );
}

/** لوحة الوسيط ← محادثات الواتساب: chats the bot handed over about this account's listings (no customer numbers). */
export function OwnerChats() {
  const [id, setId] = useState<string | null>(null);
  const q = useOwnerThreads();
  if (q.isError) return <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">محادثات الواتساب هتظهر هنا قريب.</p>;
  const list = q.data ?? [];
  const current = list.find((t) => t.id === id) ?? null;
  return (
    <div>
      <p className="mb-4 rounded-xl bg-teal-soft px-4 py-3 text-sm text-primary">
        لما عميل يسأل على إعلان من إعلاناتك على واتساب فاليو عقار، المحادثة بتتحوّل لك هنا. رد بسرعة — لو مارديتش في نص ساعة فريق فاليو عقار بيتابع.
      </p>
      <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
        <div className={`${current ? "hidden md:block" : ""} max-h-[75vh] overflow-y-auto rounded-2xl border bg-card`}>
          {q.isLoading && <div className="m-3 h-20 animate-pulse rounded-xl bg-muted" />}
          {!q.isLoading && !list.length && <p className="p-6 text-center text-sm text-muted-foreground">لسه مافيش محادثات. أول ما عميل يسأل على إعلان من إعلاناتك هتظهر هنا ويوصلك إشعار.</p>}
          {list.map((t) => (
            <button key={t.id} type="button" onClick={() => setId(t.id)}
              className={`flex w-full items-start gap-3 border-b p-3 text-start transition hover:bg-secondary ${t.id === id ? "bg-secondary" : ""}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-soft text-primary"><UserRound className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold text-primary">{who(t)}</span>
                  {t.unread > 0 && <span className="rounded-full bg-teal px-2 text-[11px] font-bold text-accent-foreground">{t.unread}</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{t.last_message}</span>
                <span className="mt-1 flex flex-wrap gap-1 text-[10px]">
                  <span className="text-muted-foreground">{time(t.last_at)}</span>
                  {t.property_code != null && <span className="rounded bg-secondary px-1.5 font-bold text-primary">VA-{t.property_code}</span>}
                  {!t.is_current && <span className="rounded bg-muted px-1.5 font-bold text-muted-foreground">مع الفريق</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
        {current ? <Thread key={current.id} t={current} onBack={() => setId(null)} />
          : <div className="hidden place-items-center rounded-2xl border border-dashed bg-card p-10 text-sm text-muted-foreground md:grid">اختار محادثة.</div>}
      </div>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Building2, Lock, MessageCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { DirectChat, LeadChat } from "@/components/site/LeadChat";
import { leadNo } from "@/components/site/data";
import { chatTime, startDirectThread, useConversations, useDirectThreads } from "@/lib/messages";

type Search = { lead?: string; dm?: string };

export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["lead"] === "string" ? { lead: s["lead"] } : {}),
    ...(typeof s["dm"] === "string" ? { dm: s["dm"] } : {}),
  }),
  head: () => ({ meta: [{ title: "الرسايل | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: MessagesPage,
});

/** One row of the inbox: a request conversation or a direct one. */
type Row = {
  key: string; search: Search; kind: "lead" | "platform" | "broker";
  name: string; sub: string; body: string; at: string; mine: boolean; unread: number; closed: boolean;
};

/**
 * Inbox: every conversation the signed-in user is part of — requests (customer ↔ company) and direct ones
 * (Value Aqar ↔ account, broker ↔ broker). The open one shows beside the list (alone on phones).
 */
function MessagesPage() {
  const { lead, dm } = Route.useSearch();
  const navigate = useNavigate();
  const { me } = useMe();
  const customer = !!me && !me.broker && !me.isAdmin && !me.isStaff;
  const platform = !!me && (me.isAdmin || me.isStaff);
  // Account holders and managers can write to Value Aqar and to other brokers.
  const canDirect = !!me?.broker && (me.memberRole === "owner" || me.memberRole === "manager") && !platform;
  const leads = useConversations();
  const direct = useDirectThreads();
  const [starting, setStarting] = useState(false);

  const rows: Row[] = [
    ...(leads.data ?? []).map((c): Row => ({
      key: `lead:${c.lead_id}`, search: { lead: c.lead_id }, kind: "lead", name: c.other_label,
      sub: `${c.title} · ${leadNo(c.lead_no)}`, body: c.last_body, at: c.last_at, mine: c.last_side === c.side, unread: c.unread, closed: c.closed,
    })),
    ...(direct.data ?? []).map((d): Row => ({
      key: `dm:${d.thread_id}`, search: { dm: d.thread_id }, kind: d.kind === "broker" ? "broker" : "platform", name: d.other_label,
      sub: d.kind === "broker" ? "رسايل بين الوسطاء" : "رسالة مباشرة", body: d.last_body, at: d.last_at, mine: d.last_mine, unread: d.unread, closed: d.closed,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const openKey = lead ? `lead:${lead}` : dm ? `dm:${dm}` : null;
  const open = rows.find((r) => r.key === openKey);
  const loading = leads.isLoading || direct.isLoading;

  // A direct conversation opened before its first message isn't in the list yet: read its own row.
  const thread = useQuery({
    queryKey: ["direct-thread", dm], enabled: !!dm,
    queryFn: async () => (await supabase.from("direct_threads").select("broker_b, closed_at").eq("id", dm!).maybeSingle()).data,
  });

  async function writeToValueAqar() {
    setStarting(true);
    try {
      const id = await startDirectThread();
      void navigate({ to: "/messages", search: { dm: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر فتح المحادثة");
    } finally {
      setStarting(false);
    }
  }

  return (
    <DashShell title="الرسايل" customer={customer} isAdmin={!!me?.isAdmin}>
      {canDirect && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={writeToValueAqar} disabled={starting}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-bold text-primary hover:border-teal disabled:opacity-60">
            <ShieldCheck className="size-4 text-teal" />راسل فاليو عقار
          </button>
          <span className="text-xs text-muted-foreground">ولمراسلة وسيط تاني: افتح صفحته من «الوسطاء» ودوس «راسل».</span>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className={`min-w-0 ${openKey ? "hidden lg:block" : ""}`} aria-label="المحادثات">
          {loading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" />
            : leads.isError && !rows.length ? <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">الرسايل لسه مش متاحة، جرّب كمان شوية.</p>
            : !rows.length ? (
              <div className="rounded-2xl border border-dashed bg-card p-6 text-center">
                <MessageCircle className="mx-auto size-8 text-teal" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {customer ? "لسه مفيش رسايل. من «طلباتي» تقدر تبعت رسالة على أي طلب، والشركة اللي ماسكاه هترد عليك هنا."
                    : platform ? "لسه مفيش رسايل. تقدر تراسل أي وسيط أو شركة من «الحسابات ← الوسطاء» في لوحة الإدارة، أو من ملف أي عميل."
                    : "لسه مفيش رسايل. أول ما عميل يبعت على طلب عندك هتلاقيه هنا، وتقدر تبدأ انت من ملف العميل، أو تراسل فاليو عقار أو وسيط تاني."}
                </p>
                {customer && <Link to="/my-requests" className="mt-3 inline-block text-sm font-bold text-teal">طلباتي</Link>}
              </div>
            ) : (
              <ul className="overflow-hidden rounded-2xl border bg-card">
                {rows.map((c) => (
                  <li key={c.key} className="border-b last:border-b-0">
                    <Link to="/messages" search={c.search}
                      className={`flex gap-3 px-3 py-3 transition hover:bg-secondary/60 ${c.key === openKey ? "bg-secondary" : ""}`}>
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-soft text-primary">
                        {c.kind === "lead" ? <MessageCircle className="size-5" /> : c.kind === "broker" ? <Building2 className="size-5" /> : <ShieldCheck className="size-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-primary">{c.name}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{chatTime(c.at)}</span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground" dir="auto">{c.sub}</span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={`flex-1 truncate text-xs ${c.unread ? "font-bold text-foreground" : "text-foreground/70"}`}>
                            {c.mine ? "انت: " : ""}{c.body}
                          </span>
                          {c.closed && <Lock className="size-3 text-muted-foreground" aria-label="مقفولة" />}
                          {c.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-teal px-1 text-[10px] font-bold leading-5 text-accent-foreground">{c.unread}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className={`min-w-0 ${openKey ? "" : "hidden lg:block"}`} aria-label="المحادثة">
          {openKey ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Link to="/messages" className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary lg:hidden">
                  <ArrowRight className="size-4 ltr:rotate-180" />كل الرسايل
                </Link>
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-primary">{open ? `${open.name} · ${open.sub}` : dm ? "محادثة جديدة" : ""}</p>
                {lead && !customer && <Link to="/leads/$id" params={{ id: lead }} className="shrink-0 text-xs font-bold text-teal hover:underline">ملف العميل</Link>}
              </div>
              {lead
                ? <LeadChat key={lead} leadId={lead} closed={open?.closed ?? false} stage={(leads.data ?? []).find((c) => c.lead_id === lead)?.stage ?? null} />
                : <DirectChat key={dm} threadId={dm!} closed={open?.closed ?? !!thread.data?.closed_at} brokers={open ? open.kind === "broker" : !!thread.data?.broker_b} />}
            </>
          ) : (
            <div className="grid h-full min-h-64 place-items-center rounded-2xl border border-dashed bg-card p-6 text-sm text-muted-foreground">اختار محادثة من القائمة.</div>
          )}
        </section>
      </div>
    </DashShell>
  );
}

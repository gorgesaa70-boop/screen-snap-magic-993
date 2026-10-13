import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lock, MessageCircle } from "lucide-react";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { LeadChat } from "@/components/site/LeadChat";
import { leadNo } from "@/components/site/data";
import { chatTime, useConversations } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: (s: Record<string, unknown>): { lead?: string } => (typeof s["lead"] === "string" ? { lead: s["lead"] } : {}),
  head: () => ({ meta: [{ title: "الرسايل | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: MessagesPage,
});

/** Inbox: every conversation the signed-in user is part of; the open one shows beside the list (alone on phones). */
function MessagesPage() {
  const { lead } = Route.useSearch();
  const { me } = useMe();
  const customer = !!me && !me.broker && !me.isAdmin && !me.isStaff;
  const q = useConversations();
  const list = q.data ?? [];
  const open = list.find((c) => c.lead_id === lead);

  return (
    <DashShell title="الرسايل" customer={customer} isAdmin={!!me?.isAdmin}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className={`min-w-0 ${lead ? "hidden lg:block" : ""}`} aria-label="المحادثات">
          {q.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" />
            : q.isError ? <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">الرسايل لسه مش متاحة، جرّب كمان شوية.</p>
            : !list.length ? (
              <div className="rounded-2xl border border-dashed bg-card p-6 text-center">
                <MessageCircle className="mx-auto size-8 text-teal" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {customer ? "لسه مفيش رسايل. من «طلباتي» تقدر تبعت رسالة على أي طلب، والشركة اللي ماسكاه هترد عليك هنا."
                    : "لسه مفيش رسايل. أول ما عميل يبعت على طلب عندك هتلاقيه هنا، وتقدر تبدأ انت من ملف العميل."}
                </p>
                {customer && <Link to="/my-requests" className="mt-3 inline-block text-sm font-bold text-teal">طلباتي</Link>}
              </div>
            ) : (
              <ul className="overflow-hidden rounded-2xl border bg-card">
                {list.map((c) => (
                  <li key={c.lead_id} className="border-b last:border-b-0">
                    <Link to="/messages" search={{ lead: c.lead_id }}
                      className={`flex gap-3 px-3 py-3 transition hover:bg-secondary/60 ${c.lead_id === lead ? "bg-secondary" : ""}`}>
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-soft text-primary"><MessageCircle className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold text-primary">{c.other_label}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{chatTime(c.last_at)}</span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{c.title} · <span dir="ltr">{leadNo(c.lead_no)}</span></span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={`flex-1 truncate text-xs ${c.unread ? "font-bold text-foreground" : "text-foreground/70"}`}>
                            {c.last_side === c.side ? "انت: " : ""}{c.last_body}
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

        <section className={`min-w-0 ${lead ? "" : "hidden lg:block"}`} aria-label="المحادثة">
          {lead ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Link to="/messages" className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary lg:hidden">
                  <ArrowRight className="size-4 ltr:rotate-180" />كل الرسايل
                </Link>
                {open && <p className="min-w-0 flex-1 truncate text-sm font-bold text-primary">{open.other_label} · {open.title}</p>}
                {!customer && <Link to="/leads/$id" params={{ id: lead }} className="shrink-0 text-xs font-bold text-teal hover:underline">ملف العميل</Link>}
              </div>
              <LeadChat key={lead} leadId={lead} closed={open?.closed ?? false} stage={open?.stage ?? null} />
            </>
          ) : (
            <div className="grid h-full min-h-64 place-items-center rounded-2xl border border-dashed bg-card p-6 text-sm text-muted-foreground">اختار محادثة من القائمة.</div>
          )}
        </section>
      </div>
    </DashShell>
  );
}

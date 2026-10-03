import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import { DashShell } from "@/components/dash/DashShell";
import { NotificationItem } from "@/components/site/NotificationBell";
import { useNotifications, NOTIF_TYPES } from "@/hooks/useNotifications";
import { useMe } from "@/hooks/useAuth";
import { WhatsappPrefs } from "@/components/site/WhatsappPrefs";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "الإشعارات | فاليو عقار" },
      { name: "description", content: "سجل إشعاراتك في فاليو عقار: الطلبات والاستفسارات وتحديثات العقارات." },
      { property: "og:title", content: "الإشعارات | فاليو عقار" },
      { property: "og:description", content: "سجل إشعاراتك في فاليو عقار." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { me } = useMe();
  const { items, unread, loading, markRead, markAll, remove } = useNotifications(200);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { setOpenId(new URLSearchParams(window.location.search).get("open")); }, []);
  useEffect(() => { const n = items.find((x) => x.id === openId); if (n && !n.is_read) markRead(n.id); }, [openId, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = filter === "unread" ? items.filter((n) => !n.is_read) : items;
  return (
    <DashShell title="الإشعارات" isAdmin={!!me?.isAdmin}>
      <WhatsappPrefs isBroker={!!(me?.isBroker || me?.isAdmin)} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["all", "unread"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === f ? "bg-primary text-primary-foreground" : "bg-background text-foreground/75"}`}>
            {f === "all" ? `الكل (${items.length})` : `غير المقروء (${unread})`}
          </button>
        ))}
        {unread > 0 && <button onClick={markAll} className="ms-auto flex items-center gap-1 rounded-full bg-background px-4 py-2 text-sm font-bold text-teal"><CheckCheck className="size-4" /> تحديد الكل كمقروء</button>}
      </div>
      <div className="overflow-hidden rounded-2xl border bg-background">
        {loading ? <p className="p-8 text-center text-muted-foreground">جارٍ التحميل…</p>
          : list.length === 0 ? <p className="p-8 text-center text-muted-foreground">لا توجد إشعارات</p>
          : <ul>{list.map((n) => (
            <div key={n.id}>
              <NotificationItem n={n} onOpen={() => setOpenId(openId === n.id ? null : n.id)} onRead={() => markRead(n.id)} onDelete={() => remove(n.id)} />
              {openId === n.id && (
                <div className="border-b bg-secondary/40 px-4 py-3 text-sm">
                  <p className="whitespace-pre-wrap text-foreground/85">{n.message || n.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("ar-EG")}</p>
                  {n.related_url?.startsWith("/") && <a href={n.related_url} className="mt-2 inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground">فتح العنصر المرتبط</a>}
                </div>
              )}
            </div>
          ))}</ul>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">الأنواع: {Object.values(NOTIF_TYPES).join("، ")}</p>
    </DashShell>
  );
}

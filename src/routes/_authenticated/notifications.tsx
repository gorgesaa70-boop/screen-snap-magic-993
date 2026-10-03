import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { DashShell } from "@/components/dash/DashShell";
import { NotificationItem, openNotification } from "@/components/site/NotificationBell";
import { useNotifications, NOTIF_TYPES } from "@/hooks/useNotifications";
import { useMe } from "@/hooks/useAuth";

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
  const list = filter === "unread" ? items.filter((n) => !n.is_read) : items;
  return (
    <DashShell title="الإشعارات" isAdmin={me?.isAdmin}>
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
          : <ul>{list.map((n) => <NotificationItem key={n.id} n={n} onOpen={() => openNotification(n, markRead)} onRead={() => markRead(n.id)} onDelete={() => remove(n.id)} />)}</ul>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">الأنواع: {Object.values(NOTIF_TYPES).join("، ")}</p>
    </DashShell>
  );
}

import { useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import { useNotifications, timeAgo, NOTIF_TYPES, type Notification } from "@/hooks/useNotifications";

export function NotificationItem({ n, onOpen, onRead, onDelete }: { n: Notification; onOpen: () => void; onRead: () => void; onDelete: () => void }) {
  return (
    <li className={`flex gap-2 border-b px-3 py-3 last:border-b-0 ${n.is_read ? "" : "bg-secondary/60"}`}>
      <button onClick={onOpen} className="min-w-0 flex-1 text-start">
        <div className="flex items-center gap-2">
          {!n.is_read && <span className="size-2 shrink-0 rounded-full bg-teal" aria-label="غير مقروء" />}
          <span className="truncate text-sm font-bold text-primary">{n.title}</span>
        </div>
        {n.message && <p className="mt-0.5 line-clamp-2 text-xs text-foreground/70">{n.message}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">{NOTIF_TYPES[n.type] ?? n.type} · {timeAgo(n.created_at)}</p>
      </button>
      <div className="flex shrink-0 flex-col gap-1">
        {!n.is_read && <button onClick={onRead} aria-label="تحديد كمقروء" title="تحديد كمقروء" className="grid size-8 place-items-center rounded-full text-primary hover:bg-secondary"><Check className="size-4" /></button>}
        <button onClick={onDelete} aria-label="حذف الإشعار" title="حذف" className="grid size-8 place-items-center rounded-full text-destructive hover:bg-secondary"><Trash2 className="size-4" /></button>
      </div>
    </li>
  );
}

export function openNotification(n: Notification, markRead: (id: string) => void) {
  if (!n.is_read) markRead(n.id);
  window.location.href = `/notifications?open=${n.id}`;
}

export function NotificationBell() {
  const { user, items, unread, markRead, markAll, remove } = useNotifications(10);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label={`الإشعارات${unread ? ` (${unread} غير مقروء)` : ""}`} aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-full text-primary transition-colors hover:bg-secondary">
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute -top-0.5 -end-0.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-5 text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-[60] overflow-hidden rounded-2xl border bg-background shadow-card sm:absolute sm:inset-x-auto sm:end-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="font-extrabold text-primary">الإشعارات</span>
            {unread > 0 && <button onClick={markAll} className="flex items-center gap-1 text-xs font-bold text-teal hover:underline"><CheckCheck className="size-4" /> تحديد الكل كمقروء</button>}
          </div>
          {items.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">لا توجد إشعارات</p> : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.map((n) => <NotificationItem key={n.id} n={n} onOpen={() => openNotification(n, markRead)} onRead={() => markRead(n.id)} onDelete={() => remove(n.id)} />)}
            </ul>
          )}
          <a href="/notifications" className="block border-t py-2.5 text-center text-sm font-bold text-primary hover:bg-secondary">عرض كل الإشعارات</a>
        </div>
      )}
    </div>
  );
}

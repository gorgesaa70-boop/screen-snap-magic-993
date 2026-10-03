import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationItem } from "@/components/site/NotificationBell";

const RANGES = [
  { id: "1", label: "آخر 24 ساعة", ms: 864e5 },
  { id: "7", label: "آخر 7 أيام", ms: 7 * 864e5 },
  { id: "30", label: "آخر 30 يوم", ms: 30 * 864e5 },
  { id: "all", label: "الكل", ms: Infinity },
] as const;

/** Admin team notifications (type = admin) with a time filter. Live via Realtime. */
export function AdminNotifications() {
  const { items, markRead, markAll, remove } = useNotifications(500);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("7");
  const ms = RANGES.find((r) => r.id === range)!.ms;
  const list = items.filter((n) => n.type === "admin" && Date.now() - new Date(n.created_at).getTime() <= ms);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => setRange(r.id)} className={`rounded-full px-4 py-2 text-sm font-bold ${range === r.id ? "bg-primary text-primary-foreground" : "bg-background text-foreground/75"}`}>{r.label}</button>
        ))}
        <span className="text-sm text-muted-foreground">({list.length})</span>
        {list.some((n) => !n.is_read) && <button onClick={markAll} className="ms-auto flex items-center gap-1 rounded-full bg-background px-4 py-2 text-sm font-bold text-teal"><CheckCheck className="size-4" /> تحديد الكل كمقروء</button>}
      </div>
      <div className="overflow-hidden rounded-2xl border bg-background">
        {list.length === 0 ? <p className="p-8 text-center text-muted-foreground">لا توجد إشعارات إدارية في هذه الفترة</p>
          : <ul>{list.map((n) => <NotificationItem key={n.id} n={n} onOpen={() => markRead(n.id)} onRead={() => markRead(n.id)} onDelete={() => remove(n.id)} />)}</ul>}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";

type Step = { done: boolean; title: string; hint: string; action: string; onClick: () => void };

/**
 * Item 31: quick 3-step guide on the account owner's first visits. Each step ticks itself when done;
 * the card disappears when all are done or the owner closes it (remembered on this device).
 */
export function BrokerGuide({ brokerId, steps }: { brokerId: string; steps: Step[] }) {
  const key = `va-guide-${brokerId}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(key) === "1"); } catch { setHidden(false); }
  }, [key]);
  const left = steps.filter((s) => !s.done).length;
  if (hidden || left === 0) return null;
  function close() {
    setHidden(true);
    try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
  }
  return (
    <section className="rounded-2xl border-2 border-teal/40 bg-teal-soft/50 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-extrabold text-primary">ابدأ في 3 خطوات</p>
          <p className="text-sm text-muted-foreground">فاضل {left} من {steps.length} — كل خطوة بتتعلّم لوحدها لما تخلصها.</p>
        </div>
        <button onClick={close} aria-label="إخفاء الدليل" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background"><X className="size-4" /></button>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex flex-wrap items-center gap-3 rounded-xl bg-card p-3 ${s.done ? "opacity-60" : ""}`}>
            {s.done ? <CheckCircle2 className="size-5 shrink-0 text-teal" /> : <Circle className="size-5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <p className={`font-bold text-primary ${s.done ? "line-through" : ""}`}>{i + 1}. {s.title}</p>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </div>
            {!s.done && <button onClick={s.onClick} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-navy-deep">{s.action}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}

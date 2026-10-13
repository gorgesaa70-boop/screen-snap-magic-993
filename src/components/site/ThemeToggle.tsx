import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { t } from "@/lib/i18n";
import { applyTheme, readTheme } from "@/lib/theme";

/** Moon / sun button. Until someone taps it, the site follows the device setting (and changes with it). */
export function ThemeToggle({ className = "grid" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (readTheme() === "system") setDark(applyTheme("system")); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const label = t(dark ? "الوضع الفاتح" : "الوضع الداكن");
  return (
    <button type="button" onClick={() => setDark(applyTheme(dark ? "light" : "dark"))} aria-label={label} title={label}
      className={`size-10 place-items-center rounded-full text-primary transition-colors hover:bg-secondary ${className}`}>
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

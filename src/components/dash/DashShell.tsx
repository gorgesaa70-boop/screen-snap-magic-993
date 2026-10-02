import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Navbar";
import { logAuthEvent } from "@/components/auth/PhoneOtp";

export function DashShell({ title, children, isAdmin }: { title: string; children: ReactNode; isAdmin?: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logAuthEvent("signed_out");
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen bg-secondary/50">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
          <Logo />
          <nav className="flex items-center gap-1 text-sm font-bold">
            <Link to="/dashboard" className="rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>لوحتي</Link>
            {isAdmin && <Link to="/admin" className="rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>الإدارة</Link>}
            <Link to="/account" className="rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>حسابي</Link>
            <button onClick={signOut} aria-label="تسجيل الخروج" className="grid size-10 place-items-center rounded-full text-primary hover:bg-secondary"><LogOut className="size-5" /></button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <h1 className="mb-5 text-2xl font-extrabold text-primary md:text-3xl">{title}</h1>
        {children}
      </main>
    </div>
  );
}

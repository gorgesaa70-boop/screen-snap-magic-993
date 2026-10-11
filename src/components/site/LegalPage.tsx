import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { PageShell } from "./ui";
import { waLink } from "./data";
import { LEGAL_UPDATED, type LegalDoc } from "@/lib/legal-content";
import { useLang } from "@/lib/i18n";

/** Privacy / terms / account-deletion layout, in the visitor's language. The WhatsApp number is not printed. */
export function LegalPage({ doc }: { doc: Record<"ar" | "en", LegalDoc> }) {
  const { lang } = useLang();
  const d = doc[lang];
  const en = lang === "en";
  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-extrabold md:text-4xl">{d.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-primary-foreground/80 md:text-base">{d.intro}</p>
        </div>
      </section>
      <article className="mx-auto max-w-3xl space-y-6 px-4 pt-8 md:px-6">
        {d.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-extrabold text-primary">{s.h}</h2>
            {s.p.length === 1 ? <p className="mt-2 leading-relaxed text-foreground/80">{s.p[0]}</p> : (
              <ul className="mt-2 list-disc space-y-1.5 ps-5 leading-relaxed text-foreground/80">{s.p.map((x) => <li key={x}>{x}</li>)}</ul>
            )}
          </section>
        ))}
        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <a href={waLink(null, en ? "Hello Value Aqar" : "أهلاً فاليو عقار")} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-whatsapp px-5 text-sm font-bold text-primary-foreground hover:brightness-95">
            <MessageCircle className="size-4" />{en ? "Message us on WhatsApp" : "راسلنا على واتساب"}
          </a>
          <p className="text-xs text-muted-foreground">{en ? "Last updated:" : "آخر تحديث:"} {LEGAL_UPDATED}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          <Link to="/privacy" className="font-bold text-primary hover:text-teal">{en ? "Privacy policy" : "سياسة الخصوصية"}</Link>{" · "}
          <Link to="/terms" className="font-bold text-primary hover:text-teal">{en ? "Terms of use" : "شروط الاستخدام"}</Link>{" · "}
          <Link to="/delete-account" className="font-bold text-primary hover:text-teal">{en ? "Delete your account" : "مسح الحساب"}</Link>
        </p>
      </article>
    </PageShell>
  );
}

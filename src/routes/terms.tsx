import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { TERMS } from "@/lib/legal-content";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () => pageHead({ path: "/terms", title: "شروط الاستخدام | فاليو عقار", description: "الشروط اللي بتنظم استخدام منصة فاليو عقار للعملاء والوسطاء والشركات." }),
  component: () => <LegalPage doc={TERMS} />,
});

import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { PRIVACY } from "@/lib/legal-content";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => pageHead({ path: "/privacy", title: "سياسة الخصوصية | فاليو عقار", description: "إزاي فاليو عقار بتجمع بياناتك وبتستخدمها وبتحميها، وحقوقك ومسح الحساب." }),
  component: () => <LegalPage doc={PRIVACY} />,
});

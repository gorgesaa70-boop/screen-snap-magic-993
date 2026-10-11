import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { DELETION } from "@/lib/legal-content";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/delete-account")({
  head: () => pageHead({ path: "/delete-account", title: "مسح الحساب | فاليو عقار", description: "إزاي تمسح حسابك على فاليو عقار وبياناتك الشخصية، من التطبيق أو بطلب." }),
  component: () => <LegalPage doc={DELETION} />,
});

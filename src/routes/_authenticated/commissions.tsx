import { createFileRoute, redirect } from "@tanstack/react-router";

// Old links keep working: commissions now live in the deals page.
export const Route = createFileRoute("/_authenticated/commissions")({
  beforeLoad: () => { throw redirect({ to: "/deals", search: { tab: "commissions" } }); },
});

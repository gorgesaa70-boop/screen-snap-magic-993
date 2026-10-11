import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

// jsdom never loads stylesheets, and React 19 holds the first paint until the <head> stylesheets load,
// so the head tags are left out here (they are covered by the build, not by this smoke test).
vi.mock("@tanstack/react-router", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-router")>()), HeadContent: () => null }));

function renderAt(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Assert only that the router mounts and paints, never page content:
// routes are rewritten as the app is built and this must keep passing.
// The root shell renders <html>/<body>, which React 19 hoists onto the document itself, so the page
// lands in document.body rather than inside the testing-library container.
const painted = () => expect(document.body.querySelector("main, h1, [href]")).not.toBeNull();
describe("App routing", () => {
  it("renders the index route", async () => {
    renderAt("/");

    await waitFor(painted);
  });

  it("renders the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderAt("/this-route-does-not-exist");

    await waitFor(painted);
  });
});

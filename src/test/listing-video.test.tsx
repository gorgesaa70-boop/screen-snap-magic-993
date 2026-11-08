import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListingVideo } from "@/components/site/ListingVideo";

describe("ListingVideo", () => {
  it("loads the player only after a tap", () => {
    const { container } = render(<ListingVideo url="https://www.tiktok.com/@valueaqar/video/7301234567890123456" poster="/p.jpg" title="شقة" />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe("https://www.tiktok.com/embed/v2/7301234567890123456");
  });
  it("opens a short link on the platform", () => {
    const { container } = render(<ListingVideo url="https://fb.watch/abc123/" poster="/p.jpg" title="شقة" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelectorAll('a[href="https://fb.watch/abc123/"]').length).toBe(2);
  });
  it("shows nothing for a link it can't read", () => {
    const { container } = render(<ListingVideo url="https://evil.com/x" poster="/p.jpg" title="شقة" />);
    expect(container.innerHTML).toBe("");
  });
});

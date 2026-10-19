import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UnitsImport } from "@/components/dash/UnitsImport";

afterEach(cleanup);

describe("UnitsImport", () => {
  it("offers the compound template inside the compound form (nothing saved here)", () => {
    render(<UnitsImport existingCodes={[]} onReady={vi.fn()} />);
    expect(screen.getByText("تنزيل نموذج وحدات الكمبوند")).toBeTruthy();
    expect(screen.getByText(/العمارة بتجمّع الوحدات/)).toBeTruthy();
    expect(screen.queryByText(/استيراد/)).toBeNull();
  });

  it("keeps the project template for project units", () => {
    render(<UnitsImport projectId="p1" existingCodes={[]} onDone={vi.fn()} />);
    expect(screen.getByText("تنزيل نموذج الأعمدة")).toBeTruthy();
    expect(screen.queryByText(/العمارة/)).toBeNull();
  });
});

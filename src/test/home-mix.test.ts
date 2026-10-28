import { describe, it, expect } from "vitest";
import type { Property } from "@/components/site/data";
import { bucketOf, mixByKind } from "@/components/site/mix";

const p = (id: string, type: string, kind?: Property["kind"]) => ({ id, type, kind }) as Property;

describe("home list mix", () => {
  it("sorts listings into kinds", () => {
    expect(bucketOf(p("1", "أرض"))).toBe("land");
    expect(bucketOf(p("2", "شقة سكنية"))).toBe("apartment");
    expect(bucketOf(p("3", "فيلا"))).toBe("house");
    expect(bucketOf(p("4", "محل"))).toBe("commercial");
    expect(bucketOf(p("5", "محل تجاري", "mall"))).toBe("mall");
    expect(bucketOf(p("6", "شقة", "compound"))).toBe("compound");
  });
  it("a batch of lands doesn't fill the first screen", () => {
    const list = [p("l1", "أرض"), p("l2", "أرض"), p("l3", "أرض"), p("a1", "شقة"), p("m1", "محل", "mall"), p("h1", "بيت"), p("a2", "شقة")];
    expect(mixByKind(list).map((x) => x.id)).toEqual(["a1", "l1", "h1", "m1", "a2", "l2", "l3"]);
  });
  it("keeps everything and the order inside each kind", () => {
    const list = [p("l1", "أرض"), p("l2", "أرض")];
    expect(mixByKind(list).map((x) => x.id)).toEqual(["l1", "l2"]);
    expect(mixByKind([])).toEqual([]);
  });
});

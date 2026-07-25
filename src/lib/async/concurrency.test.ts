import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency (PC-355)", () => {
  it("preserves input order regardless of completion order", async () => {
    const delays = [30, 5, 20, 1];
    const results = await mapWithConcurrency(delays, 3, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return index;
    });

    expect(results).toEqual([0, 1, 2, 3]);
  });

  it("never exceeds the requested number of in-flight tasks", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
    });

    expect(peak).toBe(4);
  });

  it("runs strictly sequentially when the limit is one", async () => {
    const order: number[] = [];

    await mapWithConcurrency([0, 1, 2], 1, async (item) => {
      order.push(item);
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(item);
    });

    expect(order).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("returns an empty array for empty input", async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });
});

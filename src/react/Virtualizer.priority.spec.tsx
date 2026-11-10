import { createRef, useLayoutEffect } from "react";
import { fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { Virtualizer } from "./Virtualizer.js";
import { setupResizeJsDom } from "../../spec/jsdom/dom.js";
import { render } from "../../spec/jsdom/react.js";
import { delay, range } from "../../spec/utils.js";

const ROW_HEIGHT = 50;
const VIEWPORT_HEIGHT = ROW_HEIGHT * 10;
const BUFFER_SIZE = ROW_HEIGHT * 10;

setupResizeJsDom({
  itemSize: { width: 100, height: ROW_HEIGHT },
  viewportSize: { width: 100, height: VIEWPORT_HEIGHT },
});

async function settleUpdates() {
  vi.runAllTicks();
  await delay(100);
  vi.runAllTicks();
  await delay(100);
}

function visibleRows(container: Element) {
  return [...container.querySelectorAll<HTMLElement>("[data-row-index]")].map(
    (element) => Number(element.dataset["rowIndex"]),
  );
}

it("mounts the cold visible range and then reaches the forward buffer", async () => {
  const scrollRef = createRef<HTMLDivElement>();
  const { container } = await render(
    <div ref={scrollRef} style={{ height: VIEWPORT_HEIGHT, overflow: "auto" }}>
      <Virtualizer
        data={range(1000)}
        itemSize={ROW_HEIGHT}
        bufferSize={BUFFER_SIZE}
        prioritizeVisible
        scrollRef={scrollRef}
      >
        {(_item, index) => <div data-row-index={index}>row-{index}</div>}
      </Virtualizer>
    </div>,
  );

  scrollRef.current!.scrollTop = ROW_HEIGHT * 200;
  fireEvent.scroll(scrollRef.current!);
  await settleUpdates();

  const rows = visibleRows(container);
  for (let index = 200; index < 210; index += 1) {
    expect(rows).toContain(index);
    expect(
      container.querySelectorAll(`[data-row-index="${index}"]`),
    ).toHaveLength(1);
  }
  expect(rows).toContain(219);
  expect(rows).not.toContain(0);
});

it("keeps the latest target after rapid reversed scroll events", async () => {
  const scrollRef = createRef<HTMLDivElement>();
  const { container } = await render(
    <div ref={scrollRef} style={{ height: VIEWPORT_HEIGHT, overflow: "auto" }}>
      <Virtualizer
        data={range(1000)}
        itemSize={ROW_HEIGHT}
        bufferSize={BUFFER_SIZE}
        prioritizeVisible
        scrollRef={scrollRef}
      >
        {(_item, index) => <div data-row-index={index}>row-{index}</div>}
      </Virtualizer>
    </div>,
  );

  scrollRef.current!.scrollTop = ROW_HEIGHT * 400;
  fireEvent.scroll(scrollRef.current!);
  scrollRef.current!.scrollTop = ROW_HEIGHT * 200;
  fireEvent.scroll(scrollRef.current!);
  await settleUpdates();

  expect(scrollRef.current!.scrollTop).toBe(ROW_HEIGHT * 200);
  const rows = visibleRows(container);
  for (let index = 200; index < 210; index += 1) expect(rows).toContain(index);
  // Upward scrolling requests its buffer before the viewport.
  expect(rows).toContain(190);
  expect(rows).not.toContain(400);
});

it("retains keepMounted rows outside the active range", async () => {
  const scrollRef = createRef<HTMLDivElement>();
  const { container } = await render(
    <div ref={scrollRef} style={{ height: VIEWPORT_HEIGHT, overflow: "auto" }}>
      <Virtualizer
        data={range(1000)}
        itemSize={ROW_HEIGHT}
        bufferSize={BUFFER_SIZE}
        keepMounted={[7, 900]}
        prioritizeVisible
        scrollRef={scrollRef}
      >
        {(_item, index) => <div data-row-index={index}>row-{index}</div>}
      </Virtualizer>
    </div>,
  );

  scrollRef.current!.scrollTop = ROW_HEIGHT * 400;
  fireEvent.scroll(scrollRef.current!);
  await settleUpdates();

  expect(container.querySelector('[data-row-index="7"]')).not.toBeNull();
  expect(container.querySelector('[data-row-index="900"]')).not.toBeNull();
  expect(container.querySelector('[data-row-index="400"]')).not.toBeNull();
});

it("preserves visible row instances as buffer rows are admitted", async () => {
  const scrollRef = createRef<HTMLDivElement>();
  const mounts = new Map<number, number>();
  const unmounts = new Map<number, number>();
  function TrackedRow({ index }: { index: number }) {
    useLayoutEffect(() => {
      mounts.set(index, (mounts.get(index) ?? 0) + 1);
      return () => {
        unmounts.set(index, (unmounts.get(index) ?? 0) + 1);
      };
    }, [index]);
    return <div data-row-index={index}>row-{index}</div>;
  }
  const { container } = await render(
    <div ref={scrollRef} style={{ height: VIEWPORT_HEIGHT, overflow: "auto" }}>
      <Virtualizer
        data={range(1000)}
        itemSize={ROW_HEIGHT}
        bufferSize={BUFFER_SIZE}
        prioritizeVisible
        scrollRef={scrollRef}
      >
        {(_item, index) => <TrackedRow key={index} index={index} />}
      </Virtualizer>
    </div>,
  );

  scrollRef.current!.scrollTop = ROW_HEIGHT * 200;
  fireEvent.scroll(scrollRef.current!);
  await settleUpdates();

  for (let index = 200; index < 210; index += 1) {
    expect(mounts.get(index)).toBe(1);
    expect(unmounts.get(index) ?? 0).toBe(0);
    expect(
      container.querySelector(`[data-row-index="${index}"]`),
    ).not.toBeNull();
  }
  expect(container.querySelector('[data-row-index="219"]')).not.toBeNull();

  const promotedRow = container.querySelector<HTMLElement>(
    '[data-row-index="209"]',
  )!;
  scrollRef.current!.scrollTop = ROW_HEIGHT * 199;
  fireEvent.scroll(scrollRef.current!);
  await settleUpdates();

  expect(container.querySelector('[data-row-index="209"]')).toBe(promotedRow);
  expect(mounts.get(209)).toBe(1);
  expect(unmounts.get(209) ?? 0).toBe(0);
});

// SPDX-License-Identifier: GPL-3.0-or-later
import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import { visibleRows, type RowWindow } from '../catalog/visible-rows';

export interface VirtualRows {
  /** The rows to render. */
  readonly window: ComputedRef<RowWindow>;
  /** The height, in pixels, of the rows above and below the window (spacers keep the scroll). */
  readonly before: ComputedRef<number>;
  readonly after: ComputedRef<number>;
  /** Re-reads the scroll box and the row height (after the rows change). */
  measure(): void;
}

/** Rows rendered before a row can be measured (the first paint) and when nothing can be. */
const FALLBACK_VIEWPORT = 800;
const OVERSCAN = 8;

/**
 * Which rows of a long list of fixed-height rows to render, following a scroll box: rows out of
 * view aren't in the DOM, and spacers above and below take their height. The row height is read
 * from a rendered row (`[data-row]`), so it follows the user's font size.
 */
export function useVirtualRows(
  box: Readonly<Ref<HTMLElement | null>>,
  count: Readonly<Ref<number>>,
  fallbackRowHeight: number,
): VirtualRows {
  const scrollTop = ref(0);
  const viewport = ref(FALLBACK_VIEWPORT);
  const rowHeight = ref(fallbackRowHeight);

  function measure(): void {
    const element = box.value;
    if (element === null) return;
    scrollTop.value = element.scrollTop;
    if (element.clientHeight > 0) viewport.value = element.clientHeight;
    const row = element.querySelector<HTMLElement>('[data-row]');
    if (row !== null && row.offsetHeight > 0) rowHeight.value = row.offsetHeight;
  }

  const onScroll = () => {
    scrollTop.value = box.value?.scrollTop ?? 0;
  };
  const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  watch(
    box,
    (element, previous) => {
      previous?.removeEventListener('scroll', onScroll);
      if (previous !== null && previous !== undefined) resized?.unobserve(previous);
      if (element === null) return;
      element.addEventListener('scroll', onScroll, { passive: true });
      resized?.observe(element);
      measure();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    box.value?.removeEventListener('scroll', onScroll);
    resized?.disconnect();
  });

  const window = computed(() =>
    visibleRows(count.value, rowHeight.value, scrollTop.value, viewport.value, OVERSCAN),
  );
  return {
    window,
    before: computed(() => window.value.start * rowHeight.value),
    after: computed(() => (count.value - window.value.end) * rowHeight.value),
    measure,
  };
}

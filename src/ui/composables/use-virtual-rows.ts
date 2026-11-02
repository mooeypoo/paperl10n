// SPDX-License-Identifier: GPL-3.0-or-later
import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import {
  rowTop,
  scrollToShow,
  visibleRows,
  type OpenRow,
  type RowWindow,
} from '../catalog/visible-rows';

export interface VirtualRows {
  /** The rows to render. */
  readonly window: ComputedRef<RowWindow>;
  /** The height, in pixels, of the rows above and below the window (spacers keep the scroll). */
  readonly before: ComputedRef<number>;
  readonly after: ComputedRef<number>;
  /** Re-reads the scroll box and the rows' heights (after the rows change). */
  measure(): void;
  /** Scrolls the box just enough for row `index` to be in view. */
  scrollToRow(index: number): void;
}

/** Rows rendered before a row can be measured (the first paint) and when nothing can be. */
const FALLBACK_VIEWPORT = 800;
const OVERSCAN = 8;

/**
 * Which rows of a long list of fixed-height rows to render, following a scroll box: rows out of
 * view aren't in the DOM, and spacers above and below take their height. The row height is read
 * from a rendered row (`[data-row]`), so it follows the user's font size. One row may be open
 * (`[data-open]`), and taller: its height is read too, and followed as it changes.
 */
export function useVirtualRows(
  box: Readonly<Ref<HTMLElement | null>>,
  count: Readonly<Ref<number>>,
  fallbackRowHeight: number,
  /** The open row's index, if any. */
  openIndex: Readonly<Ref<number | null>> = ref(null),
): VirtualRows {
  const scrollTop = ref(0);
  const viewport = ref(FALLBACK_VIEWPORT);
  const rowHeight = ref(fallbackRowHeight);
  /** The open row's height, once rendered (a row's height until then). */
  const openHeight = ref<number | null>(null);
  let observedOpen: HTMLElement | null = null;

  const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);

  function measure(): void {
    const element = box.value;
    if (element === null) return;
    scrollTop.value = element.scrollTop;
    if (element.clientHeight > 0) viewport.value = element.clientHeight;
    const row = element.querySelector<HTMLElement>('[data-row]:not([data-open])');
    if (row !== null && row.offsetHeight > 0) rowHeight.value = row.offsetHeight;
    const open = element.querySelector<HTMLElement>('[data-row][data-open]');
    if (open !== null && open.offsetHeight > 0) openHeight.value = open.offsetHeight;
    // The open row grows and shrinks as it's edited: follow it.
    if (open !== observedOpen) {
      if (observedOpen !== null) resized?.unobserve(observedOpen);
      if (open !== null) resized?.observe(open);
      observedOpen = open;
    }
  }

  const onScroll = () => {
    scrollTop.value = box.value?.scrollTop ?? 0;
  };
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
  // Another row opening is a row's height until it's rendered and measured.
  watch(openIndex, () => {
    openHeight.value = null;
  });
  onBeforeUnmount(() => {
    box.value?.removeEventListener('scroll', onScroll);
    resized?.disconnect();
  });

  const open = computed<OpenRow | null>(() =>
    openIndex.value === null || openHeight.value === null
      ? null
      : { index: openIndex.value, height: openHeight.value },
  );
  const window = computed(() =>
    visibleRows(
      count.value,
      rowHeight.value,
      scrollTop.value,
      viewport.value,
      OVERSCAN,
      open.value,
    ),
  );
  const top = (index: number) => rowTop(index, rowHeight.value, open.value);
  return {
    window,
    before: computed(() => top(window.value.start)),
    after: computed(() => top(count.value) - top(window.value.end)),
    measure,
    scrollToRow: (index) => {
      const element = box.value;
      if (element === null) return;
      const target = scrollToShow(
        index,
        rowHeight.value,
        element.scrollTop,
        viewport.value,
        open.value,
      );
      if (target !== element.scrollTop) element.scrollTop = target;
      scrollTop.value = target;
    },
  };
}

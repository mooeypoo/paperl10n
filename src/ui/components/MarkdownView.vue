<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { DocumentTextDto } from '#ipc-contract';
import { computed } from 'vue';
import { blockViews, isLeftToRightBlock, isolatesLeftToRight } from '../markdown/segments';

const props = defineProps<{ document: DocumentTextDto }>();
const views = computed(() => blockViews(props.document));
</script>

<template>
  <!-- The document as written, block by block. Everything is rendered as text (never as HTML), and
       blocks inherit the pane's direction, except code and data, which read left to right. -->
  <div class="markdown">
    <div
      v-for="view in views"
      :key="view.block.start"
      class="markdown-block"
      :class="[
        `markdown-${view.block.kind}`,
        view.block.depth === undefined ? '' : `markdown-h${String(view.block.depth)}`,
      ]"
      :dir="isLeftToRightBlock(view.block) ? 'ltr' : undefined"
    >
      <template v-for="(segment, index) in view.segments" :key="index">
        <span
          v-if="segment.kind !== 'text'"
          :class="`markdown-span-${segment.kind}`"
          :dir="isolatesLeftToRight(segment, view.block) ? 'ltr' : undefined"
          >{{ segment.text }}</span
        >
        <template v-else>{{ segment.text }}</template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.markdown {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-3);
  font-family: var(--pl-font-text);
  font-size: 1.0625rem;
  line-height: 1.6;
}

.markdown-block {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.markdown-heading {
  font-weight: 650;
  line-height: 1.3;
}

.markdown-h1 {
  font-size: 1.625rem;
}

.markdown-h2 {
  font-size: 1.3rem;
}

.markdown-h3 {
  font-size: 1.125rem;
}

.markdown-code,
.markdown-table,
.markdown-frontmatter,
.markdown-mdx-esm {
  padding: var(--pl-space-3) var(--pl-space-4);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-code-surface);
  font-family: var(--pl-font-mono);
  font-size: var(--pl-text-sm);
  line-height: 1.55;
  white-space: pre;
  overflow-x: auto;
  overflow-wrap: normal;
  /* Each line takes the direction of its first strong character, so a Hebrew line in a code
     sample reads right to left while commands stay left to right. */
  unicode-bidi: plaintext;
}

.markdown-table {
  background: transparent;
  padding-inline: 0;
}

.markdown-frontmatter,
.markdown-mdx-esm {
  color: var(--pl-color-muted);
}

/* An isolated run can't be reordered with the sentence around it (and vice versa). */
.markdown-block span[dir] {
  unicode-bidi: isolate;
}

.markdown-span-markup {
  color: var(--pl-color-markup);
}

.markdown-span-code {
  font-family: var(--pl-font-mono);
  font-size: 0.92em;
}

/* Inline code in prose gets a light surface; inside a code block, the block already has one. */
.markdown-block:not(.markdown-code) > .markdown-span-code {
  padding-inline: 0.15em;
  border-radius: var(--pl-radius-sm);
  background: var(--pl-color-code-surface);
}

.markdown-span-url {
  color: var(--pl-color-link);
  font-family: var(--pl-font-mono);
  font-size: 0.92em;
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>

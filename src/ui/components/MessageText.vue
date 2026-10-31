<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { PlaceholderTokenDto } from '#ipc-contract';
import { computed } from 'vue';
import { tokenSegments } from '../catalog/token-segments';

// A message's text, read-only, with each token isolated left to right: `$1` or `{{PLURAL:…}}`
// inside a Hebrew sentence keeps its place instead of reordering the words around it.
const props = defineProps<{ text: string; tokens: readonly PlaceholderTokenDto[] }>();
const segments = computed(() => tokenSegments(props.text, props.tokens));
</script>

<template>
  <span class="message-text"
    ><template v-for="(segment, index) in segments" :key="index"
      ><bdi
        v-if="segment.kind === 'token'"
        class="message-token"
        :data-token="segment.token"
        dir="ltr"
        >{{ segment.text }}</bdi
      ><template v-else>{{ segment.text }}</template></template
    ></span
  >
</template>

<style scoped>
.message-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message-token {
  padding-inline: 0.15em;
  border-radius: var(--pl-radius-sm);
  background: var(--pl-color-code-surface);
  color: var(--pl-color-markup);
  font-family: var(--pl-font-mono);
  font-size: 0.92em;
}
</style>

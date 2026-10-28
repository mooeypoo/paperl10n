<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { computed } from 'vue';
import { icons, type IconName } from './icons';

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 });
const icon = computed(() => icons[props.name]);
</script>

<template>
  <!-- Decorative: the control around it carries the accessible name. -->
  <svg
    class="icon"
    :class="{ 'icon-mirrors': icon.mirrorsInRtl }"
    aria-hidden="true"
    focusable="false"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path v-for="path in icon.paths" :key="path" :d="path" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
}

.icon-mirrors:dir(rtl) {
  transform: scaleX(-1);
}
</style>

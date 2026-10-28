<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import markUrl from '#assets/paperl10n-mark.svg';
</script>

<template>
  <!-- Decorative: the app's name is right next to it. The mark is used unmodified (CC BY-ND,
       assets/README.md); dark themes give it a light backing instead of a changed drawing. -->
  <span class="mark"><img :src="markUrl" alt="" width="34" height="34" /></span>
</template>

<style scoped>
.mark {
  display: grid;
  place-items: center;
  inline-size: 2.5rem;
  block-size: 2.5rem;
  border-radius: 50%;
  background: var(--pl-mark-backing);
}
</style>

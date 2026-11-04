<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
  The About window: the version, who made it, the license in plain words (and that translations
  stay their translators'), "Check for updates" and the daily check's setting, the open-source
  components the app includes, and the full license.
  Its links open in the user's browser (main's allow-list, src/main/external-links.ts).
-->
<script setup lang="ts">
import { computed, nextTick, useId, useTemplateRef, watch } from 'vue';
import { useClient } from '../client';
import { useAbout } from '../composables/use-about';
import type { UpdateCheckState } from '../composables/use-updates';
import { errorMessage } from '../i18n/error-message';
import { useI18n } from '../i18n/i18n';
import AppMark from './AppMark.vue';

const AUTHOR_SITE = 'https://moriel.tech';
const SOURCE = 'https://github.com/mooeypoo/paperl10n';
const COFFEE = 'https://buymeacoffee.com/mooeypoo';

const props = defineProps<{
  open: boolean;
  /** The daily check's setting; `null` until main answers. */
  automatic: boolean | null;
  check: UpdateCheckState;
}>();
const emit = defineEmits<{ close: []; checkUpdates: []; setAutomatic: [enabled: boolean] }>();
const { t, locale } = useI18n();
const automaticHintId = useId();
const { about, error, load } = useAbout(useClient());
const titleId = useId();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');

// The coffee sentence, split around its link so each language can place the link where it reads well.
const coffee = computed(() => t('paperl10n-about-coffee', '$1').split('$1'));
const errorText = computed(() => (error.value === null ? '' : errorMessage(error.value, t)));
const newer = computed(() =>
  typeof props.check === 'object' && props.check.kind === 'newer' ? props.check.update : null,
);
const checkMessage = computed(() => {
  if (props.check === 'idle') return '';
  if (props.check === 'checking') return t('paperl10n-update-checking');
  if (props.check.kind === 'newer') return t('paperl10n-update-is-out', props.check.update.version);
  return t(props.check.kind === 'newest' ? 'paperl10n-update-newest' : 'paperl10n-update-failed');
});

function onAutomaticChange(event: Event): void {
  emit('setAutomatic', (event.target as HTMLInputElement).checked);
}

watch(
  () => props.open,
  async (open) => {
    const element = dialog.value;
    if (element === null) return;
    if (open) {
      if (!element.open) element.showModal();
      await nextTick();
      closeButton.value?.focus();
      await load();
    } else if (element.open) {
      element.close();
    }
  },
  { flush: 'post' },
);

function onCancel(event: Event): void {
  // Escape: the parent closes the dialog by changing `open`.
  event.preventDefault();
  emit('close');
}
</script>

<template>
  <dialog
    ref="dialog"
    class="about"
    :aria-labelledby="titleId"
    data-testid="about"
    @cancel="onCancel"
  >
    <!-- Rendered only while open: a closed About window leaves nothing in the page. -->
    <template v-if="open">
      <div class="about-heading">
        <AppMark />
        <div>
          <h2 :id="titleId" class="about-title">{{ t('paperl10n-app-name') }}</h2>
          <p v-if="about !== null" class="about-version" data-testid="about-version">
            {{ t('paperl10n-about-version', about.version) }}
          </p>
        </div>
      </div>

      <p class="about-tagline">{{ t('paperl10n-about-tagline') }}</p>
      <p>
        {{ t('paperl10n-about-made-by') }}
        <a :href="AUTHOR_SITE" target="_blank" rel="noreferrer" dir="ltr" lang="en"
          >Moriel Schottlender</a
        >
      </p>
      <p v-if="errorText !== ''" role="alert" class="about-error">
        {{ t('paperl10n-about-unavailable') }} {{ errorText }}
      </p>

      <section class="about-updates" data-testid="about-updates">
        <div class="about-check">
          <button
            type="button"
            class="pl-button"
            :disabled="check === 'checking'"
            @click="emit('checkUpdates')"
          >
            {{ t('paperl10n-update-check') }}
          </button>
          <p role="status" data-testid="about-check-result">{{ checkMessage }}</p>
        </div>
        <p v-if="newer !== null" class="about-links">
          <a :href="newer.notes" target="_blank" rel="noreferrer">{{
            t('paperl10n-update-whats-new')
          }}</a>
          <a :href="newer.download[locale] ?? newer.download.en" target="_blank" rel="noreferrer">{{
            t('paperl10n-update-download')
          }}</a>
        </p>
        <label v-if="automatic !== null" class="about-automatic">
          <input
            type="checkbox"
            :checked="automatic"
            :aria-describedby="automaticHintId"
            @change="onAutomaticChange"
          />
          {{ t('paperl10n-update-automatic') }}
        </label>
        <p v-if="automatic !== null" :id="automaticHintId" class="about-muted">
          {{ t('paperl10n-update-automatic-hint') }}
        </p>
      </section>

      <p>{{ t('paperl10n-about-license') }}</p>
      <p>{{ t('paperl10n-about-yours') }}</p>
      <p>
        <a :href="SOURCE" target="_blank" rel="noreferrer">{{ t('paperl10n-about-source') }}</a>
      </p>
      <p data-testid="about-coffee">
        {{ coffee[0]
        }}<a :href="COFFEE" target="_blank" rel="noreferrer">{{
          t('paperl10n-about-coffee-link')
        }}</a
        >{{ coffee[1] }}
      </p>

      <template v-if="about !== null">
        <details v-if="about.components.length > 0" class="about-more">
          <summary>{{ t('paperl10n-about-credits', about.components.length) }}</summary>
          <ul class="about-components" data-testid="about-components">
            <li
              v-for="component in about.components"
              :key="`${component.name}@${component.version}`"
            >
              <bdi lang="en">{{ component.name }}</bdi>
              <bdi class="about-muted">{{ component.version }}</bdi>
              <bdi class="about-muted">{{ component.license }}</bdi>
            </li>
          </ul>
        </details>
        <details v-if="about.licenseText !== ''" class="about-more">
          <summary>{{ t('paperl10n-about-full-license') }}</summary>
          <pre class="about-license" dir="ltr" lang="en">{{ about.licenseText }}</pre>
        </details>
      </template>

      <div class="about-actions">
        <button
          ref="closeButton"
          type="button"
          class="pl-button"
          data-variant="primary"
          @click="emit('close')"
        >
          {{ t('paperl10n-close') }}
        </button>
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.about {
  inline-size: min(34rem, 100vw - 2 * var(--pl-space-4));
  max-block-size: calc(100vh - 2 * var(--pl-space-5));
  padding: var(--pl-space-5);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-lg);
  background: var(--pl-color-surface);
  color: var(--pl-color-ink);
  box-shadow: var(--pl-shadow-sheet);
}

.about[open] {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-3);
}

.about::backdrop {
  background: var(--pl-color-backdrop);
}

.about p {
  margin: 0;
}

.about a {
  color: var(--pl-color-link);
}

.about-heading {
  display: flex;
  align-items: center;
  gap: var(--pl-space-3);
}

.about-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-xl);
  font-weight: 600;
}

.about-version,
.about-muted {
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.about-tagline {
  font-family: var(--pl-font-text);
}

.about-error {
  color: var(--pl-color-danger);
}

.about-updates {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-2);
  padding: var(--pl-space-3);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
}

.about-check {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-3);
}

.about-links {
  display: flex;
  gap: var(--pl-space-4);
}

.about-automatic {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
}

.about-more summary {
  cursor: pointer;
  font-weight: 500;
}

.about-components {
  max-block-size: 16rem;
  margin: 0;
  overflow: auto;
  margin-block-start: var(--pl-space-2);
  padding: 0;
  list-style: none;
  font-size: var(--pl-text-sm);
}

.about-components li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pl-space-2);
  padding-block: var(--pl-space-1);
  border-block-end: 1px solid var(--pl-color-line);
}

.about-license {
  max-block-size: 16rem;
  margin: 0;
  margin-block-start: var(--pl-space-2);
  padding: var(--pl-space-3);
  overflow: auto;
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-bg);
  font-family: var(--pl-font-mono);
  font-size: var(--pl-text-sm);
  white-space: pre-wrap;
}

.about-actions {
  display: flex;
  justify-content: flex-end;
}
</style>

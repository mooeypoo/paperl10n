---
title: Getting started
outline: deep
---

# {{ $frontmatter.title }}

[[toc]]

Install Lantern :tada: and light your first page.

::: tip Before you start
Lantern needs Node 20 or later.
:::

::: code-group

```sh [npm]
npm install lantern
```

```sh [pnpm]
pnpm add lantern
```

:::

```js{2}
import { createLantern } from 'lantern'
const lantern = createLantern() // [!code ++]
```

<<< @/snippets/setup.js#setup{1}

<!--@include: ./parts/support.md-->

<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

The button was pressed {{ count }} times. <button @click="count++">Press</button>

::: details Why "Lantern"?
It lights the way. See the [API](/reference/api.md) and the [home page](/).
:::

<style module>
.button { color: var(--vp-c-brand-1); }
</style>

// SPDX-License-Identifier: GPL-3.0-or-later
// For tools that use plain TypeScript (type-aware ESLint): what a .vue import is. vue-tsc resolves
// the real component types instead, so this never hides an error in `pnpm typecheck`.
declare module '*.vue' {
  import type { Component } from 'vue';
  const component: Component;
  export default component;
}

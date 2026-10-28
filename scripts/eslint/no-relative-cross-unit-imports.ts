// SPDX-License-Identifier: GPL-3.0-or-later
// AGENTS.md dependency rule 7: relative imports stay inside their unit (a domain, a plugin, the
// kernel, app/main/preload/ui). Crossing units goes through `#` aliases, which resolve only to
// entry points. That keeps deep imports impossible and plugin folders movable.
import { relative, sep } from 'node:path';
import type { Rule } from 'eslint';
import { aliasHint, resolveRelative, unitOf } from './units.ts';

export const noRelativeCrossUnitImports: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow relative imports that leave the current domain, plugin, or layer',
    },
    schema: [],
    messages: {
      leavesUnit:
        "Relative import '{{source}}' leaves '{{fromUnit}}'. Import from {{hint}} instead (AGENTS.md, dependency rule 7).",
    },
  },
  create(context) {
    const file = relative(context.cwd, context.filename).split(sep).join('/');
    const fromUnit = unitOf(file);
    if (fromUnit === undefined) return {};

    const check = (node: Rule.Node, source: unknown) => {
      if (typeof source !== 'string' || !source.startsWith('.')) return;
      const targetUnit = unitOf(resolveRelative(file, source));
      if (targetUnit === fromUnit) return;
      context.report({
        node,
        messageId: 'leavesUnit',
        data: {
          source,
          fromUnit,
          hint: targetUnit === undefined ? 'a # alias' : aliasHint(targetUnit),
        },
      });
    };

    return {
      ImportDeclaration: (node) => {
        check(node, node.source.value);
      },
      ExportAllDeclaration: (node) => {
        check(node, node.source.value);
      },
      ExportNamedDeclaration: (node) => {
        if (node.source) check(node, node.source.value);
      },
      ImportExpression: (node) => {
        if (node.source.type === 'Literal') check(node, node.source.value);
      },
    };
  },
};

// SPDX-License-Identifier: GPL-3.0-or-later
// Styling rules from AGENTS.md (UI and design): logical properties only, so layouts mirror in RTL,
// and no raw colors outside the design tokens. See docs/adr/0010-styling-tokens-and-logical-css.md.

const physicalProperties = [
  'margin-left',
  'margin-right',
  'padding-left',
  'padding-right',
  'left',
  'right',
  'border-left',
  'border-right',
  'border-left-width',
  'border-right-width',
  'border-left-color',
  'border-right-color',
  'border-left-style',
  'border-right-style',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'scroll-margin-left',
  'scroll-margin-right',
  'scroll-padding-left',
  'scroll-padding-right',
];

export default {
  rules: {
    'property-disallowed-list': [
      physicalProperties,
      {
        message: (property) =>
          `"${property}" is physical: use the logical property (…-inline-start/-end) so RTL works (AGENTS.md).`,
      },
    ],
    'declaration-property-value-disallowed-list': [
      { 'text-align': ['left', 'right'], float: ['left', 'right'], clear: ['left', 'right'] },
      {
        message: (property, value) =>
          `"${property}: ${value}" is physical: use start or end so RTL works (AGENTS.md).`,
      },
    ],
    'color-no-hex': [
      true,
      { message: 'Use a design token (var(--pl-color-…)), not a raw color (AGENTS.md).' },
    ],
    'color-named': [
      'never',
      { message: 'Use a design token (var(--pl-color-…)), not a named color (AGENTS.md).' },
    ],
    'function-disallowed-list': [
      ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'],
      { message: 'Use a design token (var(--pl-color-…)), not a raw color (AGENTS.md).' },
    ],
  },
  overrides: [
    { files: ['**/*.vue'], customSyntax: 'postcss-html' },
    // The tokens file is where raw colors are defined.
    {
      files: ['src/ui/styles/tokens.css'],
      rules: { 'color-no-hex': null, 'function-disallowed-list': null },
    },
  ],
};

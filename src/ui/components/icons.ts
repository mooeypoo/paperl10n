// SPDX-License-Identifier: GPL-3.0-or-later
// The app's icons: 24×24 stroke drawings, hand-written (no icon dependency). An icon that points
// somewhere ("forward") mirrors in right-to-left layouts; one that depicts a thing (a sun, a
// folder) never does.

export interface IconDefinition {
  /** SVG path data, drawn with a 2px round stroke and no fill. */
  readonly paths: readonly string[];
  /** Flip horizontally when the surrounding text is right-to-left. */
  readonly mirrorsInRtl: boolean;
}

export const icons = {
  sun: {
    paths: [
      'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
      'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
    ],
    mirrorsInRtl: false,
  },
  moon: { paths: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'], mirrorsInRtl: false },
  monitor: { paths: ['M3 4h18v12H3z', 'M8 20h8M12 16v4'], mirrorsInRtl: false },
  folder: {
    paths: [
      'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z',
    ],
    mirrorsInRtl: false,
  },
  search: { paths: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'M20 20l-4-4'], mirrorsInRtl: false },
  forward: { paths: ['M5 12h14', 'M13 6l6 6-6 6'], mirrorsInRtl: true },
} as const satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof icons;

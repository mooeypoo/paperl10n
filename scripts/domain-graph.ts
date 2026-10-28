// SPDX-License-Identifier: GPL-3.0-or-later
// The allowed domain → domain dependencies. The ESLint boundaries config is generated from this,
// and a test checks it's acyclic and matches the folders in src/domains/.
// Adding an edge is a reviewed change: update docs/architecture.md in the same commit.

export const domainNames = [
  'locale',
  'document',
  'catalog',
  'translation',
  'formats',
  'workspace',
] as const;

export type DomainName = (typeof domainNames)[number];

export type DomainGraph = Readonly<Record<DomainName, readonly DomainName[]>>;

export const domainGraph: DomainGraph = {
  locale: [],
  document: [],
  catalog: [],
  translation: ['document', 'catalog', 'locale'],
  formats: ['document', 'catalog'],
  workspace: ['formats', 'locale', 'document'],
};

/** Returns one dependency cycle as a list of nodes (first = last), or `undefined` if there's none. */
export function findCycle(
  graph: Readonly<Record<string, readonly string[]>>,
): string[] | undefined {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const path: string[] = [];

  const visit = (node: string): string[] | undefined => {
    if (done.has(node)) return undefined;
    if (visiting.has(node)) return [...path.slice(path.indexOf(node)), node];
    visiting.add(node);
    path.push(node);
    for (const next of graph[node] ?? []) {
      const cycle = visit(next);
      if (cycle !== undefined) return cycle;
    }
    path.pop();
    visiting.delete(node);
    done.add(node);
    return undefined;
  };

  for (const node of Object.keys(graph)) {
    const cycle = visit(node);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
}

// SPDX-License-Identifier: GPL-3.0-or-later
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { domainGraph, domainNames, findCycle } from './domain-graph.ts';

describe('the declared domain graph', () => {
  it('is acyclic (AGENTS.md, dependency rule 6)', () => {
    expect(findCycle(domainGraph)).toBeUndefined();
  });

  it('lists exactly the domain folders in src/domains/', () => {
    const folders = readdirSync(new URL('../src/domains', import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect([...domainNames].sort()).toEqual(folders);
  });

  it('only has edges to known domains, and no self-edges', () => {
    for (const [domain, dependencies] of Object.entries(domainGraph)) {
      for (const dependency of dependencies) {
        expect(domainNames).toContain(dependency);
        expect(dependency).not.toBe(domain);
      }
    }
  });
});

describe('findCycle', () => {
  it.each<[string, Record<string, string[]>, string[] | undefined]>([
    ['an empty graph', {}, undefined],
    ['a chain', { a: ['b'], b: ['c'], c: [] }, undefined],
    ['a diamond', { a: ['b', 'c'], b: ['d'], c: ['d'], d: [] }, undefined],
    ['a self-loop', { a: ['a'] }, ['a', 'a']],
    ['a two-node cycle', { a: ['b'], b: ['a'] }, ['a', 'b', 'a']],
    ['a cycle behind a chain', { a: ['b'], b: ['c'], c: ['d'], d: ['b'] }, ['b', 'c', 'd', 'b']],
    ['an edge to an undeclared node', { a: ['z'] }, undefined],
  ])('%s', (_description, graph, expected) => {
    expect(findCycle(graph)).toEqual(expected);
  });
});

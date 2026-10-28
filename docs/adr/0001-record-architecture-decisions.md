# 0001. Record architecture decisions

- Status: accepted
- Date: 2026-10-28

## Context

Paper Lion is meant to be maintained for years by one developer, with help from coding agents.
Decisions that shape the codebase (tooling, boundaries, contracts) need to be findable later,
with their reasons, so they can be revisited deliberately instead of eroded by accident.
`AGENTS.md` already requires an ADR for a new domain, a new layer, or a broken rule.

## Decision

We record significant decisions as Architecture Decision Records in `docs/adr/`.

- One decision per file, named `NNNN-short-title.md`, numbered sequentially and never reused.
- A light MADR-style format, using [`template.md`](template.md): *Status, Context, Decision,
  Alternatives considered, Consequences*. Aim for under one page.
- Status is one of `proposed`, `accepted`, `superseded by NNNN`, or `deprecated`.
- Accepted ADRs aren't rewritten. To change a decision, write a new ADR that supersedes the old
  one, and update the old one's status line only.
- When an ADR changes a rule, `AGENTS.md` and the relevant `docs/` file are updated in the same
  change.

## Alternatives considered

- **Decisions only in `AGENTS.md` and commit messages.** `AGENTS.md` states rules, not the reasons
  behind them. Commit messages are hard to find later.
- **Full MADR or arc42 templates.** More structure than a solo project needs, so they'd likely be
  skipped.

## Consequences

- Every significant choice in the M0 plan gets its own short ADR (see `docs/plan/M0.md` §10.2).
- Writing an ADR costs a few minutes. In return, "why is it like this?" has an answer.

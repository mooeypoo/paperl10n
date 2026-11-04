# Releasing

Paper Lion releases the way Plot Device does ([the M6 plan](../plan/M6-installer.md), question 8):
- a script prepares a pull request with the version and the notes;
- merging that pull request tags the release;
- CI builds a **draft** GitHub release, which the maintainer tries and publishes.

Update notices ([ADR 0018](../adr/0018-updates-domain.md)) reach earlier copies only once a
release is published.

## Commit messages

Every commit subject starts with a prefix:

| Prefix | For | In the release notes |
|---|---|---|
| `feat:` | something new translators can do or see | **New** |
| `fix:` | something that was wrong for translators | **Fixed** |
| `perf:` | something faster | **Faster** |
| `docs:`, `test:`, `ci:`, `build:`, `style:`, `dev:`, `refactor:`, `chore:`, `release:` | everything else | left out |

A scope (`fix(ui):`) and `!` are allowed. `feat`, `fix`, and `perf` lines go into the notes as
written, so write them for translators. For example, "feat: preview a message's plural forms",
not "feat: add MessagePreview component". CI checks every commit in a pull request
(`node scripts/release-notes.ts check-commits <base>..<head>`).

## Making a release

1. **On an up-to-date main, with CI green:**

   ```sh
   pnpm release 0.2.0 --dry-run   # the notes it would write, and anything that stops it
   pnpm release 0.2.0
   ```

   It refuses, in plain words, when:
   - you're not on main, or have uncommitted changes;
   - main differs from GitHub;
   - the version isn't newer, or CI failed or is still running on this commit;
   - nothing changed since the last release.

   Otherwise it:
   - sets the version in `package.json` and the AppStream metadata;
   - writes a `CHANGELOG.md` section from the `feat`, `fix`, and `perf` commits since the last tag
     (grouped, prefixes removed, repeats once, with a summary placeholder);
   - opens a pull request from `release/v0.2.0`.
2. **In that pull request**, write the summary (two or three sentences for translators) and
   reword the lines. CI refuses while any `<!-- comment -->` is left in the section.
3. **Merge it.** `tag-release.yml` tags the merge commit `v0.2.0`, then `release.yml` creates a
   draft release with the notes and attaches:
   - the AppImage, the `.deb` (its AppStream metadata carries the notes for software centres), and
     the Windows installer;
   - one `SHA256SUMS` for all of them;
   - `latest.json`.
4. **Try the draft's files, then publish it.** Never mark it "Pre-release": GitHub's
   `releases/latest` skips those, and update notices read `latest.json` from there.

A tag pushed by hand (`git tag v0.2.0 && git push origin v0.2.0`) runs `release.yml` too.

**The first release, 0.1.0:** commits before M6 have no prefixes. Its notes start from M6's
commits; rewrite them by hand in the pull request, as an introduction to what Paper Lion does.

## The tooling

- `scripts/changelog.ts`: the pure rules, tested in `scripts/changelog.test.ts`. They cover
  prefixes, sections, readiness, versions, `latest.json` (checked against the app's own reader),
  and AppStream.
- `scripts/release-checks.ts`: what stops a release, tested in `scripts/release-checks.test.ts`.
- `scripts/release.ts`: `pnpm release`, git and `gh` around them.
- `scripts/release-notes.ts`: the workflows' helper. Its subcommands are `check-commits`,
  `check`, `notes`, `latest`, and `metainfo`.

// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { err, ok, type Result } from '#kernel/result';
import type {
  Draft,
  DraftKey,
  DraftStore,
  DraftStoreError,
} from '../application/ports/draft-store.ts';

const FORMAT = 'paperl10n-draft';
const VERSION = 1;
const unavailable: DraftStoreError = { code: 'drafts.unavailable' };

interface DraftFile extends DraftKey, Draft {
  readonly format: typeof FORMAT;
  readonly version: typeof VERSION;
}

function errorCode(thrown: unknown): string | undefined {
  return typeof thrown === 'object' &&
    thrown !== null &&
    'code' in thrown &&
    typeof thrown.code === 'string'
    ? thrown.code
    : undefined;
}

/** A file name per key: a hash, so any project path, locale, or page key makes a safe name. */
function fileName(key: DraftKey): string {
  const id = JSON.stringify([key.project, key.locale, key.document]);
  return `${createHash('sha256').update(id).digest('hex')}.json`;
}

/** A draft file's contents, or `null` when it isn't one (corrupt, or another version). */
function parseDraftFile(text: string): DraftFile | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const file = value as Record<string, unknown>;
  const valid =
    file.format === FORMAT &&
    file.version === VERSION &&
    typeof file.project === 'string' &&
    typeof file.locale === 'string' &&
    typeof file.document === 'string' &&
    typeof file.text === 'string' &&
    (file.base === null || typeof file.base === 'string');
  return valid ? (value as DraftFile) : null;
}

const sameKey = (file: DraftKey, key: DraftKey) =>
  file.project === key.project && file.locale === key.locale && file.document === key.document;

/**
 * Drafts as one JSON file each in `folder` (the app's data, created on the first write, readable
 * only by the user). Writes are atomic: a temporary file, flushed, then renamed. A file that isn't
 * a draft for the key asked for (corrupt, another version, or a hash collision) counts as none.
 */
export function nodeDraftStore(folder: string): DraftStore {
  async function read(name: string): Promise<Result<DraftFile | null, DraftStoreError>> {
    try {
      return ok(parseDraftFile(await readFile(join(folder, name), 'utf8')));
    } catch (thrown) {
      return errorCode(thrown) === 'ENOENT' ? ok(null) : err(unavailable);
    }
  }

  return {
    async get(key) {
      const file = await read(fileName(key));
      if (!file.ok) return file;
      return ok(
        file.value !== null && sameKey(file.value, key)
          ? { text: file.value.text, base: file.value.base }
          : null,
      );
    },

    async put(key, draft) {
      const contents: DraftFile = {
        format: FORMAT,
        version: VERSION,
        project: key.project,
        locale: key.locale,
        document: key.document,
        text: draft.text,
        base: draft.base,
      };
      const target = join(folder, fileName(key));
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await mkdir(folder, { recursive: true, mode: 0o700 });
        const handle = await open(temporary, 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify(contents), 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, target);
        return ok(undefined);
      } catch {
        await unlink(temporary).catch(() => undefined);
        return err(unavailable);
      }
    },

    async remove(key) {
      try {
        await unlink(join(folder, fileName(key)));
        return ok(undefined);
      } catch (thrown) {
        return errorCode(thrown) === 'ENOENT' ? ok(undefined) : err(unavailable);
      }
    },

    async documents(project, locale) {
      let names: string[];
      try {
        names = await readdir(folder);
      } catch (thrown) {
        return errorCode(thrown) === 'ENOENT' ? ok([]) : err(unavailable);
      }
      const documents: string[] = [];
      for (const name of names.filter((each) => /^[0-9a-f]{64}\.json$/.test(each))) {
        const file = await read(name);
        if (!file.ok) return file;
        // Only a file under its own key's name counts (not a stray copy).
        if (
          file.value !== null &&
          file.value.project === project &&
          file.value.locale === locale &&
          fileName(file.value) === name
        ) {
          documents.push(file.value.document);
        }
      }
      return ok(documents);
    },
  };
}

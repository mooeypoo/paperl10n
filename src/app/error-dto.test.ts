// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { errorCodes, type ErrorCode, type ErrorDto } from '#ipc-contract';
import type { FormatId } from '#domains/formats';
import type { ProjectPath } from '#kernel/project-path';
import { toErrorDto, type AppError } from './error-dto.ts';

const formatId = 'format-fake' as FormatId;
const file = 'paperl10n.config.json' as ProjectPath;

const cases: [AppError, ErrorDto][] = [
  [
    { code: 'workspace.folder-unavailable', reason: 'not-a-folder' },
    { code: 'workspace.folder-unavailable', params: { reason: 'not-a-folder' }, details: [] },
  ],
  [
    { code: 'workspace.config-missing' },
    { code: 'workspace.config-missing', params: {}, details: [] },
  ],
  [
    { code: 'workspace.config-unreadable', cause: { code: 'files.not-utf8', path: file } },
    {
      code: 'workspace.config-unreadable',
      params: { file, problem: 'files.not-utf8' },
      details: [],
    },
  ],
  [
    {
      code: 'workspace.config-invalid',
      problems: [
        { field: 'targetLocale', problem: 'is required' },
        { field: 'formatOptions', problem: 'must be an object' },
      ],
    },
    {
      code: 'workspace.config-invalid',
      params: {},
      details: ['targetLocale: is required', 'formatOptions: must be an object'],
    },
  ],
  [
    { code: 'workspace.unknown-document-format', formatId: 'format-nope' },
    { code: 'workspace.unknown-document-format', params: { formatId: 'format-nope' }, details: [] },
  ],
  [
    {
      code: 'workspace.no-document-format',
      failures: [{ code: 'formats.plugin-failed', formatId, reason: 'boom' }],
    },
    {
      code: 'workspace.no-document-format',
      params: {},
      details: ['format-fake: formats.plugin-failed'],
    },
  ],
  [
    { code: 'workspace.unknown-project' },
    { code: 'workspace.unknown-project', params: {}, details: [] },
  ],
  [
    { code: 'workspace.unknown-document', key: 'guide/gone' },
    { code: 'workspace.unknown-document', params: { key: 'guide/gone' }, details: [] },
  ],
  [
    {
      code: 'workspace.document-unreadable',
      cause: { code: 'files.not-utf8', path: 'he/index.md' as ProjectPath },
    },
    {
      code: 'workspace.document-unreadable',
      params: { file: 'he/index.md', problem: 'files.not-utf8' },
      details: [],
    },
  ],
  [
    { code: 'formats.invalid-options', formatId, reason: 'bad root' },
    { code: 'formats.invalid-options', params: { formatId, reason: 'bad root' }, details: [] },
  ],
  [
    { code: 'formats.unsupported-project', formatId, reason: 'no en folder' },
    {
      code: 'formats.unsupported-project',
      params: { formatId, reason: 'no en folder' },
      details: [],
    },
  ],
  [
    { code: 'formats.plugin-failed', formatId, reason: 'boom' },
    { code: 'formats.plugin-failed', params: { formatId, reason: 'boom' }, details: [] },
  ],
  [
    {
      code: 'formats.file-access',
      formatId,
      cause: { code: 'files.unreadable', path: 'en' as ProjectPath },
    },
    {
      code: 'formats.file-access',
      params: { formatId, file: 'en', problem: 'files.unreadable' },
      details: [],
    },
  ],
];

/** Codes no use case returns: the transport layer produces them. */
const transportCodes: ErrorCode[] = ['internal.unexpected', 'internal.invalid-request'];

describe('toErrorDto', () => {
  it.each(cases)('maps %j', (error, dto) => {
    expect(toErrorDto(error)).toEqual(dto);
  });

  it('produces plain data that survives structured cloning (as over IPC)', () => {
    for (const [error] of cases) {
      const dto = toErrorDto(error);
      expect(structuredClone(dto)).toEqual(dto);
    }
  });

  it('covers every contract error code, or the code is reserved for the transport', () => {
    const produced = new Set<string>(cases.map(([error]) => toErrorDto(error).code));
    expect([...produced, ...transportCodes].sort()).toEqual([...errorCodes].sort());
  });
});

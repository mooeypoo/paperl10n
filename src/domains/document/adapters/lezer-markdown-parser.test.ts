// SPDX-License-Identifier: GPL-3.0-or-later
import { describeMarkdownParserContract } from '../testing/markdown-parser-contract.ts';
import { createLezerMarkdownParser } from './lezer-markdown-parser.ts';

describeMarkdownParserContract('lezer', createLezerMarkdownParser());

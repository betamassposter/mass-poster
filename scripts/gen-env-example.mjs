#!/usr/bin/env node
/**
 * Auto-generate .env.example from the Zod schema in src/lib/env.ts.
 * Run when you add/remove env vars; commit both env.ts and .env.example.
 *
 * Usage: pnpm env:example
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const envSchemaPath = join(repoRoot, 'src', 'lib', 'env.ts');
const examplePath = join(repoRoot, '.env.example');

const source = readFileSync(envSchemaPath, 'utf8');

// Extract the z.object({...}) body. The schema is well-formed (one top-level
// object literal), so a simple bracket-matching parse suffices.
const start = source.indexOf('z.object({');
if (start === -1) {
  console.error('✗ z.object({ not found in env.ts');
  process.exit(1);
}
let depth = 0;
let end = -1;
for (let i = start + 'z.object('.length; i < source.length; i++) {
  const c = source[i];
  if (c === '{') depth++;
  else if (c === '}') {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
if (end === -1) {
  console.error('✗ unmatched braces in z.object({...})');
  process.exit(1);
}
const body = source.slice(start, end);

// Walk lines: track contiguous `//` comments as the next field's docstring.
const lines = body.split('\n');
const entries = [];
let pendingComments = [];
const fieldStartRe = /^\s*([A-Z][A-Z0-9_]+):\s*z\./;

for (const raw of lines) {
  const line = raw.replace(/\r$/, '');
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) {
    pendingComments.push(trimmed.replace(/^\/\/\s?/, ''));
    continue;
  }
  if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.endsWith('*/')) {
    // Strip JSDoc-style block comments down to their text.
    const cleaned = trimmed.replace(/^\/\*+\s?/, '').replace(/\s?\*+\/$/, '').replace(/^\*\s?/, '');
    if (cleaned) pendingComments.push(cleaned);
    continue;
  }
  if (trimmed === '' || trimmed.startsWith('z.object') || trimmed === '})' || trimmed === ');') {
    continue;
  }
  const m = trimmed.match(fieldStartRe);
  if (m) {
    const [, name] = m;
    const required = !trimmed.includes('.optional()') && !trimmed.includes('.default(');
    const defaultMatch = trimmed.match(/\.default\(([^)]+)\)/);
    const def = defaultMatch ? defaultMatch[1].trim().replace(/^['"]|['"]$/g, '') : null;
    entries.push({
      name,
      required,
      default: def,
      comments: pendingComments.slice(),
    });
    pendingComments = [];
  } else if (!trimmed.startsWith('}')) {
    // Continuation line of a multi-line field — ignore for the example.
  }
}

const lines_out = [];
lines_out.push('# ─────────────────────────────────────────────────────────────');
lines_out.push('# .env.example — auto-generated from src/lib/env.ts');
lines_out.push('# Regenerate with: pnpm env:example');
lines_out.push('# Copy to .env.local and fill in real values.');
lines_out.push('# ─────────────────────────────────────────────────────────────');
lines_out.push('');

for (const e of entries) {
  for (const c of e.comments) lines_out.push(`# ${c}`);
  const reqMark = e.required ? '  # REQUIRED' : '';
  const defStr = e.default !== null ? e.default : '';
  lines_out.push(`${e.name}=${defStr}${reqMark}`);
  lines_out.push('');
}

writeFileSync(examplePath, lines_out.join('\n'));
console.log(`✓ Wrote ${examplePath} (${entries.length} env vars)`);

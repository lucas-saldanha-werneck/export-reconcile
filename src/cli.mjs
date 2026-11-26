#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseCsv, reconcile, formatReport } from './reconcile.mjs';

const args = process.argv.slice(2);
const get = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
if (args.includes('--help') || !get('left') || !get('right') || !get('key')) {
  console.log(`Usage: export-reconcile --left a.csv --right b.csv --key cnpj [--right-key col]
       [--key-kind cnpj|email|digits|text] [--fields name,email:email,city] [--json]
Field spec: leftCol[:kind] or leftCol=rightCol[:kind]. Exit code 1 when drift is found.`);
  process.exit(args.includes('--help') ? 0 : 2);
}
const fields = (get('fields', '') || '').split(',').filter(Boolean).map((s) => {
  const [cols, kind] = s.split(':');
  const [l, r] = cols.split('=');
  return { left: l, right: r, kind };
});
const result = reconcile(parseCsv(readFileSync(get('left'), 'utf8')), parseCsv(readFileSync(get('right'), 'utf8')), {
  key: get('key'), rightKey: get('right-key'), keyKind: get('key-kind', 'text'), fields,
});
console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : formatReport(result));
const bad = result.onlyLeft.length + result.onlyRight.length + result.mismatches.length + result.duplicates.length
  + result.invalidKeys.left.length + result.invalidKeys.right.length;
process.exit(bad ? 1 : 0);

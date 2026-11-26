import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseCsv, validCnpj, normalizers, reconcile } from '../src/reconcile.mjs';

const erp = parseCsv(readFileSync(new URL('../examples/erp.csv', import.meta.url), 'utf8'));
const crm = parseCsv(readFileSync(new URL('../examples/crm.csv', import.meta.url), 'utf8'));
const opts = { key: 'cnpj', keyKind: 'cnpj', fields: [{ left: 'name' }, { left: 'email', kind: 'email' }, { left: 'city' }] };

test('parseCsv handles quotes, commas, CRLF and BOM', () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: 'say "hi"' }]);
});

test('validCnpj accepts good check digits and rejects bad ones', () => {
  assert.equal(validCnpj('10001117000143'), true);
  assert.equal(validCnpj('10005585000169'), false);
  assert.equal(validCnpj('11111111111111'), false);
  assert.equal(validCnpj('123'), false);
});

test('normalizers ignore formatting, case, accents and company suffix', () => {
  assert.equal(normalizers.cnpj('10.001.117/0001-43'), '10001117000143');
  assert.equal(normalizers.email(' A@B.com '), 'a@b.com');
  assert.equal(normalizers.text('Auto Peças Beta LTDA.'), normalizers.text('auto pecas beta'));
});

test('example: formatting-only differences do not count as missing', () => {
  const r = reconcile(erp, crm, opts);
  assert.equal(r.counts.naiveOnlyLeft, 5);
  assert.equal(r.counts.matched, 7);
  assert.deepEqual(r.onlyLeft.map((x) => x.key), ['10005585000196', '10007819000134', '10011170000125']);
});

test('example: finds the extra CRM record, the duplicate, the bad key and real mismatches', () => {
  const r = reconcile(erp, crm, opts);
  assert.deepEqual(r.onlyRight.map((x) => x.key), ['10005585000169', '10099999000150']);
  assert.deepEqual(r.duplicates, [{ side: 'right', key: '10004468000108', lines: [5, 6] }]);
  assert.equal(r.invalidKeys.right.length, 2);
  const fields = r.mismatches.map((m) => `${m.key}:${m.field}`).sort();
  assert.deepEqual(fields, ['10003351000100:city', '10006702000136:email']);
});

test('empty key is reported, not matched', () => {
  const r = reconcile([{ cnpj: '' }], [{ cnpj: '' }], opts);
  assert.equal(r.counts.matched, 0);
  assert.equal(r.invalidKeys.left[0].reason, 'empty key');
});

test('cli exits 1 on drift and prints the report', () => {
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
  const base = [cli, '--left', 'examples/erp.csv', '--right', 'examples/crm.csv', '--key', 'cnpj', '--key-kind', 'cnpj', '--fields', 'name,email:email,city'];
  const res = spawnSync('node', base, { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.equal(res.status, 1);
  assert.match(res.stdout, /Only in left \(3\)/);
  const same = spawnSync('node', [cli, '--left', 'examples/erp.csv', '--right', 'examples/erp.csv', '--key', 'cnpj', '--key-kind', 'cnpj'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.equal(same.status, 0);
});

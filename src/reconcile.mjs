// Compare two customer exports (e.g. ERP and CRM) and report drift.
// Zero dependencies. All example data in this repo is invented.

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x !== '')) rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function validCnpj(digits) {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const dv = (base, w) => {
    const s = base.split('').reduce((a, x, i) => a + Number(x) * w[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = dv(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(digits.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${d1}${d2}`);
}

const strip = (v) =>
  String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(ltda|me|epp|sa|s\/a|eireli)\b/g, '').replace(/[^a-z0-9@]+/g, ' ').trim();

export const normalizers = {
  cnpj: (v) => String(v).replace(/\D/g, '').padStart(14, '0'),
  digits: (v) => String(v).replace(/\D/g, ''),
  email: (v) => String(v).trim().toLowerCase(),
  text: strip,
};

// opts: { key: 'cnpj', rightKey?, keyKind: 'cnpj'|'email'|'text', fields: [{left, right?, kind?}] }
export function reconcile(left, right, opts) {
  const lk = opts.key, rk = opts.rightKey ?? opts.key;
  const kind = opts.keyKind ?? 'text';
  const norm = normalizers[kind];
  const fields = (opts.fields ?? []).map((f) => ({ left: f.left, right: f.right ?? f.left, kind: f.kind ?? 'text' }));

  const index = (rows, col) => {
    const map = new Map(), invalid = [];
    rows.forEach((row, i) => {
      const raw = row[col] ?? '';
      const k = String(raw).trim() === '' ? '' : norm(raw);
      if (!k) return invalid.push({ line: i + 2, raw, reason: 'empty key' });
      if (kind === 'cnpj' && !validCnpj(k)) invalid.push({ line: i + 2, raw, reason: 'bad check digits' });
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ line: i + 2, row });
    });
    return { map, invalid };
  };

  const L = index(left, lk), R = index(right, rk);
  const onlyLeft = [], onlyRight = [], mismatches = [], duplicates = [];
  let matched = 0;

  for (const [k, ls] of L.map) {
    const rs = R.map.get(k);
    if (!rs) { onlyLeft.push({ key: k, line: ls[0].line }); continue; }
    matched++;
    if (ls.length > 1) duplicates.push({ side: 'left', key: k, lines: ls.map((x) => x.line) });
    if (rs.length > 1) duplicates.push({ side: 'right', key: k, lines: rs.map((x) => x.line) });
    for (const f of fields) {
      const a = ls[0].row[f.left] ?? '', b = rs[0].row[f.right] ?? '';
      if (normalizers[f.kind](a) !== normalizers[f.kind](b))
        mismatches.push({ key: k, field: f.left, left: a, right: b });
    }
  }
  for (const [k, rs] of R.map) if (!L.map.has(k)) onlyRight.push({ key: k, line: rs[0].line });

  // What a plain string join would report, to show how many "differences" are only formatting.
  const rawL = new Set(left.map((r) => r[lk])), rawR = new Set(right.map((r) => r[rk]));
  const naiveOnlyLeft = [...rawL].filter((x) => !rawR.has(x)).length;

  return {
    counts: { left: left.length, right: right.length, matched, naiveOnlyLeft },
    onlyLeft, onlyRight, mismatches, duplicates,
    invalidKeys: { left: L.invalid, right: R.invalid },
  };
}

export function formatReport(r, names = { left: 'left', right: 'right' }) {
  const o = [];
  o.push(`${names.left}: ${r.counts.left} rows | ${names.right}: ${r.counts.right} rows | matched: ${r.counts.matched}`);
  o.push(`A plain string join would call ${r.counts.naiveOnlyLeft} ${names.left} keys missing; after normalizing, ${r.onlyLeft.length} are.`);
  const sec = (title, items, fn) => { if (items.length) { o.push('', `${title} (${items.length})`); items.forEach((x) => o.push('  - ' + fn(x))); } };
  sec(`Only in ${names.left}`, r.onlyLeft, (x) => `${x.key} (line ${x.line})`);
  sec(`Only in ${names.right}`, r.onlyRight, (x) => `${x.key} (line ${x.line})`);
  sec('Field mismatches', r.mismatches, (x) => `${x.key} ${x.field}: "${x.left}" vs "${x.right}"`);
  sec('Duplicate keys', r.duplicates, (x) => `${x.side}: ${x.key} on lines ${x.lines.join(', ')}`);
  sec(`Invalid keys in ${names.left}`, r.invalidKeys.left, (x) => `line ${x.line}: "${x.raw}" ${x.reason}`);
  sec(`Invalid keys in ${names.right}`, r.invalidKeys.right, (x) => `line ${x.line}: "${x.raw}" ${x.reason}`);
  return o.join('\n') + '\n';
}

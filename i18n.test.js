import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AM, setLang, t } from './i18n.js';

test('every t("…") text in the app has an Amharic translation', () => {
  const files = ['ui.js', 'app.js', 'store.js', ...fs.readdirSync('screens').map(f => `screens/${f}`)];
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\((['"`])((?:(?!\1).)+)\1/g)) if (!(m[2] in AM)) missing.push(`${f}: ${m[2]}`);
  }
  assert.deepEqual(missing, []);
});

test('t fills {placeholders} and falls back to English', () => {
  setLang('en');
  assert.equal(t('{n} left', { n: 5 }), '5 left');
  setLang('am');
  assert.equal(t('{n} left', { n: 5 }), '5 ቀርቷል');
  assert.equal(t('Not in the list'), 'Not in the list');
  setLang('en');
});

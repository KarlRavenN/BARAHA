import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToPlain, makeSnippet, highlightParts } from '../js/core/search-text.js';
import { createMemoryBackend } from './memory-backend.js';
import { setBackend, globalSearch, createBattle } from '../js/core/store.js';

test('raw editor HTML becomes readable lines, with no tags left', () => {
  assert.equal(htmlToPlain('line one<br>detective line'), 'line one\ndetective line');
  assert.equal(htmlToPlain('<div>first</div><div>second<br></div>'), 'first\nsecond');
  assert.equal(htmlToPlain('a&nbsp;&amp;&nbsp;b &lt;3 &#39;ok&#39;'), "a & b <3 'ok'");
  assert.ok(!/[<>]/.test(htmlToPlain('<span style="color:red">hi</span><br/>there')));
});

test('dangerous HTML is removed and never rendered as markup', () => {
  const out = htmlToPlain('ok<script>alert(1)</script><img src=x onerror=alert(2)><b onclick="x">bold</b>');
  assert.equal(out, 'okbold');
  assert.ok(!out.includes('<') && !out.includes('script') && !out.includes('onerror'));
});

test('snippet shows the matching line and keeps the match visible in long text', () => {
  const plain = 'intro line\nthe detective walks in\nnext line here';
  assert.equal(makeSnippet(plain, 'detective'), 'the detective walks in / next line here');
  const long = 'x'.repeat(200) + ' detective ' + 'y'.repeat(200);
  const snip = makeSnippet(long, 'detective', 60);
  assert.ok(snip.includes('detective'), snip);
  assert.ok(snip.length <= 62);
});

test('highlight: exact word, phrase, case-insensitive, and words when the phrase is split', () => {
  assert.deepEqual(highlightParts('The Detective came', 'detective'), [
    { t: 'The ', hit: false }, { t: 'Detective', hit: true }, { t: ' came', hit: false }]);
  const phrase = highlightParts('hold the line tonight', 'the line');
  assert.deepEqual(phrase.filter((p) => p.hit).map((p) => p.t), ['the line']);
  const words = highlightParts('line and one more', 'line one');
  assert.ok(words.some((p) => p.hit && p.t.toLowerCase() === 'line'));
  assert.deepEqual(highlightParts('anything', ''), [{ t: 'anything', hit: false }]);
});

test('highlight treats regex characters literally', () => {
  const parts = highlightParts('price (x+y) = 5', '(x+y)');
  assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.t), ['(x+y)']);
});

test('global search finds the line, shows clean text, and leaves the stored data unchanged', async () => {
  const be = createMemoryBackend({ now: () => Date.parse('2030-06-01T10:00:00Z') });
  setBackend(be);
  const battle = await createBattle({ title: 'Yoraven vs Bat', opponentName: 'Bat' });
  const stored = '<div>opening bars</div><div>the detective <b>walks</b> in<br>second line</div>';
  await be.batch([{ op: 'put', store: 'finalMaterials', value: { roundId: battle.rounds[0].id, battleId: battle.battle.id, text: stored } }]);
  const { results } = await globalSearch('detective');
  const hit = results.find((r) => r.type === 'Final Material');
  assert.ok(hit, 'found');
  assert.equal(hit.subtitle, 'the detective walks in / second line');
  assert.ok(!/[<>]/.test(hit.subtitle));
  const row = (await be.getAll('finalMaterials'))[0];
  assert.equal(row.text, stored, 'stored HTML is not modified');
});

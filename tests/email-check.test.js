import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEmail, editDistance } from '../js/core/email-check.js';

test('common providers are accepted, case and spaces ignored', () => {
  assert.deepEqual(checkEmail(' Karl@Gmail.com '), { ok: true, email: 'karl@gmail.com' });
  for (const d of ['yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com.ph']) {
    assert.equal(checkEmail(`a@${d}`).ok, true, d);
  }
});

test('typos get a suggestion', () => {
  const r = checkEmail('karl@gmial.com');
  assert.equal(r.ok, false);
  assert.equal(r.suggestion, 'karl@gmail.com');
  assert.equal(checkEmail('karl@gmail.co').suggestion, 'karl@gmail.com');
  assert.equal(checkEmail('karl@yaho.com').suggestion, 'karl@yahoo.com');
});

test('unknown domains are rejected without a suggestion', () => {
  const r = checkEmail('karl@example-company.xyz');
  assert.equal(r.ok, false);
  assert.equal(r.suggestion, undefined);
  assert.match(r.message, /not a supported email provider/);
});

test('bad format is rejected', () => {
  for (const bad of ['', 'karl', 'karl@', '@gmail.com', 'karl@gmail', 'ka rl@gmail.com', '.karl@gmail.com']) {
    assert.equal(checkEmail(bad).ok, false, bad);
  }
});

test('edit distance', () => {
  assert.equal(editDistance('gmail.com', 'gmail.com'), 0);
  assert.equal(editDistance('gmial.com', 'gmail.com'), 2);
});

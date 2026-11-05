import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTrailer, validateNote } from '../src/validate.js';

test('applies defaults for a minimal valid trailer', () => {
  const { errors, value } = validateTrailer({ trailer_number: ' T-100 ', carrier: 'ACME' });
  assert.deepEqual(errors, {});
  assert.equal(value.trailer_number, 'T-100');
  assert.equal(value.status, 'arrived');
  assert.equal(value.load_type, 'live');
  assert.equal(value.condition, 'ok');
  assert.equal(value.seal_intact, 1);
  assert.ok(!Number.isNaN(Date.parse(value.arrived_at)));
});

test('requires trailer_number and carrier on create', () => {
  const { errors } = validateTrailer({});
  assert.equal(errors.trailer_number, 'Required');
  assert.equal(errors.carrier, 'Required');
});

test('partial mode only validates provided fields', () => {
  assert.deepEqual(validateTrailer({ door: '12' }, { partial: true }).errors, {});
  assert.equal(validateTrailer({ carrier: '' }, { partial: true }).errors.carrier, 'Required');
});

test('rejects bad enums, numbers, dates and types', () => {
  const { errors } = validateTrailer({
    trailer_number: 5, carrier: 'x'.repeat(101), status: 'lost', load_type: 'x', condition: 'x',
    seal_intact: 'yes', pallet_count: 1.5, temperature_f: 999, arrived_at: 'nope',
  });
  for (const k of ['trailer_number', 'carrier', 'status', 'load_type', 'condition', 'seal_intact', 'pallet_count', 'temperature_f', 'arrived_at']) {
    assert.ok(errors[k], `expected error for ${k}`);
  }
});

test('allows clearing optional numeric fields and normalizes dates', () => {
  const { errors, value } = validateTrailer(
    { pallet_count: '', temperature_f: null, arrived_at: '2026-01-02T03:04:05-05:00' }, { partial: true });
  assert.deepEqual(errors, {});
  assert.equal(value.pallet_count, null);
  assert.equal(value.temperature_f, null);
  assert.equal(value.arrived_at, '2026-01-02T08:04:05.000Z');
});

test('rejects non-object bodies', () => {
  assert.ok(validateTrailer([]).errors._);
  assert.ok(validateTrailer(null).errors._);
  assert.ok(validateNote('x').errors._);
});

test('validateNote trims and enforces limits', () => {
  assert.deepEqual(validateNote({ body: '  hi ', author: ' Bo ' }).value, { body: 'hi', author: 'Bo' });
  assert.equal(validateNote({ body: '   ' }).errors.body, 'Required');
  assert.ok(validateNote({ body: 'x'.repeat(2001) }).errors.body);
  assert.ok(validateNote({ body: 'ok', author: 5 }).errors.author);
});

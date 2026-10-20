import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PALETTE,
  SHADES,
  generate,
  hexToRgb,
  hsbToHex,
  normalizeHex,
  rgbToHsb
} from '../assets/js/palette-engine.js';

const HEX_PATTERN = /^#[0-9A-F]{6}$/;

test('normalizeHex accepts a hashless value and normalizes case', () => {
  assert.equal(normalizeHex('6750a4'), '#6750A4');
  assert.equal(normalizeHex('#AbCdEf'), '#ABCDEF');
});

test('normalizeHex rejects invalid RGB hex values', () => {
  assert.throws(() => normalizeHex(''), /valid six-digit hex/i);
  assert.throws(() => normalizeHex('#123'), /valid six-digit hex/i);
  assert.throws(() => normalizeHex('#GGGGGG'), /valid six-digit hex/i);
});

test('hexToRgb converts channels to integer RGB values', () => {
  assert.deepEqual(hexToRgb('#12A0FF'), { r: 18, g: 160, b: 255 });
});

test('rgbToHsb returns expected primary and grayscale values', () => {
  assert.deepEqual(rgbToHsb('#FF0000'), { h: 0, s: 100, b: 100 });
  assert.deepEqual(rgbToHsb('#808080'), { h: 0, s: 0, b: 128 / 255 * 100 });
});

test('hsbToHex converts primary HSB values into RGB hex', () => {
  assert.equal(hsbToHex(0, 100, 100), '#FF0000');
  assert.equal(hsbToHex(120, 100, 100), '#00FF00');
  assert.equal(hsbToHex(240, 100, 100), '#0000FF');
});

test('generate returns all ten shades and preserves the seed at shade 600', () => {
  const seed = '#6750A4';
  const result = generate(seed, 20);

  assert.equal(result.colors.length, SHADES.length);
  assert.deepEqual(result.colors.map(color => color.name), SHADES.map(shade => `BrandPrimary${shade}`));
  assert.equal(result.colors.find(color => color.name === 'BrandPrimary600').hex, seed);
  assert.ok(result.colors.every(color => HEX_PATTERN.test(color.hex)));
  assert.equal(result.mode, 'generated');
});

test('generate uses the exact approved palette for a very dark seed', () => {
  const result = generate('#110000', 20);

  assert.equal(result.mode, 'fallback');
  assert.deepEqual(result.colors, DEFAULT_PALETTE.map(([name, hex]) => ({ name, hex })));
  assert.match(result.reason, /default palette/i);
});

test('generated shades remain stable in ordering for a low-saturation seed', () => {
  const result = generate('#777777', 20);

  assert.equal(result.colors.length, 10);
  assert.equal(result.colors[5].name, 'BrandPrimary600');
  assert.equal(result.colors[5].hex, '#777777');
});

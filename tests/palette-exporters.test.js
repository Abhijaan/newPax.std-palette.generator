import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../assets/js/palette-engine.js';
import {
  assetContents,
  kotlinExport,
  paletteObject,
  swiftExport,
  xmlExport
} from '../assets/js/palette-exporters.js';

const palette = generate('#6750A4', 20);

test('paletteObject includes versioning, seed metadata, and named colors', () => {
  const result = paletteObject(palette, '#6750A4');

  assert.equal(result.schemaVersion, '1.0.0');
  assert.equal(result.seed, '#6750A4');
  assert.equal(result.colors.BrandPrimary600, '#6750A4');
  assert.equal(result.mode, 'generated');
});

test('Android XML export contains every shade in a resources element', () => {
  const xml = xmlExport(palette);

  assert.match(xml, /^<\?xml/);
  assert.match(xml, /<resources>/);
  assert.match(xml, /<color name="brandprimary600">#6750A4<\/color>/);
  assert.match(xml, /<\/resources>/);
});

test('Jetpack Compose export uses the fixed BrandColorPalette constructor template', () => {
  const kotlin = kotlinExport(palette);

  assert.match(kotlin, /^private val BRAND_COLOR_PALETTE = BrandColorPalette\(/);
  assert.match(kotlin, /brandPrimary100 = Color\(0xFF[0-9A-F]{6}\)/);
  assert.match(kotlin, /brandPrimary600 = Color\(0xFF6750A4\), \/\/ Core brand colour/);
  assert.match(kotlin, /brandPrimary1000 = Color\(0xFF[0-9A-F]{6}\)\n\)\n?$/);
  assert.doesNotMatch(kotlin, /object BrandPrimary|shade600/);
});

test('Swift export contains the seed shade', () => {
  assert.match(swiftExport(palette), /static let shade600 = Color\(/);
});

test('Xcode asset Contents.json is valid JSON with sRGB components', () => {
  const result = JSON.parse(assetContents('#123456'));

  assert.equal(result.info.author, 'xcode');
  assert.equal(result.colors[0].color.colorSpace, 'srgb');
  assert.equal(result.colors[0].color.components.red, (0x12 / 255).toFixed(6));
});

/**
 * Palette page controller.
 *
 * Owns DOM events, palette rendering, preview state, and browser interactions.
 * Color math lives in palette-engine.js; file serialization lives in
 * palette-exporters.js so both modules remain independently testable.
 */
import { generate, normalizeHex, rgbToHsb } from './palette-engine.js';
import {
  assetContents,
  kotlinExport,
  paletteObject,
  swiftExport,
  xmlExport
} from './palette-exporters.js';
import { downloadElementScreenshot } from './preview-screenshots.js';

const $ = id => document.getElementById(id);
const DEFAULT_SEED = '#6750A4';
const TOAST_DURATION_MS = 1700;
const DOWNLOAD_URL_REVOKE_DELAY_MS = 1000;

let currentPalette = null;
let toastTimeoutId;

/** Show a short, accessible status message without blocking the UI. */
function toast(message) {
  const element = $('toast');
  if (!element) return;

  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => element.classList.remove('show'), TOAST_DURATION_MS);
}

/**
 * Render palette swatches and apply the current palette to the mobile preview.
 * The mobile preview uses CSS custom properties so its layout remains in CSS.
 */
function renderPalette() {
  if (!currentPalette) return;

  const paletteContainer = $('palette');
  paletteContainer.replaceChildren();

  currentPalette.colors.forEach(({ name, hex }) => {
    const shade = name.replace('BrandPrimary', '');
    const card = document.createElement('div');
    card.className = 'swatch';
    card.title = `Copy ${hex}`;
    card.addEventListener('click', () => copyText(hex));

    const color = document.createElement('div');
    color.className = 'swatchcolor';
    color.style.background = hex;
    color.title = `Copy ${hex}`;
    color.tabIndex = 0;
    color.setAttribute('role', 'button');
    color.setAttribute('aria-label', `Copy ${name} ${hex}`);
    color.addEventListener('click', () => copyText(hex));
    color.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      copyText(hex);
    });

    const metadata = document.createElement('div');
    metadata.className = 'swatchmeta';

    const nameElement = document.createElement('div');
    nameElement.className = 'swatchname';
    nameElement.textContent = name;

    const hexElement = document.createElement('div');
    hexElement.className = 'swatchhex';
    hexElement.textContent = hex;

    const hsb = rgbToHsb(hex);
    const hsbElement = document.createElement('div');
    hsbElement.className = 'swatchhsb';
    hsbElement.textContent = `H ${hsb.h.toFixed(1)}° · S ${hsb.s.toFixed(1)}% · B ${hsb.b.toFixed(1)}%`;

    metadata.append(nameElement, hexElement, hsbElement);

    if (shade === '600') {
      const seedTag = document.createElement('div');
      seedTag.className = 'seedtag';
      seedTag.textContent = currentPalette.mode === 'fallback' ? 'Default 600' : 'SEED';
      metadata.append(seedTag);
    }

    card.append(color, metadata);
    paletteContainer.append(card);
  });

  const getShade = shade => currentPalette.colors.find(color =>
    color.name === `BrandPrimary${shade}`
  ).hex;

  const primary = getShade(600);
  const lightBackground = getShade(100);
  const lightOutline = getShade(200);
  const promoEnd = getShade(800);
  const darkOutline = getShade(900);
  const darkBackground = getShade(1000);
  const phone = $('phonePreview');
  const isLightMode = phone.dataset.mode !== 'dark';
  const onPrimary = normalizeHex($(isLightMode ? 'onPrimaryLightHex' : 'onPrimaryDarkHex').value);

  phone.style.setProperty('--mock-primary', primary);
  phone.style.setProperty('--on-primary', onPrimary);
  phone.style.setProperty('--promo-end', promoEnd);

  // Keep the phone mockup's neutral surfaces distinct from the website theme.
  const previewTokens = isLightMode
    ? {
        '--mock-bg': lightBackground,
        '--mock-text': '#242424',
        '--mock-surface': '#FFFFFF',
        '--mock-input': '#E8E8E8',
        '--mock-muted': '#777777',
        '--mock-outline': lightOutline,
        '--map-bg': '#F2F3F3',
        '--map-road': '#FFFFFF',
        '--map-road2': '#D6D9DC',
        '--map-water': '#7AAAB5'
      }
    : {
        '--mock-bg': darkBackground,
        '--mock-text': '#F4F4F4',
        '--mock-surface': '#202020',
        '--mock-input': '#454545',
        '--mock-muted': '#BBBBBB',
        '--mock-outline': darkOutline,
        '--map-bg': '#383B43',
        '--map-road': '#252830',
        '--map-road2': '#555A64',
        '--map-water': '#4C6676'
      };

  Object.entries(previewTokens).forEach(([property, value]) => {
    phone.style.setProperty(property, value);
  });
  phone.style.setProperty('--route', primary);

  $('lightModeBtn').classList.toggle('active', isLightMode);
  $('darkModeBtn').classList.toggle('active', !isLightMode);
  $('lightModeBtn').setAttribute('aria-pressed', String(isLightMode));
  $('darkModeBtn').setAttribute('aria-pressed', String(!isLightMode));

  const { h, s, b } = currentPalette.hsb;
  const heading = currentPalette.mode === 'fallback'
    ? 'Default palette selected'
    : 'Custom palette generated';
  $('status').innerHTML = `<strong>${heading}</strong><br>HSB: H ${h.toFixed(1)}° · S ${s.toFixed(1)}% · B ${b.toFixed(1)}%<br>${currentPalette.reason}`;
}

/** Validate the seed field, generate a palette, and refresh all dependent UI. */
function generateFromInput() {
  try {
    const seed = normalizeHex($('seedHex').value);
    $('seedHex').value = seed;
    $('seedPicker').value = seed;
    $('seedHex').removeAttribute('aria-invalid');

    currentPalette = generate(seed, Number($('threshold').value));
    renderPalette();
  } catch (error) {
    $('seedHex').setAttribute('aria-invalid', 'true');
    toast(error.message || 'Could not generate a palette.');
  }
}

/** Copy text using the Clipboard API, with a legacy fallback when unavailable. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${text}`);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();

    const copied = document.execCommand('copy');
    textarea.remove();
    toast(copied ? `Copied ${text}` : 'Clipboard access is unavailable in this browser.');
  }
}

/** Download text content as a browser-generated file. */
function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), DOWNLOAD_URL_REVOKE_DELAY_MS);
}

/** Download one Xcode color asset JSON payload for each generated shade. */
function downloadIosAssets() {
  if (!currentPalette) return;

  // Browser downloads are initiated one at a time to avoid dropping rapid clicks.
  const files = currentPalette.colors.map(color => ({
    filename: `${color.name}.colorset-Contents.json`,
    content: assetContents(color.hex)
  }));

  files.forEach((file, index) => {
    setTimeout(() => downloadTextFile(file.filename, file.content, 'application/json'), index * 120);
  });

  toast('Downloading 10 Asset Catalog JSON files. Place each JSON in its matching .colorset folder.');
}

/** Route each export button to the matching pure serializer. */
document.querySelectorAll('[data-export]').forEach(button => {
  button.addEventListener('click', () => {
    if (!currentPalette) return;

    switch (button.dataset.export) {
      case 'json':
        downloadTextFile(
          'brand-primary-palette.json',
          `${JSON.stringify(paletteObject(currentPalette, $('seedHex').value), null, 2)}\n`,
          'application/json'
        );
        break;
      case 'xml':
        downloadTextFile('colors.xml', xmlExport(currentPalette), 'application/xml');
        break;
      case 'kotlin':
        downloadTextFile('BrandPrimary.kt', kotlinExport(currentPalette));
        break;
      case 'swift':
        downloadTextFile('BrandPrimary.swift', swiftExport(currentPalette));
        break;
      case 'ios':
        downloadIosAssets();
        break;
      default:
        console.warn(`Unsupported palette export: ${button.dataset.export}`);
    }
  });
});

/** Keep a color picker and its hexadecimal input synchronized. */
function bindColorPair(pickerId, hexId) {
  const picker = $(pickerId);
  const input = $(hexId);

  picker.addEventListener('input', () => {
    input.value = picker.value.toUpperCase();
    input.removeAttribute('aria-invalid');
    renderPalette();
  });

  input.addEventListener('change', () => {
    try {
      const value = normalizeHex(input.value);
      input.value = value;
      picker.value = value;
      input.removeAttribute('aria-invalid');
      renderPalette();
    } catch {
      input.setAttribute('aria-invalid', 'true');
      toast('Enter a valid six-digit HEX color.');
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Initial page event bindings                                                 */
/* -------------------------------------------------------------------------- */
bindColorPair('onPrimaryLightPicker', 'onPrimaryLightHex');
bindColorPair('onPrimaryDarkPicker', 'onPrimaryDarkHex');

$('lightModeBtn').addEventListener('click', () => {
  $('phonePreview').dataset.mode = 'light';
  renderPalette();
});

$('darkModeBtn').addEventListener('click', () => {
  $('phonePreview').dataset.mode = 'dark';
  renderPalette();
});

document.querySelectorAll('.screen-toggle [data-screen]').forEach(button => {
  button.addEventListener('click', () => {
    const screen = button.dataset.screen;
    $('phonePreview').dataset.screen = screen;

    document.querySelectorAll('.screen-toggle [data-screen]').forEach(tab => {
      const selected = tab.dataset.screen === screen;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
  });
});

$('generateBtn').addEventListener('click', generateFromInput);
$('seedPicker').addEventListener('input', event => {
  $('seedHex').value = event.target.value.toUpperCase();
  generateFromInput();
});
$('seedHex').addEventListener('keydown', event => {
  if (event.key === 'Enter') generateFromInput();
});
$('seedHex').addEventListener('input', () => $('seedHex').removeAttribute('aria-invalid'));
$('threshold').addEventListener('change', generateFromInput);

$('resetBtn').addEventListener('click', () => {
  $('seedHex').value = DEFAULT_SEED;
  $('seedPicker').value = DEFAULT_SEED;
  $('threshold').value = '20';
  generateFromInput();
});

$('copyAllBtn').addEventListener('click', () => {
  if (!currentPalette) return;
  copyText(currentPalette.colors.map(color => `${color.name}: ${color.hex}`).join('\n'));
});

$('downloadHomePreviewScreenshot')?.addEventListener('click', async () => {
  try {
    const result = await downloadElementScreenshot($('phonePreview'), 'blueline-home-preview.png');
    toast(result?.clipboardCopied
      ? 'Home preview downloaded and copied to clipboard'
      : 'Home preview downloaded; clipboard copy is unavailable in this browser');
  } catch (error) {
    toast(error.message || 'Could not capture the preview.');
  }
});

// Initialize the page with the documented default seed.
generateFromInput();

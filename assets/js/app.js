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
// Keep the low-saturation curve threshold internal instead of exposing algorithm tuning in the UI.
const LOW_SATURATION_THRESHOLD = 20;
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
  const paletteIsLightMode = $('phonePreview').dataset.mode !== 'dark';
  // Kotlin ExtraBrandColors uses bd600 as primary in light mode and bd600
  // maps to BrandPrimary500 in dark mode. Highlight the source shade accordingly.
  const primaryShade = paletteIsLightMode ? '600' : '500';

  currentPalette.colors.forEach(({ name, hex }) => {
    const shade = name.replace('BrandPrimary', '');
    const displayName = `Primary ${shade}`;
    const card = document.createElement('div');
    card.className = `swatch${shade === primaryShade ? ' primary-shade' : ''}`;
    card.title = shade === primaryShade
      ? `Primary color for ${paletteIsLightMode ? 'light' : 'dark'} mode — copy ${hex}`
      : `Copy ${hex}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', shade === primaryShade
      ? `${displayName}, primary color for ${paletteIsLightMode ? 'light' : 'dark'} mode, ${hex}; activate to copy`
      : `Copy ${displayName}, ${hex}`);
    card.addEventListener('click', () => copyText(hex));
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      copyText(hex);
    });

    // The color circle is decorative; the parent swatch owns click and keyboard behavior.
    const color = document.createElement('div');
    color.className = 'swatchcolor';
    color.style.background = hex;
    color.setAttribute('aria-hidden', 'true');

    const metadata = document.createElement('div');
    metadata.className = 'swatchmeta';

    const nameElement = document.createElement('div');
    nameElement.className = 'swatchname';
    nameElement.textContent = displayName;

    const hexElement = document.createElement('div');
    hexElement.className = 'swatchhex';
    hexElement.textContent = hex;

    const hsb = rgbToHsb(hex);
    const hsbElement = document.createElement('div');
    hsbElement.className = 'swatchhsb';
    hsbElement.textContent = `H ${hsb.h.toFixed(1)}° · S ${hsb.s.toFixed(1)}% · B ${hsb.b.toFixed(1)}%`;

    metadata.append(nameElement, hexElement, hsbElement);

    // The primary shade changes with preview mode: 600 in light, 500 in dark.
    if (shade === primaryShade) {
      const primaryTag = document.createElement('div');
      primaryTag.className = 'primary-role-tag';
      primaryTag.textContent = `PRIMARY · ${paletteIsLightMode ? 'LIGHT' : 'DARK'}`;
      metadata.append(primaryTag);
    }

    card.append(color, metadata);
    paletteContainer.append(card);
  });

  const getShade = shade => currentPalette.colors.find(color =>
    color.name === `BrandPrimary${shade}`
  ).hex;

  const lightBackground = getShade(100);
  const lightOutline = getShade(200);
  const promoEnd = getShade(800);
  const darkOutline = getShade(900);
  const darkBackground = getShade(1000);
  const phone = $('phonePreview');
  const isLightMode = phone.dataset.mode !== 'dark';
  // Match the Kotlin ExtraBrandColors mapping exactly.
  // Light mode maps bdN directly to BrandPrimaryN.
  // Dark mode reverses the generated scale: bd100=1000 ... bd1000=100.
  // Do not tint or otherwise transform the generated colors.
  const baseBrandShades = Object.fromEntries(
    currentPalette.colors.map(({ name, hex }) => [name.replace('BrandPrimary', ''), hex])
  );
  const darkBrandShades = Object.fromEntries(
    Object.entries(baseBrandShades).map(([shade, hex]) => [String(1100 - Number(shade)), hex])
  );
  const extraBrandColors = isLightMode ? baseBrandShades : darkBrandShades;
  const bd300 = extraBrandColors['300'];
  const bd600 = extraBrandColors['600'];
  const onPrimaryHexId = isLightMode ? 'onPrimaryLightHex' : 'onPrimaryDarkHex';
  const onPrimaryPickerId = isLightMode ? 'onPrimaryLightPicker' : 'onPrimaryDarkPicker';
  let onPrimary;

  // A partially typed HEX value is normal during editing; keep the last valid picker value until it is complete.
  try {
    onPrimary = normalizeHex($(onPrimaryHexId).value);
  } catch {
    onPrimary = $(onPrimaryPickerId).value.toUpperCase();
  }

  phone.style.setProperty('--extra-brand-bd600', bd600);
  phone.style.setProperty('--extra-brand-bd300', bd300);
  // Backward-compatible aliases for existing preview styles.
  phone.style.setProperty('--mock-primary', bd600);
  phone.style.setProperty('--mock-banner-bg', extraBrandColors['900']);
  // Match the Android banner's LocalExtraTextColors tokens exactly.
  phone.style.setProperty('--banner-text100', isLightMode ? '#FFFFFF' : '#111111');
  phone.style.setProperty('--banner-text200', isLightMode ? '#E6E6E6' : '#333333');
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

    currentPalette = generate(seed, LOW_SATURATION_THRESHOLD);
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
    toast(`Copied ${text} to clipboard`);
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
    toast(copied ? `Copied ${text} to clipboard` : 'Clipboard access is unavailable in this browser.');
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

/** Human-readable descriptions of the exact files produced by each export option. */
const EXPORT_FORMAT_HELP = {
  json: 'One .json file containing palette metadata, HSB values, fallback information and all shade HEX values.',
  xml: 'One Android colors.xml resource file containing all ten BrandPrimary color resources.',
  kotlin: 'One .kt file containing a Kotlin object with Jetpack Compose Color declarations.',
  ios: 'Ten Xcode Asset Catalog Contents.json files, one for each shade. Place each file inside its matching .colorset folder.',
  swift: 'One .swift file containing SwiftUI Color declarations for all ten shades.'
};

/** Keep the export description synchronized with the selected output format. */
function updateExportFormatHelp() {
  const format = $('exportFormat').value;
  $('exportFormatHelp').textContent = EXPORT_FORMAT_HELP[format] || 'Choose an export format to see which files will be generated.';
}

/** Export the current palette using the format selected in the output section. */
function exportSelectedFormat() {
  if (!currentPalette) {
    toast('Generate a palette before exporting.');
    return;
  }

  switch ($('exportFormat').value) {
    case 'json':
      downloadTextFile(
        'brand-primary-palette.json',
        `${JSON.stringify(paletteObject(currentPalette, $('seedHex').value), null, 2)}\n`,
        'application/json'
      );
      toast('Exported palette as JSON.');
      break;
    case 'xml':
      downloadTextFile('colors.xml', xmlExport(currentPalette), 'application/xml');
      toast('Exported Android colors.xml.');
      break;
    case 'kotlin':
      downloadTextFile('BrandColorPalette.kt', kotlinExport(currentPalette));
      toast('Exported Kotlin / Compose colors.');
      break;
    case 'swift':
      downloadTextFile('BrandPrimary.swift', swiftExport(currentPalette));
      toast('Exported Swift colors.');
      break;
    case 'ios':
      downloadIosAssets();
      break;
    default:
      toast('Choose a supported export format.');
      console.warn(`Unsupported palette export: ${$('exportFormat').value}`);
  }
}

$('exportFormat').addEventListener('change', updateExportFormatHelp);
$('exportBtn').addEventListener('click', exportSelectedFormat);

/** Keep a color picker and HEX field synchronized, updating the preview as soon as HEX is valid. */
function bindColorPair(pickerId, hexId) {
  const picker = $(pickerId);
  const input = $(hexId);

  picker.addEventListener('input', () => {
    input.value = picker.value.toUpperCase();
    input.removeAttribute('aria-invalid');
    renderPalette();
  });

  // Update on every keystroke once the user has entered a complete valid HEX value.
  input.addEventListener('input', () => {
    try {
      const value = normalizeHex(input.value);
      input.value = value;
      picker.value = value;
      input.removeAttribute('aria-invalid');
      renderPalette();
    } catch {
      // Partial values are expected while typing; validate only when editing is committed.
    }
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

function selectPreviewMode(mode) {
  const isLight = mode === 'light';
  $('phonePreview').dataset.mode = mode;
  // Update selection synchronously; renderPalette also reapplies the same state.
  $('lightModeBtn').classList.toggle('active', isLight);
  $('darkModeBtn').classList.toggle('active', !isLight);
  $('lightModeBtn').setAttribute('aria-pressed', String(isLight));
  $('darkModeBtn').setAttribute('aria-pressed', String(!isLight));
  renderPalette();
}

$('lightModeBtn').addEventListener('click', () => selectPreviewMode('light'));
$('darkModeBtn').addEventListener('click', () => selectPreviewMode('dark'));

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

$('resetBtn').addEventListener('click', () => {
  $('seedHex').value = DEFAULT_SEED;
  $('seedPicker').value = DEFAULT_SEED;
  generateFromInput();
});

$('copyAllBtn').addEventListener('click', () => {
  if (!currentPalette) return;
  copyText(currentPalette.colors.map(color => `Primary ${color.name.replace('BrandPrimary', '')}: ${color.hex}`).join('\n'));
});

$('downloadHomePreviewScreenshot')?.addEventListener('click', async () => {
  try {
    const result = await downloadElementScreenshot($('phonePreview'), 'brand-home-preview.png');
    toast(result?.clipboardCopied
      ? 'Home preview downloaded and copied to clipboard'
      : 'Home preview downloaded; clipboard copy is unavailable in this browser');
  } catch (error) {
    toast(error.message || 'Could not capture the preview.');
  }
});

// Initialize the page with the documented default main brand color and export guidance.
updateExportFormatHelp();
generateFromInput();

/** Image Asset Studio: SVG preparation and export stays in the browser. */
import { downloadElementScreenshot } from '../../assets/js/preview-screenshots.js';
/* -------------------------------------------------------------------------- */
/* DOM access and feature state                                               */
/* -------------------------------------------------------------------------- */
const byId = id => document.getElementById(id);
const state = { baseSvg: '', originalSvg: '', viewBox: null, loaded: false, previewUrls: {}, undoStack: [], selected: { splash: null, brand: null }, offsets: { splash: { x: 0, y: 0 }, brand: { x: 0, y: 0 } }, brandSource: { mode: 'shared', type: 'svg', svgText: '', dataUrl: '', fileName: '' }, brandRasterPoints: [], brandRasterAuto: false, brandRasterUndo: [] };
/**
 * Return whether the currently selected Brand Icon source is ready.
 */
function brandSourceAvailable() { return state.brandSource.mode === 'shared' ? state.loaded : Boolean(state.brandSource.type === 'svg' ? state.brandSource.svgText : state.brandSource.dataUrl); }
/**
 * Resolve the active Brand Icon SVG source or report why it is unavailable.
 */
function brandSvgSource() { if (state.brandSource.mode === 'custom' && state.brandSource.type === 'svg') return state.brandSource.svgText; if (state.brandSource.mode === 'shared' && state.loaded) return state.baseSvg; throw new Error('Choose a Brand Icon SVG/PNG or load the shared SVG first.'); }
/**
 * Reset Brand Icon raster edits and artwork offsets.
 */
function resetBrandRasterEdits() { state.brandRasterPoints = []; state.brandRasterAuto = false; state.brandRasterUndo = []; state.offsets.brand = { x: 0, y: 0 }; }
/**
 * Update the selected source label and shared-source action state.
 */
function updateBrandSourceLabel() { const label = byId('brandSourceModeLabel'); if (label) label.textContent = state.brandSource.mode === 'shared' ? 'Using shared Splash SVG' : `Using own ${state.brandSource.type.toUpperCase()}${state.brandSource.fileName ? ` · ${state.brandSource.fileName}` : ''}`; byId('useSharedBrandSourceBtn').disabled = state.brandSource.mode === 'shared'; }
const status = (message, kind = '') => { const el = byId('assetStatus'); el.textContent = message; el.className = `asset-message ${kind}`.trim(); };
const clampDimension = value => Math.max(1, Math.min(4096, Number.parseInt(value, 10) || 288));

/**
 * Parse and sanitize SVG input before previewing or exporting it.
 */
/* -------------------------------------------------------------------------- */
/* SVG validation, normalization, and export composition                     */
/* -------------------------------------------------------------------------- */
function parseSvgText(text) {
  if (!/<svg\b/i.test(text)) throw new Error('This does not look like SVG markup.');
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse this SVG. Check that the markup is valid.');
  const root = doc.documentElement;
  if (root.localName.toLowerCase() !== 'svg') throw new Error('The document root must be an <svg> element.');
  root.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node => node.remove());
  [root, ...root.querySelectorAll('*')].forEach(node => [...node.attributes].forEach(attr => {
    const name = attr.name.toLowerCase(), value = attr.value.trim();
    if (name.startsWith('on')) node.removeAttribute(attr.name);
    if ((name === 'href' || name.endsWith(':href')) && value && !value.startsWith('#') && !value.startsWith('data:image/')) node.removeAttribute(attr.name);
    if ((name === 'style' || name === 'fill' || name === 'stroke' || name === 'filter') && /url\s*\(\s*['"]?(?!#)/i.test(value)) node.removeAttribute(attr.name);
  }));
  let values;
  const vb = root.getAttribute('viewBox');
  if (vb) values = vb.trim().split(/[\s,]+/).map(Number);
  else {
    const w = parseFloat(root.getAttribute('width')), h = parseFloat(root.getAttribute('height'));
    if (!(w > 0 && h > 0)) throw new Error('SVG needs a valid viewBox or numeric width and height.');
    values = [0, 0, w, h]; root.setAttribute('viewBox', values.join(' '));
  }
  if (values.length !== 4 || values.some(v => !Number.isFinite(v)) || values[2] <= 0 || values[3] <= 0) throw new Error('SVG viewBox must contain four valid numbers and positive dimensions.');
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(values[2])); root.setAttribute('height', String(values[3]));
  return { root, viewBox: values };
}
/**
 * Serialize an SVG DOM tree back into markup.
 */
function serialize(root) { return new XMLSerializer().serializeToString(root); }
/**
 * Read a valid six-digit hexadecimal color from a form control.
 */
function hexColor(id, fallback = '#FFFFFF') { const value = byId(id)?.value?.trim() || fallback; return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
/**
 * Add a generated full-canvas background rectangle to an SVG.
 */
function addCanvasBackground(root, vb, color) {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('data-generated-background', 'true'); rect.setAttribute('x', vb[0]); rect.setAttribute('y', vb[1]); rect.setAttribute('width', vb[2]); rect.setAttribute('height', vb[3]); rect.setAttribute('fill', color);
  root.insertBefore(rect, root.firstChild);
}
/**
 * Build the configured Splash or Brand SVG output without mutating the source.
 */
function buildSvg(kind, exportFile = false) {
  if (kind === 'splash' && !state.loaded) throw new Error('Load a shared SVG first.');
  if (kind === 'brand' && !brandSourceAvailable()) throw new Error('Choose a Brand Icon SVG/PNG or load the shared SVG first.');
  const sourceText = kind === 'brand' ? brandSvgSource() : state.baseSvg;
  const { root, viewBox: original } = parseSvgText(sourceText);
  const [x, y, w, h] = original;
  const isSplash = kind === 'splash';
  const padding = Number(byId(isSplash ? 'splashPadding' : 'brandPadding').value) / 100;
  const scale = Number(byId(isSplash ? 'splashScale' : 'brandScale')?.value || 100) / 100;
  const includeBg = isSplash ? byId('splashIncludeBackground').checked : byId('brandIncludeBackground').checked;
  const bg = hexColor(isSplash ? 'splashBackgroundHex' : 'brandBackgroundHex', '#FFFFFF');
  const side = Math.max(w, h) * (1 + padding * 2);
  const cx = x + w / 2, cy = y + h / 2;
  const square = [cx - side / 2, cy - side / 2, side, side];
  // Keep a fixed square viewBox; scaled artwork outside it is intentionally clipped on export.
  const drawable = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  drawable.setAttribute('data-generated-artwork-group', 'true');
  const offset = state.offsets[kind] || { x: 0, y: 0 };
  const dx = offset.x / 100 * side, dy = offset.y / 100 * side;
  drawable.setAttribute('transform', `translate(${dx} ${dy}) translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`);
  if (!exportFile) {
    [...root.querySelectorAll('*')].forEach((node, index) => node.setAttribute('data-source-index', String(index)));
  }
  if (!exportFile && state.selected[kind] !== null) {
    const target = [...root.querySelectorAll('*')][state.selected[kind]];
    if (target && target !== drawable) { target.setAttribute('stroke', '#ff2d55'); target.setAttribute('stroke-width', String(Math.max(w, h) * 0.012)); target.setAttribute('stroke-dasharray', `${Math.max(w, h) * 0.025} ${Math.max(w, h) * 0.015}`); target.setAttribute('vector-effect', 'non-scaling-stroke'); }
  }
  const children = [...root.childNodes];
  children.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE && node.localName === 'defs') return;
    drawable.appendChild(node);
  });
  // Keep defs outside the transformed group so reusable definitions stay available.
  const defs = children.filter(node => node.nodeType === Node.ELEMENT_NODE && node.localName === 'defs');
  root.replaceChildren();
  defs.forEach(node => root.appendChild(node));
  if (includeBg) { addCanvasBackground(root, square, bg); if (!isSplash && Number(byId('brandCornerRadius')?.value || 0) > 0) { const bgRect = root.querySelector('[data-generated-background]'); if (bgRect) bgRect.setAttribute('rx', square[2] * Number(byId('brandCornerRadius').value) / 100); } }
  root.appendChild(drawable);
  root.setAttribute('viewBox', square.join(' '));
  const targetSize = isSplash ? (includeBg ? 240 : 288) : 200;
  if (!isSplash) {
    const radiusPct = Number(byId('brandCornerRadius')?.value || 0);
    if (radiusPct > 0) {
      let defs = root.querySelector('defs');
      if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); root.insertBefore(defs, root.firstChild); }
      const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath'); clip.setAttribute('id', 'brandRoundedClip'); clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.setAttribute('x', square[0]); rect.setAttribute('y', square[1]); rect.setAttribute('width', square[2]); rect.setAttribute('height', square[3]); rect.setAttribute('rx', square[2] * radiusPct / 100); clip.appendChild(rect); defs.appendChild(clip);
      drawable.setAttribute('clip-path', 'url(#brandRoundedClip)');
    }
  }
  root.setAttribute('width', String(targetSize)); root.setAttribute('height', String(targetSize));
  return { text: serialize(root), viewBox: square, includeBg, bg, targetSize };
}
/**
 * Read the configured color tolerance for connected-pixel removal.
 */
/* -------------------------------------------------------------------------- */
/* Brand Icon raster editing and background removal                           */
/* -------------------------------------------------------------------------- */
function rasterTolerance() { return Number(byId('brandRasterTolerance')?.value || 24); }
/**
 * Remove a connected raster region whose pixels fall within the selected tolerance.
 */
function removeConnectedColor(canvas, x, y, tolerance) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas; if (!width || !height) return;
  const image = ctx.getImageData(0, 0, width, height), data = image.data;
  x = Math.max(0, Math.min(width - 1, Math.round(x))); y = Math.max(0, Math.min(height - 1, Math.round(y)));
  const start = (y * width + x) * 4, target = [data[start], data[start + 1], data[start + 2]];
  const visited = new Uint8Array(width * height), stack = [y * width + x], tol = tolerance * 2.55;
  while (stack.length) {
    const index = stack.pop(); if (index < 0 || index >= width * height || visited[index]) continue;
    visited[index] = 1; const i = index * 4;
    if (Math.abs(data[i] - target[0]) > tol || Math.abs(data[i+1] - target[1]) > tol || Math.abs(data[i+2] - target[2]) > tol) continue;
    data[i+3] = 0; const px = index % width, py = Math.floor(index / width);
    if (px > 0) stack.push(index - 1); if (px < width - 1) stack.push(index + 1); if (py > 0) stack.push(index - width); if (py < height - 1) stack.push(index + width);
  }
  ctx.putImageData(image, 0, 0);
}

// Heuristic: inspect points across the canvas, not just its four outer corners.
// This can find a flat background shape inset within an SVG's own viewBox.
/**
 * Find likely flat background regions by sampling candidate points across the image.
 */
function findLikelyBackgroundSeed(canvas, tolerance) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const tol = Math.max(0, Number(tolerance) || 0) * 2.55;
  const samples = [0.03, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 0.97];
  let best = null;
  const minArea = Math.max(12, Math.floor(width * height * 0.025));

  for (const sy of samples) for (const sx of samples) {
    const x = Math.max(0, Math.min(width - 1, Math.round(sx * (width - 1))));
    const y = Math.max(0, Math.min(height - 1, Math.round(sy * (height - 1))));
    const start = (y * width + x) * 4;
    if (data[start + 3] < 24) continue;
    const target = [data[start], data[start + 1], data[start + 2]];
    const visited = new Uint8Array(width * height), stack = [y * width + x];
    let count = 0, touchesEdge = false;
    while (stack.length) {
      const index = stack.pop();
      if (index < 0 || index >= width * height || visited[index]) continue;
      visited[index] = 1;
      const i = index * 4;
      if (data[i + 3] < 24 || Math.abs(data[i] - target[0]) > tol ||
          Math.abs(data[i + 1] - target[1]) > tol || Math.abs(data[i + 2] - target[2]) > tol) continue;
      count++;
      const px = index % width, py = Math.floor(index / width);
      if (px === 0 || py === 0 || px === width - 1 || py === height - 1) touchesEdge = true;
      if (px > 0) stack.push(index - 1);
      if (px < width - 1) stack.push(index + 1);
      if (py > 0) stack.push(index - width);
      if (py < height - 1) stack.push(index + width);
    }
    if (count < minArea) continue;
    const score = count * (touchesEdge ? 1.12 : 1);
    if (!best || score > best.score) best = { x, y, count, score, touchesEdge };
  }
  return best;
}
/**
 * Rasterize the active Brand Icon source and apply its raster edits.
 */
async function renderBrandRaster(size = 200, includeEdits = true, includeOutputBackground = true) {
  let canvas;
  const includeBg = byId('brandIncludeBackground').checked;
  const bg = hexColor('brandBackgroundHex');
  const radiusPct = Number(byId('brandCornerRadius')?.value || 0);

  if (state.brandSource.mode === 'custom' && state.brandSource.type === 'png') {
    if (!state.brandSource.dataUrl) throw new Error('Choose a Brand Icon PNG first.');
    canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.save();
    if (radiusPct > 0) {
      const radius = size * radiusPct / 100;
      ctx.beginPath(); ctx.roundRect(0, 0, size, size, radius); ctx.clip();
    }
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Could not read the selected Brand Icon PNG.')); img.src = state.brandSource.dataUrl; });
    const padding = Number(byId('brandPadding').value) / 100;
    const scale = Number(byId('brandScale')?.value || 100) / 100;
    const available = size * Math.max(0.05, 1 - padding * 2);
    const fit = Math.min(available / img.naturalWidth, available / img.naturalHeight) * scale;
    const drawW = img.naturalWidth * fit, drawH = img.naturalHeight * fit;
    const offset = state.offsets.brand || { x: 0, y: 0 };
    const dx = offset.x / 100 * size, dy = offset.y / 100 * size;
    ctx.drawImage(img, (size - drawW) / 2 + dx, (size - drawH) / 2 + dy, drawW, drawH);
    ctx.restore();
  } else {
    // Rasterize the artwork without the optional output background so background
    // removal can target the source artwork instead of deleting the chosen output color.
    const includeBackgroundControl = byId('brandIncludeBackground');
    const previousIncludeBackground = includeBackgroundControl.checked;
    let result;
    try {
      includeBackgroundControl.checked = false;
      result = buildSvg('brand', true);
    } finally {
      includeBackgroundControl.checked = previousIncludeBackground;
    }
    const url = URL.createObjectURL(new Blob([result.text], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Could not convert the SVG to PNG.')); img.src = url; });
      canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size, size);
    } finally { URL.revokeObjectURL(url); }
  }

  if (includeEdits) {
    const points = [];
    if (state.brandRasterAuto) points.push([0,0],[size-1,0],[0,size-1],[size-1,size-1]);
    state.brandRasterPoints.forEach(point => points.push([point.x / 200 * size, point.y / 200 * size]));
    for (const [x, y] of points) removeConnectedColor(canvas, x, y, rasterTolerance());
  }

  // Add the requested output background behind the edited raster. This keeps
  // background removal independent from the output background color.
  if (includeBg && includeOutputBackground) {
    const ctx = canvas.getContext('2d');
    ctx.save();
    if (radiusPct > 0) {
      const radius = size * radiusPct / 100;
      ctx.beginPath(); ctx.roundRect(0, 0, size, size, radius); ctx.clip();
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }
  return canvas;
}
/**
 * Refresh the Brand Icon raster preview after a source or edit change.
 */
async function refreshBrandRasterPreview() {
  const img = byId('brandPreviewImage'), empty = byId('brandEmpty');
  if (!brandSourceAvailable()) { img.hidden = true; empty.hidden = false; const phoneImg = byId('brandPhoneImage'); if (phoneImg) phoneImg.hidden = true; return; }
  try { const canvas = await renderBrandRaster(200, true); img.src = canvas.toDataURL('image/png'); img.hidden = false; empty.hidden = true; const phoneImg = byId('brandPhoneImage'); if (phoneImg) { phoneImg.src = img.src; phoneImg.hidden = false; } }
  catch (e) { status(e.message, 'error'); }
}
/**
 * Save a snapshot of Brand Icon raster-edit state for undo.
 */
function saveRasterUndo() { state.brandRasterUndo.push({ auto: state.brandRasterAuto, points: state.brandRasterPoints.map(p => ({...p})) }); if (state.brandRasterUndo.length > 30) state.brandRasterUndo.shift(); updateRasterButtons(); }
/**
 * Synchronize raster cleanup button states with the current edit state.
 */
function updateRasterButtons() { const available = brandSourceAvailable(); byId('brandRasterUndoBtn').disabled = !state.brandRasterUndo.length; byId('brandRasterRestoreBtn').disabled = !available || (!state.brandRasterAuto && !state.brandRasterPoints.length); byId('brandRasterDetectBtn').disabled = !available; }
/**
 * Refresh one Android asset preview and its dimension labels.
 */
/* -------------------------------------------------------------------------- */
/* Preview rendering and SVG editing commands                                */
/* -------------------------------------------------------------------------- */
function refreshImage(kind) {
  if (kind === 'brand') { refreshBrandRasterPreview(); return; }
  const img = byId('splashPreviewImage'), empty = byId('splashEmpty');
  if (!state.loaded) {
    img.hidden = true; empty.hidden = false;
    if (state.previewUrls.splash) { URL.revokeObjectURL(state.previewUrls.splash); delete state.previewUrls.splash; }
    return;
  }
  try {
    const result = buildSvg('splash', false);
    const url = URL.createObjectURL(new Blob([result.text], { type: 'image/svg+xml;charset=utf-8' }));
    if (state.previewUrls.splash) URL.revokeObjectURL(state.previewUrls.splash);
    state.previewUrls.splash = url;
    img.onload = () => { img.hidden = false; empty.hidden = true; };
    img.onerror = () => { img.hidden = true; empty.hidden = false; status('The selected SVG could not be rendered in the Splash preview. Check the SVG markup and references.', 'error'); };
    img.src = url;
  } catch (error) {
    img.hidden = true; empty.hidden = false;
    status(error.message, 'error');
  }
}
/**
 * Refresh all Android asset previews and derived control labels.
 */
function refreshPreviews() {
  const withBg = byId('splashIncludeBackground').checked;
  const canvasDp = withBg ? 240 : 288, safeDp = withBg ? 160 : 192;
  // Render at a visually useful preview size while keeping the exact 240/288 square ratio.
  const previewSide = Math.min(320, Math.max(220, canvasDp));
  byId('splashCanvas').style.width = `${previewSide}px`; byId('splashCanvas').style.height = `${previewSide}px`;
  byId('splashCanvas').style.background = withBg ? hexColor('splashBackgroundHex') : 'transparent';
  byId('splashSafeCircle').style.width = `${safeDp / canvasDp * 100}%`; byId('splashSafeCircle').style.height = `${safeDp / canvasDp * 100}%`;
  byId('splashWindowPreview').classList.add('checkerboard');
  byId('splashCanvas').classList.toggle('checkerboard', !withBg);
  byId('splashPreviewDimensions').textContent = `${canvasDp} × ${canvasDp} dp`;
  byId('splashPaddingValue').textContent = `${byId('splashPadding').value}%`;
  byId('splashScaleValue').textContent = `${byId('splashScale').value}%`;
  byId('splashExportDimensions').textContent = `${canvasDp} × ${canvasDp} px`;
  byId('brandPaddingValue').textContent = `${byId('brandPadding').value}%`;
  if (byId('brandScaleValue')) byId('brandScaleValue').textContent = `${byId('brandScale').value}%`;
  const brandSize = 200;
  byId('brandSquare').style.width = 'min(100%, 200px)'; byId('brandSquare').style.aspectRatio = '1';
  byId('brandSquare').style.background = byId('brandIncludeBackground').checked ? hexColor('brandBackgroundHex') : 'transparent';
  byId('brandSquare').style.borderRadius = `${Number(byId('brandCornerRadius')?.value || 0)}%`;
  byId('brandCornerRadiusValue').textContent = `${byId('brandCornerRadius').value}%`;
  byId('brandPreviewDimensions').textContent = `${brandSize} × ${brandSize} px`;
  byId('brandCanvasInfo').textContent = `${brandSize} × ${brandSize} px`;
  byId('brandPaddingInfo').textContent = `${byId('brandPadding').value}%`;
  byId('brandBackgroundInfo').textContent = byId('brandIncludeBackground').checked ? hexColor('brandBackgroundHex') : 'Transparent';
  const phoneHex = byId('brandPhoneBgHex')?.value?.trim();
  const phoneBg = /^#[0-9a-f]{6}$/i.test(phoneHex || '') ? phoneHex : (byId('brandPhoneBgCustom').value || byId('brandPhoneBgSelect').value || '#F36D21');
  byId('brandPhoneScreen').style.background = phoneBg;
  // Match the Get Started label to the selected preview background color.
  const welcomeButton = byId('brandWelcomeButton');
  if (welcomeButton) welcomeButton.style.color = phoneBg;
  // Keep logo and copy fixed to the reference screenshot; only screen color is customizable.
  const phoneImage = byId('brandPhoneImage'), brandImage = byId('brandPreviewImage'); phoneImage.src = brandImage.src; phoneImage.hidden = !brandSourceAvailable();
  byId('brandPhoneIcon').style.background = byId('brandIncludeBackground').checked ? hexColor('brandBackgroundHex') : 'transparent'; byId('brandPhoneIcon').style.borderRadius = `${Number(byId('brandCornerRadius').value)}%`;
  refreshImage('splash'); refreshImage('brand');
  byId('brandPhoneImage').src = byId('brandPreviewImage').src; byId('brandPhoneImage').hidden = !brandSourceAvailable();
  byId('downloadSplashBtn').disabled = !state.loaded; byId('downloadBrandBtn').disabled = !brandSourceAvailable();
  byId('downloadSplashPreviewScreenshot').disabled = !state.loaded;
  byId('downloadBrandPreviewScreenshot').disabled = !brandSourceAvailable();
  byId('downloadWelcomePreviewScreenshot').disabled = !brandSourceAvailable();
}
/**
 * Populate Brand Icon color choices from the generated palette.
 */
function syncBrandColorOptions() {
  const options = [...document.querySelectorAll('#palette .swatch')].map(card => ({ name: card.querySelector('.swatchname')?.textContent?.trim(), hex: card.querySelector('.swatchhex')?.textContent?.trim() })).filter(c => c.name && /^#[0-9a-f]{6}$/i.test(c.hex));
  [['brandPaletteColor', '#FFFFFF'], ['brandPhoneBgSelect', '#F36D21']].forEach(([id, fallback]) => {
    const select = byId(id); if (!select) return;
    const previous = select.value; select.innerHTML = '';
    select.add(new Option('Custom / white', fallback));
    options.forEach(({ name, hex }) => select.add(new Option(`${name} · ${hex}`, hex)));
    const chosen = options.some(c => c.hex.toLowerCase() === previous.toLowerCase()) ? previous : fallback;
    select.value = chosen;
    if (id === 'brandPhoneBgSelect' && byId('brandPhoneBgCustom') && !byId('brandPhoneBgHex').matches(':focus')) { byId('brandPhoneBgCustom').value = chosen; byId('brandPhoneBgHex').value = chosen.toUpperCase(); }
  });
}
/**
 * Populate SVG element selectors and reset invalid selections.
 */
function populateElementPickers() {
  const kind = 'splash';
  const select = byId(`${kind}ElementSelect`), count = byId(`${kind}ElementCount`);
  const deleteButton = byId(`${kind}DeleteBtn`);
  select.innerHTML = '';
  if (!state.loaded) {
    select.add(new Option('Load an SVG to see elements', '')); select.disabled = true;
    deleteButton.disabled = true; byId(`${kind}DetectBtn`).disabled = true;
    byId(`${kind}UndoBtn`).disabled = true; byId(`${kind}RestoreBtn`).disabled = true;
    count.textContent = '0'; state.selected[kind] = null; return;
  }
  const root = parseSvgText(state.baseSvg).root, elements = [...root.querySelectorAll('*')];
  select.add(new Option(elements.length ? 'Choose an element…' : 'No child elements', ''));
  elements.forEach((node, index) => {
    const id = node.getAttribute('id');
    const label = `${node.localName}${id ? `#${id}` : ''}${node.getAttribute('class') ? `.${node.getAttribute('class').trim().replace(/\\s+/g, '.')}` : ''}`;
    select.add(new Option(`${index + 1}. ${label}`, String(index)));
  });
  select.disabled = !elements.length;
  byId(`${kind}DetectBtn`).disabled = false;
  count.textContent = String(elements.length);
  byId(`${kind}UndoBtn`).disabled = state.undoStack.length === 0;
  byId(`${kind}RestoreBtn`).disabled = !state.originalSvg || state.baseSvg === state.originalSvg;
  if (state.selected[kind] !== null && state.selected[kind] < elements.length) {
    select.value = String(state.selected[kind]);
    deleteButton.disabled = false;
  } else {
    state.selected[kind] = null;
    select.value = '';
    deleteButton.disabled = true;
  }
}
/**
 * Find and remove a likely vector background for the selected asset.
 */
function detectAndRemoveBackground(kind) {
  if (!state.loaded) return;
  try {
    const parsed = parseSvgText(state.baseSvg), root = parsed.root, vb = parsed.viewBox, [vx, vy, vw, vh] = vb;
    const candidates = [...root.children].filter(node => !['defs','title','desc','metadata'].includes(node.localName.toLowerCase()));
    const measuringSvg = root.cloneNode(true);
    measuringSvg.setAttribute('width', '1000'); measuringSvg.setAttribute('height', '1000');
    measuringSvg.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden;overflow:visible'; document.body.appendChild(measuringSvg);
    let best = null, bestArea = 0;
    try {
      for (const candidate of candidates) {
        if (candidate.hasAttribute('data-generated-background')) continue;
        const index = candidates.indexOf(candidate);
        const measureNode = [...measuringSvg.children].filter(n => !['defs','title','desc','metadata'].includes(n.localName.toLowerCase()))[index];
        if (!measureNode || ['text','use'].includes(candidate.localName.toLowerCase())) continue;
        let box; try { box = measureNode.getBBox(); } catch { continue; }
        const fullW = box.width >= vw * .84, fullH = box.height >= vh * .84;
        const nearLeft = box.x <= vx + vw * .08, nearTop = box.y <= vy + vh * .08;
        const nearRight = box.x + box.width >= vx + vw * .92, nearBottom = box.y + box.height >= vy + vh * .92;
        const coversEdges = (fullW && nearTop && nearBottom) || (fullH && nearLeft && nearRight) || (fullW && fullH && nearLeft && nearTop && nearRight && nearBottom);
        const area = box.width * box.height; if (coversEdges && area > bestArea) { best = candidate; bestArea = area; }
      }
    } finally { measuringSvg.remove(); }
    if (!best) { status(`(${kind === 'splash' ? 'Splash' : 'Brand'}) No clear full-canvas background found. Select it in this section's element list to remove it manually.`, 'error'); return; }
    const label = best.localName + (best.id ? `#${best.id}` : ''), index = candidates.indexOf(best);
    state.undoStack.push(state.baseSvg);
    const sourceRoot = parseSvgText(state.baseSvg).root;
    const sourceCandidates = [...sourceRoot.children].filter(node => !['defs','title','desc','metadata'].includes(node.localName.toLowerCase()));
    sourceCandidates[index]?.remove(); state.baseSvg = serialize(sourceRoot); byId('svgSourceInput').value = state.baseSvg;
    state.selected = { splash: null, brand: null }; populateElementPickers(); refreshPreviews(); status(`Removed likely background element (${label}) from the shared SVG.`, 'success');
  } catch (error) { status(`Background detection failed: ${error.message}`, 'error'); }
}
/**
 * Delete the explicitly selected SVG element for one asset.
 */
function deleteSelectedElement(kind) {
  try {
    const rawValue = byId(`${kind}ElementSelect`).value;
    if (rawValue === '' || state.selected[kind] === null) { status('Select an element before deleting it.', 'error'); return; }
    const index = Number(rawValue), parsed = parseSvgText(state.baseSvg), elements = [...parsed.root.querySelectorAll('*')];
    if (!Number.isInteger(index) || !elements[index]) return;
    const target = elements[index], label = `<${target.localName}>${target.id ? `#${target.id}` : ''}`;
    state.undoStack.push(state.baseSvg); target.remove(); state.baseSvg = serialize(parsed.root); byId('svgSourceInput').value = state.baseSvg;
    state.selected = { splash: null, brand: null }; populateElementPickers(); refreshPreviews(); status(`Deleted ${label} from the shared SVG.`, 'success');
  } catch (error) { status(error.message, 'error'); }
}
/**
 * Restore the most recent SVG source snapshot.
 */
function undoSvgChange(kind) {
  const previous = state.undoStack.pop(); if (!previous) return;
  state.baseSvg = previous; byId('svgSourceInput').value = previous;
  const parsed = parseSvgText(previous); state.viewBox = parsed.viewBox; state.selected = { splash: null, brand: null };
  populateElementPickers(); refreshPreviews(); status('Last SVG edit undone.', 'success');
}
/**
 * Restore the original uploaded SVG for the selected asset.
 */
function restoreOriginalSvg(kind) {
  if (!state.originalSvg || state.baseSvg === state.originalSvg) return;
  state.undoStack.push(state.baseSvg); state.baseSvg = state.originalSvg; byId('svgSourceInput').value = state.originalSvg;
  const parsed = parseSvgText(state.originalSvg); state.viewBox = parsed.viewBox; state.selected = { splash: null, brand: null };
  populateElementPickers(); refreshPreviews(); status('Restored the original uploaded SVG.', 'success');
}
/**
 * Update the selected SVG element for the active asset preview.
 */
function selectElement(kind) {
  const rawValue = byId(`${kind}ElementSelect`).value;
  if (rawValue === '') {
    state.selected[kind] = null;
    byId(`${kind}DeleteBtn`).disabled = true;
    refreshPreviews();
    status('Choose an SVG element to highlight, then delete if needed.', '');
    return;
  }
  const index = Number(rawValue), root = parseSvgText(state.baseSvg).root;
  const target = [...root.querySelectorAll('*')][index];
  state.selected[kind] = target ? index : null;
  byId(`${kind}DeleteBtn`).disabled = !target;
  refreshPreviews();
  if (target) status(`Selected <${target.localName}>${target.id ? `#${target.id}` : ''}; it is highlighted in the Splash preview.`, '');
}
/**
 * Adjust artwork translation while preserving the export canvas dimensions.
 */
function moveArtwork(kind, direction, amount = 1) {
  const offset = state.offsets[kind];
  if (direction === 'left') offset.x -= amount; if (direction === 'right') offset.x += amount;
  if (direction === 'up') offset.y -= amount; if (direction === 'down') offset.y += amount;
  offset.x = Math.max(-200, Math.min(200, offset.x)); offset.y = Math.max(-200, Math.min(200, offset.y));
  byId(`${kind}OffsetReadout`).textContent = `X ${offset.x} · Y ${offset.y}`; refreshPreviews();
}
/**
 * Validate and initialize the shared SVG source and dependent previews.
 */
/* -------------------------------------------------------------------------- */
/* Source loading, downloads, and form event bindings                         */
/* -------------------------------------------------------------------------- */
function loadSvg(text) {
  const parsed = parseSvgText(text);
  state.baseSvg = serialize(parsed.root); state.originalSvg = state.baseSvg; state.undoStack = []; state.viewBox = parsed.viewBox; state.loaded = true;
  byId('svgSourceInput').value = state.baseSvg; state.selected.splash = null; state.offsets.splash = { x: 0, y: 0 };
  if (state.brandSource.mode === 'shared') { state.selected.brand = null; resetBrandRasterEdits(); }
  updateRasterButtons(); updateBrandSourceLabel(); populateElementPickers(); refreshPreviews();
}
/**
 * Trigger a browser download for a generated Blob.
 */
function downloadBlob(filename, blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
/**
 * Build and download the configured Android asset in the selected format.
 */
async function exportAsset(kind) {
  try {
    if (kind === 'brand') {
      const resolution = byId('brandPngResolution'); let size = resolution.value === 'custom' ? clampDimension(byId('brandPngCustomSize').value) : 200 * Number(resolution.value || 1); size = clampDimension(size);
      const canvas = await renderBrandRaster(size, true); const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!png) throw new Error('PNG export failed.');
      downloadBlob(`android-brand-icon-${size}.png`, png); status(`Brand icon PNG exported at ${size} × ${size} px.`, 'success'); return;
    }
    const result = buildSvg(kind, true);
    const format = byId(kind === 'splash' ? 'splashExportFormat' : 'brandExportFormat').value;
    const name = kind === 'splash' ? 'android-splash-icon' : 'android-brand-icon';
    if (format === 'svg') { downloadBlob(`${name}.svg`, new Blob([result.text], { type: 'image/svg+xml;charset=utf-8' })); status(`${name}.svg exported.`, 'success'); return; }
    const baseSize = kind === 'splash' ? result.targetSize : 200;
    const resolution = byId(`${kind}PngResolution`);
    let size = baseSize;
    if (resolution?.value === 'custom') size = clampDimension(byId(`${kind}PngCustomSize`).value);
    else if (resolution) size = clampDimension(baseSize * Number(resolution.value || 1));
    const url = URL.createObjectURL(new Blob([result.text], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image(); await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('SVG could not be rendered. Check for unsupported external resources.')); img.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d');
      if (result.includeBg) { ctx.fillStyle = result.bg; ctx.fillRect(0, 0, size, size); }
      ctx.drawImage(img, 0, 0, size, size);
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!png) throw new Error('PNG export failed. Try a smaller size or simplify the SVG.');
      downloadBlob(`${name}-${size}.png`, png); status(`${name} exported at ${size} × ${size} px.`, 'success');
    } finally { URL.revokeObjectURL(url); }
  } catch (error) { status(error.message, 'error'); }
}
/**
 * Synchronize a color picker with its hexadecimal text field.
 */
function bindColorPair(colorId, hexId, refresh = refreshPreviews) {
  byId(colorId).addEventListener('input', () => { byId(hexId).value = byId(colorId).value.toUpperCase(); refresh(); });
  byId(hexId).addEventListener('change', () => { const value = byId(hexId).value.trim(); if (/^#[0-9a-f]{6}$/i.test(value)) byId(colorId).value = value; else byId(hexId).value = byId(colorId).value.toUpperCase(); refresh(); });
}

byId('loadSvgBtn').addEventListener('click', () => { try { loadSvg(byId('svgSourceInput').value.trim()); status('SVG applied successfully.', 'success'); } catch (error) { status(error.message, 'error'); } });
byId('clearSvgBtn').addEventListener('click', () => {
  state.baseSvg = ''; state.originalSvg = ''; state.undoStack = []; state.viewBox = null; state.loaded = false;
  if (state.brandSource.mode === 'shared') resetBrandRasterEdits();
  updateRasterButtons(); Object.values(state.previewUrls).forEach(URL.revokeObjectURL); state.previewUrls = {};
  byId('svgSourceInput').value = ''; byId('svgFileInput').value = ''; state.selected.splash = null; if (state.brandSource.mode === 'shared') state.selected.brand = null; populateElementPickers(); refreshPreviews(); status('Shared SVG cleared.');
});
/**
 * Read and validate a user-selected SVG file.
 */
async function readSvgFile(file) {
  if (!file || (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml')) { status('Choose an SVG file.', 'error'); return; }
  try { loadSvg(await file.text()); status(`Loaded ${file.name}.`, 'success'); } catch (error) { status(error.message, 'error'); }
}
byId('svgFileInput').addEventListener('change', e => readSvgFile(e.target.files?.[0]));
/**
 * Read an image file as a data URL for local previewing.
 */
function readAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the selected file.')); reader.readAsDataURL(file); }); }
byId('chooseBrandSourceBtn').addEventListener('click', () => byId('brandSourceFileInput').click());
byId('brandSourceFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  const lower = file.name.toLowerCase();
  try {
    if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
      const parsed = parseSvgText(await file.text());
      state.brandSource = { mode: 'custom', type: 'svg', svgText: serialize(parsed.root), dataUrl: '', fileName: file.name };
    } else if (lower.endsWith('.png') || file.type === 'image/png') {
      const dataUrl = await readAsDataUrl(file);
      const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('The selected PNG could not be decoded.')); image.src = dataUrl; });
      state.brandSource = { mode: 'custom', type: 'png', svgText: '', dataUrl, fileName: file.name };
    } else throw new Error('Choose an SVG or PNG file.');
    resetBrandRasterEdits(); state.selected.brand = null; updateBrandSourceLabel(); updateRasterButtons(); refreshPreviews();
    status(`Brand Icon source changed to ${file.name}. The shared Splash SVG is unchanged.`, 'success');
  } catch (error) { status(error.message || 'Could not load the Brand Icon source.', 'error'); }
  finally { event.target.value = ''; }
});
byId('useSharedBrandSourceBtn').addEventListener('click', () => {
  state.brandSource = { mode: 'shared', type: 'svg', svgText: '', dataUrl: '', fileName: '' };
  resetBrandRasterEdits(); state.selected.brand = null; updateBrandSourceLabel(); updateRasterButtons(); refreshPreviews();
  status(state.loaded ? 'Brand Icon now uses the shared Splash SVG.' : 'Brand Icon is set to use the shared SVG. Load one above to preview/export.', 'success');
});
const dropzone = byId('svgDropzone');
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragover'); readSvgFile(e.dataTransfer.files?.[0]); });
['splash'].forEach(kind => {
  byId(`${kind}DetectBtn`).addEventListener('click', () => detectAndRemoveBackground(kind));
  byId(`${kind}DeleteBtn`).addEventListener('click', () => deleteSelectedElement(kind));
  byId(`${kind}UndoBtn`).addEventListener('click', () => undoSvgChange(kind));
  byId(`${kind}RestoreBtn`).addEventListener('click', () => restoreOriginalSvg(kind));
  byId(`${kind}ElementSelect`).addEventListener('change', () => selectElement(kind));
  const stage = byId('splashCanvas');
  stage.addEventListener('keydown', event => {
    const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (!dirs[event.key]) return; event.preventDefault(); moveArtwork(kind, dirs[event.key], event.shiftKey ? 5 : 1);
  });
  document.querySelectorAll(`[data-position="${kind}"] [data-move]`).forEach(button => button.addEventListener('click', () => moveArtwork(kind, button.dataset.move, 1)));
  document.querySelector(`[data-position="${kind}"] [data-reset-position]`).addEventListener('click', () => {
    state.offsets[kind] = { x: 0, y: 0 }; byId(`${kind}OffsetReadout`).textContent = 'X 0 · Y 0'; refreshPreviews(); stage.focus();
  });
});
const brandStage = byId('brandSquare');
brandStage.addEventListener('keydown', event => { const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }; if (!dirs[event.key]) return; event.preventDefault(); moveArtwork('brand', dirs[event.key], event.shiftKey ? 5 : 1); });
document.querySelectorAll('[data-position="brand"] [data-move]').forEach(button => button.addEventListener('click', () => moveArtwork('brand', button.dataset.move, 1)));
document.querySelector('[data-position="brand"] [data-reset-position]').addEventListener('click', () => { state.offsets.brand = { x: 0, y: 0 }; byId('brandOffsetReadout').textContent = 'X 0 · Y 0'; refreshPreviews(); brandStage.focus(); });
['splashIncludeBackground','splashPadding','splashScale','brandIncludeBackground','brandPadding','brandScale'].forEach(id => byId(id).addEventListener('input', refreshPreviews));
['splashBackgroundColor','splashBackgroundHex','brandBackgroundColor','brandBackgroundHex'].forEach((id, i, arr) => { if (id.endsWith('Color')) bindColorPair(id, arr[i + 1]); });
syncBrandColorOptions();
byId('brandPaletteColor').addEventListener('change', () => { const color = byId('brandPaletteColor').value; byId('brandBackgroundColor').value = color; byId('brandBackgroundHex').value = color.toUpperCase(); byId('brandIncludeBackground').checked = true; refreshPreviews(); });
byId('brandPhoneBgSelect').addEventListener('change', () => { const color = byId('brandPhoneBgSelect').value; byId('brandPhoneBgCustom').value = color; byId('brandPhoneBgHex').value = color.toUpperCase(); refreshPreviews(); });
byId('brandPhoneBgCustom').addEventListener('input', () => { const color = byId('brandPhoneBgCustom').value.toUpperCase(); byId('brandPhoneBgHex').value = color; byId('brandPhoneBgSelect').value = ''; refreshPreviews(); });
byId('brandPhoneBgHex').addEventListener('change', () => { const value = byId('brandPhoneBgHex').value.trim(); if (/^#[0-9a-f]{6}$/i.test(value)) { byId('brandPhoneBgCustom').value = value; byId('brandPhoneBgSelect').value = ''; } else { byId('brandPhoneBgHex').value = byId('brandPhoneBgCustom').value.toUpperCase(); } refreshPreviews(); });
['splash','brand'].forEach(kind => { const fmt = byId(`${kind}ExportFormat`), wrap = byId(`${kind}PngResolutionWrap`), res = byId(`${kind}PngResolution`), custom = byId(`${kind}PngCustomWrap`); const update = () => { wrap.hidden = fmt.value !== 'png'; wrap.classList.remove('asset-png-disabled'); custom.hidden = res.value !== 'custom'; }; fmt.addEventListener('change', update); res.addEventListener('change', update); update(); });
['brandCornerRadius'].forEach(id => byId(id).addEventListener('input', refreshPreviews));
new MutationObserver(() => syncBrandColorOptions()).observe(byId('palette'), { childList: true, subtree: true });
byId('downloadSplashBtn').addEventListener('click', () => exportAsset('splash'));
byId('downloadBrandBtn').addEventListener('click', () => exportAsset('brand'));
byId('brandRasterDetectBtn').addEventListener('click', async () => {
  if (!brandSourceAvailable()) return;
  try {
    const sourceCanvas = await renderBrandRaster(200, false, false);
    const candidate = findLikelyBackgroundSeed(sourceCanvas, rasterTolerance());
    if (!candidate) {
      status('Could not confidently detect a large, flat background region. Try increasing color tolerance or click the background manually.', 'error');
      return;
    }
    saveRasterUndo();
    state.brandRasterAuto = false;
    state.brandRasterPoints = [{ x: candidate.x, y: candidate.y }];
    await refreshBrandRasterPreview();
    updateRasterButtons();
    status(`Removed a likely connected background region (${Math.round(candidate.count / 400)}% of the 200 × 200 canvas). Review the result before export; detection is heuristic.`, 'success');
  } catch (error) {
    status(error.message || 'Background detection failed.', 'error');
  }
});
byId('brandRasterUndoBtn').addEventListener('click', async () => { const previous = state.brandRasterUndo.pop(); if (!previous) return; state.brandRasterAuto = previous.auto; state.brandRasterPoints = previous.points; await refreshBrandRasterPreview(); updateRasterButtons(); });
byId('brandRasterRestoreBtn').addEventListener('click', async () => { saveRasterUndo(); state.brandRasterAuto = false; state.brandRasterPoints = []; await refreshBrandRasterPreview(); updateRasterButtons(); status('Restored the unedited rasterized PNG preview.', 'success'); });
byId('brandRasterTolerance').addEventListener('input', async () => { byId('brandRasterToleranceValue').textContent = byId('brandRasterTolerance').value; await refreshBrandRasterPreview(); });
byId('brandPreviewImage').addEventListener('click', async e => { if (!brandSourceAvailable()) return; const rect = e.currentTarget.getBoundingClientRect(); saveRasterUndo(); state.brandRasterPoints.push({ x: (e.clientX - rect.left) / rect.width * 200, y: (e.clientY - rect.top) / rect.height * 200 }); await refreshBrandRasterPreview(); updateRasterButtons(); status('Removed connected pixels at the selected preview point. Use Undo raster edit if needed.', 'success'); });

/**
 * Capture a selected preview and report download/clipboard status.
 */
async function capturePreviewScreenshot(element, filename, label) {
  try {
    const result = await downloadElementScreenshot(element, filename);
    status(result?.clipboardCopied
      ? `${label} screenshot downloaded and copied to clipboard.`
      : `${label} screenshot downloaded. Clipboard copy is unavailable in this browser or permission context.`, 'success');
  } catch (error) {
    status(error.message || `Could not capture the ${label} preview.`, 'error');
  }
}
byId('downloadSplashPreviewScreenshot').addEventListener('click', () => capturePreviewScreenshot(byId('splashWindowPreview'), 'android-splash-icon-preview.png', 'Splash Icon preview'));
byId('downloadBrandPreviewScreenshot').addEventListener('click', () => capturePreviewScreenshot(byId('brandPreviewStage'), 'android-brand-icon-preview.png', 'Brand Icon preview'));
byId('downloadWelcomePreviewScreenshot').addEventListener('click', () => capturePreviewScreenshot(document.querySelector('.asset-android-preview-card .onboarding-phone'), 'android-welcome-screen-preview.png', 'Android welcome-screen'));

document.querySelectorAll('[data-platform]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-platform]').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  document.querySelectorAll('.asset-platform-panel').forEach(panel => { const active = panel.id === button.dataset.platform; panel.hidden = !active; panel.classList.toggle('active', active); });
}));
updateBrandSourceLabel();
updateRasterButtons();
refreshPreviews();

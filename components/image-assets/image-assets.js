/** Image Asset Studio: SVG preparation and export stays in the browser. */
const byId = id => document.getElementById(id);
const state = { baseSvg: '', originalSvg: '', viewBox: null, loaded: false, previewUrls: {}, undoStack: [], selected: { splash: null, brand: null }, offsets: { splash: { x: 0, y: 0 }, brand: { x: 0, y: 0 } }, brandRasterPoints: [], brandRasterAuto: false, brandRasterUndo: [] };
const status = (message, kind = '') => { const el = byId('assetStatus'); el.textContent = message; el.className = `asset-message ${kind}`.trim(); };
const clampDimension = value => Math.max(1, Math.min(4096, Number.parseInt(value, 10) || 288));

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
function serialize(root) { return new XMLSerializer().serializeToString(root); }
function hexColor(id, fallback = '#FFFFFF') { const value = byId(id)?.value?.trim() || fallback; return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function addCanvasBackground(root, vb, color) {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('data-generated-background', 'true'); rect.setAttribute('x', vb[0]); rect.setAttribute('y', vb[1]); rect.setAttribute('width', vb[2]); rect.setAttribute('height', vb[3]); rect.setAttribute('fill', color);
  root.insertBefore(rect, root.firstChild);
}
function buildSvg(kind, exportFile = false) {
  if (!state.loaded) throw new Error('Load an SVG first.');
  const { root, viewBox: original } = parseSvgText(state.baseSvg);
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
function rasterTolerance() { return Number(byId('brandRasterTolerance')?.value || 24); }
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
async function renderBrandRaster(size = 200, includeEdits = true) {
  const result = buildSvg('brand', true), url = URL.createObjectURL(new Blob([result.text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image(); await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Could not convert the SVG to PNG.')); img.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (result.includeBg) { ctx.fillStyle = result.bg; ctx.fillRect(0, 0, size, size); }
    ctx.drawImage(img, 0, 0, size, size);
    if (includeEdits) {
      const points = [];
      if (state.brandRasterAuto) points.push([0,0],[size-1,0],[0,size-1],[size-1,size-1]);
      state.brandRasterPoints.forEach(p => points.push([p.x / 200 * size, p.y / 200 * size]));
      for (const [x,y] of points) removeConnectedColor(canvas, x, y, rasterTolerance());
    }
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}
async function refreshBrandRasterPreview() {
  const img = byId('brandPreviewImage'), empty = byId('brandEmpty');
  if (!state.loaded) { img.hidden = true; empty.hidden = false; return; }
  try { const canvas = await renderBrandRaster(200, true); img.src = canvas.toDataURL('image/png'); img.hidden = false; empty.hidden = true; const phoneImg = byId('brandPhoneImage'); if (phoneImg) { phoneImg.src = img.src; phoneImg.hidden = false; } }
  catch (e) { status(e.message, 'error'); }
}
function saveRasterUndo() { state.brandRasterUndo.push({ auto: state.brandRasterAuto, points: state.brandRasterPoints.map(p => ({...p})) }); if (state.brandRasterUndo.length > 30) state.brandRasterUndo.shift(); updateRasterButtons(); }
function updateRasterButtons() { byId('brandRasterUndoBtn').disabled = !state.brandRasterUndo.length; byId('brandRasterRestoreBtn').disabled = !state.loaded || (!state.brandRasterAuto && !state.brandRasterPoints.length); byId('brandRasterDetectBtn').disabled = !state.loaded; }
function refreshImage(kind) {
  if (kind === 'brand') { refreshBrandRasterPreview(); return; }
  const img = byId(kind === 'splash' ? 'splashPreviewImage' : 'brandPreviewImage');
  const empty = byId(kind === 'splash' ? 'splashEmpty' : 'brandEmpty');
  if (!state.loaded) { img.hidden = true; empty.hidden = false; return; }
  try {
    const result = buildSvg(kind, false), url = URL.createObjectURL(new Blob([result.text], { type: 'image/svg+xml;charset=utf-8' }));
    if (state.previewUrls[kind]) URL.revokeObjectURL(state.previewUrls[kind]);
    state.previewUrls[kind] = url; img.src = url; img.hidden = false; empty.hidden = true;
  } catch (error) { status(error.message, 'error'); }
}
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
  const phoneImage = byId('brandPhoneImage'), brandImage = byId('brandPreviewImage'); phoneImage.src = brandImage.src; phoneImage.hidden = !state.loaded;
  byId('brandPhoneIcon').style.background = byId('brandIncludeBackground').checked ? hexColor('brandBackgroundHex') : 'transparent'; byId('brandPhoneIcon').style.borderRadius = `${Number(byId('brandCornerRadius').value)}%`;
  byId('assetPaddingValue')?.replaceChildren(document.createTextNode(`${byId('assetPadding')?.value || 12}%`));
  refreshImage('splash'); refreshImage('brand');
  byId('brandPhoneImage').src = byId('brandPreviewImage').src; byId('brandPhoneImage').hidden = !state.loaded;
  const disabled = !state.loaded; byId('downloadSplashBtn').disabled = disabled; byId('downloadBrandBtn').disabled = disabled;
}
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
function populateElementPickers() {
  ['splash'].forEach(kind => {
    const select = byId(`${kind}ElementSelect`), count = byId(`${kind}ElementCount`);
    select.innerHTML = '';
    if (!state.loaded) {
      select.add(new Option('Load an SVG to see elements', '')); select.disabled = true;
      byId(`${kind}DeleteBtn`).disabled = true; byId(`${kind}DetectBtn`).disabled = true;
      byId(`${kind}UndoBtn`).disabled = true; byId(`${kind}RestoreBtn`).disabled = true; count.textContent = '0'; return;
    }
    const root = parseSvgText(state.baseSvg).root, elements = [...root.querySelectorAll('*')];
    elements.forEach((node, index) => {
      const id = node.getAttribute('id');
      const label = `${node.localName}${id ? `#${id}` : ''}${node.getAttribute('class') ? `.${node.getAttribute('class').trim().replace(/\s+/g, '.')}` : ''}`;
      select.add(new Option(`${index + 1}. ${label}`, String(index)));
    });
    if (!elements.length) select.add(new Option('No child elements', ''));
    select.disabled = !elements.length; byId(`${kind}DeleteBtn`).disabled = !elements.length;
    byId(`${kind}DetectBtn`).disabled = false; count.textContent = String(elements.length);
    byId(`${kind}UndoBtn`).disabled = state.undoStack.length === 0;
    byId(`${kind}RestoreBtn`).disabled = !state.originalSvg || state.baseSvg === state.originalSvg;
    if (state.selected[kind] !== null && state.selected[kind] < elements.length) select.value = String(state.selected[kind]);
    else state.selected[kind] = null;
  });
}
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
function deleteSelectedElement(kind) {
  try {
    const index = Number(byId(`${kind}ElementSelect`).value), parsed = parseSvgText(state.baseSvg), elements = [...parsed.root.querySelectorAll('*')];
    if (!Number.isInteger(index) || !elements[index]) return;
    const target = elements[index], label = `<${target.localName}>${target.id ? `#${target.id}` : ''}`;
    state.undoStack.push(state.baseSvg); target.remove(); state.baseSvg = serialize(parsed.root); byId('svgSourceInput').value = state.baseSvg;
    state.selected = { splash: null, brand: null }; populateElementPickers(); refreshPreviews(); status(`Deleted ${label} from the shared SVG.`, 'success');
  } catch (error) { status(error.message, 'error'); }
}
function undoSvgChange(kind) {
  const previous = state.undoStack.pop(); if (!previous) return;
  state.baseSvg = previous; byId('svgSourceInput').value = previous;
  const parsed = parseSvgText(previous); state.viewBox = parsed.viewBox; state.selected = { splash: null, brand: null };
  populateElementPickers(); refreshPreviews(); status('Last SVG edit undone.', 'success');
}
function restoreOriginalSvg(kind) {
  if (!state.originalSvg || state.baseSvg === state.originalSvg) return;
  state.undoStack.push(state.baseSvg); state.baseSvg = state.originalSvg; byId('svgSourceInput').value = state.originalSvg;
  const parsed = parseSvgText(state.originalSvg); state.viewBox = parsed.viewBox; state.selected = { splash: null, brand: null };
  populateElementPickers(); refreshPreviews(); status('Restored the original uploaded SVG.', 'success');
}
function selectElement(kind) {
  const index = Number(byId(`${kind}ElementSelect`).value), root = parseSvgText(state.baseSvg).root;
  const target = [...root.querySelectorAll('*')][index]; state.selected[kind] = target ? index : null;
  refreshPreviews();
  if (target) status(`${kind === 'splash' ? 'Splash' : 'Brand'} preview highlights <${target.localName}>${target.id ? `#${target.id}` : ''}.`, '');
}
function moveArtwork(kind, direction, amount = 1) {
  const offset = state.offsets[kind];
  if (direction === 'left') offset.x -= amount; if (direction === 'right') offset.x += amount;
  if (direction === 'up') offset.y -= amount; if (direction === 'down') offset.y += amount;
  offset.x = Math.max(-200, Math.min(200, offset.x)); offset.y = Math.max(-200, Math.min(200, offset.y));
  byId(`${kind}OffsetReadout`).textContent = `X ${offset.x} · Y ${offset.y}`; refreshPreviews();
}
function loadSvg(text) {
  const parsed = parseSvgText(text);
  state.baseSvg = serialize(parsed.root); state.originalSvg = state.baseSvg; state.undoStack = []; state.viewBox = parsed.viewBox; state.loaded = true; state.brandRasterPoints = []; state.brandRasterAuto = false; state.brandRasterUndo = []; updateRasterButtons();
  byId('svgSourceInput').value = state.baseSvg; state.selected = { splash: null, brand: null }; state.offsets = { splash: { x: 0, y: 0 }, brand: { x: 0, y: 0 } }; populateElementPickers(); refreshPreviews();
}
function downloadBlob(filename, blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
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
function bindColorPair(colorId, hexId, refresh = refreshPreviews) {
  byId(colorId).addEventListener('input', () => { byId(hexId).value = byId(colorId).value.toUpperCase(); refresh(); });
  byId(hexId).addEventListener('change', () => { const value = byId(hexId).value.trim(); if (/^#[0-9a-f]{6}$/i.test(value)) byId(colorId).value = value; else byId(hexId).value = byId(colorId).value.toUpperCase(); refresh(); });
}

byId('loadSvgBtn').addEventListener('click', () => { try { loadSvg(byId('svgSourceInput').value.trim()); status('SVG applied successfully.', 'success'); } catch (error) { status(error.message, 'error'); } });
byId('clearSvgBtn').addEventListener('click', () => {
  state.baseSvg = ''; state.originalSvg = ''; state.undoStack = []; state.viewBox = null; state.loaded = false; state.brandRasterPoints = []; state.brandRasterAuto = false; state.brandRasterUndo = []; updateRasterButtons();
  Object.values(state.previewUrls).forEach(URL.revokeObjectURL); state.previewUrls = {};
  byId('svgSourceInput').value = ''; byId('svgFileInput').value = ''; state.selected = { splash: null, brand: null }; populateElementPickers(); refreshPreviews(); status('Add an SVG to begin.');
});
async function readSvgFile(file) {
  if (!file || (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml')) { status('Choose an SVG file.', 'error'); return; }
  try { loadSvg(await file.text()); status(`Loaded ${file.name}.`, 'success'); } catch (error) { status(error.message, 'error'); }
}
byId('svgFileInput').addEventListener('change', e => readSvgFile(e.target.files?.[0]));
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
byId('brandRasterDetectBtn').addEventListener('click', async () => { if (!state.loaded) return; saveRasterUndo(); state.brandRasterAuto = true; await refreshBrandRasterPreview(); updateRasterButtons(); status('Removed connected corner-background pixels from the rasterized PNG. Review the result before export.', 'success'); });
byId('brandRasterUndoBtn').addEventListener('click', async () => { const previous = state.brandRasterUndo.pop(); if (!previous) return; state.brandRasterAuto = previous.auto; state.brandRasterPoints = previous.points; await refreshBrandRasterPreview(); updateRasterButtons(); });
byId('brandRasterRestoreBtn').addEventListener('click', async () => { saveRasterUndo(); state.brandRasterAuto = false; state.brandRasterPoints = []; await refreshBrandRasterPreview(); updateRasterButtons(); status('Restored the unedited rasterized PNG preview.', 'success'); });
byId('brandRasterTolerance').addEventListener('input', async () => { byId('brandRasterToleranceValue').textContent = byId('brandRasterTolerance').value; await refreshBrandRasterPreview(); });
byId('brandPreviewImage').addEventListener('click', async e => { if (!state.loaded) return; const rect = e.currentTarget.getBoundingClientRect(); saveRasterUndo(); state.brandRasterPoints.push({ x: (e.clientX - rect.left) / rect.width * 200, y: (e.clientY - rect.top) / rect.height * 200 }); await refreshBrandRasterPreview(); updateRasterButtons(); status('Removed connected pixels at the selected preview point. Use Undo raster edit if needed.', 'success'); });

document.querySelectorAll('[data-platform]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-platform]').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  document.querySelectorAll('.asset-platform-panel').forEach(panel => { const active = panel.id === button.dataset.platform; panel.hidden = !active; panel.classList.toggle('active', active); });
}));
refreshPreviews();

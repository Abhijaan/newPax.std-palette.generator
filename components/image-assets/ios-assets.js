/* Load the isolated iOS workspace into the existing platform tab. */
const iosPanelMount = document.getElementById('iosAssetsPanel');
let iosWorkspaceLoaded = false;
if (iosPanelMount) {
  try {
    const iosMarkupResponse = await fetch('components/image-assets/ios-assets.html');
    if (!iosMarkupResponse.ok) throw new Error(`HTTP ${iosMarkupResponse.status}`);
    iosPanelMount.innerHTML = await iosMarkupResponse.text();
    iosWorkspaceLoaded = true;
    document.querySelector('[data-platform="iosAssetsPanel"] .asset-coming-soon')?.remove();
  } catch (error) {
    iosPanelMount.innerHTML = '<div class="panel"><h3>Could not load the iOS workspace</h3><p>Run the project through Live Server or another local HTTP server.</p></div>';
    console.error('Unable to load the iOS asset workspace:', error);
  }
}

// Independent iOS asset controller. The event-binding section is guarded below
// so a failed fragment fetch does not register listeners against missing controls.

/* -------------------------------------------------------------------------- */
/* iOS feature state and shared DOM helpers                                   */
/* -------------------------------------------------------------------------- */
const iosState = { source: '', original: '', loaded: false, undo: [], selected: null, offset: { x: 0, y: 0 }, squareSizes: [90, 1024], zoom: { square: 1, app: 1, screen: 1, island: 1 } };
const iosById = id => document.getElementById(id);
const iosStatus = (message, kind = '') => { const el = iosById('iosAssetStatus'); if (el) { el.textContent = message; el.className = `asset-message ${kind}`.trim(); } };
const iosClamp = (n, min = 1, max = 4096) => Math.max(min, Math.min(max, Math.round(Number(n) || min)));
/**
 * Parse and sanitize SVG input, validating its coordinate system before use.
 */
function iosParseSvg(text) {
  if (!/<svg\b/i.test(text)) throw new Error('This does not look like SVG markup.');
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse this SVG. Check that the markup is valid.');
  const root = doc.documentElement;
  if (root.localName.toLowerCase() !== 'svg') throw new Error('The document root must be an <svg> element.');
  root.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node => node.remove());
  [root, ...root.querySelectorAll('*')].forEach(node => [...node.attributes].forEach(attr => {
    const name = attr.name.toLowerCase();
    const value = attr.value.trim();

    // Strip event handlers and external resource references from untrusted SVG input.
    if (name.startsWith('on')) node.removeAttribute(attr.name);
    if (
      (name === 'href' || name.endsWith(':href')) &&
      value &&
      !value.startsWith('#') &&
      !value.startsWith('data:image/')
    ) {
      node.removeAttribute(attr.name);
    }
    if (
      ['style', 'fill', 'stroke', 'filter', 'clip-path', 'mask'].includes(name) &&
      /url\s*\(\s*['"]?(?!#)/i.test(value)
    ) {
      node.removeAttribute(attr.name);
    }
  }));
  let viewBox;
  const raw = root.getAttribute('viewBox');
  if (raw) viewBox = raw.trim().split(/[\s,]+/).map(Number);
  else {
    const width = parseFloat(root.getAttribute('width')), height = parseFloat(root.getAttribute('height'));
    if (!(width > 0 && height > 0)) throw new Error('SVG needs a valid viewBox or numeric width and height.');
    viewBox = [0, 0, width, height]; root.setAttribute('viewBox', viewBox.join(' '));
  }
  if (viewBox.length !== 4 || viewBox.some(v => !Number.isFinite(v)) || viewBox[2] <= 0 || viewBox[3] <= 0) throw new Error('SVG viewBox must contain four valid numbers and positive dimensions.');
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return { root, viewBox };
}
/**
 * Serialize an SVG DOM tree into markup.
 */
function iosSerialize(root) { return new XMLSerializer().serializeToString(root); }
/**
 * Download a generated Blob using a temporary object URL.
 */
function iosDownloadBlob(filename, blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }



/* --------------------------- iOS asset workspace --------------------------- */
/* -------------------------------------------------------------------------- */
/* SVG source management and export builders                                  */
/* -------------------------------------------------------------------------- */
function iosSourceReady() { return iosState.loaded && Boolean(iosState.source); }
/**
 * Parse supplied SVG text or the active iOS source.
 */
function iosParseSource(text = iosState.source) { return iosParseSvg(text); }
/**
 * Store the current SVG source as an undo checkpoint.
 */
function iosSnapshot() { iosState.undo.push(iosState.source); if (iosState.undo.length > 40) iosState.undo.shift(); }
/**
 * Validate and initialize the iOS source and dependent previews.
 */
function iosSetSource(text, { original = false } = {}) {
  const parsed = iosParseSource(text);
  iosState.source = iosSerialize(parsed.root);
  if (original) { iosState.original = iosState.source; iosState.undo = []; }
  iosState.loaded = true;
  iosState.selected = null;
  iosById('iosSvgSourceInput').value = iosState.source;
  iosRefreshAll();
  iosPopulateElementPicker();
}
/**
 * Return a fresh SVG DOM tree from the current source text.
 */
function iosSourceRoot() { return iosParseSource().root; }
/**
 * Build a square SVG export with the selected padding, scale, and background.
 */
function iosBuildSquareSvg(size, options = {}) {
  if (!iosSourceReady()) throw new Error('Load an iOS SVG first.');
  const { root, viewBox } = iosParseSource();
  const [x, y, w, h] = viewBox;
  const padding = Math.max(0, Math.min(0.4, Number(options.padding ?? 0)));
  const scale = Math.max(0.05, Number(options.scale ?? 1));
  const side = Math.max(w, h) / Math.max(0.05, 1 - padding * 2);
  const cx = x + w / 2, cy = y + h / 2;
  const square = [cx - side / 2, cy - side / 2, side, side];
  const defs = [...root.children].filter(n => n.localName === 'defs');
  const drawable = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  drawable.setAttribute('transform', `translate(${iosState.offset.x / 100 * side} ${iosState.offset.y / 100 * side}) translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`);
  const nodes = [...root.childNodes];
  nodes.forEach(n => { if (!(n.nodeType === Node.ELEMENT_NODE && n.localName === 'defs')) drawable.appendChild(n); });
  root.replaceChildren(); defs.forEach(n => root.appendChild(n));
  const includeBg = Boolean(options.includeBg);
  const radius = Math.max(0, Math.min(50, Number(options.radius || 0)));
  if (includeBg) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', square[0]); rect.setAttribute('y', square[1]); rect.setAttribute('width', square[2]); rect.setAttribute('height', square[3]);
    rect.setAttribute('fill', options.bg || '#FFFFFF');
    if (radius) rect.setAttribute('rx', square[2] * radius / 100);
    rect.setAttribute('data-ios-generated-background', 'true');
    root.appendChild(rect);
  }
  if (radius > 0) {
    let defsRoot = root.querySelector('defs');
    if (!defsRoot) { defsRoot = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); root.insertBefore(defsRoot, root.firstChild); }
    const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clip.setAttribute('id', 'iosAppIconClip'); clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    clipRect.setAttribute('x', square[0]); clipRect.setAttribute('y', square[1]); clipRect.setAttribute('width', square[2]); clipRect.setAttribute('height', square[3]); clipRect.setAttribute('rx', square[2] * radius / 100);
    clip.appendChild(clipRect); defsRoot.appendChild(clip); drawable.setAttribute('clip-path', 'url(#iosAppIconClip)');
  }
  root.appendChild(drawable);
  root.setAttribute('viewBox', square.join(' ')); root.setAttribute('width', String(size)); root.setAttribute('height', String(size));
  return iosSerialize(root);
}
/**
 * Build the fixed-height Dynamic Island SVG export.
 */
function iosBuildIslandSvg() {
  if (!iosSourceReady()) throw new Error('Load an iOS SVG first.');
  const { root, viewBox } = iosParseSource();
  const [x, y, w, h] = viewBox;
  const width = iosClamp(iosById('iosIslandWidth').value, 18, 600), height = 18;
  const padding = Math.max(0, Math.min(0.4, Number(iosById('iosIslandPadding').value) / 100));
  const scale = Number(iosById('iosIslandScale').value) / 100;
  const usableW = width * (1 - 2 * padding), usableH = height * (1 - 2 * padding);
  const fit = Math.min(usableW / w, usableH / h) * scale;
  const cx = x + w / 2, cy = y + h / 2;
  const nodes = [...root.childNodes], defs = nodes.filter(n => n.nodeType === Node.ELEMENT_NODE && n.localName === 'defs');
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('transform', `translate(${width / 2} ${height / 2}) scale(${fit}) translate(${-cx} ${-cy})`);
  nodes.forEach(n => { if (!(n.nodeType === Node.ELEMENT_NODE && n.localName === 'defs')) group.appendChild(n); });
  root.replaceChildren(); defs.forEach(n => root.appendChild(n));
  if (iosById('iosIslandIncludeBackground').checked) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0'); rect.setAttribute('y', '0'); rect.setAttribute('width', String(width)); rect.setAttribute('height', String(height));
    rect.setAttribute('rx', '9'); rect.setAttribute('fill', iosById('iosIslandBgHex').value); root.appendChild(rect);
  }
  root.appendChild(group); root.setAttribute('viewBox', `0 0 ${width} ${height}`); root.setAttribute('width', String(width)); root.setAttribute('height', String(height));
  return iosSerialize(root);
}
/**
 * Create a temporary object URL for SVG preview rendering.
 */
function iosSvgUrl(text) { return URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' })); }
/**
 * Update a preview image and manage its temporary object URL.
 */
function iosUpdatePreview(imgId, emptyId, text) {
  const img = iosById(imgId), empty = iosById(emptyId);
  if (empty) empty.hidden = true;
  if (!iosSourceReady() || !text) { img.hidden = true; return; }
  const url = iosSvgUrl(text);
  const old = img.dataset.objectUrl;
  if (old) URL.revokeObjectURL(old);
  img.dataset.objectUrl = url; img.onload = () => { img.hidden = false; if (empty) empty.hidden = true; }; img.onerror = () => { img.hidden = true; if (empty) empty.hidden = true; };
  img.src = url;
}
/**
 * Render square export sizes and their individual download actions.
 */
/* -------------------------------------------------------------------------- */
/* Preview updates, export lists, and cleanup                                 */
/* -------------------------------------------------------------------------- */
function iosRefreshSquareList() {
  const list = iosById('iosSquareSizeList'); list.replaceChildren();
  iosState.squareSizes.forEach(size => {
    const row = document.createElement('div'); row.className = 'ios-size-item';
    const title = document.createElement('strong'); title.textContent = `${size} × ${size} px`;
    const format = document.createElement('select'); format.className = 'asset-select'; format.setAttribute('aria-label', `Export format for ${size} pixel icon`); format.innerHTML = '<option value="svg">SVG</option><option value="png">PNG</option>';
    const download = document.createElement('button'); download.type = 'button'; download.className = 'btn primary'; download.textContent = 'Download'; download.disabled = !iosSourceReady();
    download.addEventListener('click', async () => {
      try { await iosDownloadSquare(size, format.value); iosStatus(`${size} × ${size} ${format.value.toUpperCase()} exported.`, 'success'); }
      catch (error) { iosStatus(error.message, 'error'); }
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn ios-size-remove'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${size} pixel size`);
    remove.addEventListener('click', () => { if (iosState.squareSizes.length <= 1) { iosStatus('Keep at least one square dimension.', 'error'); return; } iosState.squareSizes = iosState.squareSizes.filter(n => n !== size); iosRefreshSquareList(); });
    row.append(title, format, download, remove); list.appendChild(row);
  });
}
/**
 * Export one square icon size as SVG or PNG.
 */
async function iosDownloadSquare(size, format) {
  const svg = iosBuildSquareSvg(size, { padding: 0, scale: 1 });
  if (format === 'svg') { iosDownloadBlob(`ios-icon-${size}x${size}.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); return; }
  const url = iosSvgUrl(svg);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Could not render this SVG as PNG.')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, size, size);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG export failed.');
    iosDownloadBlob(`ios-icon-${size}x${size}.png`, blob);
  } finally { URL.revokeObjectURL(url); }
}
/**
 * Populate the Brand Icon SVG element picker.
 */
function iosPopulateElementPicker() {
  const select = iosById('iosAppElementSelect'), count = iosById('iosAppElementCount'); select.replaceChildren();
  if (!iosSourceReady()) { select.add(new Option('Load SVG first', '')); select.disabled = true; iosById('iosAppDeleteElementBtn').disabled = true; iosById('iosAppDetectBgBtn').disabled = true; iosById('iosIslandDetectBgBtn').disabled = true; iosById('iosAppUndoBtn').disabled = true; iosById('iosIslandUndoBtn').disabled = true; iosById('iosAppRestoreBtn').disabled = true; count.textContent = '0'; return; }
  const elements = [...iosSourceRoot().querySelectorAll('*')];
  elements.forEach((node, index) => select.add(new Option(`${index + 1}. ${node.localName}${node.id ? `#${node.id}` : ''}`, String(index))));
  select.disabled = !elements.length; count.textContent = String(elements.length);
  if (iosState.selected !== null && iosState.selected < elements.length) select.value = String(iosState.selected); else iosState.selected = null;
  iosById('iosAppDeleteElementBtn').disabled = iosState.selected === null;
  iosById('iosAppDetectBgBtn').disabled = false; iosById('iosIslandDetectBgBtn').disabled = false;
  iosById('iosAppUndoBtn').disabled = !iosState.undo.length; iosById('iosIslandUndoBtn').disabled = !iosState.undo.length; iosById('iosAppRestoreBtn').disabled = !iosState.original || iosState.source === iosState.original;
}
/**
 * Apply the selected zoom level to a preview target.
 */
function iosApplyZoom(key) {
  const zoom = iosState.zoom[key] || 1;
  const targetId = ({ square: 'iosSquarePreview', app: 'iosAppPreview', screen: 'iosPhoneShellZoomTarget', island: 'iosIslandPreviewFrame' })[key];
  const target = targetId === 'iosPhoneShellZoomTarget' ? document.querySelector('.ios-phone-shell') : iosById(targetId);
  if (target) { target.style.transform = `scale(${zoom})`; target.style.transformOrigin = 'center center'; }
  const readout = iosById(({ square: 'iosSquareZoomReadout', app: 'iosAppZoomReadout', screen: 'iosScreenZoomReadout', island: 'iosIslandZoomReadout' })[key]);
  if (readout) readout.textContent = `${Math.round(zoom * 100)}%`;
}
/**
 * Restore the last SVG source snapshot.
 */
function iosUndoSourceEdit() {
  const previous = iosState.undo.pop();
  if (!previous) return;
  iosState.source = previous; iosById('iosSvgSourceInput').value = previous; iosState.selected = null;
  iosRefreshAll(); iosPopulateElementPicker(); iosStatus('Undid the last iOS SVG edit.', 'success');
}
/**
 * Refresh iOS previews, dimensions, and control states.
 */
function iosRefreshAll() {
  const ready = iosSourceReady();
  iosById('iosAppDownloadBtn').disabled = !ready; iosById('iosIslandDownloadBtn').disabled = !ready;
  iosRefreshSquareList();
  if (!ready) { iosUpdatePreview('iosSquarePreview', 'iosSquareEmpty', ''); iosUpdatePreview('iosAppPreview', 'iosAppEmpty', ''); iosUpdatePreview('iosIslandPreview', 'iosIslandEmpty', ''); return; }
  const square = iosState.squareSizes[0] || 90;
  iosById('iosSquarePreviewSize').textContent = `${square} × ${square} px`;
  iosUpdatePreview('iosSquarePreview', 'iosSquareEmpty', iosBuildSquareSvg(square));
  const dimension = iosClamp(iosById('iosAppDimension').value);
  iosById('iosAppDimensionValue').textContent = `${dimension} × ${dimension} px`;
  iosById('iosAppPreviewDimensions').textContent = `${dimension} × ${dimension} px`;
  const appSvg = iosBuildSquareSvg(dimension, { padding: Number(iosById('iosAppPadding').value) / 100, scale: Number(iosById('iosAppScale').value) / 100, includeBg: iosById('iosAppIncludeBackground').checked, bg: iosById('iosAppBgHex').value, radius: Number(iosById('iosAppCornerRadius').value) });
  iosUpdatePreview('iosAppPreview', 'iosAppEmpty', appSvg);
  const screenImage = iosById('iosScreenBrandImage');
  const appPreviewImage = iosById('iosAppPreview');
  if (screenImage && appPreviewImage && appPreviewImage.dataset.objectUrl) {
    const screenUrl = iosSvgUrl(appSvg);
    if (screenImage.dataset.objectUrl) URL.revokeObjectURL(screenImage.dataset.objectUrl);
    screenImage.dataset.objectUrl = screenUrl; screenImage.src = screenUrl; screenImage.hidden = !ready;
  } else if (screenImage) screenImage.hidden = true;
  iosById('iosAppPaddingValue').textContent = `${iosById('iosAppPadding').value}%`;
  iosById('iosAppScaleValue').textContent = `${iosById('iosAppScale').value}%`;

  // Show the radius in both units. The percent is relative to the configured canvas size.
  const cornerRadiusPercent = Number(iosById('iosAppCornerRadius').value);
  const cornerRadiusPixels = (dimension * cornerRadiusPercent) / 100;
  const formattedRadiusPixels = Number.isInteger(cornerRadiusPixels)
    ? String(cornerRadiusPixels)
    : cornerRadiusPixels.toFixed(1);
  iosById('iosAppCornerValue').textContent = `${cornerRadiusPercent}% · ${formattedRadiusPixels} px`;
  iosById('iosAppOffsetReadout').textContent = `X ${iosState.offset.x} · Y ${iosState.offset.y}`;
  const width = iosClamp(iosById('iosIslandWidth').value, 18, 600);
  iosById('iosIslandWidthValue').textContent = `${width} px`; iosById('iosIslandPreviewDimensions').textContent = `${width} × 18 px`;
  iosById('iosIslandPaddingValue').textContent = `${iosById('iosIslandPadding').value}%`; iosById('iosIslandScaleValue').textContent = `${iosById('iosIslandScale').value}%`;
  const island = iosBuildIslandSvg();
  iosUpdatePreview('iosIslandPreview', 'iosIslandEmpty', island);
  const frame = iosById('iosIslandPreviewFrame'); frame.style.width = `${Math.min(width, 600)}px`; frame.style.height = '18px';
  ['square', 'app', 'screen', 'island'].forEach(iosApplyZoom);
}
/**
 * Remove a likely full-canvas background from the active iOS source.
 */
function iosRemoveLikelyBackground() {
  if (!iosSourceReady()) return;
  try {
    const root = iosSourceRoot(), [vx, vy, vw, vh] = iosParseSource().viewBox;
    const candidates = [...root.children].filter(node => !['defs', 'title', 'desc', 'metadata'].includes(node.localName.toLowerCase()));
    let best = null, bestArea = 0;
    // Inspect simple SVG geometry attributes first. This also works without
    // inserting a measuring SVG into the visible document.
    for (const node of candidates) {
      let box = null;
      if (node.localName === 'rect') {
        const nx = Number(node.getAttribute('x') || 0), ny = Number(node.getAttribute('y') || 0);
        const nw = Number(node.getAttribute('width') || 0), nh = Number(node.getAttribute('height') || 0);
        box = { x: nx, y: ny, width: nw, height: nh };
      } else {
        let holder;
        try {
          holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          holder.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
          holder.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1000px;height:1000px;visibility:hidden';
          holder.appendChild(root.cloneNode(true));
          document.body.appendChild(holder);

          const clonedRoot = holder.firstElementChild;
          const clonedCandidates = [...clonedRoot.children].filter(candidate =>
            !['defs', 'title', 'desc', 'metadata'].includes(candidate.localName.toLowerCase())
          );
          const copy = clonedCandidates[candidates.indexOf(node)];
          if (copy) box = copy.getBBox();
        } catch {
          // Complex SVG geometry cannot always be measured; skip that candidate.
        } finally {
          // Always remove the off-screen measurement tree, including on getBBox failures.
          holder?.remove();
        }
      }
      if (!box) continue;
      const covers = box.width >= vw * .88 && box.height >= vh * .88 && box.x <= vx + vw * .06 && box.y <= vy + vh * .06 && box.x + box.width >= vx + vw * .94 && box.y + box.height >= vy + vh * .94;
      if (covers && box.width * box.height > bestArea) { best = node; bestArea = box.width * box.height; }
    }
    if (!best) { iosStatus('No clear full-canvas background shape was found. Select the background element in the list and delete it manually.', 'error'); return; }
    iosSnapshot(); const label = `<${best.localName}>${best.id ? `#${best.id}` : ''}`; best.remove(); iosState.source = iosSerialize(root); iosState.selected = null; iosById('iosSvgSourceInput').value = iosState.source; iosRefreshAll(); iosPopulateElementPicker(); iosStatus(`Removed likely background ${label} from the iOS SVG.`, 'success');
  } catch (error) { iosStatus(`Background removal failed: ${error.message}`, 'error'); }
}
/**
 * Delete the selected SVG element from the iOS source.
 */
function iosDeleteSelected() {
  const value = iosById('iosAppElementSelect').value;
  if (value === '' || iosState.selected === null) { iosStatus('Select an SVG element first.', 'error'); return; }
  const root = iosSourceRoot(), elements = [...root.querySelectorAll('*')], target = elements[Number(value)];
  if (!target) return;
  iosSnapshot(); const label = `<${target.localName}>${target.id ? `#${target.id}` : ''}`; target.remove(); iosState.source = iosSerialize(root); iosById('iosSvgSourceInput').value = iosState.source; iosState.selected = null; iosRefreshAll(); iosPopulateElementPicker(); iosStatus(`Deleted ${label} from the iOS SVG.`, 'success');
}
/**
 * Build and download the configured square Brand Icon SVG.
 */
async function iosDownloadAppSvg() {
  const size = iosClamp(iosById('iosAppDimension').value);
  const text = iosBuildSquareSvg(size, { padding: Number(iosById('iosAppPadding').value) / 100, scale: Number(iosById('iosAppScale').value) / 100, includeBg: iosById('iosAppIncludeBackground').checked, bg: iosById('iosAppBgHex').value, radius: Number(iosById('iosAppCornerRadius').value) });
  iosDownloadBlob(`ios-app-icon-${size}x${size}.svg`, new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
}
/**
 * Build and download the configured Dynamic Island SVG.
 */
async function iosDownloadIsland() {
  const text = iosBuildIslandSvg();
  iosDownloadBlob(`ios-dynamic-island-${iosClamp(iosById('iosIslandWidth').value, 18, 600)}x18.svg`, new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
}

// Independent iOS SVG source controls.
/* -------------------------------------------------------------------------- */
/* UI event bindings                                                          */
/* -------------------------------------------------------------------------- */
if (iosWorkspaceLoaded) {
iosById('iosSvgFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { iosSetSource(await file.text(), { original: true }); iosStatus(`Loaded ${file.name}.`, 'success'); }
  catch (error) { iosStatus(error.message, 'error'); }
  finally { event.target.value = ''; }
});
iosById('iosSvgDropzone').addEventListener('dragover', event => { event.preventDefault(); iosById('iosSvgDropzone').classList.add('dragover'); });
iosById('iosSvgDropzone').addEventListener('dragleave', () => iosById('iosSvgDropzone').classList.remove('dragover'));
iosById('iosSvgDropzone').addEventListener('drop', async event => { event.preventDefault(); iosById('iosSvgDropzone').classList.remove('dragover'); const file = event.dataTransfer.files?.[0]; if (!file) return; try { iosSetSource(await file.text(), { original: true }); iosStatus(`Loaded ${file.name}.`, 'success'); } catch (error) { iosStatus(error.message, 'error'); } });
iosById('iosLoadSvgBtn').addEventListener('click', () => { try { iosSetSource(iosById('iosSvgSourceInput').value.trim(), { original: true }); iosStatus('iOS SVG applied.', 'success'); } catch (error) { iosStatus(error.message, 'error'); } });
iosById('iosClearSvgBtn').addEventListener('click', () => { iosState.source = ''; iosState.original = ''; iosState.loaded = false; iosState.undo = []; iosState.selected = null; iosById('iosSvgSourceInput').value = ''; iosRefreshAll(); iosPopulateElementPicker(); iosStatus('iOS SVG cleared.'); });
iosById('iosAddSquareSizeBtn').addEventListener('click', () => { const size = iosClamp(iosById('iosNewSquareSize').value); if (iosState.squareSizes.includes(size)) { iosStatus(`${size} × ${size} is already in the list.`, 'error'); return; } iosState.squareSizes.push(size); iosState.squareSizes.sort((a, b) => a - b); iosRefreshSquareList(); iosRefreshAll(); iosStatus(`Added ${size} × ${size} px.`, 'success'); });
iosById('iosAppElementSelect').addEventListener('change', () => { const value = iosById('iosAppElementSelect').value; iosState.selected = value === '' ? null : Number(value); iosById('iosAppDeleteElementBtn').disabled = iosState.selected === null; iosStatus(iosState.selected === null ? 'No element selected.' : `Selected SVG element ${iosState.selected + 1}.`, ''); });
iosById('iosAppDeleteElementBtn').addEventListener('click', iosDeleteSelected);
iosById('iosAppDetectBgBtn').addEventListener('click', iosRemoveLikelyBackground);
iosById('iosIslandDetectBgBtn').addEventListener('click', iosRemoveLikelyBackground);
iosById('iosAppUndoBtn').addEventListener('click', iosUndoSourceEdit);
iosById('iosIslandUndoBtn').addEventListener('click', iosUndoSourceEdit);
iosById('iosAppRestoreBtn').addEventListener('click', () => { if (!iosState.original) return; iosSnapshot(); iosState.source = iosState.original; iosById('iosSvgSourceInput').value = iosState.source; iosState.selected = null; iosRefreshAll(); iosPopulateElementPicker(); iosStatus('Restored the original iOS SVG.', 'success'); });
['iosAppIncludeBackground', 'iosAppDimension', 'iosAppPadding', 'iosAppScale', 'iosAppCornerRadius', 'iosIslandWidth', 'iosIslandPadding', 'iosIslandScale', 'iosIslandIncludeBackground'].forEach(id => iosById(id).addEventListener('input', iosRefreshAll));
/**
 * Keep a color picker and hexadecimal input synchronized.
 */
function iosBindColor(colorId, hexId) { iosById(colorId).addEventListener('input', () => { iosById(hexId).value = iosById(colorId).value.toUpperCase(); iosRefreshAll(); }); iosById(hexId).addEventListener('change', () => { const value = iosById(hexId).value.trim(); if (/^#[0-9a-f]{6}$/i.test(value)) iosById(colorId).value = value; else iosById(hexId).value = iosById(colorId).value.toUpperCase(); iosRefreshAll(); }); }
iosBindColor('iosAppBgColor', 'iosAppBgHex'); iosBindColor('iosIslandBgColor', 'iosIslandBgHex');
document.querySelectorAll('[data-ios-app-move]').forEach(button => button.addEventListener('click', () => { const direction = button.dataset.iosAppMove; if (direction === 'left') iosState.offset.x -= 1; if (direction === 'right') iosState.offset.x += 1; if (direction === 'up') iosState.offset.y -= 1; if (direction === 'down') iosState.offset.y += 1; iosState.offset.x = Math.max(-200, Math.min(200, iosState.offset.x)); iosState.offset.y = Math.max(-200, Math.min(200, iosState.offset.y)); iosRefreshAll(); }));
iosById('iosAppCenterBtn').addEventListener('click', () => { iosState.offset = { x: 0, y: 0 }; iosRefreshAll(); });
iosById('iosAppDownloadBtn').addEventListener('click', async () => { try { await iosDownloadAppSvg(); iosStatus('iOS app icon SVG exported.', 'success'); } catch (error) { iosStatus(error.message, 'error'); } });
iosById('iosIslandDownloadBtn').addEventListener('click', async () => { try { await iosDownloadIsland(); iosStatus('Dynamic Island SVG exported at 18 px high.', 'success'); } catch (error) { iosStatus(error.message, 'error'); } });
document.querySelectorAll('[data-ios-zoom]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.iosZoom; const step = Number(button.dataset.zoomStep); iosState.zoom[key] = Math.max(0.5, Math.min(3, Number((iosState.zoom[key] + step * 0.25).toFixed(2)))); iosApplyZoom(key); }));
document.querySelectorAll('[data-ios-zoom-reset]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.iosZoomReset; iosState.zoom[key] = 1; iosApplyZoom(key); }));
iosRefreshAll();
iosPopulateElementPicker();
}

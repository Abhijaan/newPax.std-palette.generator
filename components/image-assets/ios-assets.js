
/* iOS asset workspace. Android assets remain owned by image-assets.js. */
const iosPanelMount = document.getElementById('iosAssetsPanel');
if (iosPanelMount) {
  try {
    const response = await fetch('components/image-assets/ios-assets.html');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    iosPanelMount.innerHTML = await response.text();
    document.querySelector('[data-platform="iosAssetsPanel"] .asset-coming-soon')?.remove();
  } catch (error) {
    iosPanelMount.innerHTML = '<div class="panel"><h3>Could not load the iOS workspace</h3><p>Run the project through Live Server or another local HTTP server.</p></div>';
    console.error('Unable to load iOS workspace:', error);
  }
}

const iosKinds = ['square', 'app', 'island'];
const iosState = {
  loaded: false,
  sources: { square: '', app: '', island: '' },
  originals: { square: '', app: '', island: '' },
  undo: { square: [], app: [], island: [] },
  selectedAppElement: null,
  appOffset: { x: 0, y: 0 },
  squareSizes: [90, 1024],
  zoom: { square: 1, app: 1, screen: 1, island: 1 }
};
const iosById = id => document.getElementById(id);
const iosNS = 'http://www.w3.org/2000/svg';
const iosStatus = (message, kind = '') => {
  const element = iosById('iosAssetStatus');
  if (element) {
    element.textContent = message;
    element.className = `asset-message ${kind}`.trim();
  }
};
const iosClamp = (value, min = 1, max = 4096) =>
  Math.max(min, Math.min(max, Math.round(Number(value) || min)));

function iosParseSvg(text) {
  if (!/<svg\b/i.test(text)) throw new Error('This does not look like SVG markup.');
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse this SVG. Check the markup.');

  const root = doc.documentElement;
  if (root.localName.toLowerCase() !== 'svg') throw new Error('The document root must be an <svg> element.');

  root.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node => node.remove());
  [root, ...root.querySelectorAll('*')].forEach(node => [...node.attributes].forEach(attr => {
    const name = attr.name.toLowerCase();
    const value = attr.value.trim();

    if (name.startsWith('on')) node.removeAttribute(attr.name);
    if (
      (name === 'href' || name.endsWith(':href')) &&
      value &&
      !value.startsWith('#') &&
      !value.startsWith('data:image/')
    ) {
      node.removeAttribute(attr.name);
    }
  }));

  let viewBox;
  const raw = root.getAttribute('viewBox');

  if (raw) {
    viewBox = raw.trim().split(/[\s,]+/).map(Number);
  } else {
    const width = parseFloat(root.getAttribute('width'));
    const height = parseFloat(root.getAttribute('height'));

    if (!(width > 0 && height > 0)) {
      throw new Error('SVG needs a valid viewBox or numeric width and height.');
    }

    viewBox = [0, 0, width, height];
    root.setAttribute('viewBox', viewBox.join(' '));
  }

  if (
    viewBox.length !== 4 ||
    viewBox.some(v => !Number.isFinite(v)) ||
    viewBox[2] <= 0 ||
    viewBox[3] <= 0
  ) {
    throw new Error('SVG viewBox must contain four numbers and positive dimensions.');
  }

  root.setAttribute('xmlns', iosNS);
  return { root, viewBox };
}

function iosSerialize(root) {
  return new XMLSerializer().serializeToString(root);
}

function iosDownloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function iosReady(kind) {
  return iosState.loaded && Boolean(iosState.sources[kind]);
}

function iosRoot(kind) {
  return iosParseSvg(iosState.sources[kind]).root;
}

function iosSaveUndo(kind) {
  iosState.undo[kind].push(iosState.sources[kind]);
  if (iosState.undo[kind].length > 40) iosState.undo[kind].shift();
}

function iosSetAllSources(text) {
  const parsed = iosParseSvg(text);
  const clean = iosSerialize(parsed.root);

  iosState.loaded = true;
  iosKinds.forEach(kind => {
    iosState.sources[kind] = clean;
    iosState.originals[kind] = clean;
    iosState.undo[kind] = [];
  });

  iosState.selectedAppElement = null;
  iosById('iosSvgSourceInput').value = clean;
  iosRefreshAll();
  iosPopulateAppElements();
  iosUpdateCleanupButtons();
}

function iosUndo(kind) {
  const previous = iosState.undo[kind].pop();
  if (!previous) return;

  iosState.sources[kind] = previous;
  if (kind === 'app') iosState.selectedAppElement = null;

  iosRefreshAll();
  iosPopulateAppElements();
  iosUpdateCleanupButtons();

  iosStatus(
    `Undid the last ${kind === 'app' ? 'Brand Icon' : kind === 'square' ? 'square icon' : 'Dynamic Island'} edit.`,
    'success'
  );
}

function iosRestore(kind) {
  if (!iosState.originals[kind]) return;

  iosSaveUndo(kind);
  iosState.sources[kind] = iosState.originals[kind];
  if (kind === 'app') iosState.selectedAppElement = null;

  iosRefreshAll();
  iosPopulateAppElements();
  iosUpdateCleanupButtons();

  iosStatus(
    `Restored the original ${kind === 'app' ? 'Brand Icon' : kind === 'square' ? 'square icon' : 'Dynamic Island'} SVG.`,
    'success'
  );
}

function iosBuildSquareSvg(kind, size, options = {}) {
  if (!iosReady(kind)) throw new Error('Load an iOS SVG first.');

  const { root, viewBox } = iosParseSvg(iosState.sources[kind]);
  const [x, y, w, h] = viewBox;
  const padding = Math.max(0, Math.min(.4, Number(options.padding || 0)));
  const scale = Math.max(.05, Number(options.scale || 1));
  const side = Math.max(w, h) / Math.max(.05, 1 - padding * 2);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const square = [cx - side / 2, cy - side / 2, side, side];
  const defs = [...root.children].filter(node => node.localName === 'defs');
  const group = document.createElementNS(iosNS, 'g');
  const offset = kind === 'app' ? iosState.appOffset : { x: 0, y: 0 };

  group.setAttribute(
    'transform',
    `translate(${offset.x / 100 * side} ${offset.y / 100 * side}) translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`
  );

  [...root.childNodes].forEach(node => {
    if (!(node.nodeType === Node.ELEMENT_NODE && node.localName === 'defs')) {
      group.appendChild(node);
    }
  });

  root.replaceChildren();
  defs.forEach(node => root.appendChild(node));

  const radius = Math.max(0, Math.min(50, Number(options.radius || 0)));

  if (options.includeBg) {
    const rect = document.createElementNS(iosNS, 'rect');
    rect.setAttribute('x', square[0]);
    rect.setAttribute('y', square[1]);
    rect.setAttribute('width', square[2]);
    rect.setAttribute('height', square[3]);
    rect.setAttribute('fill', options.bg || '#FFFFFF');

    if (radius) rect.setAttribute('rx', square[2] * radius / 100);

    rect.setAttribute('data-ios-generated-background', 'true');
    root.appendChild(rect);
  }

  if (radius > 0) {
    let defsRoot = root.querySelector('defs');

    if (!defsRoot) {
      defsRoot = document.createElementNS(iosNS, 'defs');
      root.insertBefore(defsRoot, root.firstChild);
    }

    const clip = document.createElementNS(iosNS, 'clipPath');
    clip.setAttribute('id', `iosClip${kind}`);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');

    const clipRect = document.createElementNS(iosNS, 'rect');
    clipRect.setAttribute('x', square[0]);
    clipRect.setAttribute('y', square[1]);
    clipRect.setAttribute('width', square[2]);
    clipRect.setAttribute('height', square[3]);
    clipRect.setAttribute('rx', square[2] * radius / 100);

    clip.appendChild(clipRect);
    defsRoot.appendChild(clip);
    group.setAttribute('clip-path', `url(#iosClip${kind})`);
  }

  root.appendChild(group);
  root.setAttribute('viewBox', square.join(' '));
  root.setAttribute('width', String(size));
  root.setAttribute('height', String(size));

  return iosSerialize(root);
}

function iosBuildIslandSvg() {
  if (!iosReady('island')) throw new Error('Load an iOS SVG first.');

  const { root, viewBox } = iosParseSvg(iosState.sources.island);
  const [x, y, w, h] = viewBox;
  const width = iosClamp(iosById('iosIslandWidth').value, 18, 600);
  const height = 18;
  const padding = Math.max(0, Math.min(.4, Number(iosById('iosIslandPadding').value) / 100));
  const scale = Number(iosById('iosIslandScale').value) / 100;
  const fit = Math.min(width * (1 - 2 * padding) / w, height * (1 - 2 * padding) / h) * scale;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const defs = [...root.children].filter(node => node.localName === 'defs');
  const group = document.createElementNS(iosNS, 'g');

  group.setAttribute('transform', `translate(${width / 2} ${height / 2}) scale(${fit}) translate(${-cx} ${-cy})`);

  [...root.childNodes].forEach(node => {
    if (!(node.nodeType === Node.ELEMENT_NODE && node.localName === 'defs')) {
      group.appendChild(node);
    }
  });

  root.replaceChildren();
  defs.forEach(node => root.appendChild(node));

  if (iosById('iosIslandIncludeBackground').checked) {
    const rect = document.createElementNS(iosNS, 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('rx', '9');
    rect.setAttribute('fill', iosById('iosIslandBgHex').value);
    root.appendChild(rect);
  }

  root.appendChild(group);
  root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));

  return iosSerialize(root);
}

function iosSvgUrl(text) {
  return URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
}

function iosSetImage(imageId, text) {
  const image = iosById(imageId);

  if (!text) {
    image.hidden = true;
    return;
  }

  const url = iosSvgUrl(text);
  const old = image.dataset.objectUrl;

  if (old) URL.revokeObjectURL(old);

  image.dataset.objectUrl = url;
  image.onload = () => { image.hidden = false; };
  image.onerror = () => { image.hidden = true; };
  image.src = url;
}

function iosUpdateCleanupButtons() {
  const loaded = iosState.loaded;

  [['iosSquareDetectBgBtn', loaded], ['iosAppDetectBgBtn', loaded], ['iosIslandDetectBgBtn', loaded]]
    .forEach(([id, enabled]) => { iosById(id).disabled = !enabled; });

  iosById('iosSquareUndoBtn').disabled = !iosState.undo.square.length;
  iosById('iosAppUndoBtn').disabled = !iosState.undo.app.length;
  iosById('iosIslandUndoBtn').disabled = !iosState.undo.island.length;

  iosById('iosSquareRestoreBtn').disabled = !loaded || iosState.sources.square === iosState.originals.square;
  iosById('iosAppRestoreBtn').disabled = !loaded || iosState.sources.app === iosState.originals.app;
}

function iosPopulateAppElements() {
  const select = iosById('iosAppElementSelect');
  const count = iosById('iosAppElementCount');

  if (!select || !count) return;

  select.replaceChildren();

  if (!iosReady('app')) {
    select.add(new Option('Load SVG first', ''));
    select.disabled = true;
    iosById('iosAppDeleteElementBtn').disabled = true;
    count.textContent = '0';
    return;
  }

  const nodes = [...iosRoot('app').querySelectorAll('*')];

  nodes.forEach((node, index) => {
    select.add(new Option(`${index + 1}. ${node.localName}${node.id ? `#${node.id}` : ''}`, String(index)));
  });

  select.disabled = !nodes.length;
  count.textContent = String(nodes.length);

  if (iosState.selectedAppElement !== null && iosState.selectedAppElement < nodes.length) {
    select.value = String(iosState.selectedAppElement);
  } else {
    iosState.selectedAppElement = null;
  }

  iosById('iosAppDeleteElementBtn').disabled = iosState.selectedAppElement === null;
}

function iosFindBackground(kind) {
  if (!iosReady(kind)) return;

  try {
    const root = iosRoot(kind);
    const [, , vw, vh] = iosParseSvg(iosState.sources[kind]).viewBox;
    const candidates = [...root.children].filter(node =>
      !['defs', 'title', 'desc', 'metadata'].includes(node.localName.toLowerCase())
    );

    let best = null;
    let bestArea = 0;

    candidates.forEach(node => {
      let box = null;

      if (node.localName === 'rect') {
        box = {
          x: Number(node.getAttribute('x') || 0),
          y: Number(node.getAttribute('y') || 0),
          width: Number(node.getAttribute('width') || 0),
          height: Number(node.getAttribute('height') || 0)
        };
      } else {
        let host;

        try {
          host = document.createElementNS(iosNS, 'svg');
          host.setAttribute('viewBox', iosParseSvg(iosState.sources[kind]).viewBox.join(' '));
          host.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1000px;height:1000px;visibility:hidden';
          host.appendChild(root.cloneNode(true));
          document.body.appendChild(host);

          const copyRoot = host.firstElementChild;
          const copyNodes = [...copyRoot.children].filter(n =>
            !['defs', 'title', 'desc', 'metadata'].includes(n.localName.toLowerCase())
          );
          const copy = copyNodes[candidates.indexOf(node)];
          if (copy) box = copy.getBBox();
        } catch {
          /* Some SVG elements cannot be measured in every browser. */
        } finally {
          host?.remove();
        }
      }

      if (!box) return;

      const covers = box.width >= vw * .88 &&
        box.height >= vh * .88 &&
        box.x <= vw * .06 &&
        box.y <= vh * .06;

      if (covers && box.width * box.height > bestArea) {
        best = node;
        bestArea = box.width * box.height;
      }
    });

    if (!best) {
      iosStatus('No obvious full-canvas background found. You can select and delete an element in Brand Icon, or adjust the source SVG.', 'error');
      return;
    }

    iosSaveUndo(kind);
    const label = `<${best.localName}>${best.id ? `#${best.id}` : ''}`;
    best.remove();
    iosState.sources[kind] = iosSerialize(root);

    if (kind === 'app') iosState.selectedAppElement = null;

    iosRefreshAll();
    iosPopulateAppElements();
    iosUpdateCleanupButtons();

    iosStatus(
      `Removed ${label} from ${kind === 'square' ? 'square icons only' : kind === 'app' ? 'Brand Icon only' : 'Dynamic Island only'}.`,
      'success'
    );
  } catch (error) {
    iosStatus(`Background detection failed: ${error.message}`, 'error');
  }
}

function iosDeleteAppElement() {
  const index = Number(iosById('iosAppElementSelect').value);

  if (!Number.isInteger(index) || iosState.selectedAppElement === null) {
    iosStatus('Select an SVG element first.', 'error');
    return;
  }

  const root = iosRoot('app');
  const target = [...root.querySelectorAll('*')][index];
  if (!target) return;

  iosSaveUndo('app');
  const label = `<${target.localName}>${target.id ? `#${target.id}` : ''}`;
  target.remove();
  iosState.sources.app = iosSerialize(root);
  iosState.selectedAppElement = null;

  iosRefreshAll();
  iosPopulateAppElements();
  iosUpdateCleanupButtons();
  iosStatus(`Deleted ${label} from Brand Icon only.`, 'success');
}

function iosSquareOptions() {
  return {
    padding: Number(iosById('iosSquarePadding').value) / 100,
    scale: Number(iosById('iosSquareScale').value) / 100,
    includeBg: iosById('iosSquareIncludeBackground').checked,
    bg: iosById('iosSquareBgHex').value
  };
}

function iosAppOptions() {
  return {
    padding: Number(iosById('iosAppPadding').value) / 100,
    scale: Number(iosById('iosAppScale').value) / 100,
    includeBg: iosById('iosAppIncludeBackground').checked,
    bg: iosById('iosAppBgHex').value,
    radius: Number(iosById('iosAppCornerRadius').value)
  };
}

function iosApplyZoom(key) {
  const zoom = iosState.zoom[key] || 1;
  const target = key === 'square'
    ? iosById('iosSquareFrame')
    : key === 'app'
      ? iosById('iosAppFrame')
      : key === 'island'
        ? iosById('iosIslandPreviewFrame')
        : document.querySelector('#iosAssetsPanel .asset-android-preview-card .onboarding-phone');

  if (target) {
    target.style.transform = `scale(${zoom})`;
    target.style.transformOrigin = 'center center';
  }

  const readout = iosById(({
    square: 'iosSquareZoomReadout',
    app: 'iosAppZoomReadout',
    screen: 'iosScreenZoomReadout',
    island: 'iosIslandZoomReadout'
  })[key]);

  if (readout) readout.textContent = `${Math.round(zoom * 100)}%`;
}

function iosRefreshSquareList() {
  const list = iosById('iosSquareSizeList');
  list.replaceChildren();

  iosState.squareSizes.forEach(size => {
    const row = document.createElement('div');
    row.className = 'ios-size-item';

    const title = document.createElement('strong');
    title.textContent = `${size} × ${size} px`;

    const format = document.createElement('select');
    format.className = 'asset-select';
    format.setAttribute('aria-label', `Format for ${size} px icon`);
    format.innerHTML = '<option value="svg">SVG</option><option value="png">PNG</option>';

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'btn primary';
    download.textContent = 'Download';
    download.disabled = !iosReady('square');
    download.addEventListener('click', async () => {
      try {
        await iosDownloadSquare(size, format.value);
        iosStatus(`${size} × ${size} ${format.value.toUpperCase()} exported.`, 'success');
      } catch (error) {
        iosStatus(error.message, 'error');
      }
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn ios-size-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      if (iosState.squareSizes.length === 1) {
        iosStatus('Keep at least one square size.', 'error');
        return;
      }

      iosState.squareSizes = iosState.squareSizes.filter(value => value !== size);
      iosRefreshSquareList();
      iosRefreshAll();
    });

    row.append(title, format, download, remove);
    list.appendChild(row);
  });
}

async function iosDownloadSquare(size, format) {
  const svg = iosBuildSquareSvg('square', size, iosSquareOptions());

  if (format === 'svg') {
    iosDownloadBlob(`ios-icon-${size}x${size}.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    return;
  }

  const url = iosSvgUrl(svg);

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not render this SVG as PNG.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(image, 0, 0, size, size);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG export failed.');

    iosDownloadBlob(`ios-icon-${size}x${size}.png`, blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function iosRefreshAll() {
  const ready = iosState.loaded;

  ['iosAppDownloadBtn', 'iosIslandDownloadBtn'].forEach(id => {
    iosById(id).disabled = !ready;
  });

  iosRefreshSquareList();

  if (!ready) {
    ['iosSquarePreview', 'iosAppPreview', 'iosIslandPreview', 'iosScreenBrandImage'].forEach(id => {
      if (iosById(id)) iosById(id).hidden = true;
    });
    return;
  }

  const squareSize = iosState.squareSizes[0] || 90;
  const squarePreviewSide = 200;

  iosById('iosSquarePreviewSize').textContent = `${squareSize} × ${squareSize} px`;
  iosById('iosSquareCanvasInfo').textContent = `${squareSize} × ${squareSize} px`;
  iosById('iosSquarePaddingInfo').textContent = `${iosById('iosSquarePadding').value}%`;
  iosById('iosSquareBackgroundInfo').textContent =
    iosById('iosSquareIncludeBackground').checked ? iosById('iosSquareBgHex').value : 'Transparent';

  const squareFrame = iosById('iosSquareFrame');
  squareFrame.style.width = `${squarePreviewSide}px`;
  squareFrame.style.height = `${squarePreviewSide}px`;
  squareFrame.style.borderRadius = '0';
  squareFrame.classList.toggle('has-background', iosById('iosSquareIncludeBackground').checked);
  squareFrame.style.background = iosById('iosSquareIncludeBackground').checked
    ? iosById('iosSquareBgHex').value
    : '';

  iosSetImage('iosSquarePreview', iosBuildSquareSvg('square', squareSize, iosSquareOptions()));

  iosById('iosSquarePaddingValue').textContent = `${iosById('iosSquarePadding').value}%`;
  iosById('iosSquareScaleValue').textContent = `${iosById('iosSquareScale').value}%`;

  const appSize = iosClamp(iosById('iosAppDimension').value);

  iosById('iosAppDimensionValue').textContent = `${appSize} × ${appSize} px`;
  iosById('iosAppPreviewDimensions').textContent = `${appSize} × ${appSize} px`;
  iosById('iosAppCanvasInfo').textContent = `${appSize} × ${appSize} px`;
  iosById('iosAppPaddingInfo').textContent = `${iosById('iosAppPadding').value}%`;
  iosById('iosAppBackgroundInfo').textContent =
    iosById('iosAppIncludeBackground').checked ? iosById('iosAppBgHex').value : 'Transparent';

  const appPreviewSide = 200;
  const appFrame = iosById('iosAppFrame');
  appFrame.style.width = `${appPreviewSide}px`;
  appFrame.style.height = `${appPreviewSide}px`;
  appFrame.style.borderRadius = `${Number(iosById('iosAppCornerRadius').value)}%`;
  appFrame.style.background = iosById('iosAppIncludeBackground').checked
    ? iosById('iosAppBgHex').value
    : '';

  iosSetImage('iosAppPreview', iosBuildSquareSvg('app', appSize, iosAppOptions()));
  iosSetImage('iosScreenBrandImage', iosBuildSquareSvg('app', appSize, iosAppOptions()));

  const screenHex = iosById('iosPhoneBgHex')?.value?.trim();
  const screenBg = /^#[0-9a-f]{6}$/i.test(screenHex || '') ? screenHex : '#F36D21';

  if (iosById('iosPhoneScreen')) iosById('iosPhoneScreen').style.background = screenBg;
  if (iosById('iosPhoneWelcomeButton')) iosById('iosPhoneWelcomeButton').style.color = screenBg;

  if (iosById('iosPhoneIcon')) {
    iosById('iosPhoneIcon').style.background =
      iosById('iosAppIncludeBackground').checked ? iosById('iosAppBgHex').value : 'transparent';
    iosById('iosPhoneIcon').style.borderRadius = `${Number(iosById('iosAppCornerRadius').value)}%`;
  }

  iosById('iosAppPaddingValue').textContent = `${iosById('iosAppPadding').value}%`;
  iosById('iosAppScaleValue').textContent = `${iosById('iosAppScale').value}%`;

  // Show the radius as a percentage and as pixels relative to the configured SVG canvas.
  const cornerPercent = Number(iosById('iosAppCornerRadius').value);
  const cornerPixels = appSize * cornerPercent / 100;
  const cornerPixelLabel = Number.isInteger(cornerPixels)
    ? String(cornerPixels)
    : cornerPixels.toFixed(1);

  iosById('iosAppCornerValue').textContent = `${cornerPercent}% · ${cornerPixelLabel} px`;
  iosById('iosAppOffsetReadout').textContent = `X ${iosState.appOffset.x} · Y ${iosState.appOffset.y}`;

  const islandWidth = iosClamp(iosById('iosIslandWidth').value, 18, 600);

  iosById('iosIslandWidthValue').textContent = `${islandWidth} px`;
  iosById('iosIslandPreviewDimensions').textContent = `${islandWidth} × 18 px`;
  iosById('iosIslandPaddingValue').textContent = `${iosById('iosIslandPadding').value}%`;
  iosById('iosIslandScaleValue').textContent = `${iosById('iosIslandScale').value}%`;

  const islandFrame = iosById('iosIslandPreviewFrame');
  const islandDisplayWidth = Math.min(520, Math.max(90, islandWidth * 2));
  islandFrame.style.width = `${islandDisplayWidth}px`;
  islandFrame.style.height = `${islandDisplayWidth * 18 / islandWidth}px`;
  islandFrame.style.background = iosById('iosIslandIncludeBackground').checked
    ? iosById('iosIslandBgHex').value
    : '';

  iosSetImage('iosIslandPreview', iosBuildIslandSvg());

  ['square', 'app', 'screen', 'island'].forEach(iosApplyZoom);
  iosUpdateCleanupButtons();
}

function iosBindColor(colorId, hexId) {
  iosById(colorId).addEventListener('input', () => {
    iosById(hexId).value = iosById(colorId).value.toUpperCase();
    iosRefreshAll();
  });

  iosById(hexId).addEventListener('change', () => {
    const value = iosById(hexId).value.trim();

    if (/^#[0-9a-f]{6}$/i.test(value)) {
      iosById(colorId).value = value;
    } else {
      iosById(hexId).value = iosById(colorId).value.toUpperCase();
    }

    iosRefreshAll();
  });
}

/* Source import: each output receives its own copy. */
iosById('iosSvgFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    iosSetAllSources(await file.text());
    iosStatus(`Loaded ${file.name}. Each iOS output has an independent editable copy.`, 'success');
  } catch (error) {
    iosStatus(error.message, 'error');
  } finally {
    event.target.value = '';
  }
});

iosById('iosSvgDropzone').addEventListener('dragover', event => {
  event.preventDefault();
  iosById('iosSvgDropzone').classList.add('dragover');
});

iosById('iosSvgDropzone').addEventListener('dragleave', () => {
  iosById('iosSvgDropzone').classList.remove('dragover');
});

iosById('iosSvgDropzone').addEventListener('drop', async event => {
  event.preventDefault();
  iosById('iosSvgDropzone').classList.remove('dragover');

  const file = event.dataTransfer.files?.[0];
  if (!file) return;

  try {
    iosSetAllSources(await file.text());
    iosStatus(`Loaded ${file.name}. Each iOS output has an independent editable copy.`, 'success');
  } catch (error) {
    iosStatus(error.message, 'error');
  }
});

iosById('iosLoadSvgBtn').addEventListener('click', () => {
  try {
    iosSetAllSources(iosById('iosSvgSourceInput').value.trim());
    iosStatus('Applied SVG to all three independent iOS outputs.', 'success');
  } catch (error) {
    iosStatus(error.message, 'error');
  }
});

iosById('iosClearSvgBtn').addEventListener('click', () => {
  iosState.loaded = false;

  iosKinds.forEach(kind => {
    iosState.sources[kind] = '';
    iosState.originals[kind] = '';
    iosState.undo[kind] = [];
  });

  iosById('iosSvgSourceInput').value = '';
  iosRefreshAll();
  iosPopulateAppElements();
  iosUpdateCleanupButtons();
  iosStatus('iOS source cleared.');
});

iosById('iosAddSquareSizeBtn').addEventListener('click', () => {
  const size = iosClamp(iosById('iosNewSquareSize').value);

  if (iosState.squareSizes.includes(size)) {
    iosStatus(`${size} × ${size} is already listed.`, 'error');
    return;
  }

  iosState.squareSizes.push(size);
  iosState.squareSizes.sort((a, b) => a - b);
  iosRefreshSquareList();
  iosRefreshAll();
});

iosById('iosAppElementSelect').addEventListener('change', () => {
  const value = iosById('iosAppElementSelect').value;
  iosState.selectedAppElement = value === '' ? null : Number(value);
  iosById('iosAppDeleteElementBtn').disabled = iosState.selectedAppElement === null;
});

iosById('iosAppDeleteElementBtn').addEventListener('click', iosDeleteAppElement);

[['iosSquareDetectBgBtn', 'square'], ['iosAppDetectBgBtn', 'app'], ['iosIslandDetectBgBtn', 'island']]
  .forEach(([id, kind]) => iosById(id).addEventListener('click', () => iosFindBackground(kind)));

[['iosSquareUndoBtn', 'square'], ['iosAppUndoBtn', 'app'], ['iosIslandUndoBtn', 'island']]
  .forEach(([id, kind]) => iosById(id).addEventListener('click', () => iosUndo(kind)));

[['iosSquareRestoreBtn', 'square'], ['iosAppRestoreBtn', 'app']]
  .forEach(([id, kind]) => iosById(id).addEventListener('click', () => iosRestore(kind)));

[
  'iosSquareIncludeBackground',
  'iosSquarePadding',
  'iosSquareScale',
  'iosAppIncludeBackground',
  'iosAppDimension',
  'iosAppPadding',
  'iosAppScale',
  'iosAppCornerRadius',
  'iosIslandWidth',
  'iosIslandPadding',
  'iosIslandScale',
  'iosIslandIncludeBackground'
].forEach(id => iosById(id).addEventListener('input', iosRefreshAll));

iosBindColor('iosSquareBgColor', 'iosSquareBgHex');
iosBindColor('iosAppBgColor', 'iosAppBgHex');
iosBindColor('iosIslandBgColor', 'iosIslandBgHex');

/* Mirror the palette choices available to Android's Brand Icon, while keeping iOS settings independent. */
function iosCopyPaletteOptions(sourceId, targetId, fallbackLabel, fallbackColor) {
  const target = iosById(targetId);
  const source = iosById(sourceId);
  if (!target) return;

  const current = target.value || fallbackColor;
  target.replaceChildren(new Option(fallbackLabel, fallbackColor));

  if (source) {
    [...source.options].forEach(option => {
      const color = option.value;

      if (
        /^#[0-9a-f]{6}$/i.test(color) &&
        ![...target.options].some(existing => existing.value.toLowerCase() === color.toLowerCase())
      ) {
        target.add(new Option(option.textContent.trim(), color));
      }
    });
  }

  target.value = [...target.options].some(option =>
    option.value.toLowerCase() === current.toLowerCase()
  ) ? current : fallbackColor;
}

iosCopyPaletteOptions('brandPaletteColor', 'iosSquarePaletteColor', 'Custom / white', '#FFFFFF');
iosCopyPaletteOptions('brandPaletteColor', 'iosAppPaletteColor', 'Custom / white', '#FFFFFF');
iosCopyPaletteOptions('brandPhoneBgSelect', 'iosPhoneBgPalette', 'Brand orange · #F36D21', '#F36D21');

function iosSyncPaletteToColor(selectId, colorId, hexId, includeBgId = null) {
  const color = iosById(selectId).value;

  iosById(colorId).value = color;
  iosById(hexId).value = color.toUpperCase();

  if (includeBgId) iosById(includeBgId).checked = true;

  iosRefreshAll();
}

iosById('iosSquarePaletteColor').addEventListener('change', () =>
  iosSyncPaletteToColor('iosSquarePaletteColor', 'iosSquareBgColor', 'iosSquareBgHex', 'iosSquareIncludeBackground')
);

iosById('iosAppPaletteColor').addEventListener('change', () =>
  iosSyncPaletteToColor('iosAppPaletteColor', 'iosAppBgColor', 'iosAppBgHex', 'iosAppIncludeBackground')
);

iosById('iosPhoneBgPalette').addEventListener('change', () =>
  iosSyncPaletteToColor('iosPhoneBgPalette', 'iosPhoneBgColor', 'iosPhoneBgHex')
);

iosBindColor('iosPhoneBgColor', 'iosPhoneBgHex');

document.querySelectorAll('[data-ios-app-move]').forEach(button => {
  button.addEventListener('click', () => {
    const direction = button.dataset.iosAppMove;

    if (direction === 'left') iosState.appOffset.x -= 1;
    if (direction === 'right') iosState.appOffset.x += 1;
    if (direction === 'up') iosState.appOffset.y -= 1;
    if (direction === 'down') iosState.appOffset.y += 1;

    iosState.appOffset.x = Math.max(-200, Math.min(200, iosState.appOffset.x));
    iosState.appOffset.y = Math.max(-200, Math.min(200, iosState.appOffset.y));

    iosRefreshAll();
  });
});

iosById('iosAppCenterBtn').addEventListener('click', () => {
  iosState.appOffset = { x: 0, y: 0 };
  iosRefreshAll();
});

iosById('iosAppDownloadBtn').addEventListener('click', () => {
  try {
    const size = iosClamp(iosById('iosAppDimension').value);
    const svg = iosBuildSquareSvg('app', size, iosAppOptions());

    iosDownloadBlob(
      `ios-app-icon-${size}x${size}.svg`,
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    );

    iosStatus('Brand Icon SVG exported.', 'success');
  } catch (error) {
    iosStatus(error.message, 'error');
  }
});

iosById('iosIslandDownloadBtn').addEventListener('click', () => {
  try {
    const width = iosClamp(iosById('iosIslandWidth').value, 18, 600);

    iosDownloadBlob(
      `ios-dynamic-island-${width}x18.svg`,
      new Blob([iosBuildIslandSvg()], { type: 'image/svg+xml;charset=utf-8' })
    );

    iosStatus('Dynamic Island SVG exported at 18 px high.', 'success');
  } catch (error) {
    iosStatus(error.message, 'error');
  }
});

document.querySelectorAll('[data-ios-zoom]').forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.iosZoom;
    const step = Number(button.dataset.zoomStep);

    iosState.zoom[key] = Math.max(
      .5,
      Math.min(3, Number((iosState.zoom[key] + step * .25).toFixed(2)))
    );

    iosApplyZoom(key);
  });
});

document.querySelectorAll('[data-ios-zoom-reset]').forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.iosZoomReset;
    iosState.zoom[key] = 1;
    iosApplyZoom(key);
  });
});

iosRefreshAll();
iosPopulateAppElements();
iosUpdateCleanupButtons();

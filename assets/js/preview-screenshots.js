
/** Capture a local DOM preview as PNG, download it, and try to copy the image.
 * Uses an SVG foreignObject so the existing DOM/CSS preview can be rendered
 * without introducing a framework or external dependency.
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not inline an image for the screenshot.'));
    reader.readAsDataURL(blob);
  });
}

async function inlineCloneImages(sourceNodes, cloneNodes) {
  await Promise.all(sourceNodes.map(async (source, index) => {
    if (!(source instanceof HTMLImageElement)) return;
    const target = cloneNodes[index];
    if (!(target instanceof HTMLImageElement)) return;
    const sourceUrl = source.currentSrc || source.src;
    if (!sourceUrl || sourceUrl.startsWith('data:')) return;

    try {
      // Blob URLs are common in the SVG preview. Inlining them avoids nested
      // resource loading failures some browsers have with foreignObject.
      const response = await fetch(sourceUrl);
      if (response.ok) target.src = await blobToDataUrl(await response.blob());
    } catch {
      // Leave same-origin URLs as-is. Rendering will report if capture fails.
    }
    target.removeAttribute('srcset');
    target.removeAttribute('sizes');
  }));
}

async function renderElementToPng(element) {
  if (!element) throw new Error('Preview element was not found.');
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width), height = Math.ceil(rect.height);
  if (!width || !height) throw new Error('The preview has no visible size. Open its tab and try again.');

  const clone = element.cloneNode(true);
  const sourceNodes = [element, ...element.querySelectorAll('*')];
  const cloneNodes = [clone, ...clone.querySelectorAll('*')];

  sourceNodes.forEach((source, index) => {
    const target = cloneNodes[index];
    if (!target) return;
    const computed = getComputedStyle(source);
    let inline = '';
    for (const property of computed) inline += `${property}:${computed.getPropertyValue(property)};`;
    target.setAttribute('style', `${inline};box-sizing:border-box;`);

    if (source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement || source instanceof HTMLSelectElement) {
      if (source instanceof HTMLInputElement && (source.type === 'checkbox' || source.type === 'radio')) target.checked = source.checked;
      else target.setAttribute('value', source.value);
    }

    if (source instanceof HTMLCanvasElement && target instanceof HTMLCanvasElement) {
      try { target.setAttribute('data-canvas-snapshot', source.toDataURL('image/png')); } catch { /* handled below */ }
    }
  });

  // A canvas bitmap is not serialized as ordinary HTML, so replace cloned
  // canvases with inline PNG images before serializing the preview.
  cloneNodes.forEach(node => {
    if (!(node instanceof HTMLCanvasElement)) return;
    const data = node.getAttribute('data-canvas-snapshot');
    if (!data) return;
    const image = document.createElement('img');
    image.src = data;
    image.style.cssText = node.getAttribute('style') || '';
    node.replaceWith(image);
  });

  clone.style.setProperty('width', `${width}px`);
  clone.style.setProperty('height', `${height}px`);
  clone.style.setProperty('max-width', 'none');
  clone.style.setProperty('max-height', 'none');
  clone.style.setProperty('margin', '0');
  clone.style.setProperty('position', 'relative');
  clone.style.setProperty('inset', 'auto');

  await inlineCloneImages(sourceNodes, cloneNodes);

  const markup = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden">${markup}</div></foreignObject></svg>`;
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('This browser could not render the preview screenshot. Try Chrome on localhost and check the Console for blocked image resources.'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a screenshot canvas.');
    context.scale(2, 2);
    context.drawImage(image, 0, 0, width, height);

    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG screenshot export failed.');
    return png;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function downloadElementScreenshot(element, filename) {
  // Begin rendering immediately, but invoke clipboard.write before awaiting the
  // PNG. Some browsers require clipboard writes to start during the user gesture.
  const pngPromise = renderElementToPng(element);
  let clipboardPromise = null;

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      clipboardPromise = navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngPromise })
      ]);
    } catch {
      clipboardPromise = null;
    }
  }

  const png = await pngPromise;
  const downloadUrl = URL.createObjectURL(png);

  try {
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
  }

  let copiedToClipboard = false;
  if (clipboardPromise) {
    try {
      await clipboardPromise;
      copiedToClipboard = true;
    } catch (error) {
      console.warn('Screenshot was downloaded, but clipboard copy failed.', error);
    }
  }

  return { copiedToClipboard, filename };
}

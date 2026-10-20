/**
 * Browser-only DOM preview screenshot utility.
 *
 * The selected element is cloned with computed styles, wrapped in an SVG
 * foreignObject, and rasterized to PNG. This avoids a third-party screenshot
 * dependency, but browser-specific CSS/font rendering can differ from the live UI.
 */

const SCREENSHOT_SCALE = 2;
const OBJECT_URL_REVOKE_DELAY_MS = 1500;

/**
 * Download a DOM element as PNG and copy it to the clipboard when supported.
 *
 * @param {HTMLElement} element Element to capture.
 * @param {string} filename Suggested download filename.
 * @returns {Promise<{clipboardCopied: boolean, filename: string}>}
 */
export async function downloadElementScreenshot(element, filename) {
  if (!element) throw new Error('Preview element was not found.');

  const bounds = element.getBoundingClientRect();
  const width = Math.ceil(bounds.width);
  const height = Math.ceil(bounds.height);

  if (!width || !height) {
    throw new Error('The preview has no visible size. Open its tab and try again.');
  }

  const clone = element.cloneNode(true);
  const sourceNodes = [element, ...element.querySelectorAll('*')];
  const cloneNodes = [clone, ...clone.querySelectorAll('*')];

  // Inline computed styles so the SVG foreignObject can render without page CSS links.
  sourceNodes.forEach((source, index) => {
    const target = cloneNodes[index];
    if (!target) return;

    const computedStyle = getComputedStyle(source);
    const inlineStyles = [...computedStyle]
      .map(property => `${property}:${computedStyle.getPropertyValue(property)};`)
      .join('');
    target.setAttribute('style', `${inlineStyles};box-sizing:border-box;`);

    // Form controls do not always serialize their live values into cloned markup.
    if (
      source instanceof HTMLInputElement ||
      source instanceof HTMLTextAreaElement ||
      source instanceof HTMLSelectElement
    ) {
      if (source instanceof HTMLInputElement && ['checkbox', 'radio'].includes(source.type)) {
        target.checked = source.checked;
      } else {
        target.setAttribute('value', source.value);
      }
    }
  });

  Object.entries({
    width: `${width}px`,
    height: `${height}px`,
    'max-width': 'none',
    'max-height': 'none',
    margin: '0',
    position: 'relative',
    inset: 'auto'
  }).forEach(([property, value]) => clone.style.setProperty(property, value));

  const markup = new XMLSerializer().serializeToString(clone);
  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden">${markup}</div></foreignObject>`,
    '</svg>'
  ].join('');
  const svgObjectUrl = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('This browser could not render the preview screenshot.'));
      image.src = svgObjectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * SCREENSHOT_SCALE;
    canvas.height = height * SCREENSHOT_SCALE;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not initialize the screenshot canvas.');

    context.scale(SCREENSHOT_SCALE, SCREENSHOT_SCALE);
    context.drawImage(image, 0, 0, width, height);

    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG screenshot export failed.');

    downloadBlob(filename, png);
    const clipboardCopied = await tryCopyPngToClipboard(png);
    return { clipboardCopied, filename };
  } finally {
    URL.revokeObjectURL(svgObjectUrl);
  }
}

/** Trigger a download for a generated image Blob and release its URL later. */
function downloadBlob(filename, blob) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
}

/** Attempt PNG clipboard write without failing the download if permission is denied. */
async function tryCopyPngToClipboard(png) {
  try {
    if (!window.isSecureContext || !navigator.clipboard?.write || !window.ClipboardItem) {
      return false;
    }

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch (error) {
    console.info('Screenshot downloaded, but clipboard copy was unavailable:', error);
    return false;
  }
}

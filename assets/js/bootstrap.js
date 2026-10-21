/**
 * Application bootstrap.
 *
 * Feature controllers are imported only after their HTML fragments are mounted,
 * because those controllers bind directly to the fragment's form controls.
 */

/**
 * Fetch an HTML fragment into a mount point.
 *
 * @param {string} selector CSS selector for the mount element.
 * @param {string} path Relative URL of the fragment.
 * @returns {Promise<boolean>} Whether the fragment was loaded successfully.
 */
async function loadComponent(selector, path) {
  const mount = document.querySelector(selector);
  if (!mount) return false;

  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    mount.innerHTML = await response.text();
    mount.classList.add('loaded-component');
    return true;
  } catch (error) {
    console.error(`Unable to load component ${path}:`, error);
    mount.innerHTML = '<p class="component-error">Could not load this component. Run the site through a local server or GitHub Pages.</p>';
    return false;
  }
}

/** Wire the shared top-level tab navigation. */
function initializeApplicationTabs() {
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const panels = [...document.querySelectorAll('.tab-panel')];

  tabs.forEach(button => {
    button.addEventListener('click', () => {
      tabs.forEach(tab => {
        const active = tab === button;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      });

      panels.forEach(panel => {
        const active = panel.id === button.dataset.tab;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
    });
  });
}

const mobileHomeLoaded = await loadComponent(
  '[data-component="mobile-home"]',
  'components/mobile-home/home-screen.html?v=theme-toggle-state-v3'
);
const imageAssetsLoaded = await loadComponent(
  '[data-component="image-assets"]',
  'components/image-assets/image-assets.html'
);

document.querySelector('[data-component="mobile-home"]')?.classList.add('home-mobile-component');
initializeApplicationTabs();

// The order is part of the component contract: mount HTML before importing controllers.
if (mobileHomeLoaded) await import('./app.js');
if (imageAssetsLoaded) {
  await import('../../components/image-assets/image-assets.js');
  await import('../../components/image-assets/ios-assets.js');
}

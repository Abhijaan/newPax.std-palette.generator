/** Loads independently maintained feature components before their controllers. */
async function loadComponent(selector, path) {
  const mount = document.querySelector(selector);
  if (!mount) return;
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    mount.innerHTML = await response.text();
    mount.classList.add('loaded-component');
  } catch (error) {
    console.error(`Unable to load component ${path}:`, error);
    mount.innerHTML = `<p class="component-error">Could not load this component. Run the site through a local server or GitHub Pages.</p>`;
  }
}

await loadComponent('[data-component="mobile-home"]', 'components/mobile-home/home-screen.html');
await loadComponent('[data-component="image-assets"]', 'components/image-assets/image-assets.html');
const home = document.querySelector('[data-component="mobile-home"]');
if (home) home.classList.add('home-mobile-component');

// Tabs are shared shell behavior, not owned by either feature.
document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      const active = panel.id === button.dataset.tab;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  });
});

await import('./app.js');
await import('../../components/image-assets/image-assets.js');

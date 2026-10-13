# Color Palette Studio

A static, client-side palette generator hosted with GitHub Pages.

## Project structure

- `index.html` — page structure and accessible control markup.
- `assets/css/styles.css` — layout, responsive styling, mobile preview themes, and embedded reference-asset data URIs.
- `assets/js/palette-engine.js` — pure color conversion and palette-generation rules. This is the primary place to tune shade-generation behavior.
- `assets/js/palette-exporters.js` — JSON, Android XML/Kotlin, Swift, and iOS Asset Catalog serialization.
- `assets/js/app.js` — palette UI state, DOM rendering, interactions, clipboard and download behavior.
- `assets/js/bootstrap.js` — loads the mobile Home component before initializing the app.
- `components/mobile-home/` — all Home mobile preview markup and its dedicated stylesheet. Keep Home-only UI changes here; shared shell and palette styles stay under `assets/`.

## Local preview

Because JavaScript uses ES modules, open the project through a local static server instead of opening `index.html` as a `file://` URL. For example, from this directory:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages

Upload the contents of this folder to the root of the existing GitHub repository, preserving the `assets/` directory. Commit to the branch/folder configured for GitHub Pages.

## Add another preview screen later

1. Add the screen's markup to `index.html` using a unique class and a `data-screen` key.
2. Add its visibility and theme styles to `assets/css/styles.css`.
3. Add a selector button inside `.screen-toggle` in `index.html`.
4. If the screen needs interactions, add a focused handler in `assets/js/app.js`.

Profile and Drawer markup/styles/assets are retained in the project but their selector options are currently removed. The Splash screen is excluded.

## Palette algorithm

Algorithm constants and edge-case rules are documented near the top of `palette-engine.js`. Keep the generator pure: it should return palette data and should not update the DOM.


## Home mobile UI component

The Blueline Taxis Home preview is separated into `components/mobile-home/home-screen.html` and `components/mobile-home/home-screen.css`. `assets/js/bootstrap.js` injects the markup before `app.js` binds its controls. This works on GitHub Pages and local HTTP servers; do not open `index.html` directly with `file://` because the component is fetched as a separate file. The map image remains embedded in the shared stylesheet for now to preserve the exact supplied map asset.

# Color Palette Studio

Color Palette Studio is a static, browser-based tool for generating a ten-shade brand palette and preparing mobile image assets. Palette calculations, SVG processing, and exports run locally in the browser; there is no application backend.

## Run locally

Use Node.js 20+ for the quality checks. No npm install is required because the project has no runtime or development package dependencies.

To run the site, start any static HTTP server from the project root. For example:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Do not open `index.html` directly as a `file://` URL: the app fetches HTML fragments and uses JavaScript ES modules.

## Project structure

```text
index.html
assets/
  css/
    styles.css                    Shared theme, application shell, mobile preview
  js/
    bootstrap.js                  Fragment loading and application startup
    app.js                        Palette page UI controller
    palette-engine.js              Pure color math and palette algorithm
    palette-exporters.js           JSON, Android, Swift, and Xcode serializers
    preview-screenshots.js         DOM preview capture, PNG download, clipboard
components/
  mobile-home/
    home-screen.html               Mobile app preview markup
    home-screen.css                Mobile app preview styles
  image-assets/
    image-assets.html              Image Asset Studio and platform tabs
    image-assets.css               Shared controls and Android layout styles
    image-assets.js                Android SVG/raster editing and exports
    ios-assets.html                iOS asset workspace markup
    ios-assets.css                 iOS workspace styles
    ios-assets.js                  iOS SVG preview and export controller
scripts/
  check-syntax.mjs                 Dependency-free JavaScript syntax check
tests/
  palette-engine.test.js           Color math and palette generation tests
  palette-exporters.test.js        Export serialization tests
docs/
  ARCHITECTURE.md                  Module boundaries and data flow
CONTRIBUTING.md                    Development and review conventions
package.json                       Local quality-check commands
```

## Architecture

- `palette-engine.js` owns pure, deterministic color calculations and the shade-generation algorithm. It must not depend on the DOM.
- `palette-exporters.js` accepts generated palette data and returns platform-specific file contents. It does not access form controls or trigger downloads.
- `app.js` owns palette page events, rendering, copy/download interactions, and mobile preview theme tokens.
- `image-assets.js` owns Android SVG/raster editing, previews, and exports.
- `ios-assets.js` owns iOS source handling, previews, cleanup, and exports.
- `bootstrap.js` loads HTML fragments before importing controllers that bind to their controls.
- `styles.css` owns global tokens and the application shell. Feature styles belong in the relevant component stylesheet.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md) before changing shared behavior or adding a new feature.

## Features

### Palette generator

- Generates `BrandPrimary100` through `BrandPrimary1000`, with the seed fixed at `BrandPrimary600`.
- Reports HSB values and uses the approved fallback palette for seeds below the configured brightness threshold.
- Previews light/dark mobile UI colors and lets developers configure `colorOnPrimary` values.
- Exports JSON, Android XML, Kotlin/Compose, Swift, and individual Xcode color asset JSON payloads.

### Android Image Asset Studio

- Splash icon preview with checkerboard transparency, safe-circle guide, background toggle, padding, scale, positioning, SVG cleanup, undo/restore, and SVG/PNG export options.
- Brand Icon preview with independent SVG/PNG source selection, square canvas, background and palette color controls, padding, scale, rounded corners, raster background removal, undo/restore, and an Android welcome-screen preview.
- Preview screenshots download as PNG and attempt clipboard copy when supported by the browser and granted permission.

### iOS Image Asset Studio

- Square icon export list with per-size SVG/PNG downloads.
- App icon canvas with configurable dimensions, background, padding, artwork scale, corner radius, positioning, and SVG cleanup actions.
- Dynamic Island export with a fixed 18 px height and configurable width, padding, scale, and background.

## Quality checks

Run the following before submitting a change:

```bash
npm run check:syntax
npm test
# Run both commands together:
npm run check
```

The automated suite currently covers JavaScript syntax, HEX/RGB/HSB conversions, palette generation and fallback behavior, and export serialization. It does not replace browser testing for SVG rendering, clipboard permissions, downloads, or responsive layout.

## Known limitations

- SVG background detection is heuristic. Complex backgrounds, filters, masks, gradients, or embedded raster images may require manual cleanup.
- Removing an SVG element is a basic source-editing operation, not a full vector editor.
- DOM screenshots use SVG `foreignObject`; fonts and complex browser-specific CSS may render differently from the live page.
- Android sizing previews communicate design dimensions but do not guarantee that arbitrary SVG markup is a valid Android `VectorDrawable`. Verify exported assets in the target mobile project.

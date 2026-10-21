# Architecture

## Runtime model

Color Palette Studio is a static browser application. It does not require a backend, database, bundler, or runtime npm dependency. HTML fragments are fetched by `assets/js/bootstrap.js`, so the application must be served over HTTP rather than opened as a `file://` URL.

## Module responsibilities

| Module | Owns | Must not own |
| --- | --- | --- |
| `assets/js/bootstrap.js` | Loading HTML fragments, global tabs, controller startup order | Palette math or feature-specific SVG editing |
| `assets/js/app.js` | Palette form events, swatches, phone preview, copy/download UI | Palette-generation formulas or export serialization |
| `assets/js/palette-engine.js` | HEX/RGB/HSB conversion and palette-generation rules | DOM access, timers, notifications, or browser downloads |
| `assets/js/palette-exporters.js` | JSON, Android XML/Kotlin, Swift, and Xcode asset payloads | DOM access or mutable UI state |
| `assets/js/preview-screenshots.js` | DOM preview capture, PNG download, best-effort clipboard copy | Feature-specific screen styling or palette state |
| `components/image-assets/image-assets.js` | Android SVG editing, Brand Icon raster editing, previews, exports | Palette-generation logic |
| `components/image-assets/ios-assets.js` | iOS SVG source state, previews, cleanup, and exports | Android-specific state or palette-generation logic |
| `assets/css/styles.css` | Shared shell, global tokens, mobile preview, global theme | Feature-specific controller behavior |
| `components/*/*.css` | Feature-local layout and controls | Application state or runtime logic |

## Startup sequence

1. `index.html` loads the shared and feature stylesheets and starts `bootstrap.js` as an ES module.
2. `bootstrap.js` fetches the mobile preview and Image Asset Studio markup.
3. Shared page tabs are wired.
4. `app.js` initializes the palette page.
5. `image-assets.js` initializes the Android asset workspace.
6. `ios-assets.js` replaces the iOS placeholder panel with iOS markup and initializes iOS controls.

The ordering is intentional: feature controllers expect their HTML IDs to exist before event listeners are registered.

## Palette data flow

`app.js` validates the user-entered seed with `normalizeHex`, passes the seed and the internal low-saturation threshold to `generate`, and renders the returned `{ colors, mode, hsb, reason }` value. The threshold is intentionally not exposed as a UI control. Export actions pass the same palette result into pure serializer functions in `palette-exporters.js`.

`palette-engine.js` is designed to be testable in Node without a DOM. Keep it deterministic: the same seed and threshold should produce the same result.

## Asset editing and safety

- Treat SVG input as untrusted. Keep sanitization in the parsing boundary and validate `viewBox` dimensions before calculating transforms.
- Build export SVGs from a parsed copy rather than mutating the original source unless the user explicitly requests an edit.
- Keep undo snapshots before destructive edits.
- Revoke temporary object URLs after use or when replacing preview URLs.
- Keep Android and iOS editing state independent. Shared source data should only be shared intentionally.
- Background detection is heuristic; UI copy should not imply that every background can be identified perfectly.

## CSS organization

- `styles.css`: design tokens, application shell, palette controls, mobile preview, theme overrides.
- `image-assets.css`: shared Image Asset Studio controls and Android-specific preview layouts.
- `ios-assets.css`: iOS workspace layouts, zoom controls, and Dynamic Island preview.
- Add comments before a section when its selectors serve a distinct component or when a later override exists to preserve a specific behavior.

## Quality checks

Run `npm run check` before opening a pull request. It syntax-checks JavaScript files and runs the Node test suite for palette math and export serialization. Manually test browser-only workflows such as SVG import, preview updates, PNG downloads, clipboard permissions, undo/restore, and responsive layouts.

## Editing visible labels

- Palette headings, field labels, export options, and footer text are in `index.html`.
- Mobile preview headings and mock-screen labels are in `components/mobile-home/home-screen.html`.
- Image Asset Studio copy is in `components/image-assets/image-assets.html`; iOS-specific copy is in `components/image-assets/ios-assets.html`.
- Styling belongs in the stylesheet closest to the component.
- Toast and validation wording belongs in the controller that performs the action.

# Color Palette Studio

A modular, static web tool for generating color palettes and preparing mobile image assets. All palette and SVG processing runs locally in the browser.

## Run locally

From this directory, start a local static server:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. A local server is required because the app loads HTML components with `fetch()` and JavaScript ES modules.

## Structure

```text
index.html
assets/
  css/styles.css                 Shared app shell and palette layout
  js/
    bootstrap.js                 Loads feature components and shared tabs
    app.js                       Palette UI controller
    palette-engine.js            Palette generation
    palette-exporters.js         Palette export formats
components/
  mobile-home/                   Blueline Home mobile preview
    home-screen.html
    home-screen.css
  image-assets/                  SVG asset preparation feature
    image-assets.html            Android/iOS tabs and asset UI
    image-assets.css             Image asset feature styles
    image-assets.js              SVG parsing, previews and exports
```

## Image Asset Studio

- **Android > Splash screen icon:** fixed 288 × 288 or 240 × 240 output dimensions depending on whether the icon background is enabled. Includes a safe-circle guide, background color, canvas breathing room, and a 25–250% proportional artwork scale control. Artwork can extend beyond the fixed square viewport; overflow is clipped in both SVG and PNG exports.
- **Android > Brand icon:** fixed 200 × 200 px design canvas, PNG-only export, selectable PNG resolution, configurable padding/background/corner rounding, and a separate Android welcome-screen preview. The SVG is rasterized to PNG before brand-specific edits; automatic and click-to-remove background editing operate on connected raster pixels, with undo and restore.
- **SVG source editor:** paste/edit the source SVG. Splash cleanup remains vector-based; the Brand Icon is rendered to PNG first and its raster edits do not delete SVG paths from the source.
- **iOS:** placeholder workspace for future team-specific requirements.

### Android sizing reference

The current UI follows the Android Developers documentation for splash-screen icon sizing: 288 × 288 dp with a 192 dp safe circle when there is no icon background, or 240 × 240 dp with a 160 dp safe circle when using an icon background. Branded images use 200 × 80 dp. The UI previews these dimensions in CSS pixels for visual reference; actual Android assets should be implemented and tested in the app project. SVG export is not itself an Android `VectorDrawable` XML file.

Reference: <https://developer.android.com/develop/ui/views/launch/splash-screen>

## Limitations

- SVG sanitization removes script-like active content and external references, but complex SVG features may render differently across tools.
- Element deletion is basic: it removes one selected descendant element. Detailed geometry editing is done in the source textarea.
- Automatic background detection is heuristic: it looks for a top-level shape covering most of the SVG canvas. Complex backgrounds, filters, masks, or embedded raster images may need manual element deletion or source editing.
- No automated browser integration test has been run. JavaScript syntax has been checked with Node.js.


### Image Assets updates
- Splash preview uses a checkerboard transparency background; the surrounding window color control has been removed. Splash exports remain fixed to 288 × 288 px without an icon background and 240 × 240 px with one.
- Brand icon output is fixed to a 512 × 512 px square.
- SVG cleanup controls are split into separate automatic detection and manual element deletion sections.
- Undo last edit and Restore original uploaded SVG are available for recovery.

### Image Asset Studio editing controls (v4)
- SVG cleanup controls are provided separately inside the Splash icon and Brand icon sections.
- Selecting an element in either section highlights that element in its corresponding preview. Deleting or detecting a background edits the shared source SVG, so both outputs update.
- Undo and Restore Original are available inside each section.
- Focus the splash or brand preview and use the arrow keys to move artwork; hold Shift for a larger step. The arrow buttons offer the same movement controls, and Center resets that section's position.
- Movement and scale are applied to exported artwork while the splash/brand export canvas dimensions stay fixed.


### Brand icon workspace updates

- Brand icon canvas and PNG export are fixed at 200 × 200 px.
- Brand background can use a generated palette shade or a custom color.
- Optional rounded corners are applied to the brand asset export.
- A compact Android device preview supports independent screen background, icon size, and vertical placement controls.


### Latest Image Asset Studio changes
- Android welcome-screen preview now keeps its reference layout fixed; only the screen background color is editable, including a custom color picker.
- PNG exports support 1×/2×/3×/4× presets and custom pixel dimensions for splash and brand assets. The base splash canvas follows the selected Android guideline size; PNG resolution controls raster output resolution.


### Export defaults and resolution controls
- Splash export defaults to SVG. PNG resolution controls are shown only when PNG is selected.
- Brand Icon export is PNG-only by default; its PNG resolution selector supports 1×–4× and a custom square output size.
- Raster background removal uses a color-tolerance flood fill on connected pixels. Click a background region in the Brand Icon preview for manual removal; undo/restore are available.

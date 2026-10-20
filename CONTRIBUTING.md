# Contributing

## Before editing

1. Read `docs/ARCHITECTURE.md` and the comments at the top of the module you intend to change.
2. Identify the feature that owns the behavior. Avoid adding palette math to a UI controller or DOM logic to an exporter.
3. Preserve current output dimensions, naming conventions, fallback rules, and export formats unless the change explicitly updates those contracts.

## JavaScript conventions

- Use descriptive `camelCase` names for variables and functions, and uppercase names for shared constants.
- Keep functions focused on one responsibility. Extract non-trivial calculations from event handlers into named functions.
- Add JSDoc to exported functions and non-obvious internal functions. Document constraints and reasons, not syntax that is already clear from the code.
- Prefer guard clauses and explicit validation at file/import boundaries.
- Keep `palette-engine.js` pure and deterministic. Do not add `document`, `window`, UI notifications, or download behavior there.
- Keep SVG parsing and sanitization centralized. Do not add a new SVG import path that bypasses the sanitizer.
- Avoid adding dependencies for a small helper that can be implemented clearly with platform APIs.

## CSS conventions

- Keep shared shell rules in `assets/css/styles.css` and feature rules in their feature stylesheet.
- Add a short section comment that describes the component or behavior controlled by a group of selectors.
- Explain why a rule or override exists when the reason is not obvious. Avoid comments that simply repeat the property name.
- Preserve mobile breakpoints and keep mock-device theme tokens separate from the website theme.
- Prefer existing design tokens over hard-coded UI colors, except where a mock device must intentionally represent a fixed reference design.

## HTML conventions

- Keep IDs unique within the rendered document. JavaScript controllers depend on those IDs as stable internal interfaces.
- Keep labels associated with inputs and preserve accessible names for icon-only buttons.
- Keep component markup in its feature HTML fragment instead of growing `index.html` with feature-specific controls.

## Tests and review checklist

Run:

```bash
npm run check
```

Before merging, also verify in a browser:

- Generate a palette using a normal seed and a very dark seed.
- Confirm the seed remains `BrandPrimary600` and the shade order is stable.
- Exercise JSON, Android, Swift, and Xcode exports.
- Import a valid SVG and an invalid SVG; verify helpful errors and safe rendering.
- Test edit, undo, restore, preview zoom, SVG/PNG downloads, and color controls for each platform.
- Test narrow and wide viewports and confirm the tab controls remain keyboard-accessible.
- Check the browser console for missing IDs, failed fetches, and unhandled errors.

Describe any browser-only checks that could not be completed in the pull request. Do not describe static syntax checks as browser integration tests.

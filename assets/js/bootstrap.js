/** Loads the Home mobile UI component before initializing the palette app. */
const mount = document.querySelector("[data-component=\"mobile-home\"]");
try {
  const response = await fetch("components/mobile-home/home-screen.html");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  mount.innerHTML = await response.text();
  mount.classList.add("home-mobile-component");
  await import("./app.js");
} catch (error) {
  console.error("Unable to load Home mobile preview component:", error);
  mount.innerHTML = '<p class="component-error">Could not load the Home preview. Run this site through a local server or GitHub Pages.</p>';
}

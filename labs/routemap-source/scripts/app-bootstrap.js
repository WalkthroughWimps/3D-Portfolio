/* Keep application startup last while allowing feature controllers to load first. */
initializeApplication();
// This editor is defined after app.js, so initialize it only once every
// controller has loaded.
initializeSectionStyles?.();

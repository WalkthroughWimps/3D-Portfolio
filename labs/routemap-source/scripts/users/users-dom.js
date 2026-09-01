/* Shared DOM access for the user-site builder modules. */
function userQuery(selector, root = document) {
  return root.querySelector(selector);
}

function userQueryAll(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function userLayoutElementSelector(attribute, value) {
  return `[${attribute}="${CSS.escape(String(value || ""))}"]`;
}

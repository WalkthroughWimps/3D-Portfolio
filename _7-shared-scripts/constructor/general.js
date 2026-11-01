import { mountSettingsContextMenu } from '../panel-assembly/SettingsContextMenu.mjs';

/** General authoring tools use the same Constructor host on every main page. */
export function createGeneralConstructor({ root = document, stickyNotes } = {}) {
  const element = root.createElement('section');
  element.className = 'general-constructor';
  if (stickyNotes?.constructorElement) {
    // The note owner exports anchors and content, rather than copied form values.
    stickyNotes.constructorElement.dataset.panel = 'sticky-notes';
    element.append(stickyNotes.constructorElement);
  }
  return element;
}

export function mountGeneralConstructorTransfer(element, stickyNotes) {
  return mountSettingsContextMenu(element, target => {
    if (!stickyNotes?.readBundle || !stickyNotes?.importBundle || !target.closest('.sticky-notes-constructor')) return null;
    return {
      label: 'Sticky notes', filename: 'sticky-notes.json',
      read: () => stickyNotes.readBundle(),
      apply: data => stickyNotes.importBundle(data)
    };
  });
}

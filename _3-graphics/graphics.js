import {bootstrapPage} from '../_7-shared-scripts/core/bootstrap.js';
import {initPanelShell} from '../debug/panel-shell.js';
import {createTokenSettingsPanel} from './shelf/token-settings.mjs';
// The shelf owns its renderer and item lifecycle; site bootstrap owns header/settings.
void bootstrapPage({pageId:'graphics',mount:async({scope})=>{
 const panel=initPanelShell();scope.defer(panel.registerContext('games-tabletop','Games',createTokenSettingsPanel()));
 try{await import('./shelf/graphics-preview.mjs');}catch(error){document.getElementById('loading').textContent='The 3D shelf could not start. Use the text and controls below, or reload to retry.';console.error(error);}
}}).catch(error=>console.error('Graphics bootstrap failed',error));

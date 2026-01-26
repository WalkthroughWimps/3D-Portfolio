from pathlib import Path
path = Path('music.css')
text = path.read_text()
old_block = """.instrument-level-panel {
    position: fixed;
    right: 16px;
    top: calc(var(--header-height, 10rem) + 3.5rem);
    z-index: 1200;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 12px;
    background: rgba(0,0,0,0.45);
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.45);
    color: #e8fff4;
    font: 12px/1.3 "Source Sans 3", system-ui;
    transition: transform 0.2s ease;
}
.instrument-level-panel.is-collapsed {
    transform: translateX(calc(100% - 26px));
}
body.debug-overlays-hidden .instrument-level-panel,
body.debug-overlays-hidden #uiDebugCanvas {
    display: none !important;
}
.instrument-level-toggle {
    position: absolute;
    right: -13px;
    top: 50%;
    transform: translateY(-50%);
    width: 26px;
    height: 72px;
    border-radius: 12px;
    border: 1px solid rgba(120,200,160,0.55);
    background: rgba(12,40,26,0.9);
    color: #cfe8d8;
    font: 700 16px/1 "Source Sans 3", system-ui;
    box-shadow: 0 6px 16px rgba(0,0,0,0.45);
    cursor: pointer;
}
"""
if old_block not in text:
    raise SystemExit('old instrument panel block not found')
path.write_text(text.replace(old_block, '', 1))

"""Render the authored Illustrator board with subdued, correctly sized card slots.

Uses PyMuPDF; never writes the source AI. The two placed back designs are removed
from an in-memory PDF copy, then reused once per slot at reduced opacity. This
also removes the decorative printed stacks that could be mistaken for pieces.
"""
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tmp/card-rework-deps'))
import pymupdf as fitz
from PIL import Image, ImageOps

SOURCE = ROOT / 'source-files/World Map Game 2026 No Rules.ai'
TARGET = ROOT / '_3-graphics/shelf/assets/games/global-conquest-base.jpg'
QA = ROOT / 'output/tabletop-input-20261027'


def main():
    doc = fitz.open(SOURCE)
    page = doc[0]
    stream = page.get_contents()[0]
    # Verify these original resources before operating on their shared instances.
    images = {row[0]: row for row in page.get_images()}
    designs = {}
    for kind, xref in [('vehicles', 6755), ('landmarks', 7091)]:
        row = images[xref]
        assert row[2:4] == (1090, 1090), 'Source back resources changed; inspect the new AI first.'
        pix = fitz.Pixmap(doc, xref)
        if row[1]:
            pix = fitz.Pixmap(pix, fitz.Pixmap(doc, row[1]))
        designs[kind] = pix.tobytes('png')
        colour = Image.open(io.BytesIO(designs[kind])).convert('RGBA')
        grey = ImageOps.grayscale(colour).convert('RGBA')
        grey.putalpha(colour.getchannel('A'))
        buffer = io.BytesIO()
        grey.save(buffer, format='PNG')
        designs[kind+'-discard'] = buffer.getvalue()
    content = doc.xref_stream(stream)
    # Illustrator flattened these placements into separate image/shadow forms.
    # Removing only the two images leaves their vector edges and stack shadows.
    count = 0
    for number in range(91, 134):
        content, found = re.subn(rb'/Fm'+str(number).encode()+rb'\s+Do\b', b'', content)
        count += found
    assert count == 43, 'Printed card form inventory changed; inspect the new AI first.'
    old = b'/CS0 cs 0.149 0.133 0.38  scn'
    assert content.count(old) == 1
    # Preserve the existing light-water version of the board.
    content = content.replace(old, b'/CS0 cs 0.62 0.83 0.92  scn', 1)
    doc.update_stream(stream, content)
    # Retain the readable blue-grey waves of the existing light-water texture.
    # The source uses bright cyan waves intended for its original navy water.
    for xref in [6161, 6162, 6163, 6164, 6165, 6177, 6178, 6179, 6180, 6181]:
        wave = doc.xref_stream(xref)
        old_wave = b'/CS0 cs 0 0.678 0.933  scn'
        assert old_wave in wave
        doc.update_stream(xref, wave.replace(old_wave, b'/CS0 cs 0.25 0.46 0.56  scn'))
    icon_layers = [xref for xref, entry in doc.get_ocgs().items() if entry['name'] == 'Landmark Icons']
    assert len(icon_layers) == 1
    doc.set_layer(-1, off=icon_layers)

    # Reopen to apply OCG visibility and drop MuPDF's original image cache.
    # Otherwise reinserting a card back can restore its old shared instances.
    clean = fitz.open(stream=doc.tobytes(), filetype='pdf')
    background = clean[0].get_pixmap(matrix=fitz.Matrix(2048/page.rect.width, 2048/page.rect.width), alpha=False)
    board_size = page.rect
    doc = fitz.open()
    page = doc.new_page(width=board_size.width, height=board_size.height)
    page.insert_image(page.rect, stream=background.tobytes('png'))

    # The physical card is .84 board units. The slot is .92: 9.5% wider.
    side = .92 / 12.04 * page.rect.width
    margin = .08 / 12.04 * page.rect.width
    x = margin+side/2
    bottom = page.rect.height-margin-side/2
    slots = [('vehicles', x, bottom-3*side), ('vehicles-discard', x, bottom-2*side),
             ('landmarks', x, bottom-side),
             *[('landmarks-discard', x+i*side, bottom) for i in range(3)]]
    ghost = doc.get_new_xref()
    doc.update_object(ghost, '<< /Type /ExtGState /ca 0.24 /CA 0.24 >>')
    resources = int(doc.xref_get_key(page.xref, 'Resources')[1].split()[0])
    doc.xref_set_key(resources, 'ExtGState', f'<< /CardSlotGhost {ghost} 0 R >>')
    for kind, x, y in slots:
        rect = fitz.Rect(x-side/2, y-side/2, x+side/2, y+side/2)
        page.draw_rect(rect, color=(.18, .32, .37), fill=(.8, .9, .94), width=3,
                       stroke_opacity=.45, fill_opacity=.2, radius=.1)
        page.insert_image(rect, stream=designs[kind], overlay=True)
        image_stream = page.get_contents()[-1]
        doc.update_stream(image_stream, b'q /CardSlotGhost gs\n'+doc.xref_stream(image_stream)+b'\nQ\n')

    pix = page.get_pixmap(matrix=fitz.Matrix(2048/page.rect.width, 2048/page.rect.width), alpha=False)
    image = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
    image.save(TARGET, quality=95, subsampling=0, optimize=True)
    QA.mkdir(parents=True, exist_ok=True)
    image.resize((1024, round(1024*image.height/image.width)), Image.Resampling.LANCZOS).save(QA/'board-slots.jpg', quality=94)
    report = {'source':str(SOURCE.relative_to(ROOT)), 'pixels':image.size,
              'physicalCardWidth':.84, 'printedSlotWidth':.92, 'graphicOpacity':.24, 'leftBottomMargin':.08,
              'slots':[{'kind':kind,'centre':[x,y]} for kind,x,y in slots]}
    (QA/'board-slots.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()

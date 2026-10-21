"""Render selected authoritative phase Markdown files as review PDFs.

Usage: python tools/render-phase-pdfs.py 02 03 04
This only reads Markdown; it never regenerates or edits the source documents.
"""

import re
import sys
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_8-tools-and-notes" / "architecture-phases"
OUTPUT = ROOT / "output" / "pdf" / "phases"
OUTPUT.mkdir(parents=True, exist_ok=True)

BASE = dict(fontName="Helvetica", textColor=colors.HexColor("#1e293b"))
STYLES = {
    "title": ParagraphStyle("phase-title", fontSize=20, leading=24, spaceAfter=11, **BASE),
    "heading": ParagraphStyle("phase-heading", fontSize=12, leading=16, spaceBefore=12, spaceAfter=5, textColor=colors.HexColor("#20495e"), fontName="Helvetica-Bold"),
    "body": ParagraphStyle("phase-body", fontSize=9.1, leading=12.4, spaceAfter=6, alignment=TA_LEFT, **BASE),
    "small": ParagraphStyle("phase-small", fontSize=8.4, leading=11.4, spaceAfter=6, **BASE),
}


def safe_text(value):
    return escape(value.replace("`", "").replace("→", "->").replace("–", "-").replace("—", "-"))


def render(number):
    stem = f"phase-{int(number):02d}-instructions"
    source = SOURCE / f"{stem}.md"
    output = OUTPUT / f"{stem}.pdf"
    markdown = source.read_text(encoding="utf-8")
    revision = re.search(r"Revision (\d+) \|", markdown).group(1)
    story = []
    for block in re.split(r"\n\s*\n", markdown):
        block = block.strip()
        if not block:
            continue
        if block == "---":
            story.append(Spacer(1, 8))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#9fb4bf")))
            continue
        if block.startswith("# "):
            story.append(Paragraph(safe_text(block[2:]), STYLES["title"]))
        elif block.startswith("## "):
            story.append(Paragraph(safe_text(block[3:]), STYLES["heading"]))
        else:
            lines = block.splitlines()
            text = "<br/>".join(safe_text(line.replace("**", "")) for line in lines)
            style = STYLES["small"] if block.startswith("Model:") or block.startswith("Revision ") else STYLES["body"]
            story.append(Paragraph(text, style))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#55616a"))
        canvas.drawString(48, 26, f"Resume Website | Phase {int(number)} | Revision {revision}")
        canvas.drawRightString(564, 26, str(doc.page))
        canvas.restoreState()

    doc = SimpleDocTemplate(
        str(output), pagesize=letter, leftMargin=48, rightMargin=48,
        topMargin=42, bottomMargin=42, title=f"Phase {int(number)} instructions, revision {revision}",
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(output)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Pass one or more phase numbers")
    for phase_number in sys.argv[1:]:
        render(phase_number)

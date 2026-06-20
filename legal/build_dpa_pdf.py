"""
Génère public/dpa-naywa-v1.pdf à partir de legal/dpa-content.md.

Le PDF final est servi par Next.js depuis /dpa-naywa-v1.pdf et linké
depuis le footer + la page tarifs.

Note : on garde le nom de fichier `dpa-naywa-v1.pdf` même quand le
contenu passe à v1.1+ pour ne pas casser l'URL du footer. La version
réelle apparaît dans l'en-tête du PDF ("Version 1.1 — applicable au …").
À chaque modification de legal/dpa-content.md, ré-exécuter ce script
pour régénérer le PDF.

Format A4 portrait, typographie Helvetica (built-in ReportLab pour ne
pas avoir à embarquer Inter/Space Grotesk côté serveur de build).
"""

from pathlib import Path
import re

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
)

HERE = Path(__file__).parent
SRC = HERE / "dpa-content.md"
OUT = HERE.parent / "public" / "dpa-naywa-v1.pdf"

# Brand
PRIMARY = HexColor("#7C63C8")
INK = HexColor("#111827")
INK_SOFT = HexColor("#374151")
MUTED = HexColor("#6B7280")
LINE = HexColor("#E2DAF6")


def styles():
    s = getSampleStyleSheet()
    base = "Helvetica"
    bold = "Helvetica-Bold"

    s.add(ParagraphStyle(
        name="DPATitle",
        fontName=bold, fontSize=20, leading=24, textColor=INK,
        spaceAfter=4,
    ))
    s.add(ParagraphStyle(
        name="DPAVersion",
        fontName=base, fontSize=10, leading=13, textColor=MUTED,
        spaceAfter=18, alignment=TA_LEFT,
    ))
    s.add(ParagraphStyle(
        name="DPAH2",
        fontName=bold, fontSize=12, leading=15, textColor=PRIMARY,
        spaceBefore=14, spaceAfter=6,
    ))
    s.add(ParagraphStyle(
        name="DPABody",
        fontName=base, fontSize=10, leading=14.5, textColor=INK_SOFT,
        alignment=TA_JUSTIFY, spaceAfter=6,
    ))
    s.add(ParagraphStyle(
        name="DPABullet",
        fontName=base, fontSize=10, leading=14, textColor=INK_SOFT,
        leftIndent=14, bulletIndent=2, spaceAfter=3,
    ))
    s.add(ParagraphStyle(
        name="DPAItalic",
        fontName="Helvetica-Oblique", fontSize=9, leading=12, textColor=MUTED,
        alignment=TA_LEFT, spaceBefore=14,
    ))
    return s


def parse_inline(text: str) -> str:
    """Convertit `**bold**` en `<b>bold</b>` pour ReportLab."""
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)


def build_table_subprocessors(s):
    """Table fixe pour la liste des sous-traitants ultérieurs."""
    header = ["Sous-traitant", "Service rendu", "Hébergement"]
    rows = [
        ["Supabase",  "Base de données, auth, stockage",         "UE (Francfort)"],
        ["Vercel",    "Hébergement web et serverless",           "UE (Paris)"],
        ["OpenRouter","Acheminement IA (parsing, scoring)",      "USA (CCT)"],
        ["Stripe",    "Paiements et facturation",                "UE (Irlande)"],
        ["Resend",    "E-mails transactionnels",                 "UE"],
    ]
    tbl = Table(
        [header] + rows,
        colWidths=[35*mm, 80*mm, 40*mm],
        hAlign="LEFT",
    )
    tbl.setStyle(TableStyle([
        ("FONT",            (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("FONT",            (0, 1), (-1, -1), "Helvetica", 9),
        ("TEXTCOLOR",       (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR",       (0, 1), (-1, -1), INK_SOFT),
        ("BACKGROUND",      (0, 0), (-1, 0), HexColor("#F8F6FF")),
        ("LINEBELOW",       (0, 0), (-1, 0), 0.5, LINE),
        ("LINEBELOW",       (0, 1), (-1, -2), 0.3, LINE),
        ("BOTTOMPADDING",   (0, 0), (-1, -1), 7),
        ("TOPPADDING",      (0, 0), (-1, -1), 6),
        ("LEFTPADDING",     (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",    (0, 0), (-1, -1), 8),
    ]))
    return tbl


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    s = styles()
    text = SRC.read_text(encoding="utf-8")

    flow = []

    # On parse le markdown ligne à ligne, suffisamment simple pour ce
    # document linéaire — pas besoin d'une vraie lib markdown ici.
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()

        if line.startswith("# "):
            flow.append(Paragraph(parse_inline(line[2:]), s["DPATitle"]))
        elif line.startswith("**Version "):
            flow.append(Paragraph(parse_inline(line), s["DPAVersion"]))
        elif line.startswith("## "):
            flow.append(Paragraph(parse_inline(line[3:]), s["DPAH2"]))
        elif line.startswith("- ") or line.startswith("* "):
            # Liste : on accumule les items consécutifs en une seule
            # série de Paragraphe avec bullet "•".
            while i < len(lines) and (lines[i].startswith("- ") or lines[i].startswith("* ")):
                item = lines[i][2:].rstrip()
                flow.append(Paragraph(
                    "&bull;&nbsp;&nbsp;" + parse_inline(item),
                    s["DPABullet"],
                ))
                i += 1
            continue  # on a déjà avancé i, skip l'incrément final
        elif line.startswith("| "):
            # Table markdown — on saute toutes les lignes "| ... |" et
            # on insère la table fixe sous-traitants.
            while i < len(lines) and lines[i].startswith("|"):
                i += 1
            flow.append(Spacer(1, 4))
            flow.append(build_table_subprocessors(s))
            flow.append(Spacer(1, 8))
            continue
        elif line.startswith("---"):
            flow.append(Spacer(1, 10))
        elif line.startswith("*") and line.endswith("*") and len(line) > 2:
            # Footer italique du document
            flow.append(Paragraph(line.strip("*"), s["DPAItalic"]))
        elif line == "":
            flow.append(Spacer(1, 2))
        else:
            flow.append(Paragraph(parse_inline(line), s["DPABody"]))

        i += 1

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
        title="Accord de traitement de données — Naywa Studio",
        author="Naywa Studio",
        subject="DPA RGPD article 28",
    )

    # Footer compact avec n° de page et mention contact.
    def on_page(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(20*mm, 12*mm, "Naywa Studio — DPA v1.1 — contact@naywastudio.com")
        canvas.drawRightString(A4[0] - 20*mm, 12*mm, f"Page {_doc.page}")
        canvas.restoreState()

    doc.build(flow, onFirstPage=on_page, onLaterPages=on_page)
    print(f"DPA généré : {OUT}")


if __name__ == "__main__":
    build()

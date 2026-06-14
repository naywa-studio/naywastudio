"""
Build the GMH Engineering Solutions demo deck as a single PDF.

5 slides, 16:9 landscape (960pt x 540pt = 1280x720 @72dpi).
Drawn directly on a ReportLab canvas — no Platypus, so we have full
control over typography and layout, matching the Naywa Studio brand.
"""

from reportlab.lib.colors import HexColor, Color
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pathlib import Path

# ── Geometry ──────────────────────────────────────────────────────────
W, H = 960.0, 540.0   # 16:9
M = 56.0              # safe area margin
HERE = Path(__file__).parent
OUT = HERE / "naywa-gmh-demo.pdf"
LOGO_GMH = str(HERE / "gmh-logo.jpg")

# ── Brand ─────────────────────────────────────────────────────────────
PRIMARY     = HexColor("#7C63C8")
PRIMARY_DK  = HexColor("#6B54B2")
SECONDARY   = HexColor("#B8AEDE")
INK         = HexColor("#111827")
INK_SOFT    = HexColor("#374151")
MUTED       = HexColor("#6B7280")
BORDER      = HexColor("#E2DAF6")
SURFACE     = HexColor("#F8F6FF")
LINE        = HexColor("#F0ECF8")
GREEN       = HexColor("#16A34A")
GREEN_SOFT  = Color(0.087, 0.639, 0.290, alpha=0.10)
BG_TINT_1   = Color(0.486, 0.388, 0.784, alpha=0.06)
BG_TINT_2   = Color(0.721, 0.682, 0.871, alpha=0.10)

# ── Fonts ─────────────────────────────────────────────────────────────
# Built-in : Helvetica / Helvetica-Bold / Times-Italic. Suffisant pour un
# rendu sobre et lisible. Pas besoin d'embarquer Inter/Space Grotesk pour
# un PDF de pitch — la cohérence vient des couleurs et de la hiérarchie.
F_BODY    = "Helvetica"
F_BOLD    = "Helvetica-Bold"
F_OBL     = "Helvetica-Oblique"
F_ITAL    = "Times-Italic"   # accent serif italic pour les mots vedettes


# ── Helpers ───────────────────────────────────────────────────────────

def bg_branding(c: canvas.Canvas) -> None:
    """Bandes décoratives statiques en fond (esprit ShaderBackground)."""
    # Halo violet en haut à droite
    c.setFillColor(BG_TINT_1)
    c.circle(W - 80, H - 40, 220, stroke=0, fill=1)
    # Halo lavande en bas à gauche
    c.setFillColor(BG_TINT_2)
    c.circle(40, 60, 200, stroke=0, fill=1)


def topbar(c: canvas.Canvas, page_no: int, total: int) -> None:
    """Logo GMH à gauche + wordmark Naywa Studio à droite + compteur."""
    # GMH logo box (white card with padding so the logo breathes).
    img_h = 38
    img_w = 38
    pad = 8
    box_h = img_h + pad * 2
    box_w = 200
    # Carte blanche derrière le logo + label
    c.setFillColor(HexColor("#FFFFFF"))
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(M, H - M - box_h + 6, box_w, box_h, 8, stroke=1, fill=1)
    # Logo
    try:
        img = ImageReader(LOGO_GMH)
        c.drawImage(
            img,
            M + pad,
            H - M - box_h + 6 + pad,
            width=img_w,
            height=img_h,
            preserveAspectRatio=True,
            mask="auto",
        )
    except Exception:
        pass
    c.setFillColor(MUTED)
    c.setFont(F_BOLD, 9)
    c.drawString(M + pad + img_w + 10, H - M - box_h + 6 + box_h - 16,
                 "GMH Engineering")
    c.setFillColor(MUTED)
    c.setFont(F_BODY, 8.5)
    c.drawString(M + pad + img_w + 10, H - M - box_h + 6 + 11,
                 "Solutions")

    # Wordmark Naywa Studio à droite
    c.setFillColor(INK)
    c.setFont(F_BOLD, 18)
    text = "Naywa"
    tw = c.stringWidth(text, F_BOLD, 18)
    c.drawString(W - M - 90, H - M - 16, text)
    c.setFillColor(PRIMARY)
    c.drawString(W - M - 90 + tw + 5, H - M - 16, "Studio")

    # Compteur page (discret en haut droite, sous le wordmark)
    c.setFillColor(MUTED)
    c.setFont(F_BODY, 8.5)
    c.drawRightString(W - M, H - M - 32, f"{page_no} / {total}")


def eyebrow(c: canvas.Canvas, y: float, text: str) -> None:
    c.setFillColor(PRIMARY)
    c.setFont(F_BOLD, 9.5)
    # ReportLab built-in fonts don't expose letter-spacing easily ; we
    # fake it by inserting spaces between chars.
    c.drawString(M, y, text.upper())


def wrap_lines(
    c: canvas.Canvas, text: str, font: str, size: float, max_w: float,
) -> list[str]:
    """Wrap `text` to fit within `max_w` using `font` at `size`."""
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for w in words[1:]:
        trial = current + " " + w
        if c.stringWidth(trial, font, size) <= max_w:
            current = trial
        else:
            lines.append(current)
            current = w
    lines.append(current)
    return lines


def draw_paragraph(
    c: canvas.Canvas, x: float, y: float, text: str,
    font: str, size: float, color, max_w: float, leading: float = 1.6,
) -> float:
    """Draws a wrapped paragraph. Returns the y position after the block."""
    c.setFont(font, size)
    c.setFillColor(color)
    for line in wrap_lines(c, text, font, size, max_w):
        c.drawString(x, y, line)
        y -= size * leading
    return y


# ── Slide 1 — Cover ──────────────────────────────────────────────────

def slide_cover(c: canvas.Canvas, page_no: int, total: int) -> None:
    bg_branding(c)
    topbar(c, page_no, total)

    # Eyebrow
    y_eyebrow = 220
    c.setFillColor(PRIMARY)
    c.setFont(F_BOLD, 10)
    c.drawString(M, y_eyebrow, "PRÉSENTATION À GMH ENGINEERING SOLUTIONS")

    # H1 — 2 lignes
    c.setFillColor(INK)
    c.setFont(F_BOLD, 64)
    c.drawString(M, y_eyebrow - 70, "L’IA traite,")
    # 2e ligne : « vous » Helvetica + « décidez » Times-Italic violet
    c.setFont(F_BOLD, 64)
    c.drawString(M, y_eyebrow - 138, "vous ")
    w_vous = c.stringWidth("vous ", F_BOLD, 64)
    c.setFillColor(PRIMARY)
    c.setFont(F_ITAL, 64)
    c.drawString(M + w_vous, y_eyebrow - 138, "décidez.")

    # Lead
    c.setFillColor(INK_SOFT)
    draw_paragraph(
        c,
        M, y_eyebrow - 175,
        "Naywa Studio conçoit des packages d’optimisation de process métier "
        "augmentés par l’intelligence artificielle. Notre premier package est "
        "dédié au sourcing.",
        F_BODY, 13.5, INK_SOFT, W - 2 * M - 200, leading=1.55,
    )

    # Meta line en bas
    c.setFillColor(PRIMARY)
    c.circle(M + 4, 60, 4, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont(F_BODY, 11)
    c.drawString(
        M + 16, 56,
        "15 juin 2026  ·  Elyas Malki & Hussein Malki  ·  naywastudio.com",
    )


# ── Slide 2 — Promesse ───────────────────────────────────────────────

def slide_promise(c: canvas.Canvas, page_no: int, total: int) -> None:
    bg_branding(c)
    topbar(c, page_no, total)

    eyebrow(c, H - M - 60, "Notre proposition de valeur")

    # H2
    c.setFillColor(INK)
    c.setFont(F_BOLD, 38)
    c.drawString(M, H - M - 110, "Trois principes,")
    c.drawString(M, H - M - 154, "aucune fausse promesse.")

    # Lead
    next_y = draw_paragraph(
        c,
        M, H - M - 200,
        "Naywa n’automatise pas votre métier. Nous l’outillons pour que vous "
        "gardiez la main là où ça compte, et que la machine absorbe ce qui "
        "n’aurait jamais dû être à votre charge.",
        F_BODY, 13, INK_SOFT, W - 2 * M - 100, leading=1.55,
    )

    # 3 principles en colonnes
    principles = [
        ("Vous", "Vous gardez la décision",
         "Aucun envoi, aucun classement, aucune action automatique. Nora "
         "propose, vous tranchez. Vos process, votre style, vos clients."),
        ("IA", "L’IA absorbe la friction",
         "Parsing, indexation, scoring justifié, anonymisation, calcul de "
         "marge : tout ce qui vous prenait des heures se fait pendant que "
         "vous lisez ce paragraphe."),
        ("Métier", "Conçu pour le métier",
         "Naywa ne cherche pas à tout faire. Nous bâtissons un outil par "
         "métier, en profondeur, avec les structures qui le vivent au "
         "quotidien."),
    ]
    col_w = (W - 2 * M - 40) / 3
    y_top = next_y - 30
    for i, (badge, title, body) in enumerate(principles):
        x = M + i * (col_w + 20)
        # Top accent line (gradient simulé en violet plein)
        c.setStrokeColor(PRIMARY)
        c.setLineWidth(2.5)
        c.line(x, y_top, x + col_w - 10, y_top)
        # Badge (grand chiffre / label)
        c.setFillColor(PRIMARY)
        c.setFont(F_BOLD, 34)
        c.drawString(x, y_top - 40, badge)
        # Title
        c.setFillColor(INK)
        c.setFont(F_BOLD, 14)
        c.drawString(x, y_top - 64, title)
        # Body
        draw_paragraph(
            c, x, y_top - 86, body, F_BODY, 10.5, MUTED, col_w - 10, leading=1.55,
        )


# ── Slide 3 — Package Sourcing ───────────────────────────────────────

def slide_package(c: canvas.Canvas, page_no: int, total: int) -> None:
    bg_branding(c)
    topbar(c, page_no, total)

    eyebrow(c, H - M - 60, "Package Sourcing  ·  ce que vous obtenez")

    c.setFillColor(INK)
    c.setFont(F_BOLD, 32)
    c.drawString(M, H - M - 100, "Du CV reçu")
    c.drawString(M, H - M - 138, "à la fiche pricing client.")

    next_y = draw_paragraph(
        c,
        M, H - M - 174,
        "Tout le workflow candidat dans une seule console, partagée entre les "
        "membres de votre structure. Le Pricing Syntec est inclus dans la "
        "formule Sourcing Pro.",
        F_BODY, 11.5, INK_SOFT, W - 2 * M - 100, leading=1.55,
    )

    # Grid 3×2 des 6 étapes
    steps = [
        ("01 · VIVIER VIVANT",
         "Nora range vos candidats par zone métier",
         "Upload PDF, parsing automatique, séniorité post-diplôme réelle, "
         "badge alternant.",
         False),
        ("02 · MISSIONS PAR BRIEF",
         "Collez un brief, le formulaire se remplit",
         "L’IA extrait intitulé, séniorité, compétences, lieu, contrat, TJM "
         "et brut cible.",
         False),
        ("03 · MATCHING SCORÉ",
         "Score multi-critères, justifié",
         "Compétences, séniorité, secteur, localisation. Vous voyez le "
         "pourquoi du 87 %.",
         False),
        ("04 · PRICING SYNTEC · PRO",
         "Marge réelle, risque rupture, export PDF",
         "TJM et brut cibles, le moteur calcule la marge mensuelle réelle. "
         "Chart rupture conventionnelle vs licenciement.",
         True),
        ("05 · ANONYMISATION",
         "PDF brandé à votre structure, 1 clic",
         "Nom, photo, coordonnées masqués, écoles génériques, référence "
         "interne. Prêt à transmettre, sans biais.",
         False),
        ("06 · PIPELINE PARTAGÉ",
         "Kanban entre les membres",
         "Identifié, Contacté, Réponse, Entretien, Offre. Déplacements "
         "manuels, Nora propose mais ne décide jamais.",
         False),
    ]
    cols = 3
    gap = 16
    col_w = (W - 2 * M - (cols - 1) * gap) / cols
    row_h = 122
    y_start = next_y - 36
    for i, (label, title, body, pro) in enumerate(steps):
        col = i % cols
        row = i // cols
        x = M + col * (col_w + gap)
        y = y_start - row * (row_h + 14)
        # Card
        if pro:
            c.setFillColor(Color(0.486, 0.388, 0.784, alpha=0.10))
            c.setStrokeColor(PRIMARY)
            c.setLineWidth(1.6)
        else:
            c.setFillColor(SURFACE)
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.8)
        c.roundRect(x, y - row_h, col_w, row_h, 10, stroke=1, fill=1)
        # Label haut
        c.setFillColor(PRIMARY)
        c.setFont(F_BOLD, 8)
        c.drawString(x + 14, y - 18, label)
        # Title
        c.setFillColor(INK)
        c.setFont(F_BOLD, 12)
        c.drawString(x + 14, y - 38, title)
        # Body
        draw_paragraph(
            c, x + 14, y - 58, body, F_BODY, 9.5, INK_SOFT,
            col_w - 28, leading=1.55,
        )


# ── Slide 4 — Grille tarifaire ───────────────────────────────────────

def slide_grid(c: canvas.Canvas, page_no: int, total: int) -> None:
    bg_branding(c)
    topbar(c, page_no, total)

    eyebrow(c, H - M - 60, "Grille tarifaire  ·  au siège, dégressive")

    c.setFillColor(INK)
    c.setFont(F_BOLD, 34)
    c.drawString(M, H - M - 108, "Mensuel HT, sans engagement.")

    draw_paragraph(
        c,
        M, H - M - 148,
        "Facturation Stripe (CB ou SEPA). Vous ajustez le nombre de sièges "
        "depuis votre console, la facture suit au prorata.",
        F_BODY, 11.5, INK_SOFT, W - 2 * M - 100, leading=1.55,
    )

    # 2 cartes tableaux
    table_y_top = H - M - 200
    card_w = (W - 2 * M - 26) / 2
    card_h = 220
    draw_price_card(
        c, M, table_y_top - card_h, card_w, card_h,
        tier="PACKAGE",
        title="Sourcing",
        sub="Vivier, missions, matching, anonymisation, pipeline.",
        rows=[
            ("1 siège", "38,99 €", "38,99 €/siège", False),
            ("2 sièges", "69,99 €", "35,00 €/siège", False),
            ("3 sièges", "94,99 €", "31,66 €/siège", True),
            ("4 sièges", "119,99 €", "30,00 €/siège", False),
        ],
        featured=False,
    )
    draw_price_card(
        c, M + card_w + 26, table_y_top - card_h, card_w, card_h,
        tier="PACKAGE PREMIUM",
        title="Sourcing Pro",
        sub="Tout Sourcing + Pricing Syntec, chart rupture, export PDF.",
        rows=[
            ("1 siège", "46,99 €", "46,99 €/siège", False),
            ("2 sièges", "85,99 €", "43,00 €/siège", False),
            ("3 sièges", "118,99 €", "39,66 €/siège", True),
            ("4 sièges", "151,99 €", "38,00 €/siège", False),
        ],
        featured=True,
    )

    # Bannière essai (sous les tableaux)
    banner_y = table_y_top - card_h - 24
    c.setFillColor(GREEN_SOFT)
    c.setStrokeColor(Color(0.087, 0.639, 0.290, alpha=0.30))
    c.setLineWidth(0.8)
    c.roundRect(M, banner_y - 36, W - 2 * M, 36, 10, stroke=1, fill=1)
    # Pill
    c.setFillColor(GREEN)
    c.roundRect(M + 14, banner_y - 26, 86, 18, 9, stroke=0, fill=1)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont(F_BOLD, 8)
    c.drawString(M + 24, banner_y - 21, "ESSAI GRATUIT")
    # Texte
    c.setFillColor(HexColor("#15803D"))
    c.setFont(F_BOLD, 11)
    c.drawString(
        M + 112, banner_y - 22,
        "15 jours offerts, jusqu’à 2 sièges, sans carte bancaire — "
        "pour aller au-delà, vous choisissez une formule.",
    )


def draw_price_card(
    c: canvas.Canvas, x: float, y: float, w: float, h: float,
    tier: str, title: str, sub: str, rows, featured: bool,
) -> None:
    # Card background
    if featured:
        c.setFillColor(HexColor("#FFFFFF"))
        c.setStrokeColor(PRIMARY)
        c.setLineWidth(1.8)
    else:
        c.setFillColor(HexColor("#FFFFFF"))
        c.setStrokeColor(BORDER)
        c.setLineWidth(1.0)
    c.roundRect(x, y, w, h, 14, stroke=1, fill=1)

    # Tier eyebrow
    c.setFillColor(PRIMARY)
    c.setFont(F_BOLD, 9)
    c.drawString(x + 22, y + h - 24, tier)
    # Title
    c.setFillColor(INK)
    c.setFont(F_BOLD, 19)
    c.drawString(x + 22, y + h - 46, title)
    # Pro badge
    if featured:
        badge_w = 110
        c.setFillColor(PRIMARY)
        c.roundRect(x + w - badge_w - 16, y + h - 36, badge_w, 18, 9, stroke=0, fill=1)
        c.setFillColor(HexColor("#FFFFFF"))
        c.setFont(F_BOLD, 8)
        c.drawString(x + w - badge_w - 8, y + h - 30, "+ PRICING SYNTEC")
    # Subtitle
    draw_paragraph(
        c, x + 22, y + h - 66, sub, F_BODY, 9.5, MUTED, w - 44, leading=1.45,
    )

    # Table
    table_top = y + h - 96
    col_x_seats = x + 22
    col_x_total = x + w - 22
    col_x_per   = x + w - 22 - 102

    # Header
    c.setFillColor(MUTED)
    c.setFont(F_BOLD, 8)
    c.drawString(col_x_seats, table_top, "SIÈGES")
    c.drawRightString(col_x_per, table_top, "PAR SIÈGE")
    c.drawRightString(col_x_total, table_top, "TOTAL / MOIS")

    # Header underline
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(x + 22, table_top - 6, x + w - 22, table_top - 6)

    # Rows
    row_h = 26
    for i, (seats, total, per_seat, reco) in enumerate(rows):
        yy = table_top - 16 - i * row_h
        if reco:
            # Background tint
            c.setFillColor(Color(0.486, 0.388, 0.784, alpha=0.06))
            c.rect(x + 14, yy - 8, w - 28, 24, stroke=0, fill=1)
            # Star
            c.setFillColor(PRIMARY)
            c.setFont(F_BOLD, 11)
            c.drawString(col_x_seats - 6, yy, "★ ")
            c.setFillColor(INK)
            c.setFont(F_BOLD, 11)
            c.drawString(col_x_seats + 10, yy, seats)
        else:
            c.setFillColor(INK)
            c.setFont(F_BODY, 11)
            c.drawString(col_x_seats, yy, seats)
        # Total + per seat
        c.setFillColor(INK)
        c.setFont(F_BOLD, 13)
        c.drawRightString(col_x_total, yy, total)
        c.setFillColor(MUTED)
        c.setFont(F_BODY, 9.5)
        c.drawRightString(col_x_per, yy, per_seat)
        # Row divider
        if i < len(rows) - 1:
            c.setStrokeColor(LINE)
            c.setLineWidth(0.5)
            c.line(x + 22, yy - 10, x + w - 22, yy - 10)


# ── Slide 5 — Merci + Q&A ────────────────────────────────────────────

def slide_thanks(c: canvas.Canvas, page_no: int, total: int) -> None:
    bg_branding(c)
    topbar(c, page_no, total)

    eyebrow(c, H - M - 60, "Merci pour votre attention")

    # H1 « Vos questions. »
    c.setFillColor(INK)
    c.setFont(F_BOLD, 60)
    c.drawString(M, H - M - 130, "Vos ")
    w_vos = c.stringWidth("Vos ", F_BOLD, 60)
    c.setFillColor(PRIMARY)
    c.setFont(F_ITAL, 60)
    c.drawString(M + w_vos, H - M - 130, "questions.")

    # Lead
    draw_paragraph(
        c, M, H - M - 170,
        "On répond cash, sans détour. Et si on n’a pas la réponse, on le "
        "dit. Quelques sujets que vous voudrez peut-être creuser :",
        F_BODY, 12, INK_SOFT, W - 2 * M - 100, leading=1.55,
    )

    # 3 cartes Q&A
    qa = [
        ("Vos CVs après l’arrêt ?",
         "Vous exportez votre vivier à tout moment. À la suppression de "
         "votre structure, toutes les données sont effacées définitivement "
         "— 30 jours de grâce si plusieurs membres pour permettre une reprise."),
        ("Vos données nourrissent-elles vos modèles ?",
         "Non. Les modèles utilisés sont opérés par OpenRouter, sans "
         "rétention ni apprentissage sur les contenus que vous nous "
         "confiez. Vos CVs ne servent qu’à vous."),
        ("Différence avec un ATS ou LinkedIn Recruiter ?",
         "Un ATS gère des candidatures entrantes. Naywa gère votre vivier "
         "proactif et intègre le Pricing Syntec — ce qu’aucun ATS ni "
         "LinkedIn ne propose."),
    ]
    cols = 3
    gap = 16
    col_w = (W - 2 * M - (cols - 1) * gap) / cols
    card_h = 130
    y_top = 180
    for i, (q, a) in enumerate(qa):
        x = M + i * (col_w + gap)
        y = y_top
        c.setFillColor(SURFACE)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.8)
        c.roundRect(x, y - card_h, col_w, card_h, 12, stroke=1, fill=1)
        c.setFillColor(PRIMARY)
        c.setFont(F_BOLD, 9)
        c.drawString(x + 14, y - 18, "QUESTION")
        c.setFillColor(INK)
        c.setFont(F_BOLD, 11.5)
        # Wrap title
        for j, ln in enumerate(
            wrap_lines(c, q, F_BOLD, 11.5, col_w - 28)
        ):
            c.drawString(x + 14, y - 36 - j * 14, ln)
        # Body
        draw_paragraph(
            c, x + 14, y - 70, a, F_BODY, 9, INK_SOFT,
            col_w - 28, leading=1.5,
        )

    # Signature
    c.setFillColor(MUTED)
    c.setFont(F_BODY, 10.5)
    c.drawString(
        M, 36,
        "Elyas Malki & Hussein Malki   ·   contact@naywastudio.com   ·   "
        "naywastudio.com",
    )


# ── Build ─────────────────────────────────────────────────────────────

def main() -> None:
    c = canvas.Canvas(str(OUT), pagesize=(W, H))
    c.setTitle("Naywa Studio — Démo GMH Engineering Solutions")
    c.setAuthor("Naywa Studio")
    c.setSubject("Présentation Package Sourcing — 15 juin 2026")

    slides = [
        slide_cover,
        slide_promise,
        slide_package,
        slide_grid,
        slide_thanks,
    ]
    total = len(slides)
    for i, draw in enumerate(slides, start=1):
        draw(c, i, total)
        c.showPage()
    c.save()
    print(f"PDF généré : {OUT}")


if __name__ == "__main__":
    main()

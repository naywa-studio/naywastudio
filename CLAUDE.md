# Nawa Studio — Contexte Projet

## Qu'est-ce que ce projet ?
Site internet premium de Nawa Studio, un AI Workforce Studio qui déploie
des agents IA pour les entreprises (recrutement, support, contenu, back-office).

## Phase actuelle
PHASE 1 — Site marketing uniquement. Pas de backend, pas de Docker.
Le site sera déployé sur Vercel.

## Stack
- Next.js 14 App Router + TypeScript + Tailwind CSS v4
- Framer Motion (`LazyMotion` + `domAnimation`) pour les animations
- Déploiement : Vercel

## Design
- Thème : clair (fond blanc `#FFFFFF`, surface `#F8F6FF`)
- Couleur primaire : `#7C63C8` (violet-indigo)
- Couleur secondaire : `#B8AEDE` (violet doux)
- Fonts : Space Grotesk (titres, `--font-heading`) + Inter (body, `--font-body`)
- Style : premium, minimaliste, moderne — inspiré Linear/Vercel/Anthropic
- Design tokens complets dans `src/app/globals.css`
- Contexte design détaillé dans `.impeccable.md` (obligatoire pour les skills design)

## Règles importantes
- Toujours Server Components par défaut, "use client" uniquement si nécessaire
- Animations : Framer Motion avec `viewport={{ once: true }}` pour les sections scroll
- Easing standard : `[0.22, 1, 0.36, 1]` — jamais bounce ni elastic
- Images : toujours `next/image` avec dimensions explicites
- Pas de librairies CSS externes (Bootstrap, MUI) — Tailwind uniquement
- TypeScript strict — pas de `any`
- Accessibilité : alt texts, aria-labels, contraste suffisant (WCAG AA)

## Structure src/
- `app/` : pages et layouts (App Router)
- `components/layout/` : Navbar, Footer
- `components/sections/` : Hero, Services, AgentsCatalog, HowItWorks, Pricing, CTA
- `components/ui/` : Button, Card, Badge, GradientText
- `lib/` : fonts.ts, utils.ts

## Skills design disponibles
Ces skills sont installés dans `~/.agents/skills/` et utilisables sur demande :

| Skill | Quand l'utiliser |
|-------|-----------------|
| `/teach-impeccable` | Regénérer / mettre à jour `.impeccable.md` |
| `/frontend-design` | Créer ou refaire un composant / page avec une direction visuelle forte |
| `/critique` | Évaluer un composant ou une page (score UX + anti-patterns) |
| `/normalize` | Aligner un composant sur le design system (tokens, espacement, typographie) |
| `/polish` | Passe finale avant livraison (alignement, états, micro-détails) |
| `/adapt` | Rendre responsive / adapter à mobile ou autre contexte |
| `/colorize` | Retravailler la palette couleur d'un composant |
| `/emil-design-eng` | Animations, micro-interactions, craft UI avancé |
| `/ui-ux-pro-max` | Référence exhaustive UX (accessibilité, touch, motion, charts…) |
| `/shadcn` | Ajouter / configurer des composants shadcn/ui |
| `/find-skills` | Chercher d'autres skills sur skills.sh |

> **Règle** : avant tout travail design, vérifier que `.impeccable.md` existe et est à jour.
> Si absent, invoquer `/teach-impeccable` en premier.

## Phase 2 (plus tard)
Backend FastAPI multi-tenant sur VPS pour les agents IA.
Ne pas créer de fichiers backend/ pour l'instant.

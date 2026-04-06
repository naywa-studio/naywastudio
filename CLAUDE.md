# Nawa Studio — Contexte Projet

## Qu'est-ce que ce projet ?
Site internet premium de Nawa Studio, un AI Workforce Studio qui déploie
des agents IA pour les entreprises (recrutement, support, contenu, back-office).

## Phase actuelle
PHASE 1 — Site marketing uniquement. Pas de backend, pas de Docker.
Le site sera déployé sur Vercel.

## Stack
- Next.js 14 App Router + TypeScript + Tailwind CSS
- Framer Motion pour les animations
- Spline pour l'élément 3D hero (@splinetool/react-spline)
- GSAP + ScrollTrigger pour les animations au scroll
- Déploiement : Vercel

## Design
- Thème : sombre par défaut (#0A0A0F)
- Couleur primaire : #0066FF (bleu électrique)
- Couleur secondaire : #7C3AED (violet)
- Fonts : Space Grotesk (titres) + Inter (body)
- Style : premium, minimaliste, moderne — inspiré Linear/Vercel/Anthropic

## Règles importantes
- Toujours Server Components par défaut, "use client" uniquement si nécessaire
- Animations : Framer Motion avec viewport={{ once: true }} pour les sections
- Images : toujours next/image avec dimensions explicites
- Pas de librairies CSS externes (Bootstrap, MUI) — Tailwind uniquement
- TypeScript strict — pas de "any"
- Accessibilité : alt texts, aria-labels, contraste suffisant

## Structure src/
- app/ : pages et layouts (App Router)
- components/layout/ : Navbar, Footer
- components/sections/ : Hero, Services, AgentsCatalog, HowItWorks, Pricing, CTA
- components/ui/ : Button, Card, Badge, GradientText, SplineScene
- lib/ : fonts.ts, utils.ts

## Phase 2 (plus tard)
Backend FastAPI multi-tenant sur VPS pour les agents IA.
Ne pas créer de fichiers backend/ pour l'instant.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qu'est-ce que ce projet ?
Site internet premium de Nawa Studio, un AI Workforce Studio qui déploie
des agents IA pour les entreprises (recrutement, support, contenu, back-office).

## Phase actuelle
PHASE 1 — Site marketing + onboarding conversationnel + espace client mocké.
Pas de backend réel. Le site est déployé sur Vercel.

## Commandes
```bash
npm run dev      # serveur local (Next.js)
npm run build    # build de production
npm run lint     # ESLint
```

## Stack
- Next.js 16 (App Router) + TypeScript strict + Tailwind CSS v4
- Framer Motion (`LazyMotion` + `domAnimation`) — import via `m` (pas `motion`)
- Supabase JS client (lazy singleton dans `src/lib/supabase.ts`) pour auth uniquement
- Déploiement : Vercel

## Architecture

### Pages
- `/` — page d'accueil marketing (Hero, WhyNawa, AgentsPreview, HowItWorks)
- `/catalogue` — catalogue agents
- `/espace-client` — dashboard client mocké (layout + missions list)
- `/espace-client/sourcing/[missionId]` — détail mission
- `/auth/callback` — callback Supabase OAuth

### Flux onboarding
`OnboardingFlow` est une modale full-screen déclenchée depuis la homepage.
Elle guide l'utilisateur en 5 étapes (volume → pain → autonomy → proposal → signup),
propose un agent IA adapté (`AgentCard`), puis crée un compte Supabase (`SignupForm`).

### MockStore (`src/lib/mock-store.tsx`)
Context React persisté en `localStorage` sous la clé `nawa-mock-store`.
Simule l'état backend : `subscribedLevel`, `missions[]`, sections workspace.
Wraps toute l'app dans `layout.tsx`. Utiliser `useMockStore()` pour y accéder.
Agents disponibles : Léo (Niveau 1 — tri), Nora (Niveau 2 — sourcing), Alex (Niveau 3 — orchestrateur).

### Composants clés
- `ShaderBackground` — SVG animé SMIL avec 2 bandes diagonales (bottom-left→upper-right), clipPath en `objectBoundingBox`
- `Logo` — mark PNG (`/logo-mark.png`) + wordmark texte. Props : `size` (sm/md/lg), `light` (bool)
- `OnboardingFlow` — modale conversationnelle, accepte `initialStep` ("volume" | "signup") et `defaultAuthMode`

## Design system
- Thème : clair (fond blanc `#FFFFFF`, surface `#F8F6FF`)
- Couleur primaire : `#7C63C8` (violet-indigo), secondaire : `#B8AEDE`
- Fonts : Space Grotesk (`--font-space-grotesk`) + Inter (`--font-inter`) + Instrument Serif
- Tokens complets dans `src/app/globals.css`
- Contexte design détaillé dans `.impeccable.md` (obligatoire avant tout travail design)

## Règles importantes
- Server Components par défaut — `"use client"` uniquement si nécessaire
- Animations Framer Motion : `viewport={{ once: true }}` pour sections scroll, easing `[0.22, 1, 0.36, 1]`
- Jamais bounce ni elastic dans les transitions
- Images : `next/image` avec dimensions explicites
- Tailwind uniquement — pas de librairies CSS externes
- Pas de `any` TypeScript

## Skills design disponibles
| Skill | Quand l'utiliser |
|-------|-----------------|
| `/teach-impeccable` | Regénérer `.impeccable.md` |
| `/frontend-design` | Créer/refaire un composant avec forte direction visuelle |
| `/critique` | Score UX + anti-patterns |
| `/normalize` | Aligner sur le design system |
| `/polish` | Passe finale avant livraison |
| `/adapt` | Rendre responsive / mobile |
| `/colorize` | Retravailler la palette |
| `/emil-design-eng` | Animations, micro-interactions avancées |

> Avant tout travail design : vérifier que `.impeccable.md` existe. Sinon, invoquer `/teach-impeccable`.

## Phase 2 (plus tard)
Backend FastAPI multi-tenant sur VPS. Ne pas créer de dossier `backend/` pour l'instant.

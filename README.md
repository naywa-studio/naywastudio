# Nawa Studio

Site marketing premium de **Nawa Studio**, un AI Workforce Studio qui déploie des agents IA opérationnels pour les entreprises (recrutement, support client, création de contenu, back-office).

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 App Router + TypeScript |
| Styles | Tailwind CSS v4 |
| Animations | Framer Motion + GSAP ScrollTrigger |
| 3D | Three.js (hero) / Spline (optionnel) |
| Déploiement | Vercel (région `cdg1` — Paris) |

## Prérequis

- Node.js 20+
- npm 10+

## Lancer en local

```bash
# 1. Cloner le repo
git clone https://github.com/[USERNAME]/nawa-studio.git
cd nawa-studio

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.local.example .env.local
# Éditer .env.local avec vos valeurs

# 4. Lancer le serveur de développement
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

## Structure du projet

```
src/
├── app/                    # Pages et layouts (App Router)
│   ├── layout.tsx          # Layout racine + metadata SEO + JSON-LD
│   ├── page.tsx            # Page d'accueil
│   ├── icon.tsx            # Favicon généré dynamiquement
│   ├── opengraph-image.tsx # OG image généré dynamiquement
│   ├── sitemap.ts          # /sitemap.xml
│   └── robots.ts           # /robots.txt
├── components/
│   ├── layout/             # Navbar, Footer
│   ├── providers/          # MotionProvider (LazyMotion)
│   ├── sections/           # Hero, Services, AgentsCatalog, HowItWorks, Pricing, CTA
│   └── ui/                 # Button, Card, Badge, GradientText, SplineScene, ThreeScene
└── lib/
    ├── fonts.ts            # Space Grotesk + Inter (next/font)
    └── utils.ts            # cn() helper
```

## Commandes disponibles

```bash
npm run dev      # Serveur de développement (Turbopack)
npm run build    # Build de production
npm run start    # Serveur de production local
npm run lint     # ESLint
```

## Variables d'environnement

Copier `.env.local.example` vers `.env.local` et renseigner :

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL canonique du site |
| `NEXT_PUBLIC_SPLINE_SCENE_URL` | URL de la scène Spline 3D (optionnel) |
| `NEXT_PUBLIC_CALENDLY_URL` | Lien Calendly pour les prises de RDV |

## Déploiement sur Vercel

### Première fois

1. Pousser le code sur GitHub :
   ```bash
   git push -u origin main
   ```

2. Aller sur [vercel.com](https://vercel.com) → **Add New Project**

3. Importer le repo `nawa-studio`

4. Configurer les variables d'environnement dans **Settings → Environment Variables**

5. Cliquer **Deploy**

### Déploiements suivants

Chaque `git push` sur `main` déclenche un redéploiement automatique.
Les Pull Requests génèrent automatiquement des **Preview Deployments**.

## SEO

- Sitemap automatique : `/sitemap.xml`
- Robots : `/robots.txt`
- OG image générée via `ImageResponse` Next.js
- JSON-LD : `Organization` + `WebSite` avec `SearchAction`
- Score Lighthouse cible : 90+

## Phase 2

Backend FastAPI multi-tenant sur VPS pour les agents IA (à venir).

---

© 2026 Nawa Studio — Paris, France

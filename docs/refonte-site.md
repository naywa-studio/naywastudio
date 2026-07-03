# Refonte site Naywa Studio — plan & suivi (poste Mac)

> **But de ce fichier** : doc de référence pour la refonte visuelle du site public,
> pilotée depuis le **Mac d'Elyas** (front-only). À lire par **toute session Claude
> qui reprend ce chantier — y compris la session du PC fixe (maison)** pour ne rien
> rater. Complète [`CLAUDE.mac-front.md`](../CLAUDE.mac-front.md) (workflow branches)
> et le `CLAUDE.md` racine (contexte produit complet).
>
> Dernière mise à jour : **2026-07-02**.

---

## 0. Contexte & périmètre

- **Poste Mac = front-end / visuel / intégration UI uniquement.** Pas de back-end,
  migrations, quotas, Stripe, R2, ni logique transverse (réservé au PC fixe).
- **Branches** : `main` (jamais touché depuis le Mac) → `ent-mac-front` (branche
  d'intégration du Mac, **aucun commit direct**) → `feature/*` (un lot visuel chacune).
- **Flow** : `feature/*` → push → PR → validation → **merge dans `ent-mac-front`**.
  La fusion `ent-mac-front` → `main` est décidée **plus tard, depuis le PC fixe**.
- **Preview** : les previews **Vercel sont inaccessibles à Elyas** (protégées par
  l'authentification Vercel de l'équipe). → On utilise un **serveur local**
  (`npm run dev`, Node installé via **nvm**) comme **roue de secours**, rendu dans le
  panneau preview de Claude Code ; Elyas peut pinger des éléments en direct. À terme,
  débloquer l'accès Vercel (protection de déploiement) rendrait les previews par
  branche à nouveau utilisables.
- **Ne jamais toucher les branches `claude/*`** (tâche de fond maison en pause, dont
  `claude/pr-z-flexible-criteria`).

---

## 1. État actuel (fait & mergé dans `ent-mac-front`)

- ✅ **Navbar** ([`Navbar.tsx`](../src/components/layout/Navbar.tsx)) — PR #6 :
  liens de navigation à **gauche** (après le logo), actions (Se connecter / Créer un
  compte, ou Mon workspace + menu profil) à **droite**, état **"page active"**
  (`aria-current` + fond violet léger) desktop **et** mobile. `white-space: nowrap`
  sur les liens (anti-retour à la ligne dans la plage ~1024-1120px).
  - Les **bandes animées** rappelées dans la capsule ont été testées puis **retirées**
    (jugées trop chargées). Piste future : version beaucoup plus subtile.
- ✅ **Hero** ([`Hero.tsx`](../src/components/sections/Hero.tsx)) — PR #7 :
  contenu **remonté en centre-gauche** (`justify-content: center`, fini le grand vide
  en haut) + **eyebrow** "Nora — l'assistante IA du sourcing" au-dessus du titre.

---

## 2. Décisions design figées

### Typographie — ⚠️ décision EN SUSPENS (revertée le 2026-07-02)
- **Testé puis annulé** : la migration des titres en **Space Grotesk** + accent
  **Times New Roman** gras italique (dite "Option C", PR #9 et #10) a été livrée
  puis **entièrement revertée** à la demande d'Elyas — il n'était pas à l'aise avec
  le rendu. Retour à l'état d'origine (PR #11).
- **État actuel = l'original** : titres en **Inter** (poids 800), accents en
  **Instrument Serif** italique. Le site reste légèrement incohérent (WhyNawa était
  déjà en Space Grotesk à l'origine — non touché par le revert).
- **À reprendre plus tard** avec une autre approche/police si Elyas le souhaite —
  ne pas re-tenter Space Grotesk / Times sans nouvelle validation.
- Les 3 polices restent chargées ([`lib/fonts.ts`](../src/lib/fonts.ts)).

### Couleurs & style (cf. `.impeccable.md`)
- Primary `#7C63C8`, Secondary `#B8AEDE`, surface `#F8F6FF`, border `#E2DAF6`.
- Textes `#111827` (primary) / `#4B5563` (secondary) / `#9CA3AF` (muted).
- Cards blanches, radius 12-20px, ombres légères, easing `[0.22, 1, 0.36, 1]`,
  **pas d'emoji UI**. "Le violet = signal, pas fond."

---

## 3. Fondations à créer (Phase 0 — prioritaire)

1. **Tokens centralisés** dans `globals.css` (variables CSS) : couleurs, radius,
   ombres, espacements, **échelle de tailles de texte**. Objectif : **tuer les valeurs
   "en dur"** recopiées à la main dans chaque composant (aujourd'hui tout est en style
   inline dupliqué → dérive + maintenance lourde).
2. **Composants réutilisables** (primitives) : `Button`, `Card`, `EyebrowTag`,
   `SectionHeading`. Remplacer progressivement les styles inline dupliqués.
3. **Migration typo** : passer les titres (Hero, /tarifs, /solutions, /a-propos,
   /faq…) en Space Grotesk + accent serif, via les nouvelles primitives.

---

## 4. Plan de refonte en phases

Chaque phase = un ou plusieurs lots `feature/*`. Périmètre Mac = front public.

| Phase | Contenu | Impact | Périmètre |
|---|---|---|---|
| **0 · Fondations** | Tokens + primitives (`Button`/`Card`/`EyebrowTag`/`SectionHeading`) + migration typo Space Grotesk. | 🔥🔥🔥 débloque tout | ✅ Mac |
| **1 · Accueil** | Hero ✅. Reste : `WhyNawa`, `AgentsPreview`, `HowItWorks`, `Founders`, `FinalCTA` (rythme, cartes, animations homogènes) + **visuel produit** (capture workspace). | 🔥🔥🔥 | ✅ Mac |
| **2 · Pages marketing** | `/tarifs` (comparatif features + badge recommandé), `/solutions`, `/a-propos`, `/faq`, `/contact`. Sur les primitives Phase 0. | 🔥🔥 | ✅ Mac |
| **3 · Connexion + légal** | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `LegalPageShell`. **REPOUSSÉ** (décision Elyas : optionnel, plus tard). | 🔥🔥 | ✅ Mac |
| **4 · Accessibilité AA + mobile** | Contrastes, focus clavier, `prefers-reduced-motion`, cibles 44px, alt text, passe responsive complète. | 🔥🔥 | ✅ Mac |
| **5 · Détails de marque** | Footer polish, pages 404/500 brandées, favicon/OG, micro-interactions. | 🔥 | ✅ Mac |
| **6 · App connectée** | Aligner workspace / organisation / admin sur le design-system. Plus lourd, touche des composants logiques. | 🔥🔥 | ⚠️ **à coordonner avec la maison** |

**Ordre retenu** : Phase 0 → 1 → 2 → 4 → 5 → (3 plus tard) → 6 (avec la maison).

---

## 5. Visuels produit (preuve / crédibilité)

- **Objectif** : montrer le **vrai** workspace / Nora sur le site public (le site en
  parle mais ne le montre pas → levier fort de confiance/conversion).
- **Fidélité importante (Elyas)** → on utilise le **vrai produit**, pas une démo codée.
- **Approche retenue** :
  - **Capture d'écran propre** du vrai workspace, posée dans un cadre "navigateur"
    sur le site. Simple, 100 % fidèle, gratuit. **Point de départ.**
  - **Motion (optionnel, plus tard)** : outil gratuit **Cap** (cap.so, open-source,
    curseur lissé + zoom auto) ou **Screenity** (extension Chrome). Payant premium =
    Screen Studio.
  - ⚠️ L'appli est **derrière connexion** et le Mac est front-only → la **capture est
    prise par Elyas ou le PC maison** (compte connecté), puis intégrée côté front.

---

## 6. Accessibilité (Phase 4 — rappel)

Cibler **WCAG AA** : contrastes texte/fond ≥ 4.5:1 (le gris `#4B5563` sur fond
translucide/animé est limite), focus clavier visible, respect de
`prefers-reduced-motion` (bandes du fond `ShaderBackground` + animations `fadeUp`),
cibles cliquables ≥ 44px, textes alternatifs sur images.

---

## 7. Points ouverts

- **Visuel produit** : quelle page du workspace mettre en avant (vivier ? fiche
  mission ? matching ?) — à choisir avec Elyas.
- **Space Grotesk** : vérifier la lisibilité sur très gros titres après migration.
- **Accès preview Vercel** : débloquer la protection de déploiement pour retrouver les
  previews par branche (sinon on reste sur le local).
- **Bandes dans la navbar** : re-tenter une version ultra-subtile un jour, ou abandonner.

---

## 8. Journal

- **2026-07-02** — Setup du poste Mac : clone du repo, token GitHub fine-grained
  (trousseau macOS), création `ent-mac-front` + [`CLAUDE.mac-front.md`](../CLAUDE.mac-front.md).
  Navbar (PR #6) et Hero (PR #7) livrés et mergés. Typo "Option C" (Space Grotesk +
  accent serif) choisie. Node installé via nvm pour la preview locale (roue de
  secours, Vercel inaccessible). Plan de refonte rédigé (ce fichier).
- **2026-07-02 (suite)** — Phase 0 typo livrée (PR #9 : Space Grotesk + tokens +
  brique `EyebrowTag`) puis accent Times New Roman gras italique + hero violet plein
  (PR #10). **Puis TOUT reverté (PR #11)** à la demande d'Elyas : pas à l'aise avec
  la nouvelle typo → retour à l'original (Inter + Instrument Serif). Le hero remonté
  et la navbar sont conservés. Décision typo à reprendre plus tard.

# CLAUDE — Poste Mac (front-only)

> Ce fichier s'ajoute au `CLAUDE.md` racine (contexte projet complet). Il **ne le
> remplace pas**. Il décrit les règles de travail **spécifiques au Mac d'Elyas**,
> distinct du PC fixe de la maison où tourne le développement principal.
>
> **But** : que la session Claude « maison » (PC fixe) ne rate rien de ce qui a été
> fait ici. Toute personne/agent qui analyse `ent-mac-front` doit lire ce fichier.

---

## 1. Périmètre du poste Mac

**Front-end / visuel / intégration UI uniquement.**

Autorisé ici :
- Composants React, styles, layout, animations (`m` + `LazyMotion`, easing `[0.22, 1, 0.36, 1]`)
- Design system (cf. `CLAUDE.md` §14 + `.impeccable.md`) : palette violet `#7C63C8`, cards blanches, `#F8F6FF`, pas d'emoji UI
- Ajustements d'affichage, responsive, états hover/loading, wording UI

**Interdit ici (réservé au PC fixe / maison)** :
- Logique globale, back-end, routes API (comportement serveur)
- Migrations Supabase, schéma DB, RLS
- Quotas, Stripe, R2, webhooks, crons
- Toute décision d'architecture transverse

En cas de doute « est-ce que c'est du front ? » → ne pas toucher, le noter, demander à Elyas.

---

## 2. Modèle de branches (STRICT)

```
main  ← réservé au PC fixe / maison. On n'y touche JAMAIS depuis ce Mac.
  │
  └── ent-mac-front  ← branche d'intégration de CE Mac (créée depuis main).
        │              On ne code JAMAIS directement dessus.
        │
        ├── feature/<nom-du-visuel>   ← 1 lot visuel = 1 sous-branche
        ├── feature/<autre-visuel>
        └── ...
```

- **`ent-mac-front`** = branche commune du Mac, créée depuis `main`. Sert de point
  d'intégration. **Aucun commit direct** dessus : elle ne reçoit que des merges de
  sous-branches validées.
- **`feature/<nom>`** = une par groupe de modifications visuelles, partant toujours
  de `ent-mac-front` à jour.

---

## 3. Flow de travail (STRICT)

Pour chaque lot visuel :

1. **Créer** `feature/<nom>` depuis `ent-mac-front` à jour.
2. **Coder** le front sur cette sous-branche.
3. **Push** de la sous-branche → Vercel génère **automatiquement une preview** à
   chaque push (pas besoin d'une PR pour avoir une preview).
4. **Ouvrir une PR** de `feature/<nom>` → `ent-mac-front` (pour la revue + lien preview propre).
5. **Attendre la validation de la preview par Elyas** (screenshots / OK explicite).
   → Règle établie côté projet : `[[feedback_preview_before_merge]]`.
6. **Merger** `feature/<nom>` dans **`ent-mac-front`** (jamais dans `main`).

**Décision de fusionner `ent-mac-front` → `main`** : prise **plus tard, depuis le PC
fixe**, par la session « maison ». Ce Mac ne fusionne jamais vers `main`.

---

## 4. Ne rien casser du travail de fond (maison)

- Une tâche de fond complexe tourne côté PC fixe, actuellement **en pause** (limite de
  messages), non relancée.
- Elle vit sur des branches `claude/*` déjà poussées sur GitHub — notamment
  **`claude/pr-z-flexible-criteria`** (dernier chantier « critères flexibles / matching »).
- **Ne jamais toucher, checkout-modifier, merger ou rebaser ces branches `claude/*`
  depuis ce Mac.** On reste dans notre couloir `ent-mac-front` + `feature/*`.

---

## 5. Rappels de conventions (héritées du CLAUDE.md racine)

- **Tests via Vercel uniquement** — jamais suggérer/lancer `npm run dev` (cf. §19).
- Code en anglais, commentaires + UI en français.
- Zéro `any` ; `tsc --noEmit` + `eslint --max-warnings=0` doivent passer.
- Styles inline `React.CSSProperties` (pas de Tailwind classes lourdes, pas de shadcn).
- `framer-motion` : `m` (pas `motion`) + `LazyMotion`.
- Pas d'emoji dans l'UI sauf demande explicite.
- Commits détaillés, PR avec 2-3 bullets + « Test plan » cochable, pas de blabla AI.
- Jamais `--no-verify`, jamais `--force` sur une branche partagée.

---

## 6. Infra connue (lecture seule depuis ce Mac)

- **Repo** : `naywa-studio/naywastudio` (GitHub, public) — prod = `main`, domaine `naywastudio.com`
- **Vercel** : projet `nawa-studio` (team `malkis-projects-fe4fdf26`), region `cdg1`.
  Preview auto par branche. MCP Vercel dispo pour lire deployments/logs.
- **Supabase** + **Cloudflare R2** : back-end. **Hors périmètre Mac** — ne pas modifier.

---

*Créé le 2026-07-02 depuis le Mac. À commiter sur `ent-mac-front` une fois la branche
mise en place, pour que la session maison le voie.*

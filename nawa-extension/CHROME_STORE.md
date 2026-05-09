# Soumission Chrome Web Store — Naywa Studio

Quand tu es prêt à passer en distribution officielle (sortie de la beta privée), suis cette procédure. Délai total : **15 min de prep + 1-7 jours de review Google**.

## 0. Prérequis

- Une carte bancaire (5 $ unique pour ouvrir le compte développeur)
- L'extension à jour côté `nawa-extension/` (`npm run build:extension` la zippe dans `public/naywa-extension.zip`)

## 1. Compte développeur

1. https://chrome.google.com/webstore/devconsole/
2. Connecte-toi avec un compte Google (idéalement un email pro, ex: `dev@naywastudio.com`)
3. Paie les **5 USD** d'inscription unique
4. Renseigne ton identité (nom, adresse postale, numéro de téléphone vérifié par SMS)

## 2. Préparer les assets visuels

| Asset | Taille | Source |
|---|---|---|
| **Icône** | 128 × 128 PNG | `nawa-extension/icons/128.png` (déjà OK) |
| **Petit teaser** (carré pour le store) | 440 × 280 PNG | À créer — visuel propre du logo + texte |
| **Bandeau Marquee** (optionnel mais recommandé) | 1400 × 560 PNG | À créer |
| **Captures d'écran** (1 à 5) | 1280 × 800 ou 640 × 400 PNG | Screenshots du workspace + extension popup + résultats |

Pour les visuels rapides : utilise [Canva](https://canva.com), [Figma](https://figma.com) ou un IA logo-maker (Recraft, Ideogram).

## 3. Soumettre l'extension

1. Console développeur → **« Nouvel élément »**
2. Upload `public/naywa-extension.zip`
3. Onglet **« Description sur le Chrome Web Store »** :
   - **Nom** : `Naywa Studio — Sourcing LinkedIn`
   - **Description courte** (132 caractères max) :
     > Trouve les meilleurs candidats LinkedIn et Malt en quelques secondes. Recherche, scoring IA et export Excel intégrés.
   - **Description longue** (Markdown autorisé) — voir bloc ci-dessous
   - **Catégorie** : Productivité
   - **Langue** : Français (par défaut)
4. Onglet **« Justification des autorisations »** — pour chaque permission demandée :

   | Permission | Justification (à coller) |
   |---|---|
   | `tabs` | Ouvrir un onglet en arrière-plan vers les profils LinkedIn pour les enrichir avec la session de l'utilisateur. |
   | `storage` | Mémoriser le token Naywa Studio et l'état des recherches en cours. |
   | `scripting` | Injecter le content-script sur les pages LinkedIn et Naywa Studio pour la communication entre la page et le service worker. |
   | `activeTab` | Permettre l'envoi du brief depuis l'onglet workspace courant. |
   | `host_permissions: google.com` | Effectuer la recherche web depuis le navigateur de l'utilisateur (pas de scraping côté serveur). |
   | `host_permissions: linkedin.com` | Lire les profils LinkedIn que l'utilisateur a déjà ouverts pour enrichir les candidats. |
   | `host_permissions: nawa-studio.vercel.app` + `*.vercel.app` | Communiquer avec l'API Naywa Studio pour pousser les profils trouvés. |

5. Onglet **« Confidentialité »** :
   - **Pratiques de confidentialité** : aucune donnée personnelle n'est collectée par l'extension elle-même. Le seul backend appelé est `nawa-studio.vercel.app` qui a sa propre politique.
   - **Page de politique de confidentialité** : `https://nawa-studio.vercel.app/mentions-legales` (créer une vraie page `/privacy` plus tard si demandé)
6. Onglet **« Distribution »** :
   - **Visibilité** : Public
   - **Pays** : Tous (ou France/Europe si tu veux limiter)
7. Clique **« Soumettre pour examen »**

## 4. Pendant la review

- La review prend **1 à 7 jours**, parfois 24h pour une première soumission propre.
- Tu reçois un email à chaque transition (en review → approuvée / refusée).
- Si refusée, tu reçois la raison + 30 jours pour corriger et resoumettre.

## 5. Après l'approbation

- Tu obtiens un **lien public** : `https://chrome.google.com/webstore/detail/naywa-studio/<EXTENSION_ID>`
- Modifie `/install/page.tsx` pour pointer ce lien plutôt que le ZIP local
- Communique le lien à tes sourceuses

## Description longue (à coller dans le store)

```markdown
**Naywa Studio** — l'agent de sourcing automatisé pour les recruteurs.

Décrivez votre poste à pourvoir dans le chat Naywa Studio, et Léo trouve
jusqu'à 60 profils LinkedIn et Malt triés par pertinence, en quelques
secondes. Tableur Excel exportable en un clic.

## Comment ça marche

1. Crée un compte gratuit sur https://nawa-studio.vercel.app
2. Installe cette extension
3. Décris ton besoin de recrutement dans le chat
4. Léo cherche les candidats et te remet le tableur

## Pourquoi l'extension ?

L'extension permet à Léo d'effectuer les recherches **depuis ton propre
navigateur** : pas de quotas API à gérer, pas de blocage Google, et tes
résultats arrivent plus vite. Léo fonctionne aussi sans extension via
les API serveur, mais c'est plus rapide avec.

## Phase beta

Naywa Studio est gratuit pendant la beta — aucune carte bancaire
requise. Vos retours sont bienvenus à contact@nawastudio.com.

## Vie privée

L'extension n'envoie aucune donnée à Naywa Studio sans ton accord.
Elle utilise ton navigateur pour effectuer les recherches que tu lui
demandes via le chat workspace, puis pousse uniquement les résultats
demandés. Pas de pistage, pas de revente.
```

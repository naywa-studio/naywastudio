# Nawa Studio — Contexte projet

## Stack
- Next.js App Router + Vercel
- Supabase (auth + DB)
- VPS Hostinger par client (API auto-provisioning)
- OpenRouter (LLM)
- Tavily API (recherche profils)
- node-ssh (déploiement agents)

## Règles de développement
- Langue du code : anglais (variables, fonctions, commentaires)
- Langue UI : français
- Pas de `any` TypeScript
- Toujours vérifier la session Supabase côté serveur avant toute action
- Ne jamais exposer l'IP du VPS client au navigateur
- Toutes les requêtes vers les agents VPS passent par /api/missions (proxy Next.js)
- Les clés API clients sont stockées uniquement sur leur VPS, jamais dans Supabase

## Priorités actuelles
1. Tables Supabase (profiles, missions, candidates) + RLS
2. Flow souscription (/api/subscribe)
3. Provisioning VPS Hostinger automatique
4. Déploiement agents Python sur VPS via SSH
5. Workspace client fonctionnel (Léo + Nora uniquement)

## Agents — périmètre actuel
- Léo (N1) : recherche Tavily → Excel
- Nora (N2) : Léo + scoring LLM + messages personnalisés
- Alex (N3) : hors scope

## Ce que Nawa ne fait jamais
- Envoyer des messages aux candidats
- Accéder au compte LinkedIn du client
- Stocker des tokens LinkedIn

## Variables d'environnement
Voir .env.local — toutes les clés sont présentes.
AGENT_VPS_SSH_KEY est encodée en base64, décoder avant usage SSH.

## Fichiers agents (à créer dans lib/agent-templates/)
- main.py — serveur FastAPI (port 8000)
- agent_leo.py — logique Léo
- agent_nora.py — logique Nora
- requirements.txt — dépendances Python

## Convention nommage
- API routes : /api/[ressource]/route.ts
- Composants : PascalCase
- Utilitaires : camelCase dans /lib/
- Tables Supabase : snake_case

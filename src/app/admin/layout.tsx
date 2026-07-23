/**
 * Garde-fou d'accès à /admin — VRAI check côté serveur.
 *
 * Avant ce fichier, ce layout était "use client" : le check is_admin ne
 * tournait que dans un useEffect navigateur (cf. AUDIT-SECURITE-2026-07-21.md
 * finding #14/#16 — le commentaire d'origine prétendait "protégé côté
 * server" alors que ce n'était pas le cas). Chaque route API /admin/*
 * revérifie déjà requireAdmin() indépendamment, donc aucune donnée n'a
 * jamais fuité — mais un futur composant qui fetcherait des données
 * admin-only directement (Server Component) n'aurait eu aucun filet.
 *
 * Ce Server Component fait le vrai contrôle avant tout rendu, puis délègue
 * le chrome UI (header, onglets, contexte useAdmin()) au composant client
 * `AdminLayoutClient`, qui garde sa propre re-vérification comme filet UX
 * (ex. session expirée pendant la navigation), mais n'est plus la seule
 * barrière.
 */

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { isAdmin } from "@/lib/admin"
import AdminLayoutClient from "@/components/admin/AdminLayoutClient"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    redirect("/login?next=/admin")
  }
  if (!(await isAdmin(user.id))) {
    redirect("/workspace")
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>
}

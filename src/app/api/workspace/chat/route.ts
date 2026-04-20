/**
 * POST /api/workspace/chat
 * Central workspace AI — manages missions, briefs, searches.
 * Injects workspace_memory + optional mission brief_memory into system prompt.
 * Triggers compaction when conversation exceeds token threshold.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { Database, WorkspaceMsg } from "@/lib/database.types"

const COMPACTION_TOKEN_THRESHOLD = 16_000 // ~64k chars ≈ 16k tokens

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function countApproxTokens(msgs: WorkspaceMsg[]): number {
  const total = msgs.reduce((acc, m) => acc + m.content.length, 0)
  return Math.round(total / 4)
}

const WORKSPACE_SYSTEM_PROMPT = `Tu es l'assistant IA central de Nawa Studio, une plateforme de sourcing LinkedIn.
Tu aides le recruteur a creer des missions et lancer des recherches depuis le chat.

=== SYSTEME DE COMMANDES ===
Tu DOIS ecrire une balise <action> dans ton message chaque fois qu'une action est requise.
Le systeme extrait et execute la balise cote serveur — l'utilisateur ne la voit pas dans l'interface.
Ne mentionne jamais les mots "action", "balise", "JSON", "systeme" dans ton texte visible.

FORMAT OBLIGATOIRE (une seule balise par reponse, JSON sur une ligne) :
<action>{"type":"TYPE","cle":"valeur"}</action>

Types disponibles :
- create_mission : cree le dossier + brief en une fois
- run_mission    : lance la recherche
- update_brief   : modifie le brief existant

=== QUAND ECRIRE UNE BALISE <action> ===

[NOUVEAU BESOIN — infos suffisantes : poste + lieu + 2 competences minimum]
Ecris OBLIGATOIREMENT cette balise dans ton message :
<action>{"type":"create_mission","title":"Titre Court","brief":{"titre_poste":"Poste","localisation":"Ville","mots_cles":["comp1","comp2","comp3"],"criteres":"seniorite, contrat","ton":"style contact"}}</action>
Puis en texte (2-3 phrases max) : confirme le poste/lieu/competences retenus, termine par "Je peux lancer la recherche ?"

[INFOS MANQUANTES — poste flou OU pas de lieu]
Pas de balise. Pose UNE seule question (la plus importante).

[CONFIRMATION — utilisateur dit oui/lancez/c'est bon/parfait/top/go]
L'ID mission est disponible dans le contexte sous "ID mission : xxx".
Ecris OBLIGATOIREMENT cette balise :
<action>{"type":"run_mission","missionId":"ID_EXACT_DU_CONTEXTE"}</action>
Texte : "Recherche lancee ! Redirection vers le dossier en cours..."

[MISSION EXISTANTE ATTACHEE]
Brief disponible en contexte. Propose : relancer (run_mission), affiner (update_brief), chercher plus (run_mission).

=== REGLES BRIEF ===
- titre_poste  : 1-4 mots (ex: "Expert Equipements Rotatifs", "Developpeur Full Stack", "DRH")
- mots_cles    : 5-8 competences techniques. REGLES CRITIQUES :
    * Jamais de soft skills (communication, leadership…)
    * Pour les metiers industriels/techniques/ingenierie : inclure les equivalents ANGLAIS
      ex: "équipements rotatifs" → ajouter "rotating equipment"
      ex: "fiabilité mécanique" → ajouter "reliability"
      ex: "compresseurs" → ajouter "compressor"
    * Inclure le SECTEUR si mentionne (ex: "oil & gas", "énergie", "pétrochimie", "pharma")
    * Inclure des mots-cles de METHODE/OUTIL si cites (ex: "CMMS", "RCM", "Six Sigma")
- localisation : TOUJOURS la ville principale, jamais un suburb/commune
    * "La Garenne-Colombes", "Courbevoie", "Neuilly" → ecrire "Paris"
    * "Villeurbanne", "Bron" → ecrire "Lyon"
    * "Mérignac", "Pessac" → ecrire "Bordeaux"
    * Si le client dit "national" ou "multi-sites" → ecrire "France"
- criteres     : seniorite, contrat, secteur cible, urgence, salaire si mentionne
- ton          : style de contact (ex: "Direct et humain", "Professionnel")

=== STYLE ===
- Collegue senior, chaleureux et efficace
- 2-3 phrases max par reponse
- **Gras** sur les elements cles (poste, lieu, competences)
- Toujours en francais
- Recrutement et sourcing uniquement`

const COMPACTION_PROMPT = `Résume la conversation ci-dessous en un fichier mémoire Markdown structuré.
Ce fichier sera injecté dans les futures conversations pour donner le contexte au début.
Sois concis mais complet. Capture : le profil du client, ses préférences, les missions en cours et leur état, les décisions importantes prises.
Format :
# Mémoire Workspace
## Profil client
...
## Missions en cours
...
## Contexte et préférences
...`

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    message: string
    attachedMissionId?: string
    attachedMissionTitle?: string
  }

  const { message, attachedMissionId, attachedMissionTitle } = body
  if (!message?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 })

  const sbAdmin = supabaseAdmin()

  // Load profile (workspace memory + message history)
  const { data: profile } = await sbAdmin
    .from("profiles")
    .select("workspace_memory, workspace_messages, subscription_level, first_name, booking_url")
    .eq("user_id", user.id)
    .single()

  const workspaceMemory = profile?.workspace_memory ?? null
  const existingMessages: WorkspaceMsg[] = (profile?.workspace_messages as WorkspaceMsg[] | null) ?? []

  // Load mission memory if attached
  let missionMemory: string | null = null
  let missionTitle = attachedMissionTitle ?? null
  if (attachedMissionId) {
    const { data: mission } = await sbAdmin
      .from("missions")
      .select("brief_memory, title, brief, status, profiles_count")
      .eq("id", attachedMissionId)
      .eq("user_id", user.id)
      .single()

    if (mission) {
      missionTitle = mission.title
      if (mission.brief_memory) {
        missionMemory = mission.brief_memory
      } else if (mission.brief) {
        const b = mission.brief
        missionMemory = `# Mission : ${mission.title}
Statut : ${mission.status}
Poste : ${b.titre_poste}
Localisation : ${b.localisation}
Mots-clés : ${b.mots_cles?.join(", ")}
${b.criteres ? `Critères : ${b.criteres}` : ""}
${b.ton ? `Ton : ${b.ton}` : ""}
Profils trouvés : ${mission.profiles_count}`
      }
    }
  }

  // Build system prompt
  let systemPrompt = WORKSPACE_SYSTEM_PROMPT

  if (workspaceMemory) {
    systemPrompt += `\n\n---\n${workspaceMemory}`
  }

  if (missionMemory) {
    systemPrompt += `\n\n---\n## Dossier-mission attaché : "${missionTitle}"\nID mission : ${attachedMissionId}\n${missionMemory}`
  } else if (attachedMissionId) {
    // Mission attached but no brief yet — still inject the ID
    systemPrompt += `\n\n---\n## Dossier-mission attaché : "${missionTitle ?? "Sans titre"}"\nID mission : ${attachedMissionId}\nAucun brief défini pour l'instant.`
  }

  // Client context
  systemPrompt += `\n\n---\nClient : ${profile?.first_name ?? user.email}
Niveau agent : ${profile?.subscription_level ?? "inconnu"}
${profile?.booking_url ? `Lien booking : ${profile.booking_url}` : ""}`

  // Add new user message
  const newUserMsg: WorkspaceMsg = {
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    ...(attachedMissionId ? { attachedMissionId, attachedMissionTitle: missionTitle ?? undefined } : {}),
  }

  const updatedMessages = [...existingMessages, newUserMsg]

  // Build OpenRouter messages
  const openrouterMessages = updatedMessages.map((m) => ({
    role: m.role,
    content: m.attachedMissionTitle
      ? `[Mission attachée : "${m.attachedMissionTitle}"]\n${m.content}`
      : m.content,
  }))

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  if (!OPENROUTER_KEY) return NextResponse.json({ error: "OpenRouter not configured" }, { status: 500 })

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://nawastudio.com",
      "X-Title": "Nawa Studio",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...openrouterMessages,
      ],
      temperature: 0.4,
      max_tokens: 800,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `OpenRouter error: ${err}` }, { status: 502 })
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  const assistantContent = data.choices[0]?.message?.content ?? ""

  // Parse action tags from response
  const actionMatch = assistantContent.match(/<action>([\s\S]*?)<\/action>/)
  let action: Record<string, unknown> | null = null
  let cleanContent = assistantContent
  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1].trim())
      cleanContent = assistantContent.replace(/<action>[\s\S]*?<\/action>/g, "").trim()
    } catch { /* ignore parse error */ }
  }

  const newAssistantMsg: WorkspaceMsg = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: cleanContent,
  }

  const finalMessages = [...updatedMessages, newAssistantMsg]

  // Check if compaction needed
  const approxTokens = countApproxTokens(finalMessages)
  let savedMessages = finalMessages
  let newWorkspaceMemory = workspaceMemory

  if (approxTokens > COMPACTION_TOKEN_THRESHOLD) {
    try {
      const compactRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: COMPACTION_PROMPT },
            { role: "user", content: finalMessages.map((m) => `${m.role}: ${m.content}`).join("\n\n") },
          ],
          temperature: 0.3,
          max_tokens: 1200,
        }),
      })
      if (compactRes.ok) {
        const compactData = await compactRes.json() as { choices: Array<{ message: { content: string } }> }
        newWorkspaceMemory = compactData.choices[0]?.message?.content ?? workspaceMemory
        savedMessages = []
      }
    } catch { /* keep existing if compaction fails */ }
  }

  // ── Handle create_mission (with optional embedded brief) ────────────────────
  if (action?.type === "create_mission" && action.title) {
    const { data: newMission } = await sbAdmin
      .from("missions")
      .insert({
        title: action.title as string,
        user_id: user.id,
        agent_level: profile?.subscription_level === "leo" ? "leo" : "nora",
      })
      .select()
      .single()

    if (newMission) {
      action = { ...action, missionId: newMission.id }

      // If brief is embedded in create_mission, save it immediately
      if (action.brief) {
        try {
          const brief = typeof action.brief === "string" ? JSON.parse(action.brief) : action.brief
          await sbAdmin
            .from("missions")
            .update({ brief, status: "preparation" })
            .eq("id", newMission.id)

          const b = brief as Record<string, unknown>
          const mem = `# Mission brief\nPoste : ${b.titre_poste}\nLocalisation : ${b.localisation}\nMots-clés : ${Array.isArray(b.mots_cles) ? (b.mots_cles as string[]).join(", ") : ""}\nCritères : ${b.criteres ?? ""}\nTon : ${b.ton ?? ""}`
          await sbAdmin.from("missions").update({ brief_memory: mem }).eq("id", newMission.id)
        } catch { /* ignore */ }
      }
    }
  }

  // ── Resolve missionId for run_mission ───────────────────────────────────────
  if (action?.type === "run_mission") {
    const mId = action.missionId as string | undefined
    const resolvedId = mId && mId !== "..." ? mId : attachedMissionId
    if (resolvedId) {
      action = { ...action, missionId: resolvedId }
    }
  }

  // ── Handle update_brief ────────────────────────────────────────────────────
  if (action?.type === "update_brief" && action.missionId && action.brief) {
    try {
      const brief = typeof action.brief === "string" ? JSON.parse(action.brief) : action.brief
      await sbAdmin
        .from("missions")
        .update({ brief, status: "preparation" })
        .eq("id", action.missionId as string)
        .eq("user_id", user.id)
      const b = brief as Record<string, unknown>
      const mem = `# Mission brief\nPoste : ${b.titre_poste}\nLocalisation : ${b.localisation}\nMots-clés : ${Array.isArray(b.mots_cles) ? (b.mots_cles as string[]).join(", ") : ""}\nCritères : ${b.criteres ?? ""}\nTon : ${b.ton ?? ""}`
      await sbAdmin.from("missions").update({ brief_memory: mem }).eq("id", action.missionId as string).eq("user_id", user.id)
    } catch { /* ignore */ }
  }

  // Save messages + memory to Supabase
  await sbAdmin
    .from("profiles")
    .update({
      workspace_messages: savedMessages as unknown as Database["public"]["Tables"]["profiles"]["Update"]["workspace_messages"],
      ...(newWorkspaceMemory !== workspaceMemory ? { workspace_memory: newWorkspaceMemory } : {}),
    })
    .eq("user_id", user.id)

  // Update mission brief_memory if attached but no memory yet
  if (attachedMissionId && finalMessages.length > 0 && !missionMemory) {
    const missionSummary = `# Mission : ${missionTitle}\nContexte défini dans le chat workspace.`
    await sbAdmin
      .from("missions")
      .update({ brief_memory: missionSummary })
      .eq("id", attachedMissionId)
      .eq("user_id", user.id)
  }

  return NextResponse.json({
    content: cleanContent,
    action: action ?? undefined,
    compacted: approxTokens > COMPACTION_TOKEN_THRESHOLD,
  })
}

// DELETE — clear conversation history
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await supabaseAdmin()
    .from("profiles")
    .update({ workspace_messages: [] })
    .eq("user_id", user.id)

  return NextResponse.json({ ok: true })
}

// GET — load message history
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("workspace_messages, workspace_memory")
    .eq("user_id", user.id)
    .single()

  return NextResponse.json({
    messages: profile?.workspace_messages ?? [],
    hasMemory: !!profile?.workspace_memory,
  })
}

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
const ADMIN_EMAILS = ["elyas.malki1003@gmail.com"]

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

const WORKSPACE_SYSTEM_PROMPT = `Tu es l'assistant IA central de Nawa Studio, une plateforme de sourcing de candidats.
Tu gères l'espace de travail du recruteur : créer des missions, définir des briefs, lancer des recherches, suivre les résultats.

RÔLE ET PÉRIMÈTRE :
- Tu aides le client à structurer ses besoins en recrutement
- Tu crées et gères les dossiers-missions
- Tu analyses les résultats de sourcing et tu les commentes
- Tu proposes des actions concrètes (élargir la recherche, modifier le brief, relancer, etc.)
- Tu DEMANDES TOUJOURS l'approbation avant toute action (création, modification, lancement)

TON ET STYLE :
- Chaleureux, direct, professionnel — comme un collègue senior de confiance
- Maximum 3 phrases par message sauf si l'utilisateur demande plus de détails
- Utilise **gras** pour les éléments clés
- Un emoji occasionnel, pas plus d'un par message
- Réponds toujours en français

FLUX POUR UNE NOUVELLE MISSION :
1. Créer la mission :
<action>{"type":"create_mission","title":"..."}</action>

2. Collecter le brief via la conversation (poste, localisation, compétences, séniorité, contrat, ton)

3. Quand tu as assez d'informations, proposer de sauvegarder le brief :
<action>{"type":"update_brief","missionId":"...","brief":{"titre_poste":"...","mots_cles":["...","..."],"localisation":"...","criteres":"...","ton":"..."}}</action>

4. Après confirmation du client, proposer de lancer la recherche :
<action>{"type":"run_mission","missionId":"..."}</action>

RÈGLES BRIEF :
- titre_poste : 1-4 mots max (ex: "Développeur Full Stack", "Avocat", "DRH")
- mots_cles : compétences techniques ou sectorielles uniquement (pas de soft skills)
- localisation : ville ou région (ex: "Paris", "Lyon", "Remote")
- criteres : résumé concis des contraintes (séniorité, contrat, secteur, urgence)
- ton : style pour contacter les candidats (ex: "Direct et humain", "Professionnel")

ÉTAT INITIAL :
Si c'est la première conversation (pas de mémoire), propose deux options :
1. "Démarrer une nouvelle mission" — pour définir un nouveau besoin
2. "Continuer une mission existante" — pour travailler sur un dossier déjà créé (glisser-déposer depuis le panneau de droite)

Ne génère jamais de brief ou d'action sans avoir les informations suffisantes.
Ne parle que de recrutement et de sourcing.`

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
        // Auto-generate basic mission memory from brief
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
    systemPrompt += `\n\n---\n## Dossier-mission attaché : "${missionTitle}"\n${missionMemory}`
  }

  // Add client context
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
      temperature: 0.65,
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
  let action: Record<string, string> | null = null
  let cleanContent = assistantContent
  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1])
      cleanContent = assistantContent.replace(/<action>[\s\S]*?<\/action>/, "").trim()
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
    // Trigger compaction
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
        savedMessages = [] // Clear history after compaction
      }
    } catch { /* keep existing if compaction fails */ }
  }

  // Handle mission creation action server-side
  if (action?.type === "create_mission" && action.title) {
    const { data: newMission } = await sbAdmin
      .from("missions")
      .insert({
        title: action.title,
        user_id: user.id,
        agent_level: profile?.subscription_level === "leo" ? "leo" : "nora",
      })
      .select()
      .single()

    if (newMission) {
      action = { ...action, missionId: newMission.id }
    }
  }

  // Handle brief update action server-side
  if (action?.type === "update_brief" && action.missionId && action.brief) {
    try {
      const brief = JSON.parse(action.brief)
      await sbAdmin
        .from("missions")
        .update({ brief, status: "preparation" })
        .eq("id", action.missionId)
        .eq("user_id", user.id)
      // Also update brief_memory with a summary
      const mem = `# Mission brief\nPoste : ${brief.titre_poste}\nLocalisation : ${brief.localisation}\nMots-clés : ${(brief.mots_cles ?? []).join(", ")}\nCritères : ${brief.criteres ?? ""}\nTon : ${brief.ton ?? ""}`
      await sbAdmin.from("missions").update({ brief_memory: mem }).eq("id", action.missionId).eq("user_id", user.id)
    } catch { /* ignore parse errors */ }
  }

  // Save messages + memory to Supabase
  await sbAdmin
    .from("profiles")
    .update({
      workspace_messages: savedMessages as unknown as Database["public"]["Tables"]["profiles"]["Update"]["workspace_messages"],
      ...(newWorkspaceMemory !== workspaceMemory ? { workspace_memory: newWorkspaceMemory } : {}),
    })
    .eq("user_id", user.id)

  // Update mission brief_memory if attached
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

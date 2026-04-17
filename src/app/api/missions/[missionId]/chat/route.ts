/**
 * POST /api/missions/[missionId]/chat
 * Calls OpenRouter (gpt-4o-mini) with a structured system prompt
 * to guide the user in defining their recruitment brief.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

const SYSTEM_PROMPT = `Tu es l'assistant de cadrage de recherche pour Nawa Studio, une plateforme de sourcing RH par IA.
Ton rôle : aider le recruteur à définir son besoin précisément pour lancer une recherche LinkedIn optimale via Léo (notre agent IA de sourcing).

OBJECTIF FINAL : produire un brief structuré JSON avec :
- titre_poste : intitulé exact du poste
- localisation : ville ou région (ex: "Paris", "Lyon", "Toute la France")
- mots_cles : liste de 5-10 compétences/technologies/outils spécifiques
- criteres : niveau d'expérience + type de contrat + tout critère pertinent

COMPORTEMENT GÉNÉRAL :
- Réponds TOUJOURS en français
- Sois chaleureux, professionnel et efficace
- Structure chaque réponse : 1-2 phrases max + options cliquables entre [crochets]
- Propose toujours des exemples concrets adaptés au poste mentionné
- Ne pose jamais plus de 2 questions par message
- Ne suppose aucune information non confirmée par l'utilisateur

FORMAT DES OPTIONS CLIQUABLES :
Quand tu proposes des choix, utilise ce format : [Option 1] [Option 2] [Option 3]
Exemple : "Quelle ville ciblez-vous ? [Paris] [Lyon] [Bordeaux] [Toute la France]"

ÉTAPES OBLIGATOIRES (dans cet ordre) :
1. Accueil : demander le poste recherché (ne pas supposer)
2. Localisation : proposer [Paris] [Lyon] [Bordeaux] [Marseille] [Toulouse] [Nantes] [Toute la France] + [Autre]
3. Mots-clés : proposer 6-8 compétences adaptées au poste, ex: [React] [Node.js] [TypeScript] pour un dev. Demander validation/ajout/suppression.
4. Critères : proposer [Junior 0-3 ans] [Confirmé 3-7 ans] [Senior 7+ ans] + type de contrat si pertinent
5. Récapitulatif + brief JSON

GÉNÉRATION DU BRIEF :
Quand tu as : titre_poste + localisation + ≥3 mots_cles, génère un récapitulatif clair puis le bloc :
<brief>
{"titre_poste":"...","localisation":"...","mots_cles":["...","..."],"criteres":"..."}
</brief>
Puis demande : "Souhaitez-vous lancer la recherche avec ces critères, ou ajuster quelque chose ?"

POUR LES RECHERCHES SUPPLÉMENTAIRES :
Si l'utilisateur veut plus de profils ou des critères plus larges après une première recherche :
- Propose d'élargir : zone géo + quartiers, mots-clés alternatifs, niveau d'expérience plus large
- Génère un nouveau bloc <brief> avec les paramètres élargis
- Dis combien de profils supplémentaires cette recherche devrait apporter

RÈGLES ABSOLUES :
- Ne parle que de sourcing LinkedIn/recrutement
- Ne génère jamais de <brief> sans avoir confirmé titre_poste ET localisation avec l'utilisateur
- Si l'utilisateur change d'avis sur un critère, confirme et régénère le <brief>
- Reste dans le cadre : tu n'es pas un assistant général`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params
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

  // Load mission + brief for memory injection
  const { data: mission } = await sb
    .from("missions")
    .select("id, title, brief, profiles_count")
    .eq("id", missionId)
    .eq("user_id", user.id)
    .single()

  if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json() as { messages: ChatMessage[] }
  const { messages } = body

  if (!messages?.length) {
    return NextResponse.json({ error: "No messages" }, { status: 400 })
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  if (!OPENROUTER_KEY) {
    return NextResponse.json({ error: "OpenRouter API key not configured" }, { status: 500 })
  }

  // Inject brief memory into system prompt if already defined
  const brief = mission.brief as Record<string, unknown> | null
  const briefContext = brief && brief.titre_poste
    ? `\n\nMÉMOIRE DE MISSION EN COURS :
Mission : "${mission.title}"
Brief actuel :
- Poste : ${brief.titre_poste}
- Localisation : ${brief.localisation ?? "non définie"}
- Mots-clés : ${Array.isArray(brief.mots_cles) ? (brief.mots_cles as string[]).join(", ") : brief.mots_cles ?? "non définis"}
- Critères : ${brief.criteres ?? "non définis"}
${mission.profiles_count ? `- Dernière recherche : ${mission.profiles_count} profils trouvés` : ""}

Si l'utilisateur demande d'affiner, d'élargir ou de relancer, utilise ce contexte comme base et génère un nouveau <brief> ajusté.`
    : ""

  const systemPromptWithMemory = SYSTEM_PROMPT + briefContext

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://nawastudio.com",
      "X-Title": "Nawa Studio",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPromptWithMemory },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 600,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `OpenRouter error: ${err}` }, { status: 502 })
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
  }

  const content = data.choices[0]?.message?.content ?? ""
  return NextResponse.json({ content })
}

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

const SYSTEM_PROMPT = `Tu es un consultant senior en recrutement chez Nawa Studio. Tu mènes des entretiens de cadrage pour comprendre précisément le besoin d'un recruteur, puis tu construis un brief de recherche qui permettra à notre IA de sourcer les meilleurs profils.

PHILOSOPHIE FONDAMENTALE :
Tu n'es pas un formulaire. Tu es un expert qui pose les bonnes questions, dans le bon ordre naturel d'une vraie conversation. Tu écoutes, tu reformules, tu valides ta compréhension. Tu t'adaptes au contexte de l'interlocuteur — qu'il soit DRH, fondateur de startup, ou manager opérationnel.

TON ET STYLE :
- Chaleureux, direct, professionnel — comme un collègue senior de confiance
- Maximum 2-3 phrases par message + une seule question claire à la fois
- Reformule ce que tu comprends avant de poser la question suivante
- Sois proactif : si quelqu'un cherche un "dev React senior à Paris", tu peux déjà faire des suggestions pertinentes sans attendre d'autres infos
- Ne mentionne jamais les mots "étapes", "formulaire", "critères" dans tes réponses

MISE EN FORME DES MESSAGES :
- Ne jamais utiliser "--" ou "---" comme séparateur
- Utilise des sauts de ligne simples entre les idées (pas de listes à puces sauf si vraiment nécessaire)
- Mets en **gras** uniquement les éléments clés (poste, compétence, ville)
- Phrases courtes et aérées — pas de blocs de texte denses
- Un emoji occasionnel est ok, mais pas plus d'un par message

INFORMATIONS À COLLECTER (dans l'ordre naturel de la conversation) :
1. Contexte : pourquoi ce recrutement ? quel projet, quelle équipe ?
2. Le rôle exact : intitulé précis, responsabilités principales
3. Le profil idéal : compétences clés, soft skills, niveau d'expérience
4. Contraintes pratiques : localisation, type de contrat, urgence
5. Le ton des messages : comment ils veulent s'adresser aux candidats

SUGGESTIONS CLIQUABLES [chips] — UTILISATION SYSTÉMATIQUE :
À chaque question, propose des options rapides en [crochets] adaptées au contexte.
Ces chips permettent à l'utilisateur de répondre en un clic sans taper.

Exemples par étape :
- Localisation → [Paris] [Lyon] [Bordeaux] [Marseille] [Toulouse] [Nantes] [Remote] [Toute la France]
- Compétences tech → suggestions adaptées au poste, ex: [React] [Node.js] [TypeScript] [Python] [AWS]
- Compétences non-tech → [Management] [Négociation] [CRM] [Excel] [Gestion de projet]
- Séniorité → [Junior (0-3 ans)] [Confirmé (3-7 ans)] [Senior (7+ ans)]
- Contrat → [CDI] [Freelance] [CDD] [Alternance]
- Ton → [Professionnel et formel] [Direct et efficace] [Chaleureux et humain] [Startup / casual]
- Secteur → [SaaS / Tech] [Finance] [Santé] [Retail] [Industrie] [Conseil]

Règle chips : propose 4-6 chips max par message. Toujours inclure une option "ouverte" comme [Autre] ou [Je vous explique] quand la liste n'est pas exhaustive.

GÉNÉRATION DU BRIEF :
Génère le brief seulement quand tu as confirmé : titre_poste + localisation + au moins 4 mots_cles.
Annonce-le naturellement : "J'ai tout ce qu'il me faut, voici ce que je retiens :"

Format obligatoire :
<brief>{"titre_poste":"...","localisation":"...","mots_cles":["...","..."],"criteres":"...","ton":"..."}</brief>

POUR LES RECHERCHES D'EXTENSION :
Si l'utilisateur veut plus de profils ou élargir :
- Comprends d'abord pourquoi (pas assez de résultats ? mauvais profils ?)
- Propose des axes : [Élargir la zone géo] [Titres alternatifs] [Niveau d'expérience plus large] [Autres sources]
- Génère un nouveau <brief> ajusté

RÈGLES ABSOLUES :
- Réponds toujours en français
- Ne génère jamais de <brief> sans titre_poste ET localisation confirmés
- Adapte les suggestions de compétences au secteur/poste mentionné
- Ne parle que de recrutement/sourcing`

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

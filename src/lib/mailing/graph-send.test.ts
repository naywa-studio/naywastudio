import { describe, expect, it, vi, afterEach } from "vitest"
import { sendViaGraph } from "./graph-send"

/**
 * L'envoi par Microsoft Graph.
 *
 * Ce qui est protégé ici : que le message parte avec les bons destinataires,
 * que la copie atterrisse dans les « Éléments envoyés » du sourceur — c'est
 * la promesse du connecteur —, et surtout que l'on distingue le jeton mort
 * (reconnecter) de la panne passagère (réessayer). Confondre les deux, c'est
 * soit couper une boîte saine, soit laisser quelqu'un cliquer « Envoyer »
 * dans le vide.
 */

const OK = { ok: true, status: 202, text: async () => "" } as unknown as Response
function http(status: number, body = ""): Response {
  return { ok: false, status, text: async () => body } as unknown as Response
}

function captureBody(): { get: () => Record<string, unknown> } {
  const seen: Record<string, unknown>[] = []
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    seen.push(JSON.parse(String(init.body)))
    return OK
  }))
  return { get: () => seen[0] }
}

afterEach(() => { vi.unstubAllGlobals() })

describe("ce que Graph reçoit", () => {
  it("garde une copie dans les éléments envoyés", async () => {
    // C'est LA promesse du connecteur : écrire depuis sa vraie boîte, et
    // retrouver la trace dans sa vraie boîte. Sans ça, le sourceur ne sait
    // plus ce qu'il a envoyé.
    const body = captureBody()
    await sendViaGraph("tok", { fromEmail: "s@cab.fr", to: "c@x.fr", subject: "S", text: "T" })
    expect(body.get().saveToSentItems).toBe(true)
  })

  it("éclate les deux adresses de réponse", async () => {
    // Le double Reply-To est l'argument central du dossier de vérification :
    // le candidat répond au sourceur, et une copie nous revient. Graph veut
    // une liste d'objets, pas la chaîne « a, b » qu'attend Gmail.
    const body = captureBody()
    await sendViaGraph("tok", {
      fromEmail: "s@cab.fr", to: "c@x.fr", subject: "S", text: "T",
      replyTo: "s@cab.fr, suivi@reply.naywastudio.com",
    })
    const msg = body.get().message as { replyTo: { emailAddress: { address: string } }[] }
    expect(msg.replyTo.map((r) => r.emailAddress.address))
      .toEqual(["s@cab.fr", "suivi@reply.naywastudio.com"])
  })

  it("ignore une virgule en trop plutôt que de faire échouer l'envoi", async () => {
    // Graph rejette la requête ENTIÈRE sur un destinataire vide : une virgule
    // de trop ferait perdre le message, pas seulement l'adresse.
    const body = captureBody()
    await sendViaGraph("tok", {
      fromEmail: "s@cab.fr", to: "c@x.fr,", subject: "S", text: "T", bcc: " , ",
    })
    const msg = body.get().message as { toRecipients: unknown[]; bccRecipients: unknown[] }
    expect(msg.toRecipients).toHaveLength(1)
    expect(msg.bccRecipients).toHaveLength(0)
  })

  it("n'envoie que les en-têtes que Microsoft accepte", async () => {
    // Graph refuse tout en-tête personnalisé qui ne commence pas par « X- »,
    // et refuse le message entier avec. `List-Unsubscribe` doit donc être
    // écarté ici — la limite est assumée, cf. le commentaire dans le module.
    const body = captureBody()
    await sendViaGraph("tok", {
      fromEmail: "s@cab.fr", to: "c@x.fr", subject: "S", text: "T",
      headers: { "List-Unsubscribe": "<mailto:stop@x.fr>", "X-Naywa-Match": "abc" },
    })
    const msg = body.get().message as { internetMessageHeaders?: { name: string }[] }
    expect(msg.internetMessageHeaders).toHaveLength(1)
    expect(msg.internetMessageHeaders?.[0].name).toBe("X-Naywa-Match")
  })

  it("aplatit un sujet multiligne", async () => {
    const body = captureBody()
    await sendViaGraph("tok", {
      fromEmail: "s@cab.fr", to: "c@x.fr", subject: "Bonjour\r\nBcc: pirate@x.fr", text: "T",
    })
    const msg = body.get().message as { subject: string }
    expect(msg.subject).not.toContain("\n")
  })
})

describe("distinguer le jeton mort de la panne passagère", () => {
  it("401 et 403 demandent une reconnexion", async () => {
    for (const status of [401, 403]) {
      vi.stubGlobal("fetch", vi.fn(async () => http(status, "InvalidAuthenticationToken")))
      const r = await sendViaGraph("tok", { fromEmail: "s@c.fr", to: "c@x.fr", subject: "S", text: "T" })
      expect(r).toMatchObject({ ok: false, reason: "needs_reconnect" })
    }
  })

  it("une panne serveur se réessaie, sans couper la boîte", async () => {
    // Marquer `needs_reconnect` sur un hoquet de Microsoft obligerait le
    // sourceur à refaire tout le consentement pour rien.
    vi.stubGlobal("fetch", vi.fn(async () => http(503, "service unavailable")))
    const r = await sendViaGraph("tok", { fromEmail: "s@c.fr", to: "c@x.fr", subject: "S", text: "T" })
    expect(r).toMatchObject({ ok: false, reason: "failed" })
  })

  it("une coupure réseau ne coupe pas la boîte non plus", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET") }))
    const r = await sendViaGraph("tok", { fromEmail: "s@c.fr", to: "c@x.fr", subject: "S", text: "T" })
    expect(r).toMatchObject({ ok: false, reason: "failed" })
  })

  it("accepte le 202 sans corps que renvoie Graph", async () => {
    // Contrairement à Gmail, Graph ne renvoie aucun identifiant de message.
    // Traiter l'absence de corps comme un échec ferait afficher une erreur
    // sur un message pourtant parti — le pire des deux mondes.
    vi.stubGlobal("fetch", vi.fn(async () => OK))
    const r = await sendViaGraph("tok", { fromEmail: "s@c.fr", to: "c@x.fr", subject: "S", text: "T" })
    expect(r.ok).toBe(true)
  })
})

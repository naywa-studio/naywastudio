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

/** Capture le MIME réellement transmis, décodé. */
function captureMime(): { get: () => string; contentType: () => string } {
  const seen: { body: string; type: string }[] = []
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    seen.push({ body: Buffer.from(String(init.body), "base64").toString("utf8"), type: headers["Content-Type"] })
    return OK
  }))
  return { get: () => seen[0]?.body ?? "", contentType: () => seen[0]?.type ?? "" }
}

afterEach(() => { vi.unstubAllGlobals() })

describe("ce que Graph reçoit", () => {
  it("un MIME, et non le JSON de Graph", async () => {
    // C'est ce qui débloque `In-Reply-To` et `List-Unsubscribe` : par la voie
    // JSON, Microsoft refuse tout en-tête ne commençant pas par « X- ».
    const mime = captureMime()
    await sendViaGraph("tok", { fromEmail: "s@cab.fr", to: "c@x.fr", subject: "S", text: "T" })
    expect(mime.contentType()).toBe("text/plain")
    expect(mime.get()).toContain("To: c@x.fr")
    expect(mime.get()).toContain("MIME-Version: 1.0")
  })

  it("porte les deux adresses de réponse", async () => {
    // Le double Reply-To est l'argument central du dossier de vérification :
    // le candidat répond au sourceur, et une copie nous revient.
    const mime = captureMime()
    await sendViaGraph("tok", {
      fromEmail: "s@cab.fr", to: "c@x.fr", subject: "S", text: "T",
      replyTo: "s@cab.fr, suivi@reply.naywastudio.com",
    })
    expect(mime.get()).toContain("Reply-To: s@cab.fr, suivi@reply.naywastudio.com")
  })

  it("rattache la réponse au fil du candidat", async () => {
    // Sans cet en-tête, notre réponse arrive comme un message NEUF, à côté de
    // l'échange en cours. Impossible par la voie JSON — c'est la raison
    // d'être de la bascule.
    const mime = captureMime()
    await sendViaGraph("tok", {
      fromEmail: "s@cab.fr", to: "c@x.fr", subject: "Re: S", text: "T",
      headers: { "In-Reply-To": "<abc@mail.gmail.com>", "References": "<abc@mail.gmail.com>" },
    })
    expect(mime.get()).toContain("In-Reply-To: <abc@mail.gmail.com>")
    expect(mime.get()).toContain("References: <abc@mail.gmail.com>")
  })

  it("porte enfin le bouton « Se désabonner » natif", async () => {
    // Son absence est l'un des signaux qui font traiter un expéditeur comme
    // indésirable. Il était perdu sur tout le chemin Microsoft.
    const mime = captureMime()
    await sendViaGraph("tok", {
      fromEmail: "s@cab.fr", to: "c@x.fr", subject: "S", text: "T",
      headers: { "List-Unsubscribe": "<mailto:stop@x.fr>" },
    })
    expect(mime.get()).toContain("List-Unsubscribe: <mailto:stop@x.fr>")
  })

  it("un sujet multiligne ne peut pas fabriquer un second en-tête", async () => {
    /* Le vecteur revient avec le MIME : il y a de nouveau des en-têtes à
     * refermer. Un `Bcc:` glissé dans un sujet enverrait une copie que le
     * sourceur ne verrait jamais. */
    const mime = captureMime()
    await sendViaGraph("tok", {
      fromEmail: "s@cab.fr", to: "c@x.fr", subject: "Bonjour\r\nBcc: pirate@x.fr", text: "T",
    })
    const entete = mime.get().split("\r\n\r\n")[0]
    expect(entete).not.toMatch(/^Bcc: pirate@x\.fr$/m)
    expect(entete).toContain("Bonjour Bcc: pirate@x.fr")
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

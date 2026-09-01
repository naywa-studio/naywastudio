import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * L'envoi par la boîte connectée — et surtout la ROTATION du jeton Microsoft.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 *
 * Microsoft renvoie un NOUVEAU jeton durable à chaque rafraîchissement et
 * périme l'ancien. Le défaut qu'on protège ici est silencieux et différé : si
 * le nouveau jeton n'est pas écrit, tout continue de marcher pendant l'heure
 * de validité du jeton d'accès, puis la boîte se décroche — chez un client,
 * plusieurs jours après la mise en production, sans rien dans les journaux qui
 * pointe vers la cause.
 *
 * Un tel défaut ne se rattrape pas en recette : il se prévient par un test.
 */

const refreshMicrosoft = vi.fn()
const refreshGoogle = vi.fn()
const sendGraph = vi.fn()
const sendGmail = vi.fn()

vi.mock("./oauth-microsoft", () => ({ refreshMicrosoftAccessToken: (t: string) => refreshMicrosoft(t) }))
vi.mock("./oauth-google", () => ({ refreshGoogleAccessToken: (t: string) => refreshGoogle(t) }))
vi.mock("./graph-send", () => ({ sendViaGraph: (a: string, m: unknown) => sendGraph(a, m) }))
vi.mock("./gmail-send", () => ({ sendViaGmail: (a: string, m: unknown) => sendGmail(a, m) }))
vi.mock("./token-crypto", () => ({
  decryptToken: (v: string) => (v === "illisible" ? null : v.replace("chiffre:", "")),
  encryptToken: (v: string) => `chiffre:${v}`,
}))

import { sendFromMailbox } from "./send-via-mailbox"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../database.types"

/** Journalise les écritures pour qu'on puisse vérifier leur ORDRE. */
function fakeAdmin() {
  const writes: { patch: Record<string, unknown>; at: number }[] = []
  let seq = 0
  const admin = {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          writes.push({ patch, at: seq++ })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
  return { admin: admin as unknown as SupabaseClient<Database>, writes, tick: () => seq++ }
}

const boiteMicrosoft = {
  id: "mb1",
  provider: "microsoft" as const,
  email: "sourceur@cabinet.fr",
  refresh_token_encrypted: "chiffre:ancien-jeton",
  status: "active" as const,
}

const message = { to: "c@x.fr", subject: "S", text: "T" }

beforeEach(() => {
  refreshMicrosoft.mockReset(); sendGraph.mockReset()
  refreshGoogle.mockReset(); sendGmail.mockReset()
})

describe("rotation du jeton durable Microsoft", () => {
  it("ré-enregistre le nouveau jeton", async () => {
    refreshMicrosoft.mockResolvedValue({ accessToken: "acc", refreshToken: "nouveau-jeton" })
    sendGraph.mockResolvedValue({ ok: true, id: "g1" })
    const { admin, writes } = fakeAdmin()

    await sendFromMailbox(admin, boiteMicrosoft, message)

    const rotation = writes.find((w) => "refresh_token_encrypted" in w.patch)
    expect(rotation?.patch.refresh_token_encrypted).toBe("chiffre:nouveau-jeton")
  })

  it("l'écrit AVANT l'envoi, pas après", async () => {
    // L'ancien jeton est déjà mort quand le rafraîchissement réussit. Écrire
    // seulement en cas de succès d'envoi rendrait la boîte définitivement
    // inutilisable au premier hoquet de Graph — une panne passagère se
    // transformerait en reconnexion obligatoire.
    const { admin, writes } = fakeAdmin()
    let rotationVue = false
    refreshMicrosoft.mockResolvedValue({ accessToken: "acc", refreshToken: "nouveau-jeton" })
    // On regarde l'état des écritures AU MOMENT de l'envoi : c'est la seule
    // façon d'attester l'ordre, et non le simple fait que l'écriture ait eu
    // lieu. L'envoi échoue exprès — si la rotation était conditionnée au
    // succès, ce test tomberait.
    sendGraph.mockImplementation(async () => {
      rotationVue = writes.some((w) => "refresh_token_encrypted" in w.patch)
      return { ok: false, reason: "failed", detail: "503" }
    })

    const r = await sendFromMailbox(admin, boiteMicrosoft, message)

    expect(rotationVue).toBe(true)
    expect(r).toMatchObject({ ok: false, reason: "failed" })
  })

  it("n'écrit rien quand le jeton n'a pas changé", async () => {
    // Microsoft peut renvoyer le même. Une écriture inutile à chaque envoi
    // ferait du bruit en base sans rien apporter.
    refreshMicrosoft.mockResolvedValue({ accessToken: "acc", refreshToken: "ancien-jeton" })
    sendGraph.mockResolvedValue({ ok: true, id: "g1" })
    const { admin, writes } = fakeAdmin()

    await sendFromMailbox(admin, boiteMicrosoft, message)

    expect(writes.some((w) => "refresh_token_encrypted" in w.patch)).toBe(false)
  })
})

describe("le bon fournisseur, le bon transport", () => {
  it("une boîte Microsoft passe par Graph, jamais par Gmail", async () => {
    refreshMicrosoft.mockResolvedValue({ accessToken: "acc", refreshToken: "n" })
    sendGraph.mockResolvedValue({ ok: true, id: "g1" })
    const { admin } = fakeAdmin()

    await sendFromMailbox(admin, boiteMicrosoft, message)

    expect(sendGraph).toHaveBeenCalledOnce()
    expect(sendGmail).not.toHaveBeenCalled()
    expect(refreshGoogle).not.toHaveBeenCalled()
  })

  it("une boîte Google passe par Gmail, jamais par Graph", async () => {
    refreshGoogle.mockResolvedValue("acc")
    sendGmail.mockResolvedValue({ ok: true, id: "m1" })
    const { admin } = fakeAdmin()

    await sendFromMailbox(admin, { ...boiteMicrosoft, provider: "google" }, message)

    expect(sendGmail).toHaveBeenCalledOnce()
    expect(sendGraph).not.toHaveBeenCalled()
    expect(refreshMicrosoft).not.toHaveBeenCalled()
  })
})

describe("ce qui doit couper la boîte, et ce qui ne doit pas", () => {
  it("un jeton refusé par Microsoft demande une reconnexion, et le dit", async () => {
    refreshMicrosoft.mockResolvedValue(null)
    const { admin, writes } = fakeAdmin()

    const r = await sendFromMailbox(admin, boiteMicrosoft, message)

    expect(r).toMatchObject({ ok: false, reason: "needs_reconnect" })
    // Le message montré au sourceur doit nommer SON fournisseur : « Google a
    // révoqué… » sous une boîte Microsoft l'enverrait chercher au mauvais
    // endroit.
    expect((r as { message: string }).message).toContain("Microsoft")
    expect(writes.some((w) => w.patch.status === "needs_reconnect")).toBe(true)
  })

  it("une panne passagère ne coupe pas une boîte saine", async () => {
    refreshMicrosoft.mockResolvedValue({ accessToken: "acc", refreshToken: "n" })
    sendGraph.mockResolvedValue({ ok: false, reason: "failed", detail: "503" })
    const { admin, writes } = fakeAdmin()

    await sendFromMailbox(admin, boiteMicrosoft, message)

    expect(writes.some((w) => w.patch.status === "needs_reconnect")).toBe(false)
  })

  it("un jeton illisible coupe sans même appeler le fournisseur", async () => {
    // Clé de chiffrement tournée, ligne abîmée : inutile d'interroger
    // Microsoft, et surtout il faut le DIRE plutôt qu'échouer en silence.
    const { admin, writes } = fakeAdmin()

    const r = await sendFromMailbox(admin, { ...boiteMicrosoft, refresh_token_encrypted: "illisible" }, message)

    expect(r).toMatchObject({ ok: false, reason: "needs_reconnect" })
    expect(refreshMicrosoft).not.toHaveBeenCalled()
    expect(writes.some((w) => w.patch.status === "needs_reconnect")).toBe(true)
  })
})

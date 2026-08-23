import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

/**
 * Lecture DNS des enregistrements attendus.
 *
 * Ce que ces tests protègent : la capacité à dire au client CE QUI ne va pas.
 * C'est la différence entre « pas vérifié » — un mur devant lequel les gens
 * abandonnent ou appellent le support — et « le troisième CNAME pointe vers
 * autre chose », qu'ils corrigent seuls en dix secondes.
 *
 * Le résolveur est simulé : ces tests ne doivent dépendre d'aucun réseau, sous
 * peine d'échouer au hasard dans l'intégration continue.
 */

const resolveCname = vi.fn()
const resolveTxt = vi.fn()
const resolveMx = vi.fn()
const resolveNs = vi.fn()

vi.mock("node:dns/promises", () => ({
  Resolver: class {
    setServers() {}
    resolveCname = resolveCname
    resolveTxt = resolveTxt
    resolveMx = resolveMx
    resolveNs = resolveNs
  },
}))

const { checkRecords, detectDnsHost } = await import("./dns-check")

const CNAME = {
  type: "CNAME" as const,
  name: "sel1._domainkey.careers.cabinet.fr",
  value: "sel1.dkim.amazonses.com",
}
const DMARC = { type: "TXT" as const, name: "_dmarc.careers.cabinet.fr", value: "v=DMARC1; p=none;" }

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.clearAllMocks() })

describe("checkRecords", () => {
  it("reconnaît un CNAME correct malgré le point final et la casse", () => {
    // Un hébergeur renvoie souvent le nom absolu (« …amazonses.com. »).
    // L'exiger au caractère près ferait échouer une zone parfaitement valide.
    resolveCname.mockResolvedValue(["SEL1.DKIM.AmazonSES.com."])
    return checkRecords([CNAME]).then(([c]) => expect(c.state).toBe("ok"))
  })

  it("distingue ABSENT de VALEUR DIFFÉRENTE", async () => {
    // Deux causes, deux gestes : publier, ou corriger une faute de copie.
    // Les confondre renverrait le client chercher au mauvais endroit.
    resolveCname.mockResolvedValueOnce([])
    expect((await checkRecords([CNAME]))[0].state).toBe("missing")

    resolveCname.mockResolvedValueOnce(["autre.dkim.amazonses.com"])
    const wrong = (await checkRecords([CNAME]))[0]
    expect(wrong.state).toBe("wrong")
    // On renvoie ce qui a été trouvé : le client compare et voit sa faute.
    expect(wrong.found).toBe("autre.dkim.amazonses.com")
  })

  it("recolle un TXT renvoyé en morceaux", async () => {
    // Le DNS découpe les longues chaînes en segments de 255 caractères.
    // Comparer segment par segment ferait échouer un DMARC valide.
    resolveTxt.mockResolvedValue([["v=DMARC1;", " p=none;"]])
    expect((await checkRecords([DMARC]))[0].state).toBe("ok")
  })

  it("tolère un DMARC reformaté par l'hébergeur", async () => {
    resolveTxt.mockResolvedValue([["V=DMARC1;p=none;"]])
    expect((await checkRecords([DMARC]))[0].state).toBe("ok")
  })

  it("traite un nom inexistant comme une ABSENCE, pas une panne", async () => {
    // ENOTFOUND pendant la propagation est normal. L'annoncer comme une
    // erreur inquiéterait un client dont la zone est simplement en route.
    resolveCname.mockRejectedValue(Object.assign(new Error("nope"), { code: "ENOTFOUND" }))
    expect((await checkRecords([CNAME]))[0].state).toBe("missing")
  })

  it("n'accuse PAS le client quand le résolveur tombe", async () => {
    resolveCname.mockRejectedValue(Object.assign(new Error("timeout"), { code: "ETIMEOUT" }))
    expect((await checkRecords([CNAME]))[0].state).toBe("unknown")
  })

  it("ne fait aucun appel réseau sans enregistrement", async () => {
    expect(await checkRecords([])).toEqual([])
    expect(resolveCname).not.toHaveBeenCalled()
  })
})

describe("detectDnsHost", () => {
  it("reconnaît l'hébergeur depuis les serveurs de noms", async () => {
    resolveNs.mockResolvedValue(["dns200.anycast.me", "ns200.anycast.me"])
    expect((await detectDnsHost("cabinet.fr")).nameservers.length).toBe(2)

    resolveNs.mockResolvedValue(["kim.ns.cloudflare.com", "walt.ns.cloudflare.com"])
    expect((await detectDnsHost("cabinet.fr")).name).toBe("Cloudflare")
  })

  it("renvoie les serveurs de noms même sans reconnaître l'hébergeur", async () => {
    // Utile au support : il saura où regarder même sur un hébergeur exotique.
    resolveNs.mockResolvedValue(["ns1.exotique.example"])
    const h = await detectDnsHost("cabinet.fr")
    expect(h.name).toBeNull()
    expect(h.nameservers).toEqual(["ns1.exotique.example"])
  })

  it("ne bloque pas la mise en route si la lecture échoue", async () => {
    resolveNs.mockRejectedValue(new Error("boom"))
    expect(await detectDnsHost("cabinet.fr")).toEqual({ name: null, where: null, nameservers: [] })
  })
})

/**
 * Catalogue commercial — SOURCE UNIQUE, et volontairement SANS dépendance au
 * SDK Stripe : ce module est importé par des composants client (/tarifs, le
 * configurateur, les jauges). `lib/stripe.ts` fait `import Stripe from "stripe"`
 * et ne doit jamais finir dans le bundle navigateur ; il importe donc ce
 * fichier, et pas l'inverse.
 *
 * MODÈLE (juillet 2026) — un seul plan « Sourcing », deux leviers :
 *
 *   1. Les SIÈGES, en quantité libre sur un prix Stripe à paliers dégressifs
 *      (`graduated`). Un seul SKU couvre 1, 3 ou 12 sièges : le client saisit
 *      un nombre, Stripe applique le barème. Remplace les 4 prix figés
 *      sourcing_1..4, qui obligeaient à créer un prix par palier.
 *   2. La SUITE PRICING Syntec, add-on à prix PLAT (ligne d'abonnement
 *      séparée, quantité 1). Plat et non par siège : sa valeur est au niveau
 *      de l'organisation (config marges/RTT/avantages du cabinet), pas par
 *      utilisateur. Remplace le tier sourcing_pro_1..4.
 *
 * D'où : 8 SKU → 2, et des axes orthogonaux (ajouter une option demain ne
 * multiplie plus le catalogue). `subscription_seats` et
 * `subscription_has_pricing` existent déjà en base → aucune migration.
 */

/** Prix à paliers dégressifs, quantité = nombre de sièges. */
export const LOOKUP_SEAT = "sourcing_seat"
/** Add-on Suite Pricing Syntec, quantité toujours 1. */
export const LOOKUP_PRICING_ADDON = "pricing_addon"

/**
 * Barème dégressif du siège (HT/mois). Reproduit au centime l'ancienne grille
 * figée — 1 → 38,99 · 2 → 69,99 · 3 → 94,99 · 4 → 119,99 — et la prolonge
 * naturellement au-delà (5 → 144,99 · 6 → 169,99).
 *
 * `upTo: null` = palier final, s'applique à l'infini. Cet ordre est aussi
 * celui attendu par Stripe (`tiers` + `tiers_mode: "graduated"`) :
 * `stripeSeatTiers()` en dérive la config du prix, pour que le barème affiché
 * et le barème facturé ne puissent JAMAIS diverger.
 */
export const SEAT_TIERS: ReadonlyArray<{ upTo: number | null; unitAmountEur: number }> = [
  { upTo: 1, unitAmountEur: 38.99 },
  { upTo: 2, unitAmountEur: 31.0 },
  { upTo: null, unitAmountEur: 25.0 },
]

/** Suite Pricing Syntec — prix plat mensuel HT, quel que soit le nb de sièges. */
export const PRICING_ADDON_EUR = 9.99

/**
 * Au-delà de ce nombre de sièges, on ne vend plus en self-service : le
 * configurateur bascule sur « parlons-en » (prise de RDV). Un deal à ce
 * niveau mérite une conversation (négociation, facturation, onboarding).
 */
export const MAX_SELF_SERVE_SEATS = 5

/** Nombre de CV inclus par siège (cf. lib/quota-tiers.ts pour la résolution). */
export const CV_PER_SEAT = 10_000

/** Arrondi au centime — tue les artefacts de flottant (38.99 + 31 donnerait
 *  69.98999999999999). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Total HT/mois du socle pour `seats` sièges, en appliquant le barème
 * dégressif. Même logique que Stripe en mode `graduated` : chaque palier ne
 * facture que les sièges qui tombent DANS ce palier.
 */
export function priceForSeats(seats: number): number {
  const n = Math.max(1, Math.floor(seats))
  let total = 0
  let counted = 0
  for (const tier of SEAT_TIERS) {
    const ceiling = tier.upTo ?? n
    const inTier = Math.min(n, ceiling) - counted
    if (inTier <= 0) continue
    total += inTier * tier.unitAmountEur
    counted += inTier
    if (counted >= n) break
  }
  return round2(total)
}

/** Total HT/mois affiché au client : socle + add-on éventuel. */
export function monthlyTotalEur(seats: number, withPricing: boolean): number {
  return round2(priceForSeats(seats) + (withPricing ? PRICING_ADDON_EUR : 0))
}

/** CV inclus pour un nombre de sièges donné. */
export function cvIncludedForSeats(seats: number): number {
  return CV_PER_SEAT * Math.max(1, Math.floor(seats))
}

/** Vrai si ce nombre de sièges se vend en ligne ; sinon → prise de RDV. */
export function isSelfServeSeats(seats: number): boolean {
  return seats >= 1 && seats <= MAX_SELF_SERVE_SEATS
}

/** Traduit SEAT_TIERS en `tiers` Stripe (montants en centimes). Utilisé pour
 *  créer le prix — garantit que le catalogue Stripe est généré depuis la même
 *  source que l'affichage. */
export function stripeSeatTiers(): Array<{ up_to: number | "inf"; unit_amount: number }> {
  return SEAT_TIERS.map((t) => ({
    up_to: t.upTo ?? ("inf" as const),
    unit_amount: Math.round(t.unitAmountEur * 100),
  }))
}

/**
 * Libellé humain d'un abonnement, à partir de l'état stocké en base.
 * Remplace l'ancien `planLabel(lookup_key)`, qui ne savait décrire que les
 * 8 combinaisons figées. « Package Sourcing » et « Suite Pricing » sont des
 * noms de marque : ils ne se traduisent pas, seul le reste du libellé varie.
 */
export function planLabel(seats: number | null, hasPricing: boolean, lang: "fr" | "en" = "fr"): string {
  const n = seats ?? 1
  const base = lang === "fr"
    ? `Package Sourcing — ${n} ${n > 1 ? "personnes" : "personne"}`
    : `Package Sourcing — ${n} ${n > 1 ? "people" : "person"}`
  return hasPricing ? `${base} + Suite Pricing` : base
}

/** Formate un montant en euros à la française : 38,99 € (et 39 € si entier). */
export function formatEur(amount: number): string {
  const isInt = Math.round(amount) === round2(amount)
  return `${amount.toFixed(isInt ? 0 : 2).replace(".", ",")} €`
}

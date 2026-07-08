/**
 * Couleur déterministe par secteur (nom → teinte stable).
 *
 * Même secteur = même couleur partout (cartes vivier, cartes secteur, pills du
 * panneau de match). Teintes calées sur une palette douce cohérente avec la
 * charte (saturation/luminosité fixes, on ne fait varier que la teinte).
 */

/** Hash simple et stable d'une chaîne → teinte 0-359. */
export function sectorHue(name: string): number {
  const key = name.trim().toLowerCase()
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) % 360
  }
  // Décale hors de la zone jaune-verdâtre peu lisible (55-95°).
  if (h >= 55 && h <= 95) h = (h + 60) % 360
  return h
}

export interface SectorColors {
  /** Texte (foncé, lisible sur fond clair). */
  text: string
  /** Fond de pastille clair. */
  bg: string
  /** Bordure. */
  border: string
  /** Point/barre pleine. */
  solid: string
}

export function sectorColors(name: string): SectorColors {
  const h = sectorHue(name)
  return {
    text: `hsl(${h}, 55%, 32%)`,
    bg: `hsl(${h}, 70%, 95%)`,
    border: `hsl(${h}, 50%, 82%)`,
    solid: `hsl(${h}, 60%, 55%)`,
  }
}

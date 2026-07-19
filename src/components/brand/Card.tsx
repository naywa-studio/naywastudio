import { brand, type as t } from '@/lib/brand'

/**
 * Carte charte v2.0 (§07 « Composants UI »). Modèle exact du handoff :
 * padding 32, bordure lin #E9E1CB, rayon 20. Surface = craie par défaut
 * (règle produit : fond sable, cartes craie), surchargeable en blanc pour
 * une carte qui doit ressortir davantage.
 *
 * `label` = sur-titre mono « § … » optionnel en tête de carte.
 */
export function Card({
  label,
  surface = 'craie',
  padding = 32,
  style,
  children,
}: {
  label?: React.ReactNode
  surface?: 'craie' | 'white'
  padding?: number
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: surface === 'white' ? brand.surface2 : brand.surface,
        border: `1px solid ${brand.border}`,
        borderRadius: brand.radiusXl,
        padding,
        ...style,
      }}
    >
      {label && (
        <div style={{ ...t.meta, color: brand.violet, marginBottom: 20 }}>{label}</div>
      )}
      {children}
    </div>
  )
}

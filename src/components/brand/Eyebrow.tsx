import { brand, type as t } from '@/lib/brand'

/**
 * Eyebrow / sur-titre de section (charte v2.0). Label technique en JetBrains
 * Mono, façon « § NN · Libellé ». Le numéro de section (§ NN) est en violet,
 * le libellé en pierre. Optionnellement une pastille de statut colorée avant
 * le libellé (ex : point vert « Disponible »).
 */
export function Eyebrow({
  n,
  children,
  dotColor,
  align = 'left',
}: {
  /** Numéro de section, ex "04". Rend « § 04 ». Optionnel. */
  n?: string
  children: React.ReactNode
  /** Couleur d'une pastille de statut avant le libellé. Optionnel. */
  dotColor?: string
  align?: 'left' | 'center'
}) {
  return (
    <span
      style={{
        ...t.meta,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: align === 'center' ? 'center' : 'flex-start',
      }}
    >
      {n && <span style={{ color: brand.violet }}>§&nbsp;{n}</span>}
      {n && <span style={{ color: brand.lin }} aria-hidden>·</span>}
      {dotColor && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: dotColor,
            boxShadow: `0 0 0 4px ${dotColor}2E`,
          }}
        />
      )}
      {children}
    </span>
  )
}

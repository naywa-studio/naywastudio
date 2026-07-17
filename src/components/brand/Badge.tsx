import { brand } from '@/lib/brand'

/**
 * Pastille d'état charte v2.0 (§07). Uppercase, compacte. Le corail (urgent)
 * reste réservé au signal.
 *
 * Variantes : new (violet) · active (vert) · pending (ambre) · rejected
 * (rouge) · draft (neutre) · pro (encre) · urgent (corail).
 */
type Variant = 'new' | 'active' | 'pending' | 'rejected' | 'draft' | 'pro' | 'urgent'

const MAP: Record<Variant, { fg: string; bg: string; bd: string }> = {
  new: { fg: brand.violet, bg: brand.violet100, bd: brand.violetSoft },
  active: { fg: brand.success, bg: brand.successBg, bd: brand.success },
  pending: { fg: brand.warning, bg: brand.warningBg, bd: brand.warning },
  rejected: { fg: brand.danger, bg: brand.dangerBg, bd: brand.danger },
  draft: { fg: brand.stone, bg: brand.craie, bd: brand.lin },
  pro: { fg: brand.sable, bg: brand.ink, bd: brand.ink },
  urgent: { fg: '#FFFFFF', bg: brand.coral, bd: brand.coral },
}

export function Badge({
  variant = 'new',
  children,
}: {
  variant?: Variant
  children: React.ReactNode
}) {
  const c = MAP[variant]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: brand.radiusPill,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}33`,
        fontFamily: brand.fontBody,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  )
}

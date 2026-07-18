"use client"

/**
 * Skeletons de chargement par page — chaque variante épouse la STRUCTURE
 * réelle de l'écran qu'elle précède (cartes secteurs au vivier, colonnes au
 * pipeline…) pour que le contenu "se matérialise" sans saut de layout,
 * au lieu d'un spinner plein écran générique.
 *
 * NoraLoader reste utilisé pour les petits placeholders in-card (inline).
 *
 * Design : blocs gris-violet de la charte (var(--nw-border-soft)) en pulsation douce.
 * `prefers-reduced-motion` désactive l'animation (accessibilité).
 */

const PULSE_CSS = `
  @keyframes skPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  .sk-block { animation: skPulse 1.6s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .sk-block { animation: none; }
  }
`

/** Bloc rectangulaire de base. */
function Sk({
  w, h, r = 8, style,
}: { w: number | string; h: number; r?: number; style?: React.CSSProperties }) {
  return (
    <span
      className="sk-block"
      aria-hidden
      style={{
        display: "block", width: w, height: h, borderRadius: r,
        background: "var(--nw-border-soft)", ...style,
      }}
    />
  )
}

/** Carte blanche conteneur (même chrome que les vraies cartes). */
function SkCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 14,
      padding: 18, ...style,
    }}>
      {children}
    </div>
  )
}

function Shell({
  children, label, maxWidth = 1200, pad = "36px 24px 80px", inline = false,
}: {
  children: React.ReactNode
  label: string
  /** Largeur du gabarit page (ignorée en inline). */
  maxWidth?: number
  pad?: string
  /** true = rendu DANS un container existant (pas de maxWidth/margin). */
  inline?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      style={inline
        ? { padding: "8px 0", position: "relative" }
        : { maxWidth, margin: "0 auto", padding: pad, position: "relative" }}
    >
      <style>{PULSE_CSS}</style>
      {children}
      <span style={{
        position: "absolute", width: 1, height: 1, overflow: "hidden",
        clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
      }}>{label}</span>
    </div>
  )
}

/** Vivier : titre + barre de recherche + grille de cartes secteur. */
export function VivierSkeleton() {
  return (
    <Shell label="Chargement du vivier" maxWidth={1640} pad="40px 24px 80px">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, gap: 16 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <Sk w={64} h={22} r={100} />
          <Sk w={280} h={30} />
          <Sk w={180} h={14} />
        </div>
        <Sk w={150} h={38} r={10} />
      </div>
      <Sk w="100%" h={46} r={12} style={{ marginBottom: 24 }} />
      <div style={{
        display: "grid", gap: 14,
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
      }}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkCard key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <Sk w={140} h={16} />
              <Sk w={34} h={20} r={100} />
            </div>
            <Sk w="90%" h={12} style={{ marginBottom: 6 }} />
            <Sk w="65%" h={12} />
          </SkCard>
        ))}
      </div>
    </Shell>
  )
}

/** Missions : sidebar stats à gauche + cartes mission à droite.
 *  Rendu DANS le container de la page (le vrai header est déjà affiché). */
export function MissionsSkeleton() {
  return (
    <Shell label="Chargement des missions" inline>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>
        <SkCard>
          <Sk w={110} h={12} style={{ marginBottom: 14 }} />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <Sk w={120} h={12} />
              <Sk w={26} h={12} />
            </div>
          ))}
        </SkCard>
        <div style={{ display: "grid", gap: 14 }}>
          <Sk w="100%" h={46} r={12} />
          {Array.from({ length: 3 }, (_, i) => (
            <SkCard key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <Sk w={200} h={17} />
                <Sk w={62} h={20} r={100} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <Sk w={54} h={20} r={7} />
                <Sk w={78} h={20} r={7} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Sk w={130} h={13} />
                <Sk w={72} h={30} r={9} />
              </div>
            </SkCard>
          ))}
        </div>
      </div>
    </Shell>
  )
}

/** Pipeline : 4 colonnes kanban avec quelques cartes. */
export function PipelineSkeleton() {
  return (
    <Shell label="Chargement de la pipeline">
      <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
        <Sk w={200} h={26} />
        <Sk w={320} h={14} />
      </div>
      <div style={{
        display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      }}>
        {Array.from({ length: 4 }, (_, col) => (
          <div key={col} style={{
            background: "#FAFAFB", border: "1px solid var(--nw-border-soft)",
            borderRadius: 12, padding: 12,
          }}>
            <Sk w={100} h={13} style={{ marginBottom: 12 }} />
            {Array.from({ length: col === 0 ? 3 : col === 1 ? 2 : 1 }, (_, i) => (
              <SkCard key={i} style={{ padding: 12, marginBottom: 8 }}>
                <Sk w="70%" h={13} style={{ marginBottom: 8 }} />
                <Sk w="45%" h={11} />
              </SkCard>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  )
}

/** Pricing (liste) : 2 boutons doc + cartes mission à chiffrer. */
export function PricingSkeleton() {
  return (
    <Shell label="Chargement du pricing">
      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        <Sk w={80} h={22} r={100} />
        <Sk w={260} h={28} />
        <Sk w={300} h={14} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <Sk w={210} h={38} r={10} />
        <Sk w={150} h={38} r={10} />
      </div>
      <div style={{
        display: "grid", gap: 14,
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
      }}>
        {Array.from({ length: 2 }, (_, i) => (
          <SkCard key={i}>
            <Sk w={190} h={17} style={{ marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <Sk w={50} h={20} r={7} />
              <Sk w={80} h={20} r={7} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Sk w={110} h={13} />
              <Sk w={64} h={13} />
            </div>
          </SkCard>
        ))}
      </div>
    </Shell>
  )
}

/** Pages détail (fiche mission / match / candidat / chiffrage) :
 *  fil d'ariane + carte hero + deux cartes de contenu. */
export function DetailSkeleton({ label = "Chargement" }: { label?: string }) {
  return (
    <Shell label={label}>
      <Sk w={180} h={14} style={{ marginBottom: 20 }} />
      <SkCard style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ display: "grid", gap: 10, flex: 1 }}>
            <Sk w={260} h={24} />
            <Sk w={190} h={14} />
          </div>
          <Sk w={120} h={38} r={10} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Sk w={110} h={32} r={9} />
          <Sk w={130} h={32} r={9} />
          <Sk w={120} h={32} r={9} />
        </div>
      </SkCard>
      <SkCard style={{ marginBottom: 16 }}>
        <Sk w={150} h={14} style={{ marginBottom: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {Array.from({ length: 4 }, (_, i) => <Sk key={i} w="100%" h={44} r={10} />)}
        </div>
      </SkCard>
      <SkCard>
        <Sk w={190} h={14} style={{ marginBottom: 14 }} />
        <Sk w="100%" h={12} style={{ marginBottom: 8 }} />
        <Sk w="92%" h={12} style={{ marginBottom: 8 }} />
        <Sk w="60%" h={12} />
      </SkCard>
    </Shell>
  )
}

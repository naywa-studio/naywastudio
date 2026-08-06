"use client"

/**
 * MissionCarousel — coque de la fiche mission en 3 sections « qui coulissent ».
 *
 * Remplace le mur vertical (brief + onglets + bandeaux empilés) par un
 * bandeau persistant (identité + compteurs + navigation) au-dessus de 3
 * panneaux côte à côte : Mission · Candidats · Shortlist.
 *
 * Navigation :
 *   - flèches ◂ ▸ et onglets → glissement (scroll natif, snap).
 *   - défilement HORIZONTAL natif (deux doigts trackpad, swipe tactile).
 *   - clic sur le PEEK d'une section voisine → on y va (le clic ne
 *     déclenche pas les boutons internes du panneau voisin).
 *
 * Le composant est PRÉSENTATIONNEL : il reçoit les 3 contenus en props et
 * l'état actif (contrôlé par la page, pour survivre à un re-matching / une
 * proposition Nora qui renvoie vers Candidats).
 *
 * Respecte `prefers-reduced-motion` (pas de glissement animé, pas de hint).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

const SECTIONS = ["mission", "candidats", "shortlist"] as const
export type MissionSection = (typeof SECTIONS)[number]

const HINT_KEY = "nw_missions_carousel_hint_v1"

const copy = {
  fr: {
    back: "← Missions",
    edit: "Modifier la mission",
    delete: "Supprimer",
    menu: "Actions de la mission",
    matching: "matching en cours",
    relevant: (n: number) => `${n} pertinent${n > 1 ? "s" : ""}`,
    shortlisted: (n: number) => `${n} en shortlist`,
    prev: "Section précédente",
    next: "Section suivante",
    labels: { mission: "Mission", candidats: "Candidats", shortlist: "Shortlist" },
    hint: "Glissez à deux doigts — ou cliquez une section voisine",
    roTitle: "Lecture seule — souscrivez pour reprendre la main",
  },
  en: {
    back: "← Missions",
    edit: "Edit mission",
    delete: "Delete",
    menu: "Mission actions",
    matching: "matching in progress",
    relevant: (n: number) => `${n} relevant`,
    shortlisted: (n: number) => `${n} shortlisted`,
    prev: "Previous section",
    next: "Next section",
    labels: { mission: "Mission", candidats: "Candidates", shortlist: "Shortlist" },
    hint: "Swipe with two fingers — or click an adjacent section",
    roTitle: "Read-only — subscribe to regain control",
  },
}

interface Props {
  lang: "fr" | "en"
  backHref: string
  title: string
  clientName?: string | null
  /** Ligne « grandes lignes » (lieu · contrat · …), rendue en gris. */
  meta?: React.ReactNode
  relevantCount: number
  shortlistCount: number
  matching: boolean
  readOnly?: boolean
  onEdit?: () => void
  onDelete?: () => void
  active: MissionSection
  onActiveChange: (s: MissionSection) => void
  mission: React.ReactNode
  candidats: React.ReactNode
  shortlist: React.ReactNode
}

export function MissionCarousel({
  lang, backHref, title, clientName = null, meta,
  relevantCount, shortlistCount, matching, readOnly = false,
  onEdit, onDelete, active, onActiveChange,
  mission, candidats, shortlist,
}: Props) {
  const t = copy[lang]
  const idx = Math.max(0, SECTIONS.indexOf(active))

  const maskRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const panelsRef = useRef<(HTMLDivElement | null)[]>([])
  const stepRef = useRef(0)               // panelWidth + gap (px)
  const animatingRef = useRef(false)      // true pendant un glissement piloté
  const [menuOpen, setMenuOpen] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const reduceMotion = useCallback(
    () => typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true, [])

  const PEEK = 56
  const GAP = 16

  // Dimensionne les panneaux (largeur = viewport − 2·peek) + fixe la hauteur
  // du masque sur le panneau ACTIF (les voisins, plus grands, sont rognés ;
  // la page ne prend que la hauteur de la section regardée).
  const applyHeight = useCallback(() => {
    const p = panelsRef.current[idx]
    if (p && maskRef.current) maskRef.current.style.height = `${p.offsetHeight}px`
  }, [idx])

  const sizePanels = useCallback(() => {
    const mask = maskRef.current
    if (!mask) return
    const pw = Math.max(220, mask.clientWidth - 2 * PEEK)
    stepRef.current = pw + GAP
    for (const p of panelsRef.current) {
      if (p) { p.style.flex = `0 0 ${pw}px`; p.style.width = `${pw}px` }
    }
    if (trackRef.current) {
      trackRef.current.style.paddingLeft = `${PEEK}px`
      trackRef.current.style.paddingRight = `${PEEK}px`
    }
  }, [])

  const dim = useCallback(() => {
    const mask = maskRef.current
    const step = stepRef.current
    if (!mask || step <= 0) return
    const pos = mask.scrollLeft / step
    panelsRef.current.forEach((p, i) => {
      if (!p) return
      const d = Math.abs(pos - i)
      p.style.opacity = Math.max(0.45, 1 - d * 0.9).toFixed(2)
    })
  }, [])

  const scrollToIdx = useCallback((i: number, smooth: boolean) => {
    const mask = maskRef.current
    const step = stepRef.current
    if (!mask || step <= 0) return
    animatingRef.current = true
    mask.scrollTo({ left: i * step, behavior: smooth && !reduceMotion() ? "smooth" : "auto" })
    window.setTimeout(() => { animatingRef.current = false; dim() }, smooth && !reduceMotion() ? 480 : 60)
  }, [dim, reduceMotion])

  const goTo = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(SECTIONS.length - 1, i))
    const key = SECTIONS[clamped]
    if (key !== active) onActiveChange(key)   // la page met à jour → l'effet scrolle
    else scrollToIdx(clamped, true)           // déjà actif → on recentre
  }, [active, onActiveChange, scrollToIdx])

  // Recentre quand la section active change (clic onglet, ou pilotage externe
  // : applyAdjust qui renvoie vers Candidats).
  useEffect(() => {
    scrollToIdx(idx, true)
    // Réajuste la hauteur au panneau nouvellement actif.
    const raf = requestAnimationFrame(applyHeight)
    return () => cancelAnimationFrame(raf)
  }, [idx, scrollToIdx, applyHeight])

  // Mise en place initiale + resize.
  useEffect(() => {
    sizePanels()
    scrollToIdx(idx, false)
    applyHeight()
    dim()
    const onResize = () => { sizePanels(); scrollToIdx(idx, false); applyHeight(); dim() }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La hauteur du panneau actif change (brief déplié, candidats chargés…) →
  // on suit avec un ResizeObserver sur les 3 panneaux.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => applyHeight())
    for (const p of panelsRef.current) if (p) ro.observe(p)
    return () => ro.disconnect()
  }, [applyHeight])

  // Sync de la section active quand l'utilisateur scrolle (deux doigts / swipe).
  const onScroll = useCallback(() => {
    const mask = maskRef.current
    const step = stepRef.current
    if (!mask || step <= 0) return
    dim()
    if (animatingRef.current) return
    const near = Math.round(mask.scrollLeft / step)
    const key = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, near))]
    if (key !== active) onActiveChange(key)
  }, [active, dim, onActiveChange])

  // Hint éphémère au 1er passage (jamais si reduced-motion).
  useEffect(() => {
    if (reduceMotion()) return
    try {
      if (window.localStorage.getItem(HINT_KEY)) return
      window.localStorage.setItem(HINT_KEY, "1")
    } catch { return }
    setShowHint(true)
    const timer = window.setTimeout(() => setShowHint(false), 5200)
    return () => window.clearTimeout(timer)
  }, [reduceMotion])

  // Fermeture du menu ⋯ au clic extérieur.
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [menuOpen])

  const panels: Array<{ key: MissionSection; node: React.ReactNode }> = [
    { key: "mission", node: mission },
    { key: "candidats", node: candidats },
    { key: "shortlist", node: shortlist },
  ]

  return (
    <div style={{ position: "relative" }}>
      {/* ── Bandeau persistant ─────────────────────────────────────── */}
      <div style={{
        background: "white", border: "1px solid var(--nw-border-soft)",
        borderRadius: 14, padding: "10px 16px", marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href={backHref} style={{
            fontSize: 12.5, color: "var(--nw-primary)", textDecoration: "none",
            whiteSpace: "nowrap",
          }}>{t.back}</Link>
          <h1 style={{
            margin: 0, fontSize: 17, fontWeight: 800, color: "var(--nw-text)",
            letterSpacing: "-0.01em", minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{title}</h1>
          {clientName && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "2px 9px", borderRadius: 100,
              background: "var(--nw-primary-50)", color: "var(--nw-primary)",
              fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
            }}>
              <svg width="11" height="11" viewBox="0 0 16 16" style={{ flexShrink: 0 }} aria-hidden="true">
                <path d="M2 13V6l6-3.5L14 6v7M2 13h12M2 13H1m13 0h1M6 13V9.5h4V13" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {clientName}
            </span>
          )}

          {meta && (
            <span style={{
              fontSize: 12, color: "var(--nw-text-muted)", minWidth: 0,
              display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap",
            }}>
              <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
              {meta}
            </span>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {matching && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                color: "var(--nw-warn)", background: "rgba(217,119,6,0.08)",
                border: "1px solid rgba(217,119,6,0.22)", borderRadius: 100,
                padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  border: "2px solid rgba(217,119,6,0.3)", borderTopColor: "var(--nw-warn)",
                  animation: reduceMotion() ? "none" : "nw-carousel-spin 0.9s linear infinite",
                  display: "inline-block",
                }} />
                {t.matching}
              </span>
            )}
            {(onEdit || onDelete) && !readOnly && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  aria-label={t.menu}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
                  style={{
                    background: "transparent", border: "1px solid var(--nw-border)",
                    borderRadius: 8, width: 30, height: 30, cursor: "pointer",
                    color: "var(--nw-text-muted)", display: "inline-flex",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
                {menuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute", top: 36, right: 0, zIndex: 40,
                      background: "white", border: "1px solid var(--nw-border)",
                      borderRadius: 10, boxShadow: "0 10px 30px rgba(17,24,39,0.14)",
                      padding: 5, minWidth: 180,
                    }}
                  >
                    {onEdit && (
                      <button type="button" onClick={() => { setMenuOpen(false); onEdit() }} style={menuItem}>
                        {t.edit}
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => { setMenuOpen(false); onDelete() }} style={{ ...menuItem, color: "var(--nw-danger-strong)" }}>
                        {t.delete}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation des 3 sections : flèches + onglets. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 9,
          borderTop: "1px solid #F0EDF8", paddingTop: 8,
        }}>
          <button type="button" aria-label={t.prev} onClick={() => goTo(idx - 1)} disabled={idx === 0} style={navBtn(idx === 0)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div style={{ display: "flex", gap: 4, flex: 1, justifyContent: "center", flexWrap: "wrap" }}>
            {SECTIONS.map((key, i) => {
              const on = i === idx
              const count = key === "candidats" ? relevantCount : key === "shortlist" ? shortlistCount : null
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={on ? "true" : undefined}
                  style={{
                    border: "none", background: "transparent", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 14, fontWeight: on ? 800 : 600,
                    letterSpacing: "-0.01em",
                    color: on ? "var(--nw-primary)" : "var(--nw-text-muted)",
                    padding: "5px 12px 9px", marginBottom: -1,
                    borderBottom: `2.5px solid ${on ? "var(--nw-primary)" : "transparent"}`,
                    display: "inline-flex", alignItems: "center", gap: 7,
                  }}
                >
                  {t.labels[key]}
                  {count != null && count > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                      minWidth: 18, height: 18, padding: "0 6px", borderRadius: 999,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      color: on ? "white" : "var(--nw-text-muted)",
                      background: on ? "var(--nw-primary)" : "var(--nw-neutral-100)",
                    }}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
          <button type="button" aria-label={t.next} onClick={() => goTo(idx + 1)} disabled={idx === SECTIONS.length - 1} style={navBtn(idx === SECTIONS.length - 1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      {/* ── Piste des 3 panneaux (scroll horizontal natif + snap) ────── */}
      <div
        ref={maskRef}
        onScroll={onScroll}
        style={{
          overflowX: "auto", overflowY: "hidden", width: "100%",
          scrollSnapType: "x mandatory", overscrollBehaviorX: "contain",
          scrollbarWidth: "none", msOverflowStyle: "none",
          // Fondu des bords : le peek des sections voisines s'estompe au lieu
          // d'être coupé net (la zone de fondu < peek → le panneau actif,
          // centré à PEEK px du bord, reste parfaitement net).
          WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 44px, #000 calc(100% - 44px), transparent 100%)",
          maskImage: "linear-gradient(to right, transparent 0, #000 44px, #000 calc(100% - 44px), transparent 100%)",
        }}
        className="nw-carousel-mask"
      >
        <div ref={trackRef} style={{ display: "flex", gap: GAP, alignItems: "flex-start" }}>
          {panels.map((p, i) => {
            const isActive = p.key === active
            return (
              <div
                key={p.key}
                ref={(el) => { panelsRef.current[i] = el }}
                aria-hidden={isActive ? undefined : "true"}
                // Clic sur un panneau NON actif (= son peek) → on y va, sans
                // laisser le clic atteindre les boutons internes du voisin.
                onClickCapture={(e) => {
                  if (!isActive) { e.preventDefault(); e.stopPropagation(); goTo(i) }
                }}
                style={{
                  scrollSnapAlign: "center", boxSizing: "border-box",
                  cursor: isActive ? "default" : "pointer",
                  transition: reduceMotion() ? "none" : "opacity 200ms ease",
                }}
              >
                {p.node}
              </div>
            )
          })}
        </div>
      </div>

      {/* Hint éphémère (1er passage). */}
      {showHint && (
        <div style={{
          position: "absolute", left: "50%", bottom: -6, transform: "translateX(-50%)",
          zIndex: 45, display: "inline-flex", alignItems: "center", gap: 8,
          background: "var(--nw-text)", color: "white",
          fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 100,
          boxShadow: "0 8px 24px rgba(17,24,39,0.22)", whiteSpace: "nowrap",
          animation: "nw-carousel-hint 5.2s ease forwards",
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
          {t.hint}
        </div>
      )}

      <style>{`
        .nw-carousel-mask::-webkit-scrollbar { display: none; }
        @keyframes nw-carousel-spin { to { transform: rotate(360deg); } }
        @keyframes nw-carousel-hint {
          0% { opacity: 0; transform: translate(-50%, 8px); }
          8% { opacity: 1; transform: translate(-50%, 0); }
          88% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, 8px); }
        }
      `}</style>
    </div>
  )
}

const menuItem: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "8px 12px", borderRadius: 7, border: "none",
  background: "transparent", cursor: "pointer", fontFamily: "inherit",
  fontSize: 12.5, fontWeight: 600, color: "var(--nw-text-body)",
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    border: "1px solid var(--nw-border)", background: "white",
    borderRadius: 8, width: 30, height: 30, flexShrink: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: disabled ? "var(--nw-border)" : "var(--nw-primary-dark)",
    cursor: disabled ? "default" : "pointer",
  }
}

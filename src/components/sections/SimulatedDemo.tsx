"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { m, AnimatePresence } from "framer-motion"
import { brand, type as t } from "@/lib/brand"
import { Eyebrow } from "@/components/brand/Eyebrow"

/**
 * Démo simulée du Package Sourcing.
 *
 * Une UI de workspace SIMULÉE — pas une vidéo : toujours nette, légère (aucun
 * fichier à héberger), modifiable quand le produit évolue, et sans la moindre
 * donnée candidat réelle (zéro enjeu RGPD).
 *
 * Séquence calée sur le vrai job-to-be-done : on part d'un BESOIN CLIENT
 * (la mission), pas d'un stock de CVs. C'est l'ordre dans lequel un sourceur
 * travaille réellement.
 *
 * Deux formats depuis la même source :
 *   variant="full"    → /solutions, les 5 étapes, autoplay long
 *   variant="compact" → accueil, 3 étapes (mission → matching → décision)
 *
 * Honnêteté — non négociable :
 *   · noms de candidats et de fichiers FICTIFS, jamais de donnée réelle
 *   · aucun faux logo client, aucun faux témoignage, aucune métrique inventée
 *   · l'étape 1 montre l'utilisateur qui CORRIGE Nora : c'est ce qui se passe
 *     dans le produit, on ne prétend pas que l'analyse tombe juste toute seule
 *
 * `prefers-reduced-motion` : autoplay et curseur coupés, navigation au clic.
 */

type Variant = "full" | "compact"

const STEP_MS = 6200

const STEPS = [
  {
    n: "01",
    label: "Créez la mission",
    hint: "un brief suffit",
    caption: "Décrivez le besoin. Nora en extrait les critères — vous les corrigez et validez.",
  },
  {
    n: "02",
    label: "Réunissez les candidats",
    hint: "import + vivier",
    caption: "Importez des CVs dans la mission, ou laissez Nora piocher dans votre vivier.",
  },
  {
    n: "03",
    label: "Composez la shortlist",
    hint: "message d'approche inclus",
    caption: "Vous retenez qui vous voulez. Nora rédige l'approche, vous la relisez.",
  },
  {
    n: "04",
    label: "Suivez la pipeline",
    hint: "toutes vos missions",
    caption: "Chaque candidat avance dans son étape, par simple glisser-déposer.",
  },
  {
    n: "05",
    label: "Chiffrez la mission",
    hint: "option Suite Pricing",
    caption: "La rencontre entre votre politique de marge et les prétentions du candidat.",
  },
] as const

const COMPACT_STEPS = [0, 1, 2]

/* ── Primitives ─────────────────────────────────────────────────── */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: brand.paper,
        border: `1px solid ${brand.border}`,
        borderRadius: brand.radiusLg,
        padding: "clamp(14px, 2.2vw, 20px)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ ...t.meta, color: brand.violet }}>{children}</div>
}

/** Badge de provenance — c'est lui qui rend lisible « importé » vs « vivier ». */
function SourceBadge({ kind }: { kind: "importe" | "vivier" }) {
  const importe = kind === "importe"
  return (
    <span
      style={{
        fontFamily: brand.fontMono,
        fontSize: 9.5,
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: importe ? brand.violetDeep : brand.stone,
        background: importe ? brand.violet100 : brand.surface,
        border: `1px solid ${importe ? brand.violetSoft : brand.border}`,
        borderRadius: brand.radiusPill,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {importe ? "importé" : "vivier"}
    </span>
  )
}

function Score({ value }: { value: number }) {
  const good = value >= 75
  return (
    <span
      style={{
        fontFamily: brand.fontMono,
        fontSize: 12,
        fontWeight: 700,
        color: good ? brand.success : brand.violet,
        background: good ? brand.successBg : brand.violet100,
        border: `1px solid ${good ? brand.success : brand.violetSoft}33`,
        borderRadius: brand.radiusPill,
        padding: "2px 9px",
      }}
    >
      {value}
    </span>
  )
}

function Row({
  title,
  sub,
  right,
  accent,
}: {
  title: string
  sub?: React.ReactNode
  right?: React.ReactNode
  accent?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: brand.radiusSm,
        background: accent ? brand.violet100 : brand.surface2,
        border: `1px solid ${accent ? brand.violetSoft : brand.border}`,
        minWidth: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: brand.fontBody,
            fontSize: 13,
            fontWeight: 600,
            color: brand.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        {sub && (
          <div
            style={{
              fontFamily: brand.fontBody,
              fontSize: 11,
              color: brand.textMuted,
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
            }}
          >
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  )
}

/**
 * Curseur simulé — volontairement SOBRE.
 * Une flèche discrète + un halo au clic. Pas d'effet cartoon : la démo doit
 * ressembler au produit, pas à un tutoriel animé.
 */
function Cursor({
  to,
  click,
  delay = 0,
}: {
  to: { x: string; y: string }
  click?: boolean
  delay?: number
}) {
  return (
    <m.div
      aria-hidden
      initial={{ left: "12%", top: "88%", opacity: 0 }}
      animate={{ left: to.x, top: to.y, opacity: 1 }}
      transition={{ delay, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: "absolute", zIndex: 5, pointerEvents: "none" }}
    >
      {click && (
        <m.span
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: [0, 1.6], opacity: [0.45, 0] }}
          transition={{ delay: delay + 0.85, duration: 0.55 }}
          style={{
            position: "absolute",
            left: -11,
            top: -11,
            width: 26,
            height: 26,
            borderRadius: 999,
            background: brand.violet,
          }}
        />
      )}
      <svg width="17" height="17" viewBox="0 0 24 24" fill={brand.ink} stroke={brand.white} strokeWidth="1.4">
        <path d="M5.5 2.2l13.2 9.6-5.9.6-3.2 5.4z" />
      </svg>
    </m.div>
  )
}

function Btn({
  children,
  primary,
}: {
  children: React.ReactNode
  primary?: boolean
}) {
  return (
    <span
      style={{
        fontFamily: brand.fontBody,
        fontSize: 12.5,
        fontWeight: 600,
        padding: "8px 14px",
        borderRadius: brand.radiusSm,
        background: primary ? brand.violet : brand.surface2,
        color: primary ? brand.white : brand.text,
        border: `1px solid ${primary ? brand.violet : brand.border}`,
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {children}
    </span>
  )
}

/* ── Scènes ─────────────────────────────────────────────────────── */

/** 01 — Mission : brief tapé → analyse Nora → l'utilisateur corrige. */
function SceneMission() {
  const brief = "Je cherche un chef de projet senior sur Paris"
  const [typed, setTyped] = useState("")

  useEffect(() => {
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setTyped(brief.slice(0, i))
      if (i >= brief.length) window.clearInterval(id)
    }, 34)
    return () => window.clearInterval(id)
  }, [])

  const fields = [
    { k: "Poste", v: "Chef de projet", ok: true },
    { k: "Séniorité", v: "Senior · 5 ans et +", ok: true },
    { k: "Lieu", v: "Paris", ok: true },
    { k: "Contrat", v: "à préciser", ok: false },
  ]

  return (
    <Panel>
      <Label>Mission · brief</Label>

      <div
        style={{
          background: brand.surface2,
          border: `1px solid ${brand.border}`,
          borderRadius: brand.radiusMd,
          padding: "11px 13px",
          fontFamily: brand.fontBody,
          fontSize: 13,
          color: brand.text,
          minHeight: 40,
        }}
      >
        {typed}
        <m.span
          animate={{ opacity: [1, 0] }}
          transition={{ repeat: Infinity, duration: 0.85 }}
          style={{ borderLeft: `1.5px solid ${brand.violet}`, marginLeft: 1 }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <m.div
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.3 }}
        >
          <Btn primary>Analyser avec Nora</Btn>
        </m.div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1, minWidth: 0 }}>
        {fields.map((f, i) => (
          <m.div
            key={f.k}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 2.4 + i * 0.16, duration: 0.32 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              background: brand.surface2,
              border: `1px solid ${f.ok ? `${brand.success}44` : `${brand.warning}55`}`,
              borderRadius: brand.radiusSm,
              padding: "8px 12px",
            }}
          >
            <span style={{ ...t.meta, color: brand.textMuted, minWidth: 74 }}>{f.k}</span>
            <span style={{ fontFamily: brand.fontBody, fontSize: 13, color: brand.text, fontWeight: 500 }}>
              {f.v}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: brand.fontBody,
                fontSize: 10.5,
                fontWeight: 700,
                color: f.ok ? brand.success : brand.warning,
              }}
            >
              {f.ok ? "détecté" : "à vous de compléter"}
            </span>
          </m.div>
        ))}
      </div>

      <Cursor to={{ x: "72%", y: "34%" }} click delay={1.5} />
    </Panel>
  )
}

/** 02 — Candidats : dépôt de fichiers + matching vivier, badges de provenance. */
function SceneCandidats() {
  // Noms de fichiers FICTIFS — jamais un vrai candidat.
  const files = ["CV_Martin_D.pdf", "CV_Awa_K.pdf", "CV_Julien_R.pdf"]
  const pool = [
    { n: "Martin D.", src: "importe" as const, v: 91, f: "CV_Martin_D.pdf" },
    { n: "Awa K.", src: "importe" as const, v: 84, f: "CV_Awa_K.pdf" },
    { n: "Sofia L.", src: "vivier" as const, v: 88, f: "Chef de projet · 7 ans" },
    { n: "Julien R.", src: "importe" as const, v: 62, f: "CV_Julien_R.pdf" },
    { n: "Yanis B.", src: "vivier" as const, v: 58, f: "Chef de projet · 5 ans" },
  ]

  return (
    <Panel>
      <Label>Mission · candidats</Label>

      {/* Zone de dépôt : le VRAI geste du produit. Simuler une fenêtre de
          fichiers de l'OS ferait faux et dépendrait de la plateforme. */}
      <m.div
        initial={{ borderColor: brand.border }}
        animate={{ borderColor: [brand.border, brand.violet, brand.border] }}
        transition={{ delay: 0.2, duration: 1.6 }}
        style={{
          border: `1.5px dashed ${brand.violetSoft}`,
          borderRadius: brand.radiusMd,
          background: brand.violet100,
          padding: "10px 12px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ ...t.meta, color: brand.violet }}>Déposez vos CVs</span>
        {files.map((f, i) => (
          <m.span
            key={f}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35 + i * 0.18, duration: 0.35 }}
            style={{
              fontFamily: brand.fontMono,
              fontSize: 10.5,
              color: brand.violetDeep,
              background: brand.surface2,
              border: `1px solid ${brand.violetSoft}`,
              borderRadius: brand.radiusPill,
              padding: "3px 9px",
            }}
          >
            {f}
          </m.span>
        ))}
      </m.div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn>Matcher le vivier</Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1, minWidth: 0 }}>
        {pool.map((c, i) => (
          <m.div
            key={c.n}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.1 + i * 0.14, duration: 0.32 }}
          >
            <Row
              title={c.n}
              sub={
                <>
                  <SourceBadge kind={c.src} />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {c.f}
                  </span>
                </>
              }
              right={<Score value={c.v} />}
            />
          </m.div>
        ))}
      </div>

      <Cursor to={{ x: "76%", y: "40%" }} click delay={1.5} />
    </Panel>
  )
}

/** 03 — Shortlist : « Ajouter » puis fiche match + message d'approche. */
function SceneShortlist() {
  return (
    <Panel>
      <Label>Fiche candidat · approche</Label>

      <Row
        title="Martin D."
        accent
        sub={
          <>
            <SourceBadge kind="importe" />
            <span>Chef de projet · 8 ans · Paris</span>
          </>
        }
        right={<Score value={91} />}
      />

      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.4 }}
        style={{
          background: brand.surface2,
          border: `1px solid ${brand.border}`,
          borderRadius: brand.radiusMd,
          padding: "13px 15px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
        }}
      >
        <span style={{ ...t.meta, color: brand.violet }}>Message rédigé par Nora</span>
        <p
          style={{
            ...t.body,
            fontSize: 12.5,
            lineHeight: 1.6,
            margin: 0,
            color: brand.textSecondary,
          }}
        >
          Bonjour Martin, votre parcours en pilotage de projets d&apos;infrastructure
          a retenu notre attention pour une mission de chef de projet senior à
          Paris. Seriez-vous ouvert à en échanger cette semaine&nbsp;?
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
          <Btn primary>Envoyer</Btn>
          <Btn>Modifier</Btn>
        </div>
        <span style={{ ...t.caption, fontSize: 11 }}>
          Rien ne part sans votre clic. Nora propose, vous validez.
        </span>
      </m.div>

      <Cursor to={{ x: "26%", y: "80%" }} click delay={2.4} />
    </Panel>
  )
}

/** 04 — Pipeline : le candidat glisse d'une colonne à l'autre. */
function ScenePipeline() {
  const cols = [
    { s: "Identifié", items: ["Yanis B."] },
    { s: "Contacté", items: ["Awa K.", "Sofia L."] },
    { s: "Entretien", items: [] as string[] },
    { s: "Proposition", items: [] as string[] },
  ]

  return (
    <Panel>
      <Label>Pipeline · mission Chef de projet</Label>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
          gap: 8,
          flex: 1,
          minWidth: 0,
        }}
      >
        {cols.map((c, i) => (
          <div
            key={c.s}
            style={{
              background: brand.surface2,
              border: `1px solid ${brand.border}`,
              borderRadius: brand.radiusSm,
              padding: "9px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minWidth: 0,
            }}
          >
            <span style={{ ...t.meta, fontSize: 9, color: brand.textMuted }}>{c.s}</span>

            {c.items.map((n) => (
              <span
                key={n}
                style={{
                  fontFamily: brand.fontBody,
                  fontSize: 11,
                  color: brand.text,
                  background: brand.paper,
                  border: `1px solid ${brand.border}`,
                  borderRadius: 5,
                  padding: "6px 7px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {n}
              </span>
            ))}

            {/* La carte qui voyage : Contacté → Entretien */}
            {i === 2 && (
              <m.span
                initial={{ opacity: 0, x: -70, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 1.1, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  fontFamily: brand.fontBody,
                  fontSize: 11,
                  fontWeight: 600,
                  color: brand.violetDeep,
                  background: brand.violet100,
                  border: `1px solid ${brand.violetSoft}`,
                  borderRadius: 5,
                  padding: "6px 7px",
                  boxShadow: brand.shadowMd,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Martin D.
              </m.span>
            )}
          </div>
        ))}
      </div>

      <span style={{ ...t.caption, fontSize: 11.5 }}>
        Toutes vos missions partagent la même pipeline.
      </span>

      <Cursor to={{ x: "58%", y: "42%" }} delay={0.9} />
    </Panel>
  )
}

/** 05 — Pricing : option, basée sur Syntec. Config courte → décision. */
function ScenePricing() {
  const params = [
    ["TJM facturé", "620 €"],
    ["Prétention candidat", "48 000 € brut"],
    ["Marge cible", "28 %"],
  ]

  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Label>Pricing · convention Syntec</Label>
        <span
          style={{
            fontFamily: brand.fontMono,
            fontSize: 9.5,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: brand.stone,
            border: `1px solid ${brand.border}`,
            borderRadius: brand.radiusPill,
            padding: "2px 8px",
          }}
        >
          option
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {params.map(([k, v], i) => (
          <m.div
            key={k}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.15, duration: 0.3 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              background: brand.surface2,
              border: `1px solid ${brand.border}`,
              borderRadius: brand.radiusSm,
              padding: "8px 12px",
            }}
          >
            <span style={{ ...t.meta, color: brand.textMuted }}>{k}</span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: brand.fontMono,
                fontSize: 13,
                fontWeight: 600,
                color: brand.text,
              }}
            >
              {v}
            </span>
          </m.div>
        ))}
      </div>

      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.4 }}
        style={{
          marginTop: "auto",
          background: brand.successBg,
          border: `1px solid ${brand.success}44`,
          borderRadius: brand.radiusMd,
          padding: "13px 15px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 26,
            color: brand.success,
            lineHeight: 1,
          }}
        >
          31 %
        </span>
        <span style={{ ...t.body, fontSize: 12.5, margin: 0, flex: 1, minWidth: 140 }}>
          Marge dégagée sur la mission — au-dessus de votre cible. Le salaire
          demandé passe sans toucher au TJM.
        </span>
      </m.div>

      <span style={{ ...t.caption, fontSize: 11 }}>
        Calculs fondés sur la convention Syntec. Option indépendante du Package
        Sourcing.
      </span>
    </Panel>
  )
}

function Scene({ step }: { step: number }) {
  if (step === 0) return <SceneMission />
  if (step === 1) return <SceneCandidats />
  if (step === 2) return <SceneShortlist />
  if (step === 3) return <ScenePipeline />
  return <ScenePricing />
}

/* ── Composant principal ────────────────────────────────────────── */

export function SimulatedDemo({
  variant = "full",
  title,
  // Le numéro de section dépend de la page hôte : la démo n'est pas au même
  // rang sur l'accueil et sur /solutions.
  eyebrowN = "02",
}: {
  variant?: Variant
  title?: string
  eyebrowN?: string
}) {
  const order = useMemo(
    () => (variant === "compact" ? COMPACT_STEPS : STEPS.map((_, i) => i)),
    [variant],
  )

  const [pos, setPos] = useState(0)
  const [auto, setAuto] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setAuto(!mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(
      () => setPos((p) => (p + 1) % order.length),
      STEP_MS,
    )
    return () => window.clearInterval(id)
  }, [auto, order.length])

  const step = order[pos]
  const current = STEPS[step]

  return (
    <section style={{ padding: "8px 24px 96px", position: "relative" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: 32 }}>
          <Eyebrow n={eyebrowN} align="center">Le produit en mouvement</Eyebrow>
          <h2 style={{ ...t.h2, margin: "14px 0 0" }}>
            {title ?? "D'un brief à une shortlist présentable."}
          </h2>
        </header>

        {/* Cadre navigateur */}
        <div
          style={{
            background: brand.surface,
            border: `1px solid ${brand.border}`,
            borderRadius: brand.radiusXl,
            boxShadow: brand.shadowLg,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderBottom: `1px solid ${brand.border}`,
            }}
          >
            <span style={{ display: "flex", gap: 5, flexShrink: 0 }}>
              {[brand.coral, brand.warning, brand.success].map((c) => (
                <span key={c} style={{ width: 9, height: 9, borderRadius: 999, background: c, opacity: 0.55 }} />
              ))}
            </span>
            <span
              style={{
                ...t.meta,
                fontSize: 10,
                letterSpacing: "0.08em",
                color: brand.textMuted,
                background: brand.paper,
                border: `1px solid ${brand.border}`,
                borderRadius: brand.radiusPill,
                padding: "3px 12px",
                margin: "0 auto",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              naywastudio.com / workspace
            </span>
          </div>

          <div className="demo-grid">
            <ol className="demo-steps">
              {order.map((idx, i) => {
                const s = STEPS[idx]
                const active = i === pos
                return (
                  <li key={s.n}>
                    <button
                      onClick={() => setPos(i)}
                      aria-current={active}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "10px 12px",
                        borderRadius: brand.radiusSm,
                        border: "none",
                        cursor: "pointer",
                        background: active ? brand.violet100 : "transparent",
                        transition: "background 200ms ease",
                      }}
                    >
                      <span style={{ ...t.meta, color: active ? brand.violet : brand.lin, marginTop: 2 }}>
                        {s.n}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            fontFamily: brand.fontBody,
                            fontSize: 13,
                            fontWeight: active ? 700 : 500,
                            color: active ? brand.text : brand.textSecondary,
                          }}
                        >
                          {s.label}
                        </span>
                        <span style={{ ...t.caption, fontSize: 11, display: "block" }}>{s.hint}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>

            <div
              ref={stageRef}
              style={{
                padding: "clamp(12px, 2vw, 18px)",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ position: "relative", flex: 1, minHeight: 300 }}>
                <AnimatePresence mode="wait">
                  <m.div
                    key={step}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{ height: "100%", position: "relative" }}
                  >
                    <Scene step={step} />
                  </m.div>
                </AnimatePresence>
              </div>

              <p
                aria-live="polite"
                style={{ ...t.caption, fontSize: 12.5, margin: 0, minHeight: 34 }}
              >
                {current.caption}
              </p>
            </div>
          </div>
        </div>

        <p style={{ ...t.caption, textAlign: "center", marginTop: 14 }}>
          Démonstration illustrative — noms et documents fictifs, aucune donnée
          candidat réelle.
        </p>
      </div>

      <style>{`
        .demo-grid {
          display: grid;
          grid-template-columns: minmax(200px, 24%) minmax(0, 1fr);
          gap: 0;
        }
        .demo-steps {
          list-style: none;
          margin: 0;
          padding: 14px;
          border-right: 1px solid ${brand.border};
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        @media (max-width: 820px) {
          .demo-grid { grid-template-columns: minmax(0, 1fr); }
          .demo-steps {
            border-right: none;
            border-bottom: 1px solid ${brand.border};
            flex-direction: row;
            overflow-x: auto;
            gap: 6px;
            padding: 10px;
            scrollbar-width: thin;
          }
          .demo-steps > li { flex: 0 0 auto; max-width: 180px; }
        }
      `}</style>
    </section>
  )
}

"use client"

/** DEV ONLY — Preview espace client fidèle au workspace main */

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"
import { AGENT_LEVELS, MockStoreProvider, useMockStore } from "@/lib/mock-store"
import { LeoAvatar } from "@/components/workspace/LeoAvatar"

/* ── Helpers ─────────────────────────────────────────────── */

const FOLDER_PALETTE = ["#7C63C8","#9B88D9","#6B4FBA","#A78BFA","#8B6FD4","#B8AEDE","#7C63C8","#6B4FBA","#9B88D9","#A78BFA"]
function titleToColor(str: string) {
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return FOLDER_PALETTE[Math.abs(h) % FOLDER_PALETTE.length]
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  "preparation": { label: "Préparation", color: "#F59E0B" },
  "en-cours":    { label: "En cours",    color: "#22c55e" },
  "terminee":    { label: "Terminée",    color: "#6B7280" },
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FolderIcon({ color, size: _size = 48 }: { color: string; size?: number }) {
  // Dossier 3D animé — adapté de uiverse.io/jamrockjones
  const W = 68
  const H = 46
  const tipH = 13
  const tipW = Math.round(W * 0.62)

  const paperBase: React.CSSProperties = {
    display: "block",
    backgroundColor: "white",
    opacity: 0.45,
    width: W,
    height: H,
    position: "absolute",
    transformOrigin: "bottom center",
    borderRadius: 9,
    transition: "transform 350ms",
    top: 0,
    left: 0,
  }

  return (
    <div className="nawa-folder-wrap" style={{
      position: "relative",
      width: W,
      height: H + tipH,
      animation: "nawaFloat 2.5s infinite ease-in-out",
      perspective: 600,
    }}>
      {/* Back side — deux feuilles blanches */}
      <div className="nawa-folder-back" style={{
        position: "absolute",
        top: tipH,
        left: 0,
        transformOrigin: "bottom center",
      }}>
        <div className="nawa-paper-1" style={paperBase} />
        <div className="nawa-paper-2" style={paperBase} />
      </div>

      {/* Front side — rabat */}
      <div className="nawa-folder-front" style={{
        position: "absolute",
        top: tipH,
        left: 0,
        zIndex: 1,
        transformOrigin: "bottom center",
        transition: "transform 350ms",
      }}>
        {/* Onglet */}
        <div style={{
          background: `linear-gradient(135deg, ${color}cc, ${color})`,
          width: tipW,
          height: tipH,
          borderRadius: "7px 7px 0 0",
          position: "absolute",
          top: -tipH,
          left: 0,
          zIndex: 2,
          boxShadow: "0 3px 10px rgba(0,0,0,0.18)",
        }} />
        {/* Couverture */}
        <div style={{
          background: `linear-gradient(135deg, ${color}77, ${color}cc)`,
          width: W,
          height: H,
          borderRadius: 8,
          boxShadow: "0 10px 22px rgba(0,0,0,0.22)",
        }} />
      </div>
    </div>
  )
}

type ChatMsg = { id: string; role: "user" | "assistant"; text: string; actionCard?: { type: "mission_created" | "search_launched"; title: string; color: string } }

/* ── Export ─────────────────────────────────────────────── */

export default function WorkspacePreview() {
  return <MockStoreProvider><Inner /></MockStoreProvider>
}

function Inner() {
  const { missions, subscribe } = useMockStore()
  const [agentLevel, setAgentLevel] = useState(1)
  const agent = AGENT_LEVELS[agentLevel]

  const [view, setView] = useState<"welcome" | "chat">("welcome")
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState("")
  const [typing, setTyping] = useState(false)
  const [attached, setAttached] = useState<{ id: string; title: string; color: string } | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // État visuel de Léo selon l'activité du chat
  const leoState = typing ? "thinking" : input.trim() ? "observation" : "idle"

  useEffect(() => { subscribe(agentLevel) }, [agentLevel, subscribe])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages.length, typing])

  const switchAgent = (lvl: number) => {
    setAgentLevel(lvl)
    setView("welcome")
    setMessages([])
    setAttached(null)
  }

  const startChat = (firstMsg?: string) => {
    setView("chat")
    const greeting: ChatMsg = {
      id: "g0", role: "assistant",
      text: `Bonjour Hussein 👋 Je suis ${AGENT_LEVELS[agentLevel].agent}. ${firstMsg ?? "Décrivez-moi votre besoin ou glissez une mission depuis le panneau."}`,
    }
    setMessages([greeting])
  }

  const send = () => {
    if (!input.trim()) return
    const txt = input.trim(); setInput("")
    const userMsg: ChatMsg = { id: `u${Date.now()}`, role: "user", text: txt }
    setMessages(p => [...p, userMsg])
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      const reply: ChatMsg = {
        id: `a${Date.now()}`, role: "assistant",
        text: "Bien reçu. Je lance la recherche sur ce profil — vous aurez les premiers résultats très rapidement.",
        actionCard: { type: "search_launched", title: txt.slice(0, 48) + (txt.length > 48 ? "…" : ""), color: AGENT_LEVELS[agentLevel].color },
      }
      setMessages(p => [...p, reply])
    }, 1100)
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "var(--font-inter), sans-serif" }}>

      {/* ── Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 40, height: 60,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(14px)",
        borderBottom: "1px solid #F0ECF8",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Logo size="md" />
          <span style={{ fontSize: 13, color: "#9CA3AF" }}>Workspace</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* DEV switcher — reproduit le switcher dev du vrai layout */}
          {[1, 2, 3].map(lvl => {
            const a = AGENT_LEVELS[lvl]
            const active = agentLevel === lvl
            return (
              <button key={lvl} onClick={() => switchAgent(lvl)} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 999, cursor: "pointer",
                color: active ? a.color : "#9CA3AF",
                background: active ? a.colorLight : "transparent",
                border: active ? `1.5px solid ${a.borderColor}` : "1.5px solid #E5E7EB",
                boxShadow: active ? `0 0 0 3px ${a.color}18, 0 0 10px ${a.color}28` : "none",
                transition: "all 150ms",
              }}>
                {a.icon} {a.agent}
              </button>
            )
          })}
          <div style={{ width: 1, height: 18, background: "#E5E7EB", margin: "0 4px" }} />
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>hussein@nawastudio.com</span>
          <button style={{ fontSize: 11, color: "#9CA3AF", background: "none", border: "1px solid #E5E7EB", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* ── Layout ── */}
      <div style={{ display: "flex", height: "calc(100vh - 60px)", overflow: "hidden" }}>

        {/* ── Zone chat (gauche) ── */}
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#FAFAFA" }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            try {
              const d = JSON.parse(e.dataTransfer.getData("application/json"))
              setAttached(d)
              if (view === "welcome") startChat(`Mission attachée : "${d.title}". Que souhaitez-vous faire ?`)
            } catch {}
          }}
        >
          {view === "welcome" ? (
            /* ── Welcome state ── */
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "40px 24px", textAlign: "center",
            }}>
              <div style={{ marginBottom: 24 }}>
                {agentLevel === 1
                  ? <LeoAvatar state="idle" size={80} />
                  : (
                    <div style={{
                      width: 80, height: 80, borderRadius: 20,
                      background: `linear-gradient(135deg, ${agent.color} 0%, #A78BFA 100%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: `0 8px 32px ${agent.color}40`,
                    }}>
                      <svg width="32" height="32" viewBox="0 0 14 14" fill="none">
                        <path d="M2 12V2l4 7 4-7v10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )
                }
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 8px", fontFamily: "var(--font-space-grotesk), sans-serif", letterSpacing: -0.3 }}>
                Bonjour, Hussein 👋
              </h2>
              <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 32px", lineHeight: 1.6, maxWidth: 360 }}>
                Décrivez votre besoin ou glissez une mission existante depuis le panneau de droite.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  onClick={() => startChat()}
                  style={{
                    padding: "12px 24px", borderRadius: 12, border: "none",
                    background: agent.color, color: "white",
                    fontSize: 14, fontWeight: 700, cursor: "pointer",
                    boxShadow: `0 4px 16px ${agent.color}40`,
                    transition: "transform 120ms",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)" }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}
                >
                  ✦ Nouvelle mission
                </button>
                <button
                  onClick={() => startChat("Reprenons là où nous en étions. Quelle mission souhaitez-vous continuer ?")}
                  style={{
                    padding: "12px 24px", borderRadius: 12,
                    border: "1.5px solid #E2DAF6", background: "white",
                    fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#374151",
                    transition: "border-color 120ms",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = agent.color }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2DAF6" }}
                >
                  Reprendre une mission
                </button>
              </div>
            </div>
          ) : (
            /* ── Chat actif ── */
            <>
              {/* Mission chip */}
              {attached && (
                <div style={{ padding: "8px 20px", borderBottom: "1px solid #F0ECF8", background: "white", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>Mission :</span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 8,
                    background: attached.color + "15", color: attached.color, border: `1px solid ${attached.color}30`,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: attached.color }} />
                    {attached.title}
                  </span>
                  <button onClick={() => setAttached(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              )}

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
                {messages.map((msg, idx) => {
                  const isLastAssistant = msg.role === "assistant" && idx === messages.length - 1
                  const avatarState = isLastAssistant ? leoState : "idle"
                  return (
                  <div key={msg.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                    {/* Avatar */}
                    {msg.role === "user" ? (
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "#E2DAF6", fontSize: 13, fontWeight: 700, color: "#7C63C8",
                      }}>H</div>
                    ) : agentLevel === 1 ? (
                      <LeoAvatar state={avatarState} size={36} />
                    ) : (
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: `linear-gradient(135deg, ${agent.color} 0%, #A78BFA 100%)`,
                      }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2 12V2l4 7 4-7v10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                    <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{
                        padding: "11px 15px", fontSize: 13, lineHeight: 1.65,
                        borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                        background: msg.role === "user" ? agent.color : "white",
                        color: msg.role === "user" ? "white" : "#111827",
                        border: msg.role === "user" ? "none" : "1px solid #F0ECF8",
                        boxShadow: msg.role === "user" ? "none" : "0 1px 4px rgba(0,0,0,0.04)",
                      }}>
                        {msg.text}
                      </div>
                      {/* Action card */}
                      {msg.actionCard && (
                        <div style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          background: msg.actionCard.type === "mission_created" ? msg.actionCard.color + "12" : "rgba(34,197,94,0.08)",
                          border: `1.5px solid ${msg.actionCard.type === "mission_created" ? msg.actionCard.color + "35" : "rgba(34,197,94,0.25)"}`,
                          borderRadius: 10, padding: "8px 14px",
                        }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                            background: msg.actionCard.type === "mission_created" ? msg.actionCard.color + "22" : "rgba(34,197,94,0.15)",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                          }}>
                            {msg.actionCard.type === "mission_created" ? "📁" : "🔍"}
                          </span>
                          <div>
                            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: msg.actionCard.type === "mission_created" ? msg.actionCard.color : "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {msg.actionCard.type === "mission_created" ? "Dossier créé" : "Recherche lancée"}
                            </p>
                            <p style={{ margin: 0, fontSize: 12, color: "#374151" }}>{msg.actionCard.title}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )})}

                {/* Typing */}
                {typing && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    {agentLevel === 1
                      ? <LeoAvatar state="thinking" size={36} />
                      : <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${agent.color} 0%, #A78BFA 100%)` }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 12V2l4 7 4-7v10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                    }
                    <div style={{ padding: "12px 16px", borderRadius: "4px 16px 16px 16px", background: "white", border: "1px solid #F0ECF8", display: "flex", gap: 5, alignItems: "center" }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#9CA3AF", animation: `bounce 0.8s ${i*0.15}s infinite` }} />)}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input — style Uiverse pill */}
              <div style={{ padding: "14px 28px 16px", borderTop: "1px solid #F0ECF8", background: "white", flexShrink: 0 }}>
                <div className="nawa-input-outer" style={{
                  position: "relative",
                  background: `linear-gradient(135deg, ${agent.colorLight} 0%, ${agent.colorLight} 100%)`,
                  borderRadius: 1000,
                  padding: 8,
                  zIndex: 0,
                }}>
                  <div className="nawa-input-inner" style={{
                    position: "relative",
                    width: "100%",
                    borderRadius: 50,
                    background: "linear-gradient(135deg, #f5f2ff 0%, #ede8ff 100%)",
                    padding: "4px 4px 4px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    zIndex: 1,
                  }}>
                    {/* Icône dossier à gauche de l'input */}
                    <svg width="18" height="18" viewBox="0 0 80 62" fill="none" style={{ flexShrink: 0, opacity: 0.55 }}>
                      <path d="M2 18C2 14.686 4.686 12 8 12H28L34 6H72C75.314 6 78 8.686 78 12V18H2Z" fill={agent.color} opacity="0.7"/>
                      <rect x="2" y="18" width="76" height="42" rx="7" fill={agent.color} opacity="0.35"/>
                      <rect x="2" y="18" width="76" height="42" rx="7" stroke={agent.color} strokeWidth="3" fill="none" opacity="0.8"/>
                    </svg>
                    <textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                      placeholder={`Message à ${agent.agent}…`}
                      rows={1}
                      className="nawa-textarea"
                      style={{
                        flex: 1, background: "transparent", border: "none", outline: "none",
                        fontSize: 13, color: "#374151", resize: "none", lineHeight: 1.5,
                        fontFamily: "var(--font-inter), sans-serif", maxHeight: 80, overflowY: "auto",
                        padding: "6px 0",
                      }}
                    />
                    {/* Send button — style search icon */}
                    <button
                      onClick={send}
                      disabled={!input.trim()}
                      style={{
                        width: 42, height: 42, borderRadius: "50%", border: "none", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: input.trim() ? "pointer" : "default",
                        background: input.trim()
                          ? `linear-gradient(135deg, ${agent.color} 0%, ${agent.color}cc 100%)`
                          : "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
                        boxShadow: input.trim() ? `${agent.color}88 2px 2px 6px 0px, ${agent.color}55 4px 4px 16px 0px` : "none",
                        transition: "all 200ms ease",
                        marginLeft: 4,
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                        <path d="M3 10l14-7-4 7 4 7-14-7z" fill="white"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 11, color: "#C4BAE8", textAlign: "center" }}>
                  Glissez un dossier depuis le panneau → pour le contextualiser
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Panneau missions (droite 320px) ── */}
        <div style={{
          width: 320, flexShrink: 0,
          borderLeft: "1px solid #F0ECF8", background: "white",
          display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid #F0ECF8", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9CA3AF" }}>
              Missions{missions.length > 0 ? ` · ${missions.length}` : ""}
            </span>
            <button
              onClick={() => startChat()}
              style={{
                width: "100%", padding: "11px 16px",
                background: `linear-gradient(135deg, ${agent.color} 0%, #A78BFA 100%)`,
                color: "white", border: "none", borderRadius: 10, cursor: "pointer",
                fontSize: 13, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                boxShadow: `0 4px 14px ${agent.color}44`,
                transition: "opacity 150ms, transform 150ms",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.92"; e.currentTarget.style.transform = "translateY(-1px)" }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)" }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="white" strokeWidth="2.2" strokeLinecap="round"/></svg>
              Créer une mission
            </button>
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {missions.map((mission) => {
                const color = titleToColor(mission.name)
                const status = STATUS_META[mission.status] ?? { label: mission.status, color: "#9CA3AF" }
                return (
                  <div
                    key={mission.id}
                    draggable
                    onDragStart={e => e.dataTransfer.setData("application/json", JSON.stringify({ id: mission.id, title: mission.name, color }))}
                    style={{ cursor: "grab" }}
                  >
                    <Link href="/workspace-preview/mission" style={{ textDecoration: "none", display: "block" }}>
                      <div
                        className="nawa-card"
                        style={{ background: "white", borderRadius: 14, border: "1.5px solid #F0ECF8", padding: "16px 12px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 180ms", minHeight: 130 }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = color+"55"; el.style.boxShadow = `0 6px 20px ${color}18`; el.style.transform = "translateY(-2px)" }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#F0ECF8"; el.style.boxShadow = "none"; el.style.transform = "translateY(0)" }}
                      >
                        <div style={{ position: "relative" }}>
                          <FolderIcon color={color} size={48} />
                          <span style={{ position: "absolute", bottom: 2, right: -2, width: 8, height: 8, borderRadius: "50%", background: status.color, border: "2px solid white" }} />
                        </div>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#111827", textAlign: "center", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", width: "100%" }}>
                          {mission.name}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: status.color }} />
                          <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>{status.label}</p>
                        </div>
                      </div>
                    </Link>
                  </div>
                )
              })}

              {/* + card */}
              <div
                onClick={() => startChat()}
                style={{
                  borderRadius: 14, border: `1.5px dashed ${agent.color}55`,
                  padding: "16px 12px 14px",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 8, cursor: "pointer", minHeight: 130,
                  background: `${agent.color}06`,
                  transition: "all 150ms",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = agent.color
                  el.style.background = `${agent.color}12`
                  el.style.transform = "translateY(-2px)"
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = `${agent.color}55`
                  el.style.background = `${agent.color}06`
                  el.style.transform = "translateY(0)"
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `linear-gradient(135deg, ${agent.color}22, ${agent.color}44)`,
                  border: `1px solid ${agent.color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M10 4v12M4 10h12" stroke={agent.color} strokeWidth="2.2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: agent.color, textAlign: "center" }}>Créer une mission</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%,100% { transform:translateY(0); opacity:0.4 }
          50%      { transform:translateY(-4px); opacity:1 }
        }
        @keyframes nawaFloat {
          0%,100% { transform:translateY(0px) }
          50%      { transform:translateY(-7px) }
        }
        /* Dossier — pause de la flottaison au hover */
        .nawa-card:hover .nawa-folder-wrap {
          animation-play-state: paused;
        }

        /* Input pill — couches glass (::before / ::after) */
        .nawa-input-inner::before {
          content: "";
          width: 100%; height: 100%;
          border-radius: inherit;
          position: absolute;
          top: -1px; left: -1px;
          background: linear-gradient(0deg, #f0ebff 0%, #ffffff 100%);
          z-index: -1;
        }
        .nawa-input-inner::after {
          content: "";
          width: 100%; height: 100%;
          border-radius: inherit;
          position: absolute;
          bottom: -1px; right: -1px;
          background: linear-gradient(0deg, #ddd6fe 0%, #ede9ff 100%);
          box-shadow: rgba(124,99,200,0.55) 2px 2px 5px 0px, rgba(124,99,200,0.4) 4px 4px 18px 0px;
          z-index: -2;
        }
        .nawa-textarea::placeholder { color: #a78bfa; }
        .nawa-textarea:focus { outline: none; }
      `}</style>
    </div>
  )
}

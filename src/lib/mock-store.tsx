"use client"
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"

/* ─── Types ──────────────────────────────────────────────────── */

export interface AgentLevel {
  number: number
  name: string
  agent: string
  role: string
  color: string
  colorLight: string
  colorMid: string
  borderColor: string
  icon: string
}

export const AGENT_LEVELS: Record<number, AgentLevel> = {
  1: {
    number: 1,
    name: "Niveau 1",
    agent: "Léo",
    role: "Agent de tri & nettoyage",
    color: "#22c55e",
    colorLight: "rgba(34,197,94,0.06)",
    colorMid: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.25)",
    icon: "🧹",
  },
  2: {
    number: 2,
    name: "Niveau 2",
    agent: "Nora",
    role: "Agent maître de sourcing",
    color: "#3b82f6",
    colorLight: "rgba(59,130,246,0.06)",
    colorMid: "rgba(59,130,246,0.12)",
    borderColor: "rgba(59,130,246,0.25)",
    icon: "🎯",
  },
  3: {
    number: 3,
    name: "Niveau 3",
    agent: "Alex",
    role: "Agent orchestrateur de recrutement",
    color: "#7C63C8",
    colorLight: "rgba(124,99,200,0.06)",
    colorMid: "rgba(124,99,200,0.12)",
    borderColor: "rgba(124,99,200,0.25)",
    icon: "🚀",
  },
}

export type MissionStatus = "preparation" | "en-cours" | "terminee"

export interface WorkspaceSection {
  id: string
  title: string
  type:
    | "besoin"
    | "profils"
    | "shortlist"
    | "contacts"
    | "calendrier"
    | "dossiers"
    | "presentation"
    | "historique"
  exportable: boolean
  data: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: "agent" | "user"
  text: string
}

export interface Mission {
  id: string
  name: string
  agentLevel: number
  status: MissionStatus
  createdAt: string
  needDefined: boolean
  chatMessages: ChatMessage[]
  sections: WorkspaceSection[]
}

/* ─── Mock sections data ─────────────────────────────────────── */

const MOCK_PROFILS: WorkspaceSection = {
  id: "profils",
  title: "Profils trouvés",
  type: "profils",
  exportable: true,
  data: {
    count: 47,
    rows: [
      { nom: "Sophie Martin", poste: "Dev Full-Stack", score: 92, source: "LinkedIn", statut: "Qualifié" },
      { nom: "Thomas Durand", poste: "Dev Full-Stack", score: 88, source: "LinkedIn", statut: "Qualifié" },
      { nom: "Claire Petit", poste: "Dev Backend", score: 85, source: "Indeed", statut: "En attente" },
      { nom: "Marc Lefevre", poste: "Dev Full-Stack", score: 82, source: "LinkedIn", statut: "Qualifié" },
      { nom: "Julie Moreau", poste: "Dev Frontend", score: 79, source: "Walaxy", statut: "En attente" },
      { nom: "Pierre Dubois", poste: "Dev Full-Stack", score: 76, source: "LinkedIn", statut: "Rejeté" },
    ],
  },
}

const MOCK_SHORTLIST: WorkspaceSection = {
  id: "shortlist",
  title: "Shortlist & scoring",
  type: "shortlist",
  exportable: true,
  data: {
    candidates: [
      { nom: "Sophie Martin", score: 92, points: ["5 ans XP React/Node", "Remote OK", "Dispo immédiate"], recommendation: "Fortement recommandé" },
      { nom: "Thomas Durand", score: 88, points: ["4 ans XP full-stack", "Paris", "Préavis 1 mois"], recommendation: "Recommandé" },
      { nom: "Marc Lefevre", score: 82, points: ["3 ans XP", "Lyon (relocalisation OK)", "Dispo 2 semaines"], recommendation: "Recommandé" },
    ],
  },
}

const MOCK_CONTACTS: WorkspaceSection = {
  id: "contacts",
  title: "Candidats contactés",
  type: "contacts",
  exportable: false,
  data: {
    contacted: [
      { nom: "Sophie Martin", date: "2026-04-07", canal: "LinkedIn InMail", reponse: "Intéressée", relance: false },
      { nom: "Thomas Durand", date: "2026-04-07", canal: "Email", reponse: "En attente", relance: true },
      { nom: "Marc Lefevre", date: "2026-04-08", canal: "LinkedIn InMail", reponse: "Intéressé", relance: false },
    ],
  },
}

const MOCK_CALENDRIER: WorkspaceSection = {
  id: "calendrier",
  title: "Calendrier des interviews",
  type: "calendrier",
  exportable: false,
  data: {
    interviews: [
      { candidat: "Sophie Martin", date: "2026-04-14", heure: "10h00", type: "Visio", statut: "Confirmé" },
      { candidat: "Marc Lefevre", date: "2026-04-15", heure: "14h30", type: "Visio", statut: "En attente" },
    ],
  },
}

const MOCK_DOSSIERS: WorkspaceSection = {
  id: "dossiers",
  title: "Dossiers candidats",
  type: "dossiers",
  exportable: true,
  data: {
    dossiers: [
      {
        candidat: "Sophie Martin",
        synthese: "Profil senior full-stack, 5 ans d'expérience React/Node. Excellente communication, motivée par le projet. Prétentions salariales alignées.",
        points_forts: ["Expertise technique solide", "Disponibilité immédiate", "Culture fit"],
        points_vigilance: ["Aucune expérience en management"],
      },
    ],
  },
}

const MOCK_PRESENTATION: WorkspaceSection = {
  id: "presentation",
  title: "Présentation finale",
  type: "presentation",
  exportable: true,
  data: {
    titre: "Recrutement Dev Full-Stack — Shortlist finale",
    date: "2026-04-09",
    candidats_retenus: 3,
    recommandation: "Sophie Martin — profil le plus aligné avec le besoin exprimé.",
  },
}

const MOCK_HISTORIQUE: WorkspaceSection = {
  id: "historique",
  title: "Historique & actions",
  type: "historique",
  exportable: false,
  data: {
    events: [
      { date: "2026-04-05", action: "Mission créée", agent: "Alex" },
      { date: "2026-04-05", action: "Besoin défini par le client", agent: "Alex" },
      { date: "2026-04-06", action: "47 profils identifiés", agent: "Alex" },
      { date: "2026-04-06", action: "Shortlist de 3 candidats générée", agent: "Alex" },
      { date: "2026-04-07", action: "3 candidats contactés", agent: "Alex" },
      { date: "2026-04-08", action: "2 interviews planifiées", agent: "Alex" },
      { date: "2026-04-09", action: "Dossier candidat Sophie Martin finalisé", agent: "Alex" },
      { date: "2026-04-09", action: "Présentation finale générée", agent: "Alex" },
    ],
  },
}

/* ─── Sections visible per level ──────────────────────────────── */

function getSectionsForLevel(level: number): WorkspaceSection[] {
  switch (level) {
    case 1:
      return [MOCK_PROFILS]
    case 2:
      return [MOCK_PROFILS, MOCK_SHORTLIST, MOCK_CONTACTS]
    case 3:
      return [MOCK_PROFILS, MOCK_SHORTLIST, MOCK_CONTACTS, MOCK_CALENDRIER, MOCK_DOSSIERS, MOCK_PRESENTATION, MOCK_HISTORIQUE]
    default:
      return []
  }
}

/* ─── Initial mock missions ──────────────────────────────────── */

function createInitialMissions(level: number): Mission[] {
  const agentName = AGENT_LEVELS[level]?.agent ?? "Agent"
  return [
    {
      id: "mission-demo-1",
      name: "Dev Full-Stack Senior — Paris",
      agentLevel: level,
      status: "en-cours",
      createdAt: "2026-04-05",
      needDefined: true,
      chatMessages: [
        { id: "m1", role: "agent", text: `Bonjour ! Je suis ${agentName}, votre agent de sourcing. Décrivez-moi le profil que vous recherchez.` },
        { id: "m2", role: "user", text: "Je cherche un développeur full-stack senior, 4+ ans d'expérience, React/Node.js. Poste en CDI, Paris ou remote. Budget 55-65K€." },
        { id: "m3", role: "agent", text: "Parfait. Je lance la recherche sur ce profil. Vous aurez les premiers résultats très rapidement." },
      ],
      sections: [
        {
          id: "besoin",
          title: "Besoin client",
          type: "besoin",
          exportable: false,
          data: {
            poste: "Développeur Full-Stack Senior",
            experience: "4+ ans",
            stack: "React, Node.js, TypeScript",
            contrat: "CDI",
            localisation: "Paris ou Remote",
            salaire: "55 000 — 65 000 €",
          },
        },
        ...getSectionsForLevel(level),
      ],
    },
    {
      id: "mission-demo-2",
      name: "Product Manager — Lyon",
      agentLevel: level,
      status: "preparation",
      createdAt: "2026-04-08",
      needDefined: false,
      chatMessages: [],
      sections: [],
    },
  ]
}

/* ─── Context ─────────────────────────────────────────────────── */

interface MockStore {
  subscribedLevel: number | null
  missions: Mission[]
  subscribe: (level: number) => void
  unsubscribe: () => void
  createMission: (name: string) => string
  defineBesoin: (missionId: string, besoinData: Record<string, string>) => void
  addChatMessage: (missionId: string, message: ChatMessage) => void
  getMission: (missionId: string) => Mission | undefined
}

const STORAGE_KEY = "nawa-mock-store"

interface PersistedState {
  subscribedLevel: number | null
  missions: Mission[]
}

function loadState(): PersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedState
  } catch {
    return null
  }
}

function saveState(state: PersistedState) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota exceeded — silently ignore */
  }
}

const MockStoreContext = createContext<MockStore | null>(null)

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const [subscribedLevel, setSubscribedLevel] = useState<number | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [hydrated, setHydrated] = useState(false)

  /* ── Hydrate from localStorage on mount ─────────────── */
  useEffect(() => {
    const saved = loadState()
    if (saved) {
      setSubscribedLevel(saved.subscribedLevel)
      setMissions(saved.missions)
    }
    setHydrated(true)
  }, [])

  /* ── Persist to localStorage on every change ────────── */
  useEffect(() => {
    if (!hydrated) return
    saveState({ subscribedLevel, missions })
  }, [subscribedLevel, missions, hydrated])

  const subscribe = useCallback((level: number) => {
    setSubscribedLevel(level)
    setMissions(prev => {
      // First subscription — no existing missions → create demo ones
      if (prev.length === 0) return createInitialMissions(level)
      // Upgrading/changing agent — preserve missions, update level + adjust sections
      return prev.map(m => {
        // Keep only the "besoin" section (client-specific), replace level sections
        const besoinSections = m.sections.filter(s => s.type === 'besoin')
        const newLevelSections = m.needDefined ? getSectionsForLevel(level) : []
        return {
          ...m,
          agentLevel: level,
          sections: m.needDefined ? [...besoinSections, ...newLevelSections] : [],
        }
      })
    })
  }, [])

  const unsubscribe = useCallback(() => {
    setSubscribedLevel(null)
    setMissions([])
  }, [])

  const createMission = useCallback((name: string): string => {
    const id = `mission-${Date.now()}`
    const newMission: Mission = {
      id,
      name,
      agentLevel: subscribedLevel ?? 1,
      status: "preparation",
      createdAt: new Date().toISOString().slice(0, 10),
      needDefined: false,
      chatMessages: [],
      sections: [],
    }
    setMissions((prev) => [...prev, newMission])
    return id
  }, [subscribedLevel])

  const defineBesoin = useCallback((missionId: string, besoinData: Record<string, string>) => {
    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== missionId) return m
        const level = m.agentLevel
        const besoinSection: WorkspaceSection = {
          id: "besoin",
          title: "Besoin client",
          type: "besoin",
          exportable: false,
          data: besoinData,
        }
        return {
          ...m,
          needDefined: true,
          status: "en-cours" as MissionStatus,
          sections: [besoinSection, ...getSectionsForLevel(level)],
        }
      })
    )
  }, [])

  const addChatMessage = useCallback((missionId: string, message: ChatMessage) => {
    setMissions((prev) =>
      prev.map((m) =>
        m.id === missionId ? { ...m, chatMessages: [...m.chatMessages, message] } : m
      )
    )
  }, [])

  const getMission = useCallback(
    (missionId: string) => missions.find((m) => m.id === missionId),
    [missions]
  )

  /* ── Don't render children until hydrated to avoid flash ── */
  if (!hydrated) {
    return null
  }

  return (
    <MockStoreContext.Provider
      value={{ subscribedLevel, missions, subscribe, unsubscribe, createMission, defineBesoin, addChatMessage, getMission }}
    >
      {children}
    </MockStoreContext.Provider>
  )
}

export function useMockStore() {
  const ctx = useContext(MockStoreContext)
  if (!ctx) throw new Error("useMockStore must be used within MockStoreProvider")
  return ctx
}

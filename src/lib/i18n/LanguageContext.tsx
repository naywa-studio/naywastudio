'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getSupabase } from '@/lib/supabase'

export type Lang = 'fr' | 'en'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const STORAGE_KEY = 'naywa-lang'

function isLang(value: unknown): value is Lang {
  return value === 'fr' || value === 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('fr')
  // Tracks whether the current value came from the account (vs. localStorage
  // guess) so setLang knows whether it's safe to persist to the profile.
  const isAuthedRef = useRef(false)

  // Fast paint from localStorage, then reconcile with the account's saved
  // preference once we know whether someone is signed in.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLang(stored)) setLangState(stored)

    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return
      isAuthedRef.current = true
      const { data } = await sb
        .from('profiles')
        .select('preferred_language')
        .eq('user_id', session.user.id)
        .single()
      if (isLang(data?.preferred_language)) {
        setLangState(data.preferred_language)
        window.localStorage.setItem(STORAGE_KEY, data.preferred_language)
      }
    })
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (next: Lang) => {
    setLangState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    if (isAuthedRef.current) {
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_language: next }),
      }).catch(() => {
        // Best-effort : le localStorage reste la source de vérité immédiate,
        // un échec réseau ici ne bloque pas le changement de langue affiché.
      })
    }
  }

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}

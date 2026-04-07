'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'

const navLinks = [
  { label: 'Agents',   href: '#agents' },
  { label: 'Tarifs',   href: '#tarifs' },
  { label: 'À propos', href: '#apropos' },
]

interface NavbarProps {
  onOpenOnboarding?: () => void
  onOpenLogin?: () => void
}

export function Navbar({ onOpenOnboarding, onOpenLogin }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMobileOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <>
      <header
        className="fixed top-0 inset-x-0 z-40 h-16 transition-all duration-200"
        style={{
          background: '#FFFFFF',
          borderBottom: scrolled ? '1px solid #E2DAF6' : '1px solid transparent',
        }}
      >
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">

          {/* Logo */}
          <Link href="/" aria-label="Nawa Studio — accueil">
            <Logo size="md" />
          </Link>

          {/* Centre — liens desktop */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Navigation principale">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 rounded-md transition-colors duration-150"
                style={{ fontSize: 14, color: '#4B5563', textDecoration: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#4B5563')}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Droite — desktop */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={onOpenLogin}
              style={{
                background: 'transparent', color: '#7C63C8',
                border: '1.5px solid #7C63C8', borderRadius: 8,
                fontSize: 14, fontWeight: 500, padding: '9px 18px', cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F0FF' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              Se connecter
            </button>

            <button
              onClick={onOpenOnboarding}
              style={{
                background: '#7C63C8', color: '#FFFFFF', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600, padding: '10px 20px', cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#6B54B2' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#7C63C8' }}
            >
              Testez votre agent !
            </button>
          </div>

          {/* Toggle mobile */}
          <button
            type="button"
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="md:hidden p-2 rounded-md"
            style={{ color: '#4B5563' }}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="fixed inset-x-0 top-16 z-30 border-b shadow-lg"
          style={{ background: '#FFFFFF', borderColor: '#E2DAF6' }}
        >
          <div className="flex flex-col px-4 py-4 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{ fontSize: 15, color: '#4B5563', textDecoration: 'none', padding: '10px 12px', borderRadius: 8 }}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 mt-3 pt-3 border-t" style={{ borderColor: '#E2DAF6' }}>
              <button
                onClick={() => { setMobileOpen(false); onOpenLogin?.() }}
                style={{
                  padding: '12px', borderRadius: 10, border: '1.5px solid #7C63C8',
                  background: 'transparent', color: '#7C63C8', fontSize: 15,
                  fontWeight: 500, cursor: 'pointer',
                }}
              >
                Se connecter
              </button>
              <button
                onClick={() => { setMobileOpen(false); onOpenOnboarding?.() }}
                style={{
                  padding: '12px', borderRadius: 10, border: 'none',
                  background: '#7C63C8', color: 'white', fontSize: 15,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                Testez votre agent !
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

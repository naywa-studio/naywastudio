'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'

const navLinks = [
  { label: 'Agents',   href: '#agents' },
  { label: 'Tarifs',   href: '#tarifs' },
  { label: 'À propos', href: '#apropos' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 h-16 transition-all duration-200"
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

        {/* Droite */}
        <div className="flex items-center gap-3">
          {/* CTA desktop */}
          <Link
            href="#contact"
            className="hidden md:inline-flex items-center rounded-lg transition-colors duration-150"
            style={{
              background: '#7C63C8',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 500,
              padding: '10px 20px',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#6B54B2')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#7C63C8')}
          >
            Prendre rendez-vous
          </Link>

          {/* Icône menu mobile */}
          <button
            type="button"
            aria-label="Ouvrir le menu"
            className="md:hidden p-2 rounded-md"
            style={{ color: '#4B5563' }}
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
    </header>
  )
}

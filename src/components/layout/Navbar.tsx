'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { m, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

const navLinks = [
  { label: 'Agents', href: '#agents' },
  { label: 'Tarifs', href: '#tarifs' },
  { label: 'À propos', href: '#apropos' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      <m.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'fixed top-0 inset-x-0 z-50 transition-all duration-300',
          scrolled
            ? 'border-b border-[#1E1E2E] bg-[#0A0A0F]/80 backdrop-blur-md'
            : 'bg-transparent',
        )}
      >
        <nav
          className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
          aria-label="Navigation principale"
        >
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] rounded-md"
            aria-label="Nawa Studio — accueil"
          >
            <span className="h-7 w-7 rounded-lg bg-[#0066FF] flex items-center justify-center shrink-0" aria-hidden>
              <span className="text-white font-bold text-xs tracking-tight leading-none">N</span>
            </span>
            <span className="font-semibold text-[#F8F8FF] tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Nawa Studio
            </span>
          </Link>

          {/* Desktop nav */}
          <ul className="hidden md:flex items-center gap-1" role="list">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    'px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150',
                    'text-[#8B8BA8] hover:text-[#F8F8FF] hover:bg-[#1E1E2E]/60',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF]',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop CTA */}
          <div className="hidden md:flex">
            <Button size="sm" asChild>
              <Link href="#contact">Réserver un appel</Link>
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen((v) => !v)}
            className={cn(
              'md:hidden rounded-md p-2 text-[#8B8BA8] hover:text-[#F8F8FF] hover:bg-[#1E1E2E]',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF]',
            )}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>
      </m.header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <m.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />

            {/* Drawer */}
            <m.div
              key="drawer"
              id="mobile-menu"
              role="dialog"
              aria-label="Menu de navigation"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed right-0 top-0 z-50 h-full w-72 bg-[#111118] border-l border-[#1E1E2E] md:hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between h-16 px-6 border-b border-[#1E1E2E]">
                <span className="font-semibold text-[#F8F8FF]" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Menu
                </span>
                <button
                  type="button"
                  aria-label="Fermer le menu"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md p-1.5 text-[#8B8BA8] hover:text-[#F8F8FF] hover:bg-[#1E1E2E] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Links */}
              <nav className="flex-1 px-4 py-6 flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'px-4 py-3 rounded-lg text-sm font-medium',
                      'text-[#8B8BA8] hover:text-[#F8F8FF] hover:bg-[#1E1E2E]',
                      'transition-colors',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* CTA */}
              <div className="px-4 pb-8">
                <Button className="w-full" onClick={() => setMobileOpen(false)} asChild>
                  <Link href="#contact">Réserver un appel</Link>
                </Button>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

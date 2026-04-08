"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"

interface NavbarProps {
  onOpenOnboarding?: () => void
  onOpenLogin?: () => void
}

const navLinks = [
  { label: "Catalogue", href: "/catalogue" },
  { label: "Espace client", href: "/espace-client" },
]

export function Navbar({ onOpenOnboarding, onOpenLogin }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const handler = () => { if (mq.matches) setMobileOpen(false) }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const isLight = !scrolled && !mobileOpen

  return (
    <header
      className="fixed top-0 inset-x-0 z-40 h-16 flex items-center px-5 sm:px-8"
      style={{
        background: scrolled
          ? "rgba(255,255,255,0.92)"
          : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid #F0ECF8" : "1px solid transparent",
        transition: "background 300ms ease, backdrop-filter 300ms ease, border-color 300ms ease",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }} onClick={() => setMobileOpen(false)}>
        <Logo size="md" light={isLight} />
      </Link>

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-6 ml-10">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: isLight ? "rgba(255,255,255,0.82)" : "#4B5563",
              textDecoration: "none",
              transition: "color 150ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = isLight ? "#FFFFFF" : "#111827")}
            onMouseLeave={(e) => (e.currentTarget.style.color = isLight ? "rgba(255,255,255,0.82)" : "#4B5563")}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Desktop CTA */}
      <div className="hidden md:flex items-center gap-3 ml-auto">
        <button
          onClick={onOpenLogin}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isLight ? "rgba(255,255,255,0.9)" : "#7C63C8",
            padding: "8px 16px",
            borderRadius: 8,
            border: isLight ? "1.5px solid rgba(255,255,255,0.3)" : "1.5px solid #E2DAF6",
            background: "transparent",
            cursor: "pointer",
            transition: "all 150ms",
          }}
          onMouseEnter={(e) => {
            if (isLight) {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.6)"
              e.currentTarget.style.background = "rgba(255,255,255,0.1)"
            } else {
              e.currentTarget.style.borderColor = "#7C63C8"
              e.currentTarget.style.background = "rgba(124,99,200,0.05)"
            }
          }}
          onMouseLeave={(e) => {
            if (isLight) {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"
              e.currentTarget.style.background = "transparent"
            } else {
              e.currentTarget.style.borderColor = "#E2DAF6"
              e.currentTarget.style.background = "transparent"
            }
          }}
        >
          Se connecter
        </button>
        <button
          onClick={onOpenOnboarding}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: isLight ? "#7C63C8" : "white",
            padding: "8px 18px",
            borderRadius: 8,
            background: isLight ? "#FFFFFF" : "#7C63C8",
            border: "none",
            cursor: "pointer",
            transition: "background 150ms, transform 150ms, box-shadow 150ms",
            boxShadow: isLight ? "0 4px 16px rgba(0,0,0,0.2)" : "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isLight ? "#F5F3FF" : "#6B54B2"
            e.currentTarget.style.transform = "translateY(-1px)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isLight ? "#FFFFFF" : "#7C63C8"
            e.currentTarget.style.transform = "translateY(0)"
          }}
        >
          Testez votre agent !
        </button>
      </div>

      {/* Mobile toggle */}
      <button
        className="md:hidden ml-auto"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Menu"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isLight ? "#FFFFFF" : "#111827"}
          strokeWidth="2"
          style={{ transition: "stroke 200ms" }}
        >
          {mobileOpen
            ? <path d="M18 6L6 18M6 6l12 12" />
            : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 0,
            right: 0,
            background: "rgba(255,255,255,0.98)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid #F0ECF8",
            padding: "16px 24px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: "#4B5563",
                textDecoration: "none",
                padding: "8px 0",
              }}
            >
              {link.label}
            </Link>
          ))}
          <div style={{ height: 1, background: "#F0ECF8", margin: "4px 0" }} />
          <button
            onClick={() => { setMobileOpen(false); onOpenLogin?.() }}
            style={{
              textAlign: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "#7C63C8",
              padding: "12px",
              borderRadius: 10,
              border: "1.5px solid #E2DAF6",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Se connecter
          </button>
          <button
            onClick={() => { setMobileOpen(false); onOpenOnboarding?.() }}
            style={{
              textAlign: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "white",
              background: "#7C63C8",
              padding: "12px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
            }}
          >
            Testez votre agent !
          </button>
        </div>
      )}
    </header>
  )
}

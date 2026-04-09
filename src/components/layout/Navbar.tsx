"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"

interface NavbarProps {
  onOpenOnboarding?: () => void
  onOpenLogin?: () => void
}

const navLinks = [
  { label: "Catalogue",      href: "/catalogue" },
  { label: "Espace client",  href: "/espace-client" },
]

export function Navbar({ onOpenOnboarding, onOpenLogin }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const handler = () => { if (mq.matches) setMobileOpen(false) }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4 sm:px-6 sm:pt-5"
      style={{ pointerEvents: "none" }}
    >
      <header
        style={{
          pointerEvents: "auto",
          width: "100%",
          maxWidth: 1120,
          height: 58,
          display: "flex",
          alignItems: "center",
          padding: "0 10px 0 22px",
          borderRadius: 999,
          background: scrolled
            ? "rgba(255,255,255,0.48)"
            : "rgba(255,255,255,0.28)",
          border: "1px solid rgba(226,218,246,0.55)",
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
          boxShadow: scrolled
            ? "0 10px 40px -12px rgba(124,99,200,0.18), inset 0 1px 0 rgba(255,255,255,0.6)"
            : "0 6px 28px -10px rgba(124,99,200,0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
          transition: "background 300ms ease, box-shadow 300ms ease",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }} onClick={() => setMobileOpen(false)}>
          <Logo size="md" light={false} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 ml-8">
          {navLinks.map((link, i) => (
            <span key={link.href} style={{ display: "inline-flex", alignItems: "center" }}>
              {i > 0 && (
                <span
                  aria-hidden
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    background: "rgba(184,174,222,0.6)",
                    margin: "0 4px",
                  }}
                />
              )}
              <Link
                href={link.href}
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#4B5563",
                  textDecoration: "none",
                  padding: "8px 14px",
                  borderRadius: 999,
                  transition: "color 160ms ease, background 160ms ease",
                  fontFamily: "var(--font-inter), sans-serif",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#111827"
                  e.currentTarget.style.background = "rgba(124,99,200,0.06)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#4B5563"
                  e.currentTarget.style.background = "transparent"
                }}
              >
                {link.label}
              </Link>
            </span>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-2 ml-auto">
          <button
            onClick={onOpenLogin}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#7C63C8",
              padding: "9px 18px",
              borderRadius: 999,
              border: "1px solid rgba(124,99,200,0.25)",
              background: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              transition: "all 160ms ease",
              fontFamily: "var(--font-inter), sans-serif",
              letterSpacing: "-0.005em",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(124,99,200,0.08)"
              e.currentTarget.style.borderColor = "rgba(124,99,200,0.45)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.4)"
              e.currentTarget.style.borderColor = "rgba(124,99,200,0.25)"
            }}
          >
            Se connecter
          </button>

          <button
            onClick={onOpenOnboarding}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#FFFFFF",
              padding: "10px 20px",
              borderRadius: 999,
              background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
              border: "1px solid rgba(124,99,200,0.9)",
              cursor: "pointer",
              transition: "transform 160ms ease, box-shadow 160ms ease, filter 160ms ease",
              fontFamily: "var(--font-inter), sans-serif",
              letterSpacing: "-0.005em",
              boxShadow:
                "0 6px 20px -6px rgba(124,99,200,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)"
              e.currentTarget.style.boxShadow =
                "0 10px 28px -8px rgba(124,99,200,0.65), inset 0 1px 0 rgba(255,255,255,0.4)"
              e.currentTarget.style.filter = "brightness(1.04)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow =
                "0 6px 20px -6px rgba(124,99,200,0.55), inset 0 1px 0 rgba(255,255,255,0.35)"
              e.currentTarget.style.filter = "brightness(1)"
            }}
          >
            Testez votre agent
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden ml-auto"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
          style={{
            background: "rgba(124,99,200,0.08)",
            border: "1px solid rgba(124,99,200,0.2)",
            cursor: "pointer",
            padding: 8,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4B5563"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {mobileOpen
              ? <path d="M18 6L6 18M6 6l12 12" />
              : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>

        {/* Mobile menu */}
        {mobileOpen && (
          <div
            style={{
              position: "absolute",
              top: 66,
              left: 0,
              right: 0,
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(18px) saturate(160%)",
              WebkitBackdropFilter: "blur(18px) saturate(160%)",
              border: "1px solid rgba(226,218,246,0.6)",
              borderRadius: 24,
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              boxShadow: "0 20px 60px -20px rgba(124,99,200,0.25)",
            }}
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#4B5563",
                  textDecoration: "none",
                  padding: "11px 14px",
                  borderRadius: 12,
                  fontFamily: "var(--font-inter), sans-serif",
                }}
              >
                {link.label}
              </Link>
            ))}
            <div style={{ height: 1, background: "rgba(240,236,248,0.8)", margin: "6px 4px" }} />
            <button
              onClick={() => { setMobileOpen(false); onOpenLogin?.() }}
              style={{
                textAlign: "center",
                fontSize: 13.5,
                fontWeight: 600,
                color: "#7C63C8",
                padding: "12px",
                borderRadius: 12,
                border: "1px solid rgba(124,99,200,0.25)",
                background: "rgba(124,99,200,0.04)",
                cursor: "pointer",
                fontFamily: "var(--font-inter), sans-serif",
              }}
            >
              Se connecter
            </button>
            <button
              onClick={() => { setMobileOpen(false); onOpenOnboarding?.() }}
              style={{
                textAlign: "center",
                fontSize: 13.5,
                fontWeight: 700,
                color: "white",
                background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                padding: "12px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-inter), sans-serif",
                boxShadow: "0 6px 20px -6px rgba(124,99,200,0.5)",
              }}
            >
              Testez votre agent
            </button>
          </div>
        )}
      </header>
    </div>
  )
}

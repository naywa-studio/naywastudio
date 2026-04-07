"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { Logo } from "@/components/ui/Logo"

const navLinks = [
  { label: "Catalogue", href: "/catalogue" },
  { label: "Espace client", href: "/espace-client" },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
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
    <header
      className="fixed top-0 inset-x-0 z-40 h-16 flex items-center px-5 sm:px-8 transition-all"
      style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: scrolled ? "1px solid #F0ECF8" : "1px solid transparent",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }} onClick={() => setMobileOpen(false)}>
        <Logo size="md" />
      </Link>

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-6 ml-10">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{ fontSize: 14, fontWeight: 500, color: "#4B5563", textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#111827")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#4B5563")}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Desktop CTA */}
      <div className="hidden md:flex items-center gap-3 ml-auto">
        <Link
          href="/espace-client"
          style={{
            fontSize: 13, fontWeight: 600, color: "#7C63C8",
            padding: "8px 16px", borderRadius: 8, border: "1.5px solid #E2DAF6",
            textDecoration: "none", transition: "all 150ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7C63C8"; e.currentTarget.style.background = "rgba(124,99,200,0.05)" }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E2DAF6"; e.currentTarget.style.background = "transparent" }}
        >
          Se connecter
        </Link>
        <Link
          href="/catalogue"
          style={{
            fontSize: 13, fontWeight: 600, color: "white",
            padding: "8px 18px", borderRadius: 8, background: "#7C63C8",
            textDecoration: "none", transition: "background 150ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#6B54B2")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#7C63C8")}
        >
          Voir le catalogue
        </Link>
      </div>

      {/* Mobile toggle */}
      <button
        className="md:hidden ml-auto"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Menu"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
          {mobileOpen
            ? <path d="M18 6L6 18M6 6l12 12" />
            : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          style={{
            position: "absolute", top: 64, left: 0, right: 0,
            background: "rgba(255,255,255,0.98)", backdropFilter: "blur(12px)",
            borderBottom: "1px solid #F0ECF8", padding: "16px 24px 24px",
            display: "flex", flexDirection: "column", gap: 12,
          }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              style={{ fontSize: 15, fontWeight: 500, color: "#4B5563", textDecoration: "none", padding: "8px 0" }}
            >
              {link.label}
            </Link>
          ))}
          <div style={{ height: 1, background: "#F0ECF8", margin: "4px 0" }} />
          <Link
            href="/espace-client"
            onClick={() => setMobileOpen(false)}
            style={{
              textAlign: "center", fontSize: 14, fontWeight: 600, color: "#7C63C8",
              padding: "12px", borderRadius: 10, border: "1.5px solid #E2DAF6",
              textDecoration: "none",
            }}
          >
            Se connecter
          </Link>
          <Link
            href="/catalogue"
            onClick={() => setMobileOpen(false)}
            style={{
              textAlign: "center", fontSize: 14, fontWeight: 600, color: "white",
              background: "#7C63C8", padding: "12px", borderRadius: 10,
              textDecoration: "none",
            }}
          >
            Voir le catalogue
          </Link>
        </div>
      )}
    </header>
  )
}

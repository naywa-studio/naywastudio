"use client"
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Logo } from "@/components/ui/Logo"
import { getSupabase } from "@/lib/supabase"

const navLinks = [
  { label: "Comment ça marche", href: "/comment-ca-marche" },
  { label: "Tarifs",            href: "/tarifs" },
  { label: "FAQ",               href: "/faq" },
  { label: "Contact",           href: "/contact" },
]

interface AuthState {
  loading:   boolean
  email:     string | null
  initial:   string
}

export function Navbar() {
  const router = useRouter()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [auth, setAuth] = useState<AuthState>({ loading: true, email: null, initial: "" })
  const profileRef = useRef<HTMLDivElement>(null)

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

  // Detect auth session + listen for sign-in/sign-out
  useEffect(() => {
    const sb = getSupabase()
    const apply = (email: string | null) => {
      setAuth({
        loading: false,
        email,
        initial: email ? email.charAt(0).toUpperCase() : "",
      })
    }
    sb.auth.getSession().then(({ data: { session } }) => apply(session?.user.email ?? null))
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => apply(session?.user.email ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileOpen) return
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [profileOpen])

  const handleLogout = async () => {
    setProfileOpen(false)
    await getSupabase().auth.signOut()
    router.push("/")
  }

  const isAuthed = !auth.loading && !!auth.email

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
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px 0 22px",
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
        {/* LEFT: logo + nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, minWidth: 0 }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-flex" }} onClick={() => setMobileOpen(false)}>
            <Logo size="lg" markOnly />
          </Link>

          {/* Desktop nav */}
          <nav className="nv-desktop-nav" style={{ display: "flex", alignItems: "center", gap: 2 }}>
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
        </div>

        {/* RIGHT: desktop CTAs — auth-aware */}
        <div className="nv-desktop-cta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {auth.loading ? (
            // Skeleton placeholder while session loads (avoids flash)
            <div style={{ width: 220, height: 38 }} />
          ) : isAuthed ? (
            <>
              <Link
                href="/workspace"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  padding: "10px 20px",
                  borderRadius: 999,
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  border: "1px solid rgba(124,99,200,0.9)",
                  textDecoration: "none",
                  transition: "transform 160ms ease, box-shadow 160ms ease",
                  fontFamily: "var(--font-inter), sans-serif",
                  letterSpacing: "-0.005em",
                  boxShadow: "0 6px 20px -6px rgba(124,99,200,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)" }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)" }}
              >
                Mon workspace →
              </Link>

              <div style={{ position: "relative" }} ref={profileRef}>
                <button
                  onClick={() => setProfileOpen((o) => !o)}
                  aria-label="Profil"
                  style={{
                    width: 38, height: 38, borderRadius: "50%",
                    border: "1px solid rgba(124,99,200,0.30)",
                    background: "linear-gradient(135deg, #F0ECF8 0%, #E2DAF6 100%)",
                    color: "#7C63C8",
                    fontSize: 14, fontWeight: 700,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-inter), sans-serif",
                    transition: "border-color 150ms",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(124,99,200,0.55)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(124,99,200,0.30)" }}
                >
                  {auth.initial}
                </button>
                {profileOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 48,
                      right: 0,
                      minWidth: 220,
                      background: "white",
                      border: "1px solid #F0ECF8",
                      borderRadius: 12,
                      boxShadow: "0 12px 32px rgba(124,99,200,0.18)",
                      padding: 6,
                      fontFamily: "var(--font-inter), sans-serif",
                    }}
                  >
                    <div style={{
                      padding: "10px 12px 10px",
                      borderBottom: "1px solid #F0ECF8",
                      marginBottom: 4,
                    }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        Connecté en tant que
                      </p>
                      <p style={{
                        margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: "#111827",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {auth.email}
                      </p>
                    </div>
                    <Link
                      href="/workspace"
                      onClick={() => setProfileOpen(false)}
                      style={{ display: "block", padding: "9px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#374151", textDecoration: "none", transition: "background 150ms" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#F8F6FF" }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                    >
                      Mon workspace
                    </Link>
                    <button
                      onClick={handleLogout}
                      style={{
                        display: "block", width: "100%", padding: "9px 12px",
                        borderRadius: 8, fontSize: 13, fontWeight: 500,
                        color: "#EF4444", background: "transparent", border: "none",
                        textAlign: "left", cursor: "pointer",
                        fontFamily: "inherit", transition: "background 150ms",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.06)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                    >
                      Se déconnecter
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#7C63C8",
                  padding: "9px 18px",
                  borderRadius: 999,
                  border: "1px solid rgba(124,99,200,0.25)",
                  background: "rgba(255,255,255,0.4)",
                  textDecoration: "none",
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
              </Link>

              <Link
                href="/login?mode=signup"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  padding: "10px 20px",
                  borderRadius: 999,
                  background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                  border: "1px solid rgba(124,99,200,0.9)",
                  textDecoration: "none",
                  transition: "transform 160ms ease, box-shadow 160ms ease",
                  fontFamily: "var(--font-inter), sans-serif",
                  letterSpacing: "-0.005em",
                  boxShadow: "0 6px 20px -6px rgba(124,99,200,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)" }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)" }}
              >
                Créer un compte
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="nv-mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
          style={{
            background: "rgba(124,99,200,0.08)",
            border: "1px solid rgba(124,99,200,0.2)",
            cursor: "pointer",
            padding: 8,
            borderRadius: 999,
            display: "none",
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

            {isAuthed ? (
              <>
                <Link
                  href="/workspace"
                  onClick={() => setMobileOpen(false)}
                  style={{
                    textAlign: "center",
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "white",
                    background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    padding: "12px",
                    borderRadius: 12,
                    textDecoration: "none",
                    fontFamily: "var(--font-inter), sans-serif",
                    boxShadow: "0 6px 20px -6px rgba(124,99,200,0.5)",
                  }}
                >
                  Mon workspace →
                </Link>
                <p style={{
                  margin: "8px 4px 0", fontSize: 11, color: "#9CA3AF",
                  fontFamily: "var(--font-inter), sans-serif",
                }}>
                  Connecté en tant que <strong style={{ color: "#374151" }}>{auth.email}</strong>
                </p>
                <button
                  onClick={() => { setMobileOpen(false); handleLogout() }}
                  style={{
                    textAlign: "center",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#EF4444",
                    padding: "10px",
                    borderRadius: 12,
                    border: "1px solid rgba(239,68,68,0.20)",
                    background: "transparent",
                    cursor: "pointer",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  Se déconnecter
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  style={{
                    textAlign: "center",
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "#7C63C8",
                    padding: "12px",
                    borderRadius: 12,
                    border: "1px solid rgba(124,99,200,0.25)",
                    background: "rgba(124,99,200,0.04)",
                    textDecoration: "none",
                    fontFamily: "var(--font-inter), sans-serif",
                  }}
                >
                  Se connecter
                </Link>
                <Link
                  href="/login?mode=signup"
                  onClick={() => setMobileOpen(false)}
                  style={{
                    textAlign: "center",
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "white",
                    background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    padding: "12px",
                    borderRadius: 12,
                    textDecoration: "none",
                    fontFamily: "var(--font-inter), sans-serif",
                    boxShadow: "0 6px 20px -6px rgba(124,99,200,0.5)",
                  }}
                >
                  Créer un compte
                </Link>
              </>
            )}
          </div>
        )}
      </header>

      <style jsx global>{`
        .nv-desktop-nav,
        .nv-desktop-cta {
          display: flex;
        }
        @media (max-width: 1023px) {
          .nv-desktop-nav,
          .nv-desktop-cta {
            display: none !important;
          }
          .nv-mobile-toggle {
            display: inline-flex !important;
          }
        }
      `}</style>
    </div>
  )
}

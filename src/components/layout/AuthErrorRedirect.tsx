"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * When Supabase redirects after an auth flow (signup confirm, magic link,
 * password reset…) and the OTP has expired or is invalid, it lands on the
 * Site URL ("/") with `?error=access_denied&error_code=...` params. We
 * detect those params on the home page and bounce the user to /login with
 * a clean message instead of leaving them on a confused-looking homepage.
 */
export default function AuthErrorRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === "undefined") return
    const search = window.location.search
    const hash = window.location.hash

    const hasErrorIn = (s: string) =>
      s.includes("error=access_denied") ||
      s.includes("error_code=otp_expired") ||
      s.includes("error_code=otp_invalid")

    if (hasErrorIn(search) || hasErrorIn(hash)) {
      router.replace("/login?expired=1")
    }
  }, [router])

  return null
}

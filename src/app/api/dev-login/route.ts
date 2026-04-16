/**
 * DEV ONLY — Auto-login route for local Docker preview testing.
 * Only works in development (NODE_ENV !== "production").
 *
 * Usage: GET http://localhost:3000/api/dev-login?secret=NawaDevLogin2026
 * Signs in via Supabase REST API, sets session cookies, redirects to /workspace.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

const DEV_SECRET = "NawaDevLogin2026"
const DEV_EMAIL = "elyas.malki1003@gmail.com"
const DEV_PASSWORD = "NawaTest2026!"

export async function GET(req: NextRequest) {
  // ── Block in production ────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 })
  }

  const secret = req.nextUrl.searchParams.get("secret")
  if (secret !== DEV_SECRET) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px">
        <h2>❌ Secret invalide</h2>
        <p>Utilise <code>/api/dev-login?secret=NawaDevLogin2026</code></p>
      </body></html>`,
      { status: 401, headers: { "Content-Type": "text/html" } }
    )
  }

  // ── Sign in via Supabase REST (password we set via admin) ─────────────────
  const tokenRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
    }
  )

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px">
        <h2>❌ Login échoué</h2><pre>${err}</pre>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    )
  }

  const { access_token, refresh_token } = await tokenRes.json() as {
    access_token: string
    refresh_token: string
  }

  // ── Set session cookies via Supabase SSR ──────────────────────────────────
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, { ...options, sameSite: "lax", httpOnly: false })
          }
        },
      },
    }
  )

  await sb.auth.setSession({ access_token, refresh_token })

  // ── Redirect to workspace ─────────────────────────────────────────────────
  return NextResponse.redirect(new URL("/workspace", req.url))
}

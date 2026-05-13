import { NextResponse } from "next/server"

// Legacy extension landing. The Chrome extension has been retired —
// redirect anyone hitting this URL to the workspace.
export function GET() {
  return NextResponse.redirect(new URL("/workspace/vivier", "https://nawastudio.com"), 308)
}

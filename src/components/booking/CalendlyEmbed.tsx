"use client"

/** Inline Calendly scheduling widget — loads the Calendly script once and
 *  mounts the embed for the given scheduling URL. */

import { useEffect, useRef } from "react"

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (opts: { url: string; parentElement: HTMLElement }) => void
    }
  }
}

const SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js"

export default function CalendlyEmbed({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return

    function init() {
      if (host && window.Calendly) {
        host.innerHTML = ""
        window.Calendly.initInlineWidget({ url, parentElement: host })
      }
    }

    if (window.Calendly) {
      init()
      return
    }

    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (!script) {
      script = document.createElement("script")
      script.src = SCRIPT_SRC
      script.async = true
      document.body.appendChild(script)
    }
    script.addEventListener("load", init)
    return () => script?.removeEventListener("load", init)
  }, [url])

  return <div ref={ref} style={{ minWidth: 320, height: 700 }} />
}

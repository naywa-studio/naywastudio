"use client"
import { m } from "framer-motion"

export default function ChoiceButtons({
  choices, onSelect
}: { choices: string[]; onSelect: (c: string) => void }) {
  return (
    <m.div
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.3 }}
    >
      {choices.map((c) => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            border: "1.5px solid #E2DAF6",
            backgroundColor: "#FFFFFF",
            color: "#111827",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "left",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            transition: "all 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#7C63C8"
            e.currentTarget.style.color = "#7C63C8"
            e.currentTarget.style.background = "#F8F5FF"
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(124,99,200,0.12)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#E2DAF6"
            e.currentTarget.style.color = "#111827"
            e.currentTarget.style.background = "#FFFFFF"
            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"
          }}
        >
          {c}
        </button>
      ))}
    </m.div>
  )
}

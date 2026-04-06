"use client"
import { m } from "framer-motion"

export default function ChoiceButtons({
  choices, onSelect
}: { choices: string[]; onSelect: (c: string) => void }) {
  return (
    <m.div
      className="flex flex-wrap gap-2"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
    >
      {choices.map(c => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          style={{
            padding: "8px 16px",
            borderRadius: 100,
            border: "1px solid #E2DAF6",
            backgroundColor: "#FFFFFF",
            color: "#111827",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 150ms",
          }}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.borderColor = "#7C63C8"
            ;(e.target as HTMLButtonElement).style.color = "#7C63C8"
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.borderColor = "#E2DAF6"
            ;(e.target as HTMLButtonElement).style.color = "#111827"
          }}
        >{c}</button>
      ))}
    </m.div>
  )
}

"use client"
import { m } from "framer-motion"

export default function ChatMessage({
  from, text, isTyping = false
}: { from: "agent" | "user"; text: string; isTyping?: boolean }) {
  const isAgent = from === "agent"
  return (
    <m.div
      className={`flex ${isAgent ? "justify-start" : "justify-end"}`}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "10px 14px",
          borderRadius: isAgent ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
          backgroundColor: isAgent ? "#F8F6FF" : "#7C63C8",
          color: isAgent ? "#111827" : "#FFFFFF",
          fontSize: 14,
          lineHeight: 1.5,
          border: isAgent ? "1px solid #E2DAF6" : "none",
        }}
      >
        {isTyping ? (
          <span style={{ letterSpacing: 3, color: "#B8AEDE" }}>•••</span>
        ) : text}
      </div>
    </m.div>
  )
}

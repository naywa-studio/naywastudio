"use client"

import Image from "next/image"

type LeoState = "idle" | "observation" | "thinking"

interface LeoAvatarProps {
  state?: LeoState
  size?: number
}

const SRC: Record<LeoState, string> = {
  idle:        "/agents/leo-idle.png",
  observation: "/agents/leo-search.png",
  thinking:    "/agents/leo-run.png",
}

const ALT: Record<LeoState, string> = {
  idle:        "Léo au repos",
  observation: "Léo observe votre message",
  thinking:    "Léo génère une réponse",
}

export function LeoAvatar({ state = "idle", size = 56 }: LeoAvatarProps) {
  return (
    <>
      <div
        className="leo-avatar-wrap"
        aria-label={ALT[state]}
        role="img"
        style={{ width: size, height: size, position: "relative", flexShrink: 0 }}
      >
        {(["idle", "observation", "thinking"] as LeoState[]).map(s => (
          <Image
            key={s}
            src={SRC[s]}
            alt={ALT[s]}
            width={size}
            height={size}
            className={`leo-avatar-img ${state === s ? "leo-visible" : "leo-hidden"}`}
            style={{ position: "absolute", inset: 0, objectFit: "contain" }}
            priority={s === "idle"}
          />
        ))}
      </div>

      <style>{`
        .leo-avatar-img {
          transition: opacity 250ms ease, transform 250ms ease;
          border-radius: 50%;
        }
        .leo-visible {
          opacity: 1;
          transform: scale(1);
        }
        .leo-hidden {
          opacity: 0;
          transform: scale(0.9);
          pointer-events: none;
        }
      `}</style>
    </>
  )
}

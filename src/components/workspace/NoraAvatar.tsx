"use client"

import Image from "next/image"

type NoraState = "idle" | "observation" | "thinking"

interface NoraAvatarProps {
  state?: NoraState
  size?: number
}

const SRC: Record<NoraState, string> = {
  idle:        "/agents/nora-idle.png",
  observation: "/agents/nora-search.png",
  thinking:    "/agents/nora-run.png",
}

const ALT: Record<NoraState, string> = {
  idle:        "Nora au repos",
  observation: "Nora observe votre message",
  thinking:    "Nora génère une réponse",
}

export function NoraAvatar({ state = "idle", size = 56 }: NoraAvatarProps) {
  return (
    <>
      <div
        className="nora-avatar-wrap"
        aria-label={ALT[state]}
        role="img"
        style={{ width: size, height: size, position: "relative", flexShrink: 0 }}
      >
        {(["idle", "observation", "thinking"] as NoraState[]).map(s => (
          <Image
            key={s}
            src={SRC[s]}
            alt={ALT[s]}
            width={size}
            height={size}
            className={`nora-avatar-img ${state === s ? "nora-visible" : "nora-hidden"}`}
            style={{ position: "absolute", inset: 0, objectFit: "contain" }}
            priority={s === "idle"}
          />
        ))}
      </div>

      <style>{`
        .nora-avatar-img {
          transition: opacity 250ms ease, transform 250ms ease;
          border-radius: 50%;
        }
        .nora-visible {
          opacity: 1;
          transform: scale(1);
          filter:
            drop-shadow(0px 10px 18px rgba(59, 130, 246, 0.30))
            drop-shadow(0px 3px 6px rgba(0, 0, 0, 0.18))
            drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.12));
        }
        .nora-hidden {
          opacity: 0;
          transform: scale(0.9);
          pointer-events: none;
        }
      `}</style>
    </>
  )
}

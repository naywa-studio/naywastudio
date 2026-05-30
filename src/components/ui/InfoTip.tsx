"use client"

/**
 * InfoTip — petite infobulle stylisée conforme au design system Naywa.
 *
 * Trigger : une icône ⓘ inline (ou un label custom via `children`) qui révèle
 * une bulle au survol et au focus clavier (accessible). Pas de JS de
 * positionnement : la bulle est en `position: absolute` centrée au-dessus du
 * trigger, avec une petite flèche.
 *
 * Usage :
 *   <InfoTip text="Définition de TJM…" />
 *   <InfoTip text="…">Label cliquable</InfoTip>
 */

import type React from "react"

interface Props {
  /** Contenu de l'infobulle (texte simple). */
  text: string
  /** Trigger optionnel — par défaut, simple icône ⓘ. */
  children?: React.ReactNode
  /** Taille de l'icône (px). */
  size?: number
}

export default function InfoTip({ text, children, size = 12 }: Props) {
  return (
    <span className="ntip">
      {children ? (
        <>
          {children}
          <span className="ntip-icon" aria-hidden style={{ fontSize: size }}>ⓘ</span>
        </>
      ) : (
        <span
          className="ntip-icon"
          tabIndex={0}
          role="button"
          aria-label="Plus d'infos"
          style={{ fontSize: size }}
        >
          ⓘ
        </span>
      )}
      <span className="ntip-bubble" role="tooltip">
        {text}
        <span className="ntip-arrow" aria-hidden />
      </span>
      <style jsx>{`
        .ntip {
          position: relative;
          display: inline-flex;
          align-items: baseline;
          gap: 4px;
          cursor: help;
        }
        .ntip-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #B8AEDE;
          font-weight: 400;
          line-height: 1;
          transition: color 160ms ease;
          outline: none;
        }
        .ntip:hover .ntip-icon,
        .ntip-icon:focus-visible {
          color: #7C63C8;
        }
        .ntip-bubble {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 8px);
          transform: translateX(-50%) translateY(4px);
          min-width: 200px;
          max-width: 280px;
          padding: 9px 12px;
          background: #FFFFFF;
          border: 1px solid #E9E2F7;
          border-radius: 10px;
          box-shadow: 0 6px 24px rgba(124, 99, 200, 0.14), 0 1px 2px rgba(17, 24, 39, 0.04);
          font-family: var(--font-inter), system-ui, sans-serif;
          font-size: 11.5px;
          font-weight: 400;
          color: #374151;
          line-height: 1.5;
          letter-spacing: normal;
          text-transform: none;
          text-align: left;
          white-space: normal;
          opacity: 0;
          pointer-events: none;
          transition: opacity 160ms ease, transform 160ms ease;
          z-index: 100;
        }
        .ntip:hover .ntip-bubble,
        .ntip-icon:focus-visible ~ .ntip-bubble,
        .ntip:focus-within .ntip-bubble {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        .ntip-arrow {
          position: absolute;
          left: 50%;
          top: 100%;
          transform: translateX(-50%);
          width: 10px;
          height: 6px;
          background: #FFFFFF;
          clip-path: polygon(0 0, 100% 0, 50% 100%);
          filter: drop-shadow(0 1px 0 #E9E2F7);
        }
      `}</style>
    </span>
  )
}

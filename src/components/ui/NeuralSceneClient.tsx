'use client'

import dynamic from 'next/dynamic'

const NeuralScene = dynamic(() => import('./NeuralScene'), { ssr: false })

export function NeuralSceneClient() {
  return <NeuralScene />
}

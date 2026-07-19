/**
 * Remplace les hex bruts de l'app connectée par les variables CSS `--nw-*`.
 *
 * Lexical et sans état : un hex → une variable. Aucune logique n'est touchée,
 * seules des chaînes de couleur changent.
 *
 * Exclusions (var() n'y est pas résoluble ou casserait un calcul) :
 *   · BrandColorPicker.tsx  → fait du parsing hex (parseInt base 16)
 *   · anonymize/*           → alimente @react-pdf, qui ignore var()
 */
const fs = require('fs')
const path = require('path')

const ROOTS = [
  'src/app/workspace',
  'src/app/organisation',
  'src/app/admin',
  'src/app/nouveautes',
  'src/components/workspace',
  'src/components/organisation',
  'src/components/quota',
  'src/components/updates',
  'src/components/trial',
  'src/components/support',
]

const EXCLUDE = [
  'BrandColorPicker.tsx',
  path.join('anonymize', 'AnonymizeControls.tsx'),
  path.join('anonymize', 'types.ts'),
]

// Ordre sans importance : les clés sont disjointes.
const MAP = {
  '#6B7280': '--nw-text-muted',
  '#9CA3AF': '--nw-text-muted',
  '#111827': '--nw-text',
  '#374151': '--nw-text-body',
  '#4B5563': '--nw-text-secondary',

  '#7C63C8': '--nw-primary',
  '#6B54B2': '--nw-primary-dark',
  '#C4B6E0': '--nw-primary-200',
  '#E2DAF6': '--nw-primary-100',
  '#EEE9FB': '--nw-primary-50',

  '#E5E7EB': '--nw-border',
  '#F0ECF8': '--nw-border-soft',
  '#D1D5DB': '--nw-border',

  '#F8F6FF': '--nw-bg',
  '#FAFAFA': '--nw-surface-muted',
  '#F3F4F6': '--nw-neutral-100',

  '#15803D': '--nw-success',
  '#B45309': '--nw-warn',
  '#92400E': '--nw-warn-strong',
  '#B91C1C': '--nw-danger-strong',
  '#DC2626': '--nw-danger-strong',
  '#FECACA': '--nw-danger-border',
}

// Un seul passage : alternance de tous les hex, insensible à la casse.
const RE = new RegExp(Object.keys(MAP).join('|'), 'gi')
const LOOKUP = Object.fromEntries(
  Object.entries(MAP).map(([hex, v]) => [hex.toLowerCase(), v]),
)

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p)
  }
  return out
}

let files = 0
let hits = 0

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (EXCLUDE.some((x) => file.endsWith(x))) continue
    const src = fs.readFileSync(file, 'utf8')
    let n = 0
    const next = src.replace(RE, (m) => {
      const v = LOOKUP[m.toLowerCase()]
      if (!v) return m
      n++
      return `var(${v})`
    })
    if (n > 0) {
      fs.writeFileSync(file, next)
      files++
      hits += n
    }
  }
}

console.log(`${hits} couleurs remplacées dans ${files} fichiers.`)

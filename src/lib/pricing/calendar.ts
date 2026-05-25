/**
 * Naywa Pricing — Calendrier réel français.
 *
 * Calcule les jours travaillés (lundi-vendredi minus jours fériés) sur
 * une période donnée, en utilisant la liste officielle des 11 jours fériés
 * français. Pâques (et donc Lundi Pâques, Ascension, Lundi Pentecôte) est
 * calculée via l'algorithme de Gauss.
 *
 * Utilisé par MonthlyMarginChart pour calculer la marge mois par mois sur
 * la durée réelle de la mission, en tenant compte des creux d'août, des
 * fériés de mai/novembre, etc.
 *
 * Pas de prise en compte des CP du candidat dans cette V1 — on suppose
 * qu'il travaille tous les jours ouvrés. Les CP seront ajoutés plus tard
 * comme paramètre par mois (ex : 5 CP en août).
 */

/* ──────────────────────────────────────────────────────────────────────────
 * Easter (algorithme de Gauss) — base pour les fériés religieux mobiles
 * ────────────────────────────────────────────────────────────────────────── */

/** Retourne la date du dimanche de Pâques pour une année donnée. */
function easterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)        // 3 = mars, 4 = avril
  const day = (h + l - 7 * m + 114) % 31 + 1
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/* ──────────────────────────────────────────────────────────────────────────
 * Jours fériés français — 11 jours
 * ────────────────────────────────────────────────────────────────────────── */

/** Retourne la liste des jours fériés français pour une année donnée.
 *  Inclut les 11 jours fériés légaux (Alsace-Moselle ignorée). */
export function frenchHolidays(year: number): Date[] {
  const easter = easterDate(year)
  return [
    new Date(year, 0,  1),    // Nouvel An (1er janvier)
    addDays(easter, 1),       // Lundi de Pâques
    new Date(year, 4,  1),    // Fête du Travail (1er mai)
    new Date(year, 4,  8),    // Victoire 1945 (8 mai)
    addDays(easter, 39),      // Jeudi de l'Ascension (Pâques + 39)
    addDays(easter, 50),      // Lundi de Pentecôte (Pâques + 50)
    new Date(year, 6, 14),    // Fête nationale (14 juillet)
    new Date(year, 7, 15),    // Assomption (15 août)
    new Date(year, 10, 1),    // Toussaint (1er novembre)
    new Date(year, 10, 11),   // Armistice 1918 (11 novembre)
    new Date(year, 11, 25),   // Noël (25 décembre)
  ]
}

/** Vrai si la date donnée est un jour férié français de cette année. */
function isFrenchHoliday(date: Date, holidayCache: Map<number, Date[]>): boolean {
  const year = date.getFullYear()
  let holidays = holidayCache.get(year)
  if (!holidays) {
    holidays = frenchHolidays(year)
    holidayCache.set(year, holidays)
  }
  const d = date.getDate()
  const m = date.getMonth()
  return holidays.some((h) => h.getDate() === d && h.getMonth() === m)
}

/** Vrai si la date est un samedi ou dimanche. */
function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

/* ──────────────────────────────────────────────────────────────────────────
 * Working days — équivalent NETWORKDAYS.INTL d'Excel
 * ────────────────────────────────────────────────────────────────────────── */

/** Compte les jours travaillés (Lun-Ven hors fériés français) entre
 *  startDate et endDate inclus. */
export function workingDaysInRange(startDate: Date, endDate: Date): number {
  if (endDate < startDate) return 0
  const cache = new Map<number, Date[]>()
  let count = 0
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  const stop = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
  while (cursor <= stop) {
    if (!isWeekend(cursor) && !isFrenchHoliday(cursor, cache)) {
      count++
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

/* ──────────────────────────────────────────────────────────────────────────
 * Profile mensuel — pour le chart MonthlyMargin
 * ────────────────────────────────────────────────────────────────────────── */

export interface MonthProfile {
  /** Index 1..N du mois dans la mission. */
  monthIndex: number
  /** Premier jour du mois utilisé (start de la mission pour le mois 1, sinon 1er du mois). */
  firstDay: Date
  /** Dernier jour du mois utilisé (fin de mission pour le dernier mois, sinon dernier du mois). */
  lastDay: Date
  /** Nombre de jours travaillés (Lun-Ven hors fériés français) dans cette plage. */
  workingDays: number
  /** Année calendaire (pour affichage). */
  year: number
  /** Mois calendaire 0..11 (pour affichage). */
  calendarMonth: number
  /** Vrai si le mois est partiel (début ou fin de mission mi-mois). */
  isPartial: boolean
}

/** Génère le profil mois par mois pour une mission qui démarre à `startDate`
 *  et dure `durationMonths` mois calendaires.
 *
 *  Gère les mois partiels : si la mission démarre le 15/11, le 1er mois
 *  compte les jours travaillés du 15/11 au 30/11. Si elle finit le 15/12
 *  (par exemple 1.5 mois plus tard), le dernier mois compte du 1/12 au 15/12.
 *
 *  Pour simplifier, on considère que la mission dure exactement
 *  `durationMonths` mois calendaires, soit jusqu'au (startDate + durationMonths
 *  mois − 1 jour). Ainsi 25 mois à partir du 01/11/2024 finit le 31/11/2026. */
export function missionMonthProfile(startDate: Date, durationMonths: number): MonthProfile[] {
  if (durationMonths <= 0) return []

  // Date de fin = startDate + durationMonths mois - 1 jour
  // Ex : 01/11/2024 + 25 mois - 1 jour = 30/11/2026
  const endDate = new Date(startDate)
  endDate.setMonth(endDate.getMonth() + durationMonths)
  endDate.setDate(endDate.getDate() - 1)

  const profiles: MonthProfile[] = []
  let monthIndex = 1
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())

  while (cursor <= endDate) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    // Premier jour du mois utilisé = cursor (premier jour de la mission ce mois-là)
    const firstDay = new Date(cursor)
    // Dernier jour du mois calendaire
    const lastDayOfMonth = new Date(year, month + 1, 0)
    // Dernier jour utilisé = min(lastDayOfMonth, endDate)
    const lastDay = lastDayOfMonth < endDate ? lastDayOfMonth : endDate
    // Mois partiel si on n'a pas commencé le 1er OU on ne finit pas le dernier du mois
    const isPartial =
      firstDay.getDate() !== 1 || lastDay.getTime() !== lastDayOfMonth.getTime()

    const workingDays = workingDaysInRange(firstDay, lastDay)

    profiles.push({
      monthIndex,
      firstDay,
      lastDay,
      workingDays,
      year,
      calendarMonth: month,
      isPartial,
    })

    // Avance au 1er du mois suivant
    cursor.setFullYear(year)
    cursor.setMonth(month + 1)
    cursor.setDate(1)
    monthIndex++
  }
  return profiles
}

/** Convenience : pour afficher "Nov 2024" depuis un index calendaire 0..11. */
export const MONTH_ABBR_FR = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc',
]

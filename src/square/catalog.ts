import { BarChart3, BookOpen, CalendarCheck2, GlassWater, Map, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { bundles } from './works/bundles'

export interface SquareBundle {
  files: Record<string, string>
  js: string
  css: string
}

export type SquareId = keyof typeof bundles

export interface SquareWork {
  id: SquareId
  icon: LucideIcon
  tone: 'mint' | 'blue' | 'orange' | 'lavender' | 'yellow' | 'cyan'
  category: 'productivity' | 'finance' | 'life' | 'study'
  /** Sources and compiled output; loaded on first use so the app bundle stays small. */
  load: () => Promise<SquareBundle>
}

/** Works shipped with the app. Names and descriptions are the i18n keys `square.<id>.name|description`. */
const works: readonly Omit<SquareWork, 'load'>[] = [
  { id: 'focus', icon: Timer, tone: 'mint', category: 'productivity' },
  { id: 'ledger', icon: BarChart3, tone: 'blue', category: 'finance' },
  { id: 'habit', icon: CalendarCheck2, tone: 'orange', category: 'productivity' },
  { id: 'travel', icon: Map, tone: 'lavender', category: 'life' },
  { id: 'words', icon: BookOpen, tone: 'yellow', category: 'study' },
  { id: 'water', icon: GlassWater, tone: 'cyan', category: 'life' },
]

export const squareWorks: readonly SquareWork[] = works.map((work) => ({ ...work, load: bundles[work.id] }))

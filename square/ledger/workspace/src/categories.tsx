import { isZh } from './i18n'

export type CategoryId = 'food' | 'transport' | 'shopping' | 'housing' | 'fun' | 'other' | 'salary' | 'bonus'

interface Category {
  id: CategoryId
  /** SVG path data, drawn on a 24px grid. */
  icon: string[]
  label: readonly [string, string]
}

const circle = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`

export const EXPENSE_CATEGORIES: readonly Category[] = [
  { id: 'food', label: ['餐饮', 'Food'], icon: ['M4 3v7a3 3 0 0 0 6 0V3', 'M7 3v18', 'M20 3v18', 'M20 12h-3V7a4 4 0 0 1 3-4'] },
  { id: 'transport', label: ['交通', 'Transport'], icon: ['M4 16V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10', 'M2 16h20', 'M4 10h16', 'M12 5v5', 'M7 20v-4', 'M17 20v-4'] },
  { id: 'shopping', label: ['购物', 'Shopping'], icon: ['M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z', 'M9 11V6a3 3 0 0 1 6 0v5'] },
  { id: 'housing', label: ['居住', 'Home'], icon: ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M10 20v-6h4v6'] },
  { id: 'fun', label: ['娱乐', 'Fun'], icon: ['M7 7h10a4 4 0 0 1 4 4v3.5a2.5 2.5 0 0 1-4.3 1.7L15 14.5H9l-1.7 1.7A2.5 2.5 0 0 1 3 14.5V11a4 4 0 0 1 4-4z', 'M8 10v4', 'M6 12h4', circle(15.5, 11.5, 0.5), circle(17.5, 13.5, 0.5)] },
  { id: 'other', label: ['其他', 'Other'], icon: [circle(12, 12, 9), circle(7, 12, 0.5), circle(12, 12, 0.5), circle(17, 12, 0.5)] },
]

export const INCOME_CATEGORIES: readonly Category[] = [
  { id: 'salary', label: ['工资', 'Salary'], icon: ['M2 8a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z', circle(12, 12, 2.5), circle(6.5, 12, 0.5), circle(17.5, 12, 0.5)] },
  { id: 'bonus', label: ['奖金', 'Bonus'], icon: ['M3 8h18v4H3z', 'M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8', 'M12 8v13', 'M12 8a3 3 0 1 0-3-3c0 1.5 1.5 3 3 3z', 'M12 8a3 3 0 1 1 3-3c0 1.5-1.5 3-3 3z'] },
  { id: 'other', label: ['其他', 'Other'], icon: [circle(9, 9, 6), 'M9 6v6', 'M7.2 7.5h2.7a1.3 1.3 0 0 1 0 2.6H8.1a1.3 1.3 0 0 0 0 2.6h2.7', 'M14.2 6.3A6 6 0 1 1 8.9 15'] },
]

const ALL: readonly Category[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]

export const CATEGORY_IDS: readonly string[] = ALL.map((category) => category.id)

/** Localised name and icon of a category id that has been validated by `parseEntries`. */
export function category(id: string): Category {
  return ALL.find((item) => item.id === id) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]
}

export const categoryLabel = (id: string) => {
  const item = category(id)
  return item.label[isZh ? 0 : 1]
}

/** Inline SVG icon, 20px, stroked; decorative, so hidden from assistive technology. */
export function Icon({ d }: { d: readonly string[] }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}

export const GLYPHS = {
  left: ['M15 5l-7 7 7 7'],
  right: ['M9 5l7 7-7 7'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v5', 'M14 11v5'],
} as const

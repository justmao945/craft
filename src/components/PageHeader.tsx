import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

/**
 * Header of a secondary page: back control, centered title, optional trailing control. Both
 * side columns share one width, so the title stays centered whichever side is used.
 */
export function PageHeader({ title, subtitle, backLabel, onBack, backDisabled, trailing }: {
  title: string
  subtitle?: string
  backLabel: string
  onBack: () => void
  backDisabled?: boolean
  trailing?: ReactNode
}) {
  return <header className="page-header">
    <button className="page-back" aria-label={backLabel} disabled={backDisabled} onClick={onBack}><ChevronLeft size={26} /></button>
    <div className="page-header-copy">
      <h1>{title}</h1>
      {subtitle && <small>{subtitle}</small>}
    </div>
    {trailing ?? <span className="page-header-spacer" />}
  </header>
}

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

type Variant = 'primary' | 'token' | 'secondary' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
}

// Receitas do Design System NexaView — alvo tátil 44px, transição e focus ring sempre.
const BASE = 'inline-flex min-h-[44px] items-center justify-center gap-2 text-sm font-semibold transition ease-nexa focus-visible:outline-none focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

const VARIANTS: Record<Variant, string> = {
  // ação principal — pill âmbar com texto escuro
  primary: 'rounded-full bg-primary px-4 py-2.5 text-on-primary shadow-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/50',
  // primário em bloco (token)
  token: 'rounded-xl bg-primary px-4 py-3.5 text-on-primary shadow-md hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/50',
  // secundário / ghost
  secondary: 'rounded-xl border border-outline bg-surface-container-lowest px-4 py-2.5 text-on-surface hover:bg-surface-container-low focus-visible:ring-2 focus-visible:ring-primary/40',
  // perigo sutil — tinta sobre a superfície do tema, para funcionar no escuro
  danger: 'rounded-xl border border-risk-critical/40 bg-risk-critical/10 px-4 py-2.5 text-risk-critical hover:bg-risk-critical/20 focus-visible:ring-2 focus-visible:ring-risk-critical/40',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', icon, className, children, ...props }, ref) => (
    <button ref={ref} className={cn(BASE, VARIANTS[variant], className)} {...props}>
      {icon}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

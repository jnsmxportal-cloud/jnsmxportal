import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import {
  CheckCircle,
  Info,
  WarningOctagon,
  XCircle,
  type Icon,
} from '@phosphor-icons/react'

type Kind = 'success' | 'error' | 'info' | 'warn'
const icons: Record<Kind, Icon> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warn: WarningOctagon,
}
const colors: Record<Kind, string> = {
  success: '#16B364',
  error: '#E5484D',
  info: '#3B82F6',
  warn: '#F59E0B',
}

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; kind: Kind } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const show = useCallback((text: string, kind: Kind = 'success') => {
    setToast({ text, kind })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 3400)
  }, [])

  const IconCmp = toast ? icons[toast.kind] : CheckCircle
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[90] flex max-w-[440px] -translate-x-1/2 animate-toast items-center gap-3 rounded-[14px] bg-navy px-5 py-3 text-white shadow-[0_16px_40px_rgba(15,20,32,.35)]">
          <IconCmp size={20} weight="fill" color={colors[toast.kind]} className="flex-none" />
          <span className="text-[13.5px] font-medium leading-snug">{toast.text}</span>
        </div>
      )}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)

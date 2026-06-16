import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, AlertCircle, Zap } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

declare global {
  interface Window {
    google?: any
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client'

// Decodifica o payload do JWT (ID token) do Google — UTF-8 safe
function decodeJwt(token: string): any {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''),
  )
  return JSON.parse(json)
}

export default function LoginPage() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const btnRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) { setError('VITE_GOOGLE_CLIENT_ID não configurado no .env.'); return }

    function init() {
      const g = window.google
      if (!g?.accounts?.id || !btnRef.current) return
      g.accounts.id.initialize({
        client_id: clientId,
        callback: (resp: { credential: string }) => {
          try {
            const p = decodeJwt(resp.credential)
            setUser({ name: p.name ?? p.email, email: p.email, picture: p.picture })
            navigate('/', { replace: true })
          } catch {
            setError('Falha ao processar a resposta do Google.')
          }
        },
      })
      btnRef.current.innerHTML = ''
      g.accounts.id.renderButton(btnRef.current, {
        theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', width: 300,
      })
    }

    if (window.google?.accounts?.id) { init(); return }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    if (script) { script.addEventListener('load', init); return }
    script = document.createElement('script')
    script.src = GSI_SRC; script.async = true; script.defer = true
    script.onload = init
    script.onerror = () => setError('Não foi possível carregar o Google Sign-In.')
    document.head.appendChild(script)
  }, [clientId, navigate, setUser])

  return (
    <div className="relative min-h-dvh bg-surface lg:grid lg:grid-cols-2">
      {/* Coluna esquerda — login */}
      <div className="relative flex items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl animate-float" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl" aria-hidden />

        <div className="relative w-full max-w-md animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Marca */}
          <div className="mb-6 flex flex-col items-center text-center">
            <img
              src="/logo-circular-sebratel.png"
              alt="Sebratel"
              className="h-16 w-16 rounded-full shadow-glow ring-1 ring-amber-200/60"
            />
            <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Sebratel</p>
            <h1 className="mt-1 text-2xl font-black tracking-tighter text-on-surface">Healthy Score</h1>
            <p className="mt-1 text-sm text-on-surface-variant/80">Inteligência de churn e health score</p>
          </div>

          {/* Card de login */}
          <div className="rounded-3xl border border-amber-200/70 bg-white p-6 shadow-[0_12px_40px_-12px_rgba(180,83,9,0.18)] ring-1 ring-amber-100/80 sm:p-8">
            <div className="mb-5 text-center">
              <h2 className="text-lg font-bold tracking-tight text-on-surface">Entrar na plataforma</h2>
              <p className="mt-1 text-sm text-on-surface-variant/80">Use sua conta Google corporativa para continuar.</p>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200/90 bg-rose-50/95 px-3 py-2.5 text-sm text-rose-900 shadow-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                <span>{error}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div ref={btnRef} className="flex min-h-[44px] justify-center" role="status" aria-live="polite" />
                <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant/60">
                  <ShieldCheck size={12} strokeWidth={2} aria-hidden />
                  Autenticação segura via Google · seus dados não são compartilhados
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">
            <Zap size={11} className="text-primary" aria-hidden />
            Healthy Score Sebratel · acesso restrito
          </div>
        </div>
      </div>

      {/* Coluna direita — hero (desktop) */}
      <div className="relative hidden lg:block">
        <img src="/login-hero.png" alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-neutral-950/20 to-neutral-950/10" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200/80">Operação Sebratel</p>
          <h2 className="mt-2 max-w-sm text-2xl font-black tracking-tight text-white">Health Score em tempo real para reduzir o churn</h2>
          <p className="mt-2 max-w-sm text-sm text-white/70">Financeiro, comercial e conexão — 100% baseado em dados reais da operação.</p>
        </div>
      </div>
    </div>
  )
}

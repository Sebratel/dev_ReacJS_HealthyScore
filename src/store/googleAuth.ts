// Serviço global de token do Google (separado da tela de login, que é efêmera).
// Renova o access_token SILENCIOSAMENTE (sem popup) enquanto a sessão Google do
// navegador estiver ativa — é o que elimina o "deslogar/logar a cada 1h".
import { useAuthStore } from './authStore'

const GSI_SRC = 'https://accounts.google.com/gsi/client'

let tokenClient: any = null
let scriptPromise: Promise<void> | null = null
let pending: { resolve: (t: string) => void; reject: (e: unknown) => void } | null = null
let refreshInFlight: Promise<string> | null = null

function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    if (existing) {
      if (window.google?.accounts?.oauth2) return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar Google Sign-In')))
      return
    }
    const s = document.createElement('script')
    s.src = GSI_SRC; s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Falha ao carregar Google Sign-In'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

async function ensureClient(): Promise<void> {
  await loadScript()
  if (tokenClient) return
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID não configurado')
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'openid email profile',
    callback: (resp: { access_token?: string }) => {
      const p = pending; pending = null
      if (!p) return // callback tardio/duplicado do GSI → ignora (não sobrescreve um token mais novo)
      if (resp.access_token) { useAuthStore.getState().setAccessToken(resp.access_token); p.resolve(resp.access_token) }
      else p.reject(new Error('Sem access_token na resposta do Google'))
    },
    error_callback: (err: unknown) => { const p = pending; pending = null; p?.reject(err) },
  })
}

// Renova o token silenciosamente. Uma renovação em voo por vez (chamadas
// concorrentes compartilham a mesma promise). prompt:'none' = sem UI.
export function refreshGoogleToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    await ensureClient()
    return new Promise<string>((resolve, reject) => {
      // Timeout: se o GSI não chamar callback nem error_callback (cookies de
      // terceiros bloqueados/ITP), rejeita e libera — senão a renovação travaria
      // para sempre (refreshInFlight nunca voltaria a null).
      const timer = setTimeout(() => {
        if (pending) { pending = null; reject(new Error('Tempo esgotado ao renovar o token do Google')) }
      }, 15000)
      pending = {
        resolve: (t) => { clearTimeout(timer); resolve(t) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      }
      try { tokenClient.requestAccessToken({ prompt: 'none' }) }
      catch (e) { clearTimeout(timer); pending = null; reject(e) }
    })
  })().finally(() => { refreshInFlight = null })
  return refreshInFlight
}

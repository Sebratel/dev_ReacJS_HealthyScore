import { useEffect, useState } from 'react'
import { ShieldCheck, UserPlus, Trash2, Loader2, AlertTriangle, Lock } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import { apiFetch, ApiError } from '@/lib/apiClient'
import type { Role } from '@/store/authStore'

interface AccessUser { email: string; role: Role; source: 'env' | 'file' }

const ROLE_LABEL: Record<Role, string> = { viewer: 'Visualizador', power_user: 'Power user', admin: 'Admin' }
const ROLE_OPTS: Role[] = ['viewer', 'power_user', 'admin']

async function listUsers(): Promise<AccessUser[]> {
  const res = await apiFetch('/api/access/users')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body?.error || 'Falha ao carregar usuários.')
  return body.users as AccessUser[]
}
async function putRole(email: string, role: Role) {
  const res = await apiFetch(`/api/access/users/${encodeURIComponent(email)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body?.error || 'Falha ao salvar papel.')
}
async function removeUser(email: string) {
  const res = await apiFetch(`/api/access/users/${encodeURIComponent(email)}`, { method: 'DELETE' })
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new ApiError(res.status, b?.error || 'Falha ao remover.') }
}

// Tela "Usuários e Acessos" — só admin (a aba nem aparece pra outros; os
// endpoints também são admin). Papéis 'env' são semente (fixos, não editáveis).
export function AccessPanel() {
  const [users, setUsers] = useState<AccessUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // email em operação
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('power_user')

  async function refresh() {
    setLoading(true); setError(null)
    try { setUsers(await listUsers()) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Erro inesperado.') }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  async function onAdd() {
    const e = email.trim().toLowerCase()
    if (!e || !e.includes('@')) { setError('Informe um e-mail válido.'); return }
    setBusy(e); setError(null)
    try { await putRole(e, role); setEmail(''); await refresh() }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Erro ao adicionar.') }
    finally { setBusy(null) }
  }
  async function onChangeRole(u: AccessUser, next: Role) {
    setBusy(u.email); setError(null)
    try { await putRole(u.email, next); await refresh() }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Erro ao alterar.') }
    finally { setBusy(null) }
  }
  async function onRemove(u: AccessUser) {
    setBusy(u.email); setError(null)
    try { await removeUser(u.email); await refresh() }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Erro ao remover.') }
    finally { setBusy(null) }
  }

  return (
    <Card>
      <CardHeader
        title="Usuários e Acessos"
        subtitle="Todo @sebratel vê a plataforma. Aqui você define quem edita: power user (SQL + limiares) e admin (pesos + gestão)."
        icon={<ShieldCheck size={16} />}
      />

      {/* Adicionar / promover */}
      <div className="px-5 pt-4 flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-on-surface-variant">E-mail (@sebratel)</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
            placeholder="nome@sebratel.com.br"
            className="h-9 w-72 px-3 text-sm bg-surface border border-outline rounded-lg text-on-surface placeholder-on-surface-variant/90 focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-on-surface-variant">Papel</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}
            className="h-9 px-3 text-sm bg-surface border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50">
            <option value="power_user">Power user</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button onClick={onAdd} disabled={!!busy}
          className="h-9 flex items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[12px] font-semibold text-on-primary hover:bg-secondary disabled:opacity-40 transition">
          {busy === email.trim().toLowerCase() ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Conceder
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-risk-critical/30 bg-risk-critical/10 px-3 py-2 text-[12px] text-risk-critical">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Lista */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline bg-surface-container-low/50">
              {['E-mail', 'Papel', 'Origem', ''].map((h) => (
                <th key={h} className="px-5 py-2.5 text-left text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email} className="border-b border-outline hover:bg-surface-container-low/40">
                <td className="px-5 py-2.5 text-on-surface">{u.email}</td>
                <td className="px-5 py-2.5">
                  {u.source === 'env' ? (
                    <span className="text-xs font-medium text-on-surface/85">{ROLE_LABEL[u.role]}</span>
                  ) : (
                    <select
                      value={u.role}
                      disabled={busy === u.email}
                      onChange={(e) => onChangeRole(u, e.target.value as Role)}
                      className="h-8 px-2 text-xs bg-surface border border-outline rounded-md text-on-surface focus:outline-none focus:border-primary/50 disabled:opacity-50"
                    >
                      {ROLE_OPTS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-5 py-2.5">
                  {u.source === 'env'
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded text-on-surface/70 bg-surface-container-low border border-outline"><Lock size={10} /> semente (.env)</span>
                    : <span className="text-[10px] text-on-surface-variant">tela</span>}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {u.source === 'file' && (
                    <button onClick={() => onRemove(u)} disabled={busy === u.email} title="Remover (vira visualizador)"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-on-surface-variant hover:text-risk-critical hover:bg-risk-critical/10 disabled:opacity-40 transition">
                      {busy === u.email ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {loading && (
              <tr><td colSpan={4} className="px-5 py-10 text-center text-xs text-on-surface-variant"><Loader2 size={14} className="animate-spin inline mr-2" />Carregando…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-10 text-center text-xs text-on-surface-variant">Ninguém com papel elevado ainda. Conceda acima.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="px-5 py-3 text-[11px] text-on-surface-variant border-t border-outline">
        Quem não está na lista é <strong>visualizador</strong> (vê tudo, não edita). Papéis "semente" vêm do
        <span className="font-mono"> ADMIN_EMAILS</span>/<span className="font-mono">POWER_USER_EMAILS</span> e não podem ser removidos por aqui.
      </p>
    </Card>
  )
}

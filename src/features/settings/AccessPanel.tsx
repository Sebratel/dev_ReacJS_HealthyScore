import { useEffect, useState } from 'react'
import { ShieldCheck, UserPlus, Trash2, Loader2, AlertTriangle, Lock } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import { apiFetch, ApiError } from '@/lib/apiClient'
import type { Role } from '@/store/authStore'
import {
  SECTOR_ORDER, SECTOR_LABELS, parseScopes, describeScopes,
  type SectorKey, type Scopes,
} from '@/features/auth/sectors'

interface AccessUser { email: string; role: Role; scopes: Scopes; source: 'env' | 'file' }

const ROLE_LABEL: Record<Role, string> = { viewer: 'Visualizador', power_user: 'Power user', admin: 'Admin' }
const ROLE_OPTS: Role[] = ['viewer', 'power_user', 'admin']

async function listUsers(): Promise<AccessUser[]> {
  const res = await apiFetch('/api/access/users')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body?.error || 'Falha ao carregar usuários.')
  return (body.users as AccessUser[]).map((u) => ({ ...u, scopes: parseScopes(u.scopes) ?? '*' }))
}
async function putRole(email: string, role: Role, scopes: Scopes) {
  const res = await apiFetch(`/api/access/users/${encodeURIComponent(email)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, scopes }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body?.error || 'Falha ao salvar papel.')
}
async function removeUser(email: string) {
  const res = await apiFetch(`/api/access/users/${encodeURIComponent(email)}`, { method: 'DELETE' })
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new ApiError(res.status, b?.error || 'Falha ao remover.') }
}

// ─── Seletor de setores ────────────────────────────────────────
// "Todos os setores" e os 7 setores como chips. Sair de "todos" clicando num
// setor RESTRINGE àquele (é o gesto esperado de quem quer limitar alguém), e o
// último setor marcado não pode ser desmarcado — power user sem setor nenhum
// não editaria nada, e o servidor recusaria de qualquer forma.
function SectorPicker({ value, onChange, disabled }: {
  value: Scopes
  onChange: (next: Scopes) => void
  disabled?: boolean
}) {
  const all = value === '*'
  const list: SectorKey[] = all ? SECTOR_ORDER : value
  const toggle = (key: SectorKey) => {
    if (all) { onChange([key]); return }               // de "todos" → só este
    const has = list.includes(key)
    if (has && list.length === 1) return                // último não sai
    const next = has ? list.filter((s) => s !== key) : [...list, key]
    onChange(next.length === SECTOR_ORDER.length ? '*' : SECTOR_ORDER.filter((s) => next.includes(s)))
  }
  const chip = (active: boolean) => cn(
    'rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors',
    active ? 'border-primary/40 bg-primary/15 text-primary' : 'border-outline text-on-surface-variant hover:text-on-surface hover:border-outline-strong',
    disabled && 'cursor-not-allowed opacity-50',
  )
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" disabled={disabled} onClick={() => onChange('*')} className={chip(all)}
        title="Edita os indicadores e as queries de todos os setores">
        Todos os setores
      </button>
      <span className="text-[10px] text-on-surface-variant/70">|</span>
      {SECTOR_ORDER.map((key) => (
        <button key={key} type="button" disabled={disabled} onClick={() => toggle(key)}
          className={chip(!all && list.includes(key))}
          title={all ? `Restringir só a ${SECTOR_LABELS[key]}` : `Marcar/desmarcar ${SECTOR_LABELS[key]}`}>
          {SECTOR_LABELS[key]}
        </button>
      ))}
    </div>
  )
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
  const [scopes, setScopes] = useState<Scopes>('*')

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
    try { await putRole(e, role, role === 'admin' ? '*' : scopes); setEmail(''); await refresh() }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Erro ao adicionar.') }
    finally { setBusy(null) }
  }
  // Mudar de papel preserva os setores já concedidos (admin sempre vira total).
  async function onChangeRole(u: AccessUser, next: Role) {
    setBusy(u.email); setError(null)
    try { await putRole(u.email, next, next === 'admin' ? '*' : u.scopes); await refresh() }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Erro ao alterar.') }
    finally { setBusy(null) }
  }
  async function onChangeScopes(u: AccessUser, next: Scopes) {
    setBusy(u.email); setError(null)
    // Otimista: os chips respondem na hora e o refresh confirma com o servidor.
    setUsers((prev) => prev.map((x) => (x.email === u.email ? { ...x, scopes: next } : x)))
    try { await putRole(u.email, u.role, next); await refresh() }
    catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao alterar setores.')
      await refresh()
    }
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
        subtitle="Todo @sebratel vê a plataforma inteira. Aqui você define quem edita — e em quais setores."
        icon={<ShieldCheck size={16} />}
      />

      {/* Adicionar / promover */}
      <div className="px-5 pt-4 space-y-3">
        <div className="flex items-end gap-2 flex-wrap">
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

        {/* Setores do power user que está sendo concedido */}
        {role === 'power_user' ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-wider text-on-surface-variant">Setores que poderá editar</label>
            <SectorPicker value={scopes} onChange={setScopes} />
          </div>
        ) : (
          <p className="text-[11px] text-on-surface-variant">Admin edita todos os setores, os limiares do Health Score e a gestão de usuários.</p>
        )}
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
              {['E-mail', 'Papel', 'Setores que edita', 'Origem', ''].map((h) => (
                <th key={h} className="px-5 py-2.5 text-left text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email} className="border-b border-outline hover:bg-surface-container-low/40">
                <td className="px-5 py-2.5 text-on-surface align-top">{u.email}</td>
                <td className="px-5 py-2.5 align-top">
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
                <td className="px-5 py-2.5 align-top">
                  {u.role === 'admin' || u.source === 'env' ? (
                    <span className="text-[11px] text-on-surface-variant">{describeScopes(u.scopes)}</span>
                  ) : (
                    <SectorPicker value={u.scopes} disabled={busy === u.email} onChange={(next) => onChangeScopes(u, next)} />
                  )}
                </td>
                <td className="px-5 py-2.5 align-top">
                  {u.source === 'env'
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded text-on-surface/70 bg-surface-container-low border border-outline"><Lock size={10} /> semente (.env)</span>
                    : <span className="text-[10px] text-on-surface-variant">tela</span>}
                </td>
                <td className="px-5 py-2.5 text-right align-top">
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
              <tr><td colSpan={5} className="px-5 py-10 text-center text-xs text-on-surface-variant"><Loader2 size={14} className="animate-spin inline mr-2" />Carregando…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-xs text-on-surface-variant">Ninguém com papel elevado ainda. Conceda acima.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 space-y-1.5 text-[11px] text-on-surface-variant border-t border-outline">
        <p>
          Quem não está na lista é <strong>visualizador</strong> (vê tudo, não edita). O setor limita só a
          edição: um power user do Financeiro navega por todas as telas, mas o botão “Configurar” e o SQL das
          outras engines ficam fora do alcance dele.
        </p>
        <p>
          Faixas do Health Score e queries de base (totais, coorte mensal, cancelados, retiradas) valem para
          todos os setores — ficam com o <strong>admin</strong>. Papéis “semente” vêm do
          <span className="font-mono"> ADMIN_EMAILS</span>/<span className="font-mono">POWER_USER_EMAILS</span>,
          têm todos os setores e não podem ser removidos por aqui.
        </p>
      </div>
    </Card>
  )
}

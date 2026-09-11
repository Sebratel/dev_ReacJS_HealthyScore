import { useCallback, useEffect, useState } from 'react'
import {
  Bot, Plus, Loader2, AlertTriangle, RefreshCw, Trash2, Check, KeyRound, Star, Zap,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import { apiFetch, ApiError } from '@/lib/apiClient'

// Cadastro do provedor de IA. A chave é enviada uma vez, cifrada no servidor e
// nunca volta — a tela mostra só os quatro últimos caracteres, o suficiente
// para reconhecer ("é a que termina em 4f2a?") sem expor o segredo.

interface Provider {
  id: number
  nome: string
  kind: string
  modelo: string
  temChave: boolean
  keyHint: string | null
  baseUrl: string | null
  maxTokens: number
  effort: string | null
  ativo: boolean
  padrao: boolean
  ultimoTeste: { em: string; ok: boolean; erro: string | null; ms: number } | null
}

const KINDS = [
  { key: 'anthropic', label: 'Anthropic (Claude)' },
  { key: 'mock', label: 'Simulado (sem IA)' },
]
const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max']
const MODELO_PADRAO = 'claude-opus-5'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string })?.error || `Erro ${res.status}.`)
  return body as T
}
const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

const vazio = {
  nome: '', kind: 'anthropic', modelo: MODELO_PADRAO, apiKey: '',
  baseUrl: '', maxTokens: 16000, effort: '', padrao: true,
}

export function AiProviderPanel() {
  const [lista, setLista] = useState<Provider[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [segredoOk, setSegredoOk] = useState(true)
  const [form, setForm] = useState<typeof vazio | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState<number | null>(null)

  const carregar = useCallback(() => {
    setErro(null)
    call<{ providers: Provider[]; segredoConfigurado: boolean }>('/api/ai-providers')
      .then((d) => { setLista(d.providers); setSegredoOk(d.segredoConfigurado) })
      .catch((e) => { setLista([]); setErro(e instanceof ApiError ? e.message : 'Erro inesperado.') })
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const salvar = async () => {
    if (!form) return
    setSalvando(true)
    setErro(null)
    try {
      await call('/api/ai-providers', json('POST', form))
      setForm(null)
      carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const testar = async (id: number) => {
    setTestando(id)
    try { await call(`/api/ai-providers/${id}/test`, json('POST', {})) } finally { setTestando(null); carregar() }
  }

  const tornarPadrao = async (p: Provider) => {
    await call(`/api/ai-providers/${p.id}`, json('PUT', { padrao: true })).catch(() => {})
    carregar()
  }

  const remover = async (id: number) => {
    await call(`/api/ai-providers/${id}`, { method: 'DELETE' }).catch(() => {})
    carregar()
  }

  return (
    <Card>
      <CardHeader
        title="Provedor de IA"
        subtitle="Usado pelo módulo de Planos de Ação — a chave é cifrada em repouso e nunca volta para a tela"
        icon={<Bot size={14} />}
        action={
          <button
            onClick={() => setForm(form ? null : { ...vazio })}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium"
          >
            <Plus size={12} /> {form ? 'Cancelar' : 'Novo provedor'}
          </button>
        }
      />

      {!segredoOk && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-risk-medium/5 border border-risk-medium/20 px-3 py-2 text-[11px] text-on-surface-variant leading-relaxed">
          <KeyRound size={13} className="text-risk-medium shrink-0 mt-0.5" />
          <p>
            <strong className="text-on-surface/80">APP_SECRET não configurado.</strong> É a chave que cifra segredos em
            repouso. Defina uma string longa e aleatória na stack antes de cadastrar um provedor — sem ela, salvar a
            chave de API vai falhar.
          </p>
        </div>
      )}

      {form && (
        <div className="px-5 py-4 border-b border-outline space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Nome</span>
              <input
                value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Claude de produção"
                className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface placeholder-on-surface-variant/70 focus:outline-none focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Tipo</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value, modelo: e.target.value === 'anthropic' ? MODELO_PADRAO : 'mock' })}
                className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50"
              >
                {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Modelo</span>
              <input
                value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                className="h-8 px-2 font-mono text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Chave de API</span>
              <input
                type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={form.kind === 'mock' ? 'não se aplica' : 'sk-ant-…'} disabled={form.kind === 'mock'}
                className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface placeholder-on-surface-variant/70 focus:outline-none focus:border-primary/50 disabled:opacity-40"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">max_tokens</span>
              <input
                type="number" min={256} value={form.maxTokens}
                onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) || 16000 })}
                className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">Esforço</span>
              <select
                value={form.effort} onChange={(e) => setForm({ ...form, effort: e.target.value })}
                className="h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary/50"
              >
                {EFFORTS.map((e) => <option key={e} value={e}>{e || 'padrão do modelo'}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 justify-end pb-1">
              <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                <input type="checkbox" checked={form.padrao} onChange={(e) => setForm({ ...form, padrao: e.target.checked })} />
                Usar como padrão
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={salvar} disabled={salvando || !form.nome.trim()}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium disabled:opacity-30"
            >
              {salvando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar provedor
            </button>
          </div>
        </div>
      )}

      {erro && (
        <div className="mx-5 mt-4 flex items-start gap-2 text-[11px] text-risk-critical">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      {lista === null ? (
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-on-surface/70">
          <Loader2 size={16} className="animate-spin" /> Carregando provedores…
        </div>
      ) : lista.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Bot size={22} className="mx-auto text-on-surface-variant/50" />
          <p className="mt-2 text-xs text-on-surface-variant">Nenhum provedor cadastrado.</p>
          <p className="mt-1 text-[10px] text-on-surface-variant/70">
            Sem provedor, os Planos de Ação rodam em modo simulado — o fluxo funciona, mas nenhuma IA é consultada.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-outline">
          {lista.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-on-surface">{p.nome}</p>
                  {p.padrao && (
                    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary uppercase tracking-wide">
                      <Star size={8} /> Padrão
                    </span>
                  )}
                  {!p.ativo && <span className="text-[9px] px-1.5 py-0.5 rounded border border-outline text-on-surface-variant">Inativo</span>}
                </div>
                <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">
                  {p.kind} · {p.modelo}
                  {p.temChave ? ` · chave ····${p.keyHint}` : ' · sem chave'}
                  {p.effort ? ` · esforço ${p.effort}` : ''}
                </p>
                {p.ultimoTeste && (
                  <p className={cn('text-[10px] mt-0.5', p.ultimoTeste.ok ? 'text-risk-low' : 'text-risk-critical')}>
                    {p.ultimoTeste.ok ? `Conexão OK (${p.ultimoTeste.ms}ms)` : `Falhou: ${p.ultimoTeste.erro}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => testar(p.id)} disabled={testando === p.id}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-outline text-on-surface/80 hover:border-outline-strong transition-colors disabled:opacity-30"
                >
                  {testando === p.id ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />} Testar
                </button>
                {!p.padrao && (
                  <button onClick={() => tornarPadrao(p)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-outline text-on-surface/80 hover:border-outline-strong transition-colors">
                    <Star size={10} /> Tornar padrão
                  </button>
                )}
                <button onClick={() => remover(p.id)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-outline text-risk-critical hover:border-risk-critical/40 transition-colors">
                  <Trash2 size={10} /> Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end px-5 py-2 border-t border-outline">
        <button onClick={carregar} className="flex items-center gap-1.5 text-[10px] text-on-surface-variant hover:text-on-surface transition-colors">
          <RefreshCw size={10} /> Atualizar
        </button>
      </div>
    </Card>
  )
}

import { useCallback, useEffect, useState } from 'react'
import {
  Bot, Loader2, AlertTriangle, RefreshCw, Check, Trash2, Zap, ShieldCheck, Info,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import { apiFetch, ApiError } from '@/lib/apiClient'

// Provedor de IA do módulo de Planos de Ação. UM provedor ativo, no mesmo
// contrato do comercial_pbi: a chave é enviada uma vez, cifrada no servidor e
// nunca volta — a tela mostra só os quatro últimos caracteres, o suficiente
// para reconhecer ("é a que termina em 4f2a?") sem expor o segredo.

interface Tipo { id: string; label: string }
interface Teste { ok: boolean; ms: number; amostra?: string; erro?: string; em?: string }

interface EstadoIA {
  configurado: boolean
  origem: 'env' | 'tela' | null
  tipo: string
  modelo: string
  baseUrl: string | null
  maxTokens: number
  effort: string | null
  dica: string | null
  aviso?: string
  atualizadoEm?: string | null
  atualizadoPor?: string | null
  ultimoTeste?: Teste | null
  tipos: Tipo[]
  modelosPadrao: Record<string, string>
  segredo: 'env' | 'volume'
}

const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max']

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string })?.error || `Erro ${res.status}.`)
  return body as T
}
const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export function AiProviderPanel() {
  const [estado, setEstado] = useState<EstadoIA | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<Teste | null>(null)
  const [modelos, setModelos] = useState<{ id: string; label: string }[]>([])
  const [buscandoModelos, setBuscandoModelos] = useState(false)
  const [form, setForm] = useState({ tipo: 'anthropic', modelo: '', chave: '', baseUrl: '', maxTokens: 16000, effort: '' })

  const carregar = useCallback(async () => {
    try {
      const d = await call<EstadoIA>('/api/ia')
      setEstado(d)
      setForm((f) => ({
        ...f,
        tipo: d.tipo || 'anthropic',
        modelo: d.modelo || '',
        baseUrl: d.baseUrl || '',
        maxTokens: d.maxTokens || 16000,
        effort: d.effort || '',
        chave: '',
      }))
      setTeste(d.ultimoTeste || null)
      setErro(null)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Erro inesperado.')
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const simulado = form.tipo === 'simulado'

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      const corpo: Record<string, unknown> = {
        tipo: form.tipo,
        modelo: form.modelo,
        baseUrl: form.baseUrl || null,
        maxTokens: Number(form.maxTokens) || 16000,
        effort: form.effort || null,
      }
      // Campo em branco significa "não mexi na chave" — mandar string vazia
      // apagaria o cadastro, que é o oposto do que quem só trocou o modelo quer.
      if (form.chave.trim()) corpo.chave = form.chave.trim()
      await call('/api/ia', json('PUT', corpo))
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar.')
    } finally { setSalvando(false) }
  }

  const buscarModelos = async () => {
    setBuscandoModelos(true)
    setErro(null)
    try {
      const corpo: Record<string, unknown> = { tipo: form.tipo, baseUrl: form.baseUrl || null }
      if (form.chave.trim()) corpo.chave = form.chave.trim()
      const d = await call<{ modelos: { id: string; label: string }[] }>('/api/ia/modelos', json('POST', corpo))
      setModelos(d.modelos || [])
      if (!d.modelos?.length) setErro('A chave respondeu, mas não listou nenhum modelo.')
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível listar os modelos.')
    } finally { setBuscandoModelos(false) }
  }

  const testar = async () => {
    setTestando(true)
    setErro(null)
    try { setTeste(await call<Teste>('/api/ia/testar', json('POST', {}))) } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível testar.')
    } finally { setTestando(false) }
  }

  const remover = async () => {
    setSalvando(true)
    try {
      await call('/api/ia', { method: 'DELETE' })
      setModelos([]); setTeste(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível remover.')
    } finally { setSalvando(false) }
  }

  if (!estado && !erro) {
    return (
      <Card>
        <CardHeader title="Provedor de IA" icon={<Bot size={14} />} />
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-on-surface/70">
          <Loader2 size={16} className="animate-spin" /> Carregando configuração…
        </div>
      </Card>
    )
  }

  const campo = 'h-8 px-2 text-xs bg-surface-container-low border border-outline rounded-lg text-on-surface placeholder-on-surface-variant/70 focus:outline-none focus:border-primary/50 disabled:opacity-40'
  const rotulo = 'text-[10px] uppercase tracking-wider text-on-surface-variant'

  return (
    <Card>
      <CardHeader
        title="Provedor de IA"
        subtitle="Usado pelo módulo de Planos de Ação — um provedor ativo, chave cifrada em repouso"
        icon={<Bot size={14} />}
        action={
          <button onClick={() => void carregar()} className="flex items-center gap-1.5 text-[11px] text-on-surface-variant hover:text-on-surface transition-colors">
            <RefreshCw size={11} /> Atualizar
          </button>
        }
      />

      <div className="px-5 py-4 space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 text-[11px] text-on-surface-variant leading-relaxed">
          <Info size={13} className="text-primary shrink-0 mt-0.5" />
          <p>
            As demais telas de IA do sistema (IA Preditiva, Previsão, Pontuação sugerida) são
            <strong className="text-on-surface/70"> determinísticas</strong> e não usam provedor nenhum.
            O que é cadastrado aqui serve só aos <strong className="text-on-surface/70">Planos de Ação</strong>,
            que enviam o dossiê do cliente ao provedor escolhido.
          </p>
        </div>

        {/* Estado atual */}
        <div className={cn(
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed',
          estado?.configurado ? 'border-risk-low/25 bg-risk-low/5' : 'border-risk-medium/25 bg-risk-medium/5',
        )}>
          {estado?.configurado
            ? <ShieldCheck size={13} className="text-risk-low shrink-0 mt-0.5" />
            : <AlertTriangle size={13} className="text-risk-medium shrink-0 mt-0.5" />}
          <div className="text-on-surface-variant">
            {estado?.configurado ? (
              <p>
                Configurado: <strong className="text-on-surface/80">{estado.tipo}</strong>
                {estado.tipo !== 'simulado' && <> · <span className="font-mono">{estado.modelo}</span></>}
                {estado.dica && <> · chave {estado.dica}</>}
                {estado.origem === 'env' && ' (vindo do .env)'}
                {estado.atualizadoPor && ` · por ${estado.atualizadoPor}`}
              </p>
            ) : (
              <p>
                Nenhum provedor cadastrado. Os Planos de Ação continuam funcionando em
                <strong className="text-on-surface/80"> modo simulado</strong> — o fluxo inteiro roda,
                mas nenhuma IA é consultada e a tela diz isso.
              </p>
            )}
            {estado?.aviso && <p className="mt-0.5 text-on-surface-variant/80">{estado.aviso}</p>}
          </div>
        </div>

        {/* Formulário */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Provedor</span>
            <select
              value={form.tipo}
              onChange={(e) => {
                const tipo = e.target.value
                setForm({ ...form, tipo, modelo: estado?.modelosPadrao?.[tipo] ?? '' })
                setModelos([])
              }}
              className={campo}
            >
              {(estado?.tipos ?? []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>
              Chave de API {estado?.configurado && !simulado && '(em branco mantém a atual)'}
            </span>
            <input
              type="password" autoComplete="off" disabled={simulado}
              placeholder={simulado ? 'não se aplica' : estado?.dica ? `mantém ${estado.dica}` : 'cole a chave aqui'}
              value={form.chave} onChange={(e) => setForm({ ...form, chave: e.target.value })}
              className={campo}
            />
          </label>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Modelo</span>
            {modelos.length ? (
              <select value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} className={campo}>
                <option value="">selecione…</option>
                {modelos.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            ) : (
              <input
                type="text" disabled={simulado} placeholder="ex.: claude-opus-5"
                value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                className={cn(campo, 'font-mono')}
              />
            )}
          </label>
          <button
            onClick={buscarModelos} disabled={buscandoModelos || simulado}
            className="flex items-center gap-1.5 h-8 text-[11px] px-3 rounded-lg border border-outline text-on-surface/85 hover:border-outline-strong transition-colors disabled:opacity-30"
          >
            {buscandoModelos ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {buscandoModelos ? 'buscando…' : 'listar modelos da chave'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 col-span-1">
            <span className={rotulo}>URL base (opcional)</span>
            <input
              type="text" disabled={simulado} placeholder="padrão do provedor"
              value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              className={campo}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Teto de tokens</span>
            <input
              type="number" min={256} max={64000} disabled={simulado}
              value={form.maxTokens} onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) || 16000 })}
              className={campo}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Esforço (Anthropic)</span>
            <select
              value={form.effort} disabled={form.tipo !== 'anthropic'}
              onChange={(e) => setForm({ ...form, effort: e.target.value })}
              className={campo}
            >
              {EFFORTS.map((e) => <option key={e} value={e}>{e || 'padrão do modelo'}</option>)}
            </select>
          </label>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={salvar} disabled={salvando}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-medium disabled:opacity-30"
          >
            {salvando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar
          </button>
          <button
            onClick={testar} disabled={testando || !estado?.configurado}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-outline text-on-surface/85 hover:border-outline-strong transition-colors disabled:opacity-30"
          >
            {testando ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {testando ? 'testando…' : 'Testar conexão'}
          </button>
          {estado?.origem === 'tela' && (
            <button
              onClick={remover} disabled={salvando}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-outline text-risk-critical hover:border-risk-critical/40 transition-colors disabled:opacity-30"
            >
              <Trash2 size={12} /> Remover cadastro
            </button>
          )}
          {teste && (
            <span className={cn('text-[11px]', teste.ok ? 'text-risk-low' : 'text-risk-critical')}>
              {teste.ok
                ? `conexão ok em ${teste.ms} ms${teste.amostra ? ` — resposta: "${teste.amostra}"` : ''}`
                : `falhou: ${teste.erro}`}
            </span>
          )}
        </div>

        {erro && (
          <div className="flex items-start gap-2 text-[11px] text-risk-critical">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span>{erro}</span>
          </div>
        )}

        <ul className="space-y-1 pt-1 border-t border-outline text-[10px] text-on-surface-variant/85 leading-relaxed">
          <li className="pt-2">A chave é gravada <strong className="text-on-surface/70">cifrada</strong> (AES-256-GCM) e nunca volta numa resposta da API — só os quatro últimos caracteres.</li>
          <li><strong className="text-on-surface/70">OpenAI e compatíveis</strong> cobre Groq, OpenRouter, Azure OpenAI, Together e servidores locais: muda só a URL base.</li>
          <li>Só a Anthropic aceita o JSON Schema completo na origem; nos outros o pedido vai em modo JSON. Em todos, quem garante o formato é a validação do servidor.</li>
          <li>
            {estado?.segredo === 'env'
              ? <>A chave de cifra vem de <span className="font-mono">APP_SECRET</span> no ambiente.</>
              : <>A chave de cifra foi gerada no volume de dados. Defina <span className="font-mono">APP_SECRET</span> no ambiente para controlá-la — perder o volume é perder o que foi cifrado.</>}
          </li>
        </ul>
      </div>
    </Card>
  )
}

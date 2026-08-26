// ─────────────────────────────────────────────────────────────────────────
// Backend mínimo do ChurnIQ — serve e edita o catálogo de queries do ETL.
//
//   GET    /api/health           → status (sem auth)
//   GET    /api/queries          → catálogo (qualquer usuário @domínio logado)
//   PUT    /api/queries/:id       → grava override { sql } (editores)
//   DELETE /api/queries/:id       → remove override, volta ao default (editores)
//
// Auth: header Authorization: Bearer <google_access_token>. O token é validado
// no userinfo do Google; exige e-mail do domínio permitido e (se configurada)
// presença na allowlist de editores para escrever. SQL é barrado pelo guard
// somente-leitura antes de gravar. Os overrides ficam num JSON compartilhado
// com o ETL (scripts/queries/overrides.mjs).
// ─────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import dns from 'node:dns'
import express from 'express'

// Node 18+ pode resolver AAAA (IPv6) primeiro. Se o container não tem egress
// IPv6 (comum), o fetch() para googleapis.com falha — mesmo com IPv4 OK (wget
// funciona) — e a validação do token do Google cai em 401. Preferir IPv4 evita.
dns.setDefaultResultOrder('ipv4first')
import { getCatalog, ENGINE_LABELS } from '../scripts/queries/index.mjs'
import { writeOverride, deleteOverride, OVERRIDES_PATH } from '../scripts/queries/overrides.mjs'
import { getQueryDef } from '../scripts/queries/registry.mjs'
import { getStatus as datasetStatus, getClients, getCancelledClients, getDataset } from './dataset.mjs'
import { runEngine, runDashboard, ENGINE_KEYS } from './engines.mjs'
import { getClientHistory, getScoreHistoryStatus } from './scoreHistory.mjs'
import { buildSuggestions, deriveLists } from '../src/features/cancellation-profiles/suggestionEngine.ts'
import { resolveRole, atLeast, listRoles, setRole, deleteRole } from './roles.mjs'
import { getOfficialConfig, setOfficialConfigs, setOfficialThresholds } from './officialConfig.mjs'
import { runChurnForecast } from './churnForecast.mjs'

const PORT = Number(process.env.API_PORT) || 8787
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'sebratel.com.br').toLowerCase()

const app = express()
// Limite generoso: os configs das engines carregam os índices dinâmicos
// (vendedor/bairro/valor/técnico…) reconciliados com a BASE COMPLETA — o corpo
// do /api/dashboard e /api/engine escala com o nº de valores distintos.
app.use(express.json({ limit: '12mb' }))

// CORS — necessário em dev (Vite em outra porta). Em produção o nginx faz proxy
// same-origin de /api/, então isto fica inócuo. Reflete a origem; sem cookies.
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ─── Auth ──────────────────────────────────────────────────────
// Cache curto de token→usuário para não consultar o Google a cada request.
const tokenCache = new Map() // token -> { user, exp }
const TOKEN_TTL_MS = 5 * 60 * 1000

async function getUserFromToken(token) {
  const cached = tokenCache.get(token)
  if (cached && cached.exp > Date.now()) return cached.user
  let r
  try {
    r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (e) {
    // Falha de REDE: o container não alcançou o googleapis.com (egress/DNS).
    console.warn('[auth] falha de rede ao validar token no Google userinfo:', e.message)
    return null
  }
  if (!r.ok) { console.warn(`[auth] Google userinfo respondeu ${r.status} (token inválido/expirado?)`); return null }
  const p = await r.json().catch(() => ({}))
  if (!p.email || p.email_verified === false) { console.warn('[auth] token sem e-mail verificado'); return null }
  const user = { email: String(p.email).toLowerCase(), name: p.name || p.email }
  tokenCache.set(token, { user, exp: Date.now() + TOKEN_TTL_MS })
  return user
}

// Auth + RBAC. minRole: 'viewer' (default) | 'power_user' | 'admin'.
// req.user recebe { email, name, role } (papel efetivo resolvido em roles.mjs).
function requireAuth({ minRole = 'viewer' } = {}) {
  return async (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '')
    if (!m) return res.status(401).json({ error: 'Token de autenticação ausente.' })
    let user = null
    try { user = await getUserFromToken(m[1]) } catch { user = null }
    if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' })
    if (!user.email.endsWith('@' + ALLOWED_DOMAIN)) {
      return res.status(403).json({ error: `Acesso restrito a contas @${ALLOWED_DOMAIN}.` })
    }
    const role = resolveRole(user.email)
    req.user = { ...user, role }
    if (!atLeast(role, minRole)) {
      const label = minRole === 'admin' ? 'administrador' : 'power user'
      return res.status(403).json({ error: `Ação restrita a ${label}. Sua conta é "${role}".` })
    }
    next()
  }
}

// ─── Rotas ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'churniq-api', overridesPath: OVERRIDES_PATH })
})

// Identidade + papel do usuário logado — o front usa pra mostrar/esconder
// controles (pesos, SQL, limiares, gestão de usuários).
app.get('/api/me', requireAuth(), (req, res) => {
  res.json({ email: req.user.email, name: req.user.name, role: req.user.role })
})

// ─── Config oficial (pesos + limiares) ─────────────────────────
// Leitura por todos (@domínio); escrita: pesos e limiares → power_user+
// (admin herda). Gestão de usuários continua exclusiva de admin.
app.get('/api/config', requireAuth(), (_req, res) => {
  const o = getOfficialConfig()
  res.json({ configs: o?.configs ?? null, thresholds: o?.thresholds ?? null, updatedAt: o?.updatedAt ?? null, updatedBy: o?.updatedBy ?? null })
})

app.put('/api/config/configs', requireAuth({ minRole: 'power_user' }), (req, res) => {
  try {
    const saved = setOfficialConfigs(req.body?.configs, req.user.email)
    res.json({ ok: true, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.put('/api/config/thresholds', requireAuth({ minRole: 'power_user' }), (req, res) => {
  try {
    const saved = setOfficialThresholds(req.body?.thresholds, req.user.email)
    res.json({ ok: true, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Status da base materializada (snapshot completo carregado em memória pelo
// backend). Fundação dos endpoints paginados por engine.
app.get('/api/dataset/status', requireAuth(), (_req, res) => {
  res.json(datasetStatus())
})

// Metadados leves da base (tudo menos o array pesado de clientes) — o front
// carrega isto no boot no lugar do snapshot de ~9 MB. Sem auth: são apenas
// listas distintas/totais (o snapshot antigo já era um asset público).
app.get('/api/dataset/lists', (_req, res) => {
  const ds = getDataset()
  if (!ds) return res.status(503).json({ error: 'Base ainda não materializada no backend (snapshot ausente).' })
  const { clients, cancelledClients, withdrawalDetail, ...lists } = ds // exclui os arrays pesados
  res.json(lists)
})

// Detalhe das Retiradas (protocolos crus + pessoas) — servido sob demanda pra
// não pesar o boot. A tela de Retiradas usa pra filtrar por período no cliente.
app.get('/api/withdrawals', requireAuth(), (_req, res) => {
  const ds = getDataset()
  if (!ds) return res.status(503).json({ error: 'Base ainda não materializada no backend (snapshot ausente).' })
  res.json(ds.withdrawalDetail ?? { protocols: [], people: [] })
})

// Previsão de prazo de cancelamento — lista rankeada por urgência (janela pra
// frente estimada da sobrevivência dos cancelados por perfil). Sob demanda.
// POST /api/churn-forecast { configs?, thresholds?, topN?, city?, classification? }
app.post('/api/churn-forecast', requireAuth(), (req, res) => {
  const active = getClients()
  if (!active.length) return res.status(503).json({ error: 'Base ainda não materializada no backend (snapshot ausente).' })
  const cancelled = getCancelledClients()
  if (!cancelled.length) return res.status(503).json({ error: 'Coorte de cancelados ainda não materializada — a previsão depende dela.' })
  try {
    const b = req.body || {}
    const result = runChurnForecast(active, cancelled, {
      configs: b.configs, thresholds: b.thresholds, monthly: getDataset()?.monthly || [],
      topN: b.topN, city: b.city, classification: b.classification,
    })
    res.json({ ...result, meta: datasetStatus() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Dashboard + IA — 7 engines + ranking combinado por cliente, no servidor.
// POST /api/dashboard { configs:{financial,...}, thresholds?, name?, contract?, city?, topN? }
app.post('/api/dashboard', requireAuth(), (req, res) => {
  const clients = getClients()
  if (!clients.length) return res.status(503).json({ error: 'Base ainda não materializada no backend (snapshot ausente).' })
  try {
    const b = req.body || {}
    // Config OFICIAL do servidor manda; se ainda não gravada, cai no que o
    // cliente enviou (compat — nada quebra antes de um admin publicar a oficial).
    const official = getOfficialConfig()
    const result = runDashboard(clients, {
      configs: official?.configs ?? b.configs,
      thresholds: official?.thresholds ?? b.thresholds,
      monthly: getDataset()?.monthly || [],
      name: b.name, contract: b.contract, city: b.city, classification: b.classification, topN: b.topN,
    })
    res.json({ ...result, meta: datasetStatus(), monthly: getDataset()?.monthly || [] })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Pontuação de uma engine sobre a base materializada, paginada.
// POST /api/engine/:key  { config, thresholds?, page?, pageSize?, search?, city?, classification? }
// A config/limiares vêm por-usuário (ficam no navegador) e viajam na requisição.
app.post('/api/engine/:key', requireAuth(), (req, res) => {
  const { key } = req.params
  if (!ENGINE_KEYS.includes(key)) return res.status(404).json({ error: `Engine desconhecida: ${key}` })
  const clients = getClients()
  if (!clients.length) return res.status(503).json({ error: 'Base ainda não materializada no backend (snapshot ausente).' })
  try {
    const b = req.body || {}
    const official = getOfficialConfig()
    const result = runEngine(key, {
      clients,
      config: official?.configs?.[key] ?? b.config,
      thresholds: official?.thresholds ?? b.thresholds,
      monthly: getDataset()?.monthly || [],
      page: b.page, pageSize: b.pageSize,
      name: b.name, contract: b.contract, city: b.city, classification: b.classification,
      sortKey: b.sortKey, sortDir: b.sortDir,
    })
    res.json({ ...result, meta: datasetStatus() })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ─── Histórico de Health Score (timeline por cliente) ─────────
// Status do índice de histórico (nº de pontos, janela coberta).
app.get('/api/score-history/status', requireAuth(), (_req, res) => {
  res.json(getScoreHistoryStatus())
})

// Série temporal de um cliente (ativo ou cancelado). Vazia até acumular pontos.
// GET /api/clients/:id/score-history
app.get('/api/clients/:id/score-history', requireAuth(), (req, res) => {
  const series = getClientHistory(req.params.id)
  res.json({ clientId: req.params.id, points: series, status: getScoreHistoryStatus() })
})

// Catálogo de queries — a tela de SQL é área do power_user (view + edit).
app.get('/api/queries', requireAuth({ minRole: 'power_user' }), (req, res) => {
  // canEdit sempre true aqui (só power_user+ chega); mantido p/ compat do front.
  res.json({ queries: getCatalog(), engineLabels: ENGINE_LABELS, canEdit: atLeast(req.user.role, 'power_user') })
})

app.put('/api/queries/:id', requireAuth({ minRole: 'power_user' }), (req, res) => {
  const { id } = req.params
  if (!getQueryDef(id)) return res.status(404).json({ error: `Query desconhecida: ${id}` })
  const sql = req.body?.sql
  if (typeof sql !== 'string') return res.status(400).json({ error: 'Campo "sql" (string) é obrigatório.' })
  try {
    const entry = writeOverride(id, sql, req.user.email)
    res.json({ ok: true, id, ...entry })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.delete('/api/queries/:id', requireAuth({ minRole: 'power_user' }), (req, res) => {
  const { id } = req.params
  if (!getQueryDef(id)) return res.status(404).json({ error: `Query desconhecida: ${id}` })
  const removed = deleteOverride(id)
  res.json({ ok: true, id, removed })
})

// ─── Usuários e Acessos (admin) ────────────────────────────────
// Lista/atribui/remove papéis. Entradas de env (bootstrap) são fixas (source
// 'env') e não podem ser rebaixadas; as demais ficam em data/roles.json.
app.get('/api/access/users', requireAuth({ minRole: 'admin' }), (_req, res) => {
  res.json({ users: listRoles() })
})

app.put('/api/access/users/:email', requireAuth({ minRole: 'admin' }), (req, res) => {
  const role = req.body?.role
  try {
    const effective = setRole(req.params.email, role)
    res.json({ ok: true, email: String(req.params.email).toLowerCase(), role: effective })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.delete('/api/access/users/:email', requireAuth({ minRole: 'admin' }), (req, res) => {
  const removed = deleteRole(req.params.email)
  res.json({ ok: true, email: String(req.params.email).toLowerCase(), removed })
})

// ─── Pontuação sugerida (lift: ativos × cancelados, materializados) ──
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
// Cache por (versão do snapshot + janela) — buildSuggestions sobre a base
// completa é caro; presets reusam a mesma entrada.
const suggCache = new Map()

// GET /api/cancellation-suggestions?from=YYYY-MM-DD&to=YYYY-MM-DD
// Pontua o lift NO SERVIDOR a partir da base ATIVA completa (materializada) ×
// CANCELADOS materializados filtrados pela janela. Não consulta o banco ao
// vivo. Devolve o resultado compacto (grupos) + listas dinâmicas (p/ o Aplicar).
app.get('/api/cancellation-suggestions', requireAuth(), (req, res) => {
  const active = getClients()
  if (!active.length) return res.status(503).json({ error: 'Base ainda não materializada no backend (snapshot ausente).' })
  const cancelledAll = getCancelledClients()
  const cw = getDataset()?.cancelledMeta || null
  const winFrom = cw?.from || isoDaysAgo(365)
  const winTo = cw?.to || new Date().toISOString().slice(0, 10)

  // Filtro do usuário, limitado à janela materializada pelo ETL.
  const q = req.query
  let to = (typeof q.to === 'string' && DATE_RE.test(q.to)) ? q.to : winTo
  let from = (typeof q.from === 'string' && DATE_RE.test(q.from)) ? q.from : winFrom
  if (from > to) return res.status(400).json({ error: 'Intervalo inválido: "from" é posterior a "to".' })
  if (from < winFrom) from = winFrom
  if (to > winTo) to = winTo

  const key = `${getDataset()?.meta?.generatedAt || ''}:${from}:${to}`
  let payload = suggCache.get(key)
  if (!payload) {
    try {
      const cancelled = cancelledAll.filter((c) => c.cancellationDate && c.cancellationDate >= from && c.cancellationDate <= to)
      const lists = deriveLists([...active, ...cancelled])
      // Rede entra quando há sinal de rede (infra OU massiva) nos DOIS grupos
      // (ativos e cancelados). A infra cobre a base toda; os índices de massiva
      // que tiverem amostra baixa saem como "insuficiente" no próprio lift.
      // Enquanto o snapshot não trouxer rede p/ cancelados, mantemos fora.
      const hasNet = (c) => (c.netMassiveCount || 0) > 0 || !!c.netSite
      const netReady = active.some(hasNet) && cancelled.some(hasNet)
      const result = buildSuggestions(active, cancelled, lists, { skipEngines: netReady ? [] : ['network'] })
      payload = {
        groups: result.groups, indicatorCount: result.indicatorCount, indexCount: result.indexCount, riskCount: result.riskCount,
        lists,
        activeCount: active.length, cancelledCount: cancelled.length,
        window: { from, to }, materializedWindow: cw,
        meta: datasetStatus(),
      }
      if (suggCache.size >= 12) suggCache.delete(suggCache.keys().next().value)
      suggCache.set(key, payload)
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
  }
  res.json(payload)
})

// ─── Clientes cancelados (perfil) ─────────────────────────────
// GET /api/cancelled-clients?from&to&name&contract&city&page&pageSize
// Lista paginada da coorte de cancelados materializada — mesma convenção de
// filtro do runEngine (nome/contrato por "includes", cidade exata) e a mesma
// janela do endpoint de sugestões. Ordena por data de cancelamento (recente 1º).
app.get('/api/cancelled-clients', requireAuth(), (req, res) => {
  const all = getCancelledClients()
  if (!all.length) return res.status(503).json({ error: 'Base ainda não materializada no backend (snapshot ausente).' })
  const cw = getDataset()?.cancelledMeta || null
  const winFrom = cw?.from || '1970-01-01'
  const winTo = cw?.to || new Date().toISOString().slice(0, 10)

  const q = req.query
  let to = (typeof q.to === 'string' && DATE_RE.test(q.to)) ? q.to : winTo
  let from = (typeof q.from === 'string' && DATE_RE.test(q.from)) ? q.from : winFrom
  if (from > to) return res.status(400).json({ error: 'Intervalo inválido: "from" é posterior a "to".' })
  if (from < winFrom) from = winFrom
  if (to > winTo) to = winTo

  const name = String(q.name || '').trim().toLowerCase()
  const contract = String(q.contract || '').trim().toLowerCase()
  const city = typeof q.city === 'string' ? q.city : ''
  const motive = typeof q.motive === 'string' ? q.motive : ''
  const MOTIVE_NA = 'Não informado'
  const motiveOf = (c) => (c.cancellationMotive && String(c.cancellationMotive).trim()) || MOTIVE_NA

  let rows = all.filter((c) => c.cancellationDate && c.cancellationDate >= from && c.cancellationDate <= to)
  if (name) rows = rows.filter((c) => c.name && c.name.toLowerCase().includes(name))
  if (contract) rows = rows.filter((c) => String(c.contractNumber).toLowerCase().includes(contract) || String(c.clientId).toLowerCase().includes(contract))
  // Cidades calculadas ANTES do filtro de cidade — o dropdown mantém as opções.
  const cities = Array.from(new Set(rows.map((c) => c.city).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  if (city) rows = rows.filter((c) => c.city === city)

  // Motivos (contagem + MRR) sobre o escopo atual, ANTES do filtro de motivo —
  // o breakdown mantém todos os motivos mesmo com um selecionado.
  const motiveAgg = new Map()
  for (const c of rows) {
    const m = motiveOf(c)
    const e = motiveAgg.get(m) || { count: 0, mrr: 0 }
    e.count++; e.mrr += Number(c.monthlyValue) || 0
    motiveAgg.set(m, e)
  }
  const motives = Array.from(motiveAgg, ([value, e]) => ({ value, count: e.count, mrr: e.mrr })).sort((a, b) => b.count - a.count)
  if (motive) rows = rows.filter((c) => motiveOf(c) === motive)

  rows = rows.slice().sort((a, b) => String(b.cancellationDate || '').localeCompare(String(a.cancellationDate || '')))
  const total = rows.length
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25))
  const page = Math.max(0, Number(q.page) || 0)
  res.json({
    rows: rows.slice(page * pageSize, page * pageSize + pageSize),
    total, page, pageSize, cities, motives,
    window: { from, to }, materializedWindow: cw,
    meta: datasetStatus(),
  })
})

app.listen(PORT, () => {
  console.log(`ChurnIQ API ouvindo em :${PORT}`)
  console.log(`  domínio permitido: @${ALLOWED_DOMAIN}`)
  console.log(`  papéis: ADMIN_EMAILS/POWER_USER_EMAILS (env) + data/roles.json (tela)`)
  console.log(`  overrides: ${OVERRIDES_PATH}`)
})

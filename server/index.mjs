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
import express from 'express'
import { getCatalog, ENGINE_LABELS } from '../scripts/queries/index.mjs'
import { writeOverride, deleteOverride, OVERRIDES_PATH } from '../scripts/queries/overrides.mjs'
import { getQueryDef } from '../scripts/queries/registry.mjs'

const PORT = Number(process.env.API_PORT) || 8787
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || 'sebratel.com.br').toLowerCase()
// Allowlist opcional de editores (CSV de e-mails). Vazia → qualquer usuário do
// domínio permitido pode editar.
const EDITORS = (process.env.QUERY_EDITOR_EMAILS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

const app = express()
app.use(express.json({ limit: '256kb' }))

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
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return null
  const p = await r.json()
  if (!p.email || p.email_verified === false) return null
  const user = { email: String(p.email).toLowerCase(), name: p.name || p.email }
  tokenCache.set(token, { user, exp: Date.now() + TOKEN_TTL_MS })
  return user
}

function requireAuth({ editor = false } = {}) {
  return async (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '')
    if (!m) return res.status(401).json({ error: 'Token de autenticação ausente.' })
    let user = null
    try { user = await getUserFromToken(m[1]) } catch { user = null }
    if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' })
    if (!user.email.endsWith('@' + ALLOWED_DOMAIN)) {
      return res.status(403).json({ error: `Acesso restrito a contas @${ALLOWED_DOMAIN}.` })
    }
    if (editor && EDITORS.length && !EDITORS.includes(user.email)) {
      return res.status(403).json({ error: 'Sua conta não tem permissão para editar queries.' })
    }
    req.user = user
    next()
  }
}

// ─── Rotas ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'churniq-api', overridesPath: OVERRIDES_PATH })
})

app.get('/api/queries', requireAuth(), (req, res) => {
  // canEdit informa ao front se deve mostrar os controles de edição.
  const canEdit = !EDITORS.length || EDITORS.includes(req.user.email)
  res.json({ queries: getCatalog(), engineLabels: ENGINE_LABELS, canEdit })
})

app.put('/api/queries/:id', requireAuth({ editor: true }), (req, res) => {
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

app.delete('/api/queries/:id', requireAuth({ editor: true }), (req, res) => {
  const { id } = req.params
  if (!getQueryDef(id)) return res.status(404).json({ error: `Query desconhecida: ${id}` })
  const removed = deleteOverride(id)
  res.json({ ok: true, id, removed })
})

app.listen(PORT, () => {
  console.log(`ChurnIQ API ouvindo em :${PORT}`)
  console.log(`  domínio permitido: @${ALLOWED_DOMAIN}`)
  console.log(`  editores: ${EDITORS.length ? EDITORS.join(', ') : '(qualquer conta do domínio)'}`)
  console.log(`  overrides: ${OVERRIDES_PATH}`)
})

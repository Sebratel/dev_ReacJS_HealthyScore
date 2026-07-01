// ─────────────────────────────────────────────────────────────────────────
// API de alto nível do registro de queries — usada pelo ETL (fetch-clients.mjs)
// e pelo backend (server/index.mjs).
//
//   SQL efetivo = override (se existir e for válido) senão o default.
// ─────────────────────────────────────────────────────────────────────────
import { QUERIES, getQueryDef, renderTemplate } from './registry.mjs'
import { readOverrides } from './overrides.mjs'
import { checkReadOnly } from './guard.mjs'

// Template efetivo de UMA query (override válido ?? default), SEM renderizar.
// Override inválido (ex.: arquivo adulterado) cai no default com aviso.
function effectiveTemplate(id, overrides) {
  const def = getQueryDef(id)
  if (!def) throw new Error(`Query desconhecida: ${id}`)
  const ov = overrides[id]
  if (ov && typeof ov.sql === 'string') {
    const check = checkReadOnly(ov.sql)
    if (check.ok) return { sql: ov.sql, overridden: true }
    console.warn(`[queries] override de ${id} inválido (${check.reason}) — usando default.`)
  }
  return { sql: def.sql, overridden: false }
}

// Mapa { id -> SQL efetivo já renderizado } para o ETL.
// Loga no console quais queries estão usando override.
export function buildEffectiveQueries(ctx = {}) {
  const overrides = readOverrides()
  const out = {}
  const overriddenIds = []
  for (const def of QUERIES) {
    const { sql, overridden } = effectiveTemplate(def.id, overrides)
    out[def.id] = renderTemplate(sql, ctx)
    if (overridden) overriddenIds.push(def.id)
  }
  if (overriddenIds.length) {
    console.log(`[queries] usando override(s) em: ${overriddenIds.join(', ')}`)
  } else {
    console.log('[queries] nenhum override — usando todos os SQL default.')
  }
  return out
}

// SQL efetivo de uma única query, já renderizado.
export function getEffectiveSql(id, ctx = {}) {
  const { sql } = effectiveTemplate(id, readOverrides())
  return renderTemplate(sql, ctx)
}

// Catálogo para o backend/UI: metadados + SQL default e efetivo (templates,
// com o token {{sampleClause}} visível para edição) + info do override.
export function getCatalog() {
  const overrides = readOverrides()
  return QUERIES.map((def) => {
    const ov = overrides[def.id]
    const valid = ov && typeof ov.sql === 'string' && checkReadOnly(ov.sql).ok
    return {
      id: def.id,
      engine: def.engine,
      title: def.title,
      description: def.description,
      db: def.db,
      params: def.params,
      defaultSql: def.sql,
      effectiveSql: valid ? ov.sql : def.sql,
      isOverridden: !!valid,
      updatedAt: valid ? ov.updatedAt : null,
      updatedBy: valid ? ov.updatedBy : null,
    }
  })
}

export { ENGINE_LABELS } from './registry.mjs'

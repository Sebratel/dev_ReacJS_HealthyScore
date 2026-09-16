// ─────────────────────────────────────────────────────────────────────────
// Escopo por setor do RBAC. É regra de segurança: se um power user do
// Financeiro conseguir gravar peso da engine de Rede, o controle não existe.
//
// roles.mjs e officialConfig.mjs leem env/caminho no topo do módulo, então
// cada cenário usa resetModules() + import dinâmico com as envs do caso.
// ─────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'churniq-roles-'))
const rolesFile = join(dir, 'roles.json')
const configFile = join(dir, 'official-config.json')

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// Carrega roles.mjs com o arquivo e as envs deste cenário.
async function loadRoles({ admins = '', power = '', file = {} } = {}) {
  writeFileSync(rolesFile, JSON.stringify(file, null, 2), 'utf8')
  process.env.ROLES_PATH = rolesFile
  process.env.ADMIN_EMAILS = admins
  process.env.POWER_USER_EMAILS = power
  process.env.QUERY_EDITOR_EMAILS = ''
  vi.resetModules()
  return import('./roles.mjs')
}

describe('escopo por setor', () => {
  it('entrada legada (string) vale por todos os setores', async () => {
    const r = await loadRoles({ file: { 'antigo@sebratel.com.br': 'power_user' } })
    const acesso = r.resolveAccess('antigo@sebratel.com.br')
    expect(acesso.role).toBe('power_user')
    expect(acesso.scopes).toBe('*')
    expect(r.canEditSector(acesso.scopes, 'network')).toBe(true)
  })

  it('power user setorial edita o seu setor e mais nenhum', async () => {
    const r = await loadRoles({
      file: { 'misael.cruz@sebratel.com.br': { role: 'power_user', scopes: ['financial'] } },
    })
    const { role, scopes } = r.resolveAccess('misael.cruz@sebratel.com.br')
    expect(role).toBe('power_user')
    expect(scopes).toEqual(['financial'])
    expect(r.canEditSector(scopes, 'financial')).toBe(true)
    expect(r.canEditSector(scopes, 'relationship')).toBe(false)
  })

  it('dois setores no mesmo e-mail', async () => {
    const r = await loadRoles({
      file: { 'desenvolvimento@sebratel.com.br': { role: 'power_user', scopes: ['relationship', 'installation'] } },
    })
    const { scopes } = r.resolveAccess('desenvolvimento@sebratel.com.br')
    expect(r.canEditSector(scopes, 'relationship')).toBe(true)
    expect(r.canEditSector(scopes, 'installation')).toBe(true)
    expect(r.canEditSector(scopes, 'financial')).toBe(false)
  })

  it('admin ignora escopo gravado — manda em todos os setores', async () => {
    const r = await loadRoles({ file: { 'chefe@sebratel.com.br': { role: 'admin', scopes: ['field'] } } })
    const { role, scopes } = r.resolveAccess('chefe@sebratel.com.br')
    expect(role).toBe('admin')
    expect(scopes).toBe('*')
  })

  it('semente da env não é rebaixada por escopo no arquivo', async () => {
    const r = await loadRoles({
      power: 'semente@sebratel.com.br',
      file: { 'semente@sebratel.com.br': { role: 'power_user', scopes: ['field'] } },
    })
    expect(r.resolveAccess('semente@sebratel.com.br').scopes).toBe('*')
    expect(r.listRoles().find((u) => u.email === 'semente@sebratel.com.br').source).toBe('env')
  })

  it('quem não está em lugar nenhum é viewer', async () => {
    const r = await loadRoles()
    expect(r.resolveAccess('ninguem@sebratel.com.br').role).toBe('viewer')
  })

  it('todos os setores marcados viram escopo total', async () => {
    const r = await loadRoles()
    expect(r.normalizeScopes(r.SECTORS)).toBe('*')
    expect(r.normalizeScopes(['financial', 'inexistente'])).toEqual(['financial'])
  })

  it('power user sem setor é recusado na gravação', async () => {
    const r = await loadRoles()
    expect(() => r.setRole('x@sebratel.com.br', 'power_user', [])).toThrow(/ao menos um setor/i)
  })

  it('setRole grava papel + setores e listRoles devolve os dois', async () => {
    const r = await loadRoles()
    const efetivo = r.setRole('novo@sebratel.com.br', 'power_user', ['commercial'])
    expect(efetivo).toEqual({ role: 'power_user', scopes: ['commercial'] })
    const linha = r.listRoles().find((u) => u.email === 'novo@sebratel.com.br')
    expect(linha).toMatchObject({ role: 'power_user', scopes: ['commercial'], source: 'file' })
  })
})

describe('escopo nas queries do catálogo', () => {
  it('cada grupo segue o setor correspondente', async () => {
    const r = await loadRoles()
    const soFinanceiro = ['financial']
    expect(r.canEditQueryGroup(soFinanceiro, 'financeiro')).toBe(true)
    expect(r.canEditQueryGroup(soFinanceiro, 'rede')).toBe(false)
    expect(r.canEditQueryGroup('*', 'rede')).toBe(true)
  })

  it('grupo transversal exige escopo total', async () => {
    const r = await loadRoles()
    for (const grupo of ['base', 'mensal', 'cancelados', 'retiradas']) {
      expect(r.canEditQueryGroup(['financial'], grupo)).toBe(false)
      expect(r.canEditQueryGroup('*', grupo)).toBe(true)
    }
  })

  it('editableQueryGroups lista só os grupos do escopo', async () => {
    const r = await loadRoles()
    expect(r.editableQueryGroups(['financial', 'network']).sort()).toEqual(['financeiro', 'rede'])
    expect(r.editableQueryGroups('*')).toBe('*')
  })
})

describe('merge da config oficial por escopo', () => {
  const oficial = {
    configs: {
      financial: { indicators: { overdueBills: { key: 'overdueBills', label: 'Faturas Atrasadas', points: -25 } } },
      network: {
        indicators: {
          massive: {
            key: 'massive', label: 'Massivas', points: -30,
            indices: [{ key: 'olt', label: 'OLT', points: -10 }],
          },
        },
      },
    },
  }

  beforeEach(() => {
    writeFileSync(configFile, JSON.stringify(oficial, null, 2), 'utf8')
    process.env.OFFICIAL_CONFIG_PATH = configFile
    vi.resetModules()
  })

  it('setor no escopo entra inteiro', async () => {
    const { mergeConfigsWithScope } = await import('./officialConfig.mjs')
    const enviado = {
      financial: { indicators: { overdueBills: { key: 'overdueBills', label: 'Faturas Atrasadas', points: -40 } } },
    }
    const { configs, applied } = mergeConfigsWithScope(enviado, (e) => e === 'financial')
    expect(applied).toEqual(['financial'])
    expect(configs.financial.indicators.overdueBills.points).toBe(-40)
  })

  it('setor fora do escopo preserva os pesos e aceita só o nome', async () => {
    const { mergeConfigsWithScope } = await import('./officialConfig.mjs')
    const enviado = {
      network: {
        indicators: {
          massive: {
            key: 'massive', label: 'Massivas (novo nome)', points: 999,
            indices: [{ key: 'olt', label: 'OLT renomeada', points: 999 }],
          },
        },
      },
    }
    const { configs, applied, namesOnly } = mergeConfigsWithScope(enviado, (e) => e === 'financial')
    expect(applied).toEqual([])
    expect(namesOnly).toEqual(['network'])
    expect(configs.network.indicators.massive.points).toBe(-30)          // peso intacto
    expect(configs.network.indicators.massive.label).toBe('Massivas (novo nome)')
    expect(configs.network.indicators.massive.indices[0].points).toBe(-10)
    expect(configs.network.indicators.massive.indices[0].label).toBe('OLT renomeada')
  })

  it('setor ainda sem config oficial entra como veio (é o default do código)', async () => {
    const { mergeConfigsWithScope } = await import('./officialConfig.mjs')
    const enviado = { field: { indicators: { visits: { key: 'visits', label: 'Visitas', points: -5 } } } }
    const { configs, applied } = mergeConfigsWithScope(enviado, (e) => e === 'financial')
    expect(applied).toEqual(['field'])
    expect(configs.field.indicators.visits.points).toBe(-5)
  })

  it('setor que não foi enviado continua na oficial', async () => {
    const { mergeConfigsWithScope } = await import('./officialConfig.mjs')
    const { configs } = mergeConfigsWithScope({ financial: oficial.configs.financial }, () => true)
    expect(configs.network.indicators.massive.points).toBe(-30)
  })
})

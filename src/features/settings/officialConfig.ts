// Sincronização da CONFIG OFICIAL (pesos + limiares) com o servidor.
//   - Boot: baixa /api/config e hidrata o store (todos veem a mesma config).
//   - Escrita: quando um POWER_USER muda pesos, grava de volta (debounced) — o
//     servidor aplica só os SETORES do escopo dele e preserva os demais.
//     Limiares são globais: só admin grava.
// Autoridade real do scoring é o servidor; isto mantém a UI e a oficial em dia.
import { quietAuthedGet, quietAuthedPut } from '@/features/auth/access'
import { useAppStore } from '@/store/appStore'
import { useAuthStore, hasRole } from '@/store/authStore'

let ready = false      // só grava depois da hidratação inicial (evita eco)
let started = false    // assina o store uma única vez
let tCfg: ReturnType<typeof setTimeout> | undefined
let tThr: ReturnType<typeof setTimeout> | undefined

function collectConfigs() {
  const s = useAppStore.getState()
  return {
    financial: s.financialConfig, commercial: s.commercialConfig, connection: s.connectionConfig,
    network: s.networkConfig, field: s.fieldConfig, installation: s.installationConfig, relationship: s.relationshipConfig,
  }
}

// Baixa a config oficial e hidrata o store. Silencioso (quiet get): sem oficial
// ainda, mantém defaults/local (o backend também cai no envio do cliente).
export async function loadOfficialConfig(): Promise<void> {
  const res = await quietAuthedGet('/api/config')
  if (res?.ok) {
    const data = await res.json().catch(() => null)
    if (data && (data.configs || data.thresholds)) {
      useAppStore.getState().hydrateOfficial({ configs: data.configs || undefined, thresholds: data.thresholds || undefined })
    }
  }
  ready = true
}

// Liga a sincronização (idempotente). Chamar uma vez no boot autenticado.
export function initOfficialConfigSync(): void {
  if (started) return
  started = true
  loadOfficialConfig()
  useAppStore.subscribe((s, prev) => {
    if (!ready) return
    const role = useAuthStore.getState().role
    const cfgChanged =
      s.financialConfig !== prev.financialConfig || s.commercialConfig !== prev.commercialConfig ||
      s.connectionConfig !== prev.connectionConfig || s.networkConfig !== prev.networkConfig ||
      s.fieldConfig !== prev.fieldConfig || s.installationConfig !== prev.installationConfig ||
      s.relationshipConfig !== prev.relationshipConfig
    if (cfgChanged && hasRole(role, 'power_user')) {
      clearTimeout(tCfg)
      tCfg = setTimeout(() => quietAuthedPut('/api/config/configs', { configs: collectConfigs() }), 900)
    }
    // Limiares valem para todos os setores — quem publica é admin.
    if (s.healthThresholds !== prev.healthThresholds && hasRole(role, 'admin')) {
      clearTimeout(tThr)
      tThr = setTimeout(() => quietAuthedPut('/api/config/thresholds', { thresholds: useAppStore.getState().healthThresholds }), 900)
    }
  })
}

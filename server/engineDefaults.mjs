// ─────────────────────────────────────────────────────────────────────────
// Defaults das 7 engines, num lugar só.
//
// Estavam copiados em score-history.mjs e monthly-cohort.mjs; agora o servidor
// também precisa deles, para mesclar a config oficial gravada no volume sobre
// a forma ATUAL do código. Três cópias seria uma a mais do que já era demais.
//
// Roda sob tsx (os configs são .ts).
// ─────────────────────────────────────────────────────────────────────────
import { DEFAULT_FINANCIAL_CONFIG } from '../src/features/financial-engine/financialConfig.ts'
import { DEFAULT_COMMERCIAL_CONFIG } from '../src/features/commercial-engine/commercialConfig.ts'
import { DEFAULT_CONNECTION_CONFIG } from '../src/features/connection-engine/connectionConfig.ts'
import { DEFAULT_NETWORK_CONFIG } from '../src/features/network-engine/networkConfig.ts'
import { DEFAULT_FIELD_CONFIG } from '../src/features/field-engine/fieldConfig.ts'
import { DEFAULT_INSTALLATION_CONFIG } from '../src/features/installation-engine/installationConfig.ts'
import { DEFAULT_RELATIONSHIP_CONFIG } from '../src/features/relationship-engine/relationshipConfig.ts'
import { mergeEngineConfig } from '../src/utils/mergeEngineConfig.ts'

export const DEFAULT_ENGINE_CONFIGS = {
  financial: DEFAULT_FINANCIAL_CONFIG,
  commercial: DEFAULT_COMMERCIAL_CONFIG,
  connection: DEFAULT_CONNECTION_CONFIG,
  network: DEFAULT_NETWORK_CONFIG,
  field: DEFAULT_FIELD_CONFIG,
  installation: DEFAULT_INSTALLATION_CONFIG,
  relationship: DEFAULT_RELATIONSHIP_CONFIG,
}

/**
 * Config efetiva de scoring: os defaults do código com as notas gravadas por
 * cima. Uma engine ausente no salvo entra inteira pelo default.
 *
 * Sem isto, uma mudança de forma no código (um indicador que vira faixa) fica
 * invisível para quem já gravou config — e o indicador some da tela, pontuando
 * zero, sem erro nenhum.
 */
export function withDefaults(salvos) {
  const out = {}
  for (const [chave, def] of Object.entries(DEFAULT_ENGINE_CONFIGS)) {
    out[chave] = mergeEngineConfig(def, salvos?.[chave])
  }
  return out
}

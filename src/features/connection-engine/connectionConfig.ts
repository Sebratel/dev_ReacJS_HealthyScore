import type {
  ConnectionEngineConfig,
  ConnectionIndicatorConfig,
  ConnectionIndicatorKey,
} from '@/types'

// Indicadores de quedas de PPPoE (status da ONU, banco AutoISP) — presença:
// pontua quando o contrato registrou o status no período.
export type OnuIndicatorKey = Extract<
  ConnectionIndicatorKey,
  'onuPowerFail' | 'onuLossSignal' | 'onuCritical' | 'onuWarning' | 'onuOk' | 'onuUp'
>
export const ONU_INDICATOR_KEYS: OnuIndicatorKey[] = [
  'onuPowerFail', 'onuLossSignal', 'onuCritical', 'onuWarning', 'onuOk', 'onuUp',
]
// Chave do indicador → valor cru de new_status no AutoISP.
export const ONU_STATUS_OF: Record<OnuIndicatorKey, string> = {
  onuPowerFail: 'power_fail',
  onuLossSignal: 'loss_signal',
  onuCritical: 'critical',
  onuWarning: 'warning',
  onuOk: 'OK',
  onuUp: 'up',
}

// Indicadores de QUALIDADE DO ENLACE — a foto atual do cliente, não o histórico
// de quedas. Vêm das queries Q_AUTOISP_ONU_HEALTH / _ONU_LAN / _CPE.
export const LINK_INDICATOR_KEYS: ConnectionIndicatorKey[] = [
  'opticalPower', 'lanSpeed', 'wifiGeneration', 'wifiRssi', 'onuStatusNow',
  'fiberDistance', 'onuTemperature', 'cpeMemory', 'cpeTemperature',
]

export const CONNECTION_INDICATOR_ORDER: ConnectionIndicatorKey[] = [
  'equipment', ...LINK_INDICATOR_KEYS, ...ONU_INDICATOR_KEYS,
]

// ─── Faixas ────────────────────────────────────────────────────
export interface ConnRange { key: string; label: string; max: number; defaultPoints: number }

export function bucketByMax(value: number, ranges: ConnRange[]): ConnRange {
  return ranges.find((r) => value <= r.max) ?? ranges[ranges.length - 1]
}

// Potência óptica recebida pela ONU, em dBm (sempre negativa; quanto mais
// negativa, pior). Fazemos o bucket sobre o VALOR ABSOLUTO para a escala ficar
// crescente — −27 dBm vira 27 e cai na faixa "ruim".
// Referência de GPON: acima de −24 dBm é folgado; abaixo de −28 o enlace começa
// a errar pacote; abaixo de −30 está no limite de sensibilidade da ONU.
export const RX_POWER_RANGES: ConnRange[] = [
  { key: 'boa', label: 'Boa (≥ −24 dBm)', max: 24, defaultPoints: 0 },
  { key: 'atencao', label: 'Atenção (−24 a −26 dBm)', max: 26, defaultPoints: -5 },
  { key: 'ruim', label: 'Ruim (−26 a −28 dBm)', max: 28, defaultPoints: -15 },
  { key: 'critica', label: 'Crítica (−28 a −30 dBm)', max: 30, defaultPoints: -25 },
  { key: 'limite', label: 'No limite (< −30 dBm)', max: Infinity, defaultPoints: -40 },
]

// Distância da fibra até a OLT, em metros. Não é defeito por si — entra porque
// distância alta explica atenuação alta e limita o que adianta trocar no cliente.
export const DISTANCE_RANGES: ConnRange[] = [
  { key: 'ate2k', label: 'Até 2 km', max: 2000, defaultPoints: 0 },
  { key: '2a5k', label: '2 a 5 km', max: 5000, defaultPoints: 0 },
  { key: '5a10k', label: '5 a 10 km', max: 10000, defaultPoints: -5 },
  { key: '10a15k', label: '10 a 15 km', max: 15000, defaultPoints: -10 },
  { key: 'acima15k', label: 'Acima de 15 km', max: Infinity, defaultPoints: -15 },
]

// RSSI do Wi-Fi dentro da casa, em dBm (sempre negativo). Bucket sobre o valor
// ABSOLUTO, como a potência óptica — −74 dBm vira 74 e cai em "ruim".
//
// O valor pontuado é a MEDIANA dos dispositivos do cliente, nunca o pior. Medido
// contra o banco: agregar pelo pior marca 15% dos contratos de 1 dispositivo e
// 77% dos de 6+ — mediria quantos aparelhos a casa tem, não a qualidade do
// Wi-Fi (toda casa com 6 aparelhos tem um celular no quintal). Pela mediana a
// marcação fica estável em ~10-15% qualquer que seja o número de dispositivos.
//
// Os cortes seguem o que o cliente sente: acima de −60 dBm o Wi-Fi entrega a
// banda do plano; entre −67 e −72 a taxa já cai pela metade; abaixo de −80 a
// conexão vive caindo. Distribuição real da base: 55% boa, 21% aceitável,
// 11% fraca, 9% ruim, 4% crítica.
export const WIFI_RSSI_RANGES: ConnRange[] = [
  { key: 'boa', label: 'Boa (≥ −60 dBm)', max: 60, defaultPoints: 0 },
  { key: 'aceitavel', label: 'Aceitável (−60 a −67 dBm)', max: 67, defaultPoints: -3 },
  { key: 'fraca', label: 'Fraca (−67 a −72 dBm)', max: 72, defaultPoints: -10 },
  { key: 'ruim', label: 'Ruim (−72 a −80 dBm)', max: 80, defaultPoints: -18 },
  { key: 'critica', label: 'Crítica (< −80 dBm)', max: Infinity, defaultPoints: -30 },
]

// Memória RAM em uso no CPE (%). É o "INT6 - AUTO ISP/MEMORIA RAM ALTA -
// ONT/ROTEADOR" que a Int6 abre como chamado. Roteador sem memória trava e
// derruba a navegação mesmo com sinal perfeito.
// Marca pouca gente de propósito: 96% da base fica abaixo de 70%.
export const CPE_MEMORY_RANGES: ConnRange[] = [
  { key: 'ate70', label: 'Até 70%', max: 70, defaultPoints: 0 },
  { key: '70a80', label: '70 a 80%', max: 80, defaultPoints: -3 },
  { key: '80a90', label: '80 a 90%', max: 90, defaultPoints: -8 },
  { key: 'acima90', label: 'Acima de 90%', max: Infinity, defaultPoints: -15 },
]

// Temperatura do CPE (°C) — o roteador inteiro, NÃO o módulo óptico da ONU
// (esse é o `onuTemperature`, que vem de onu_infos). 98% da base fica abaixo de
// 45 °C; acima de 55 °C é equipamento em local abafado ou já degradado.
export const CPE_TEMPERATURE_RANGES: ConnRange[] = [
  { key: 'ate45', label: 'Até 45 °C', max: 45, defaultPoints: 0 },
  { key: '45a55', label: '45 a 55 °C', max: 55, defaultPoints: -3 },
  { key: '55a65', label: '55 a 65 °C', max: 65, defaultPoints: -8 },
  { key: 'acima65', label: 'Acima de 65 °C', max: Infinity, defaultPoints: -15 },
]

// Temperatura do módulo óptico da ONU (°C). Acima de ~65 °C o transceptor
// começa a derivar e a taxa de erro sobe.
export const TEMPERATURE_RANGES: ConnRange[] = [
  { key: 'ate45', label: 'Até 45 °C', max: 45, defaultPoints: 0 },
  { key: '45a55', label: '45 a 55 °C', max: 55, defaultPoints: -5 },
  { key: '55a65', label: '55 a 65 °C', max: 65, defaultPoints: -12 },
  { key: 'acima65', label: 'Acima de 65 °C', max: Infinity, defaultPoints: -20 },
]

// ─── Categóricos ───────────────────────────────────────────────
const catIndices = (rows: [string, string, number][]) =>
  rows.map(([key, label, points]) => ({ key, label, points }))

// Velocidade negociada na porta LAN da ONU. Os planos residenciais (TOP,
// PREMIUM, EXCLUSIVE) não trazem a banda no nome, então não dá para comparar
// automaticamente com o contratado — mas todos eles passam de 100 Mbps, e é
// por isso que uma porta negociando 100 (ou 10) é um teto que o cliente sente.
export const LAN_SPEED_INDICES: [string, string, number][] = [
  ['1000', 'Gigabit (1000 Mbps)', 0],
  ['100', 'Fast Ethernet (100 Mbps) — teto abaixo do plano', -20],
  ['10', '10 Mbps — teto muito abaixo do plano', -35],
  ['sem_link', 'Nenhuma porta LAN ativa (só Wi-Fi)', 0],
]

// Geração do Wi-Fi do CPE. Derivada do modelo reportado por TR-069 — conferida
// contra o parâmetro WLANConfiguration.5.Standard do próprio equipamento.
export const WIFI_GEN_INDICES: [string, string, number][] = [
  ['ax', 'Wi-Fi 6 (ax)', 0],
  ['ac', 'Wi-Fi 5 (ac)', -5],
  ['n', 'Wi-Fi 4 (n)', -15],
  ['bridge', 'Sem Wi-Fi (ONU bridge)', 0],
  ['desconhecido', 'Modelo não identificado', 0],
]

// Status corrente da ONU (diferente dos indicadores de PPPoE, que contam
// eventos do período: aqui é como o cliente está AGORA).
export const ONU_STATUS_NOW_INDICES: [string, string, number][] = [
  ['OK', 'OK', 0],
  ['up', 'Conectada', 0],
  ['warning', 'Alerta de sinal', -8],
  ['critical', 'Sinal crítico', -20],
  ['power_fail', 'Queda de energia', -12],
  ['loss_signal', 'Perda de sinal óptico', -25],
  ['down', 'Fora do ar', -20],
  ['unavailable', 'Indisponível', -15],
  ['inactive', 'Inativa', 0],
  ['sem_leitura', 'Sem leitura', 0],
]

// De-para modelo do CPE → geração do Wi-Fi. Conferido no próprio banco: o
// parâmetro WLANConfiguration.5.Standard devolve 'a,n,ac,ax' nos F6600/F6600P e
// 'a,n,ac' nos F670L/F680. Ler esse parâmetro para toda a base custa mais de
// 10 min (é um jsonb de 1,7 GB); o de-para por modelo sai junto com o firmware,
// em 2,3s. A comparação é feita sobre o modelo normalizado (sem hífen/espaço).
const WIFI_GEN_BY_MODEL: Record<string, 'ax' | 'ac' | 'n' | 'bridge'> = {
  // ZTE
  f6600: 'ax', f6600p: 'ax', f8605p: 'ax',
  f670l: 'ac', f680: 'ac', f6201b: 'ac', zxhnh198av30: 'ac', zxhnh199a: 'ac',
  f601: 'bridge',
  // Huawei
  eg8145v5: 'ac', eg8145b750: 'ac', hs8546v5: 'ac', hg8546m: 'ac', hs8545m5: 'ac',
  // TP-Link
  archerc5: 'ac', xx530v: 'ac', tplinkxx530v: 'ac', newarcher: 'ac', archerv5: 'ac',
  tlwr840n: 'n', tlwr849n: 'n', tlwr820n: 'n', tlwr940n: 'n',
  // Nokia / Intelbras / Fiberhome
  g1426ga: 'ac',
  intelbrasiwr300n: 'n',
  an550601a: 'bridge', an550601a1: 'bridge', an550601b1: 'bridge', an550602b: 'bridge',
  an550604b: 'n',
  parks100: 'bridge', parks101: 'bridge',
}

export function wifiGenerationOf(model: string | undefined | null): string {
  const norm = (model ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!norm) return 'desconhecido'
  return WIFI_GEN_BY_MODEL[norm] ?? 'desconhecido'
}

// ─── Montagem dos indicadores ──────────────────────────────────
const ONU_QUERY = (status: string) =>
  `SELECT c.contract_id, osc.new_status, count(*)\nFROM contracts c\nJOIN contracted_services cs ON cs.contract_id = c.contract_id\nJOIN gpon_clients gc ON gc.contracted_service_id = cs.id\nJOIN onu_status_changes osc ON osc.gpon_client_id = gc.id\nWHERE osc.new_status = '${status}'\nGROUP BY c.contract_id, osc.new_status; -- banco AutoISP`

const onuIndicator = (key: OnuIndicatorKey, label: string, description: string, points: number): ConnectionIndicatorConfig => ({
  key, label, description, mode: 'manual', points, dynamic: false, indices: [], query: ONU_QUERY(ONU_STATUS_OF[key]),
})

const rangeIndicator = (
  key: ConnectionIndicatorKey, label: string, description: string, ranges: ConnRange[], query: string,
): ConnectionIndicatorConfig => ({
  key, label, description, mode: 'manual', dynamic: false, query,
  indices: ranges.map((r) => ({ key: r.key, label: r.label, points: r.defaultPoints })),
})

const catIndicator = (
  key: ConnectionIndicatorKey, label: string, description: string, rows: [string, string, number][], query: string,
): ConnectionIndicatorConfig => ({
  key, label, description, mode: 'manual', dynamic: false, query, indices: catIndices(rows),
})

const Q_HEALTH = 'SELECT cs.contract_id, os.calculated_rx_power, os.calculated_status, os.massive_event_id,\n  oi.distance, oi.optical_temperature\nFROM onu_statuses os\nJOIN gpon_clients gc ON gc.id = os.gpon_client_id\nJOIN contracted_services cs ON cs.id = gc.contracted_service_id\nLEFT JOIN onu_infos oi ON oi.gpon_client_id = gc.id; -- banco AutoISP'

const Q_LAN = "SELECT cs.contract_id,\n  (SELECT max(nullif(regexp_replace(p->>'negotiated_speed','[^0-9]','','g'),'')::int)\n     FROM jsonb_array_elements(os.ethernet) p WHERE p->>'link' = 'up') lan_mbps\nFROM onu_statuses os\nJOIN gpon_clients gc ON gc.id = os.gpon_client_id\nJOIN contracted_services cs ON cs.id = gc.contracted_service_id\nWHERE jsonb_typeof(os.ethernet) = 'array'; -- banco AutoISP"

const Q_CPE = 'SELECT cs.contract_id, ac.router_model_name, ac.firmware_version\nFROM acs_clients ac\nJOIN gpon_clients gc ON gc.id = ac.gpon_client_id\nJOIN contracted_services cs ON cs.id = gc.contracted_service_id; -- banco AutoISP'

const Q_WIFI = "-- banco AutoISP (TR-069). RSSI por dispositivo associado ao Wi-Fi:\n-- ...WLANConfiguration.<radio>.AssociatedDevice.<n>.X_INT6_RSSI\n-- (radio 1 = 2.4 GHz, 5 = 5 GHz). O filtro por last_inform e' o que segura o\n-- custo: e' coluna normal, avaliada ANTES de abrir o jsonb de 1,7 GB.\nSELECT cs.contract_id,\n  percentile_cont(0.5) WITHIN GROUP (ORDER BY rssi) rssi_mediano,\n  min(rssi) pior_rssi, count(*) devices_wifi,\n  d->>'InternetGatewayDevice.DeviceInfo.X_INT6_MEMUSED_PERCENT' cpe_mem_pct,\n  d->>'InternetGatewayDevice.DeviceInfo.X_INT6_TEMPERATURE' cpe_temp_c\nFROM acs_device_statuses ads, LATERAL jsonb_each_text(ads.last_analytics_data_translated) e\nJOIN acs_clients ac ON ac.device_id = ads.device_id\nJOIN gpon_clients gc ON gc.id = ac.gpon_client_id\nJOIN contracted_services cs ON cs.id = gc.contracted_service_id\nWHERE ads.last_inform >= now() - interval '48 hours'\n  AND e.key LIKE '%.AssociatedDevice.%.X_INT6_RSSI'\nGROUP BY cs.contract_id;"

// Configuração padrão. Os índices de "Equipamento" são preenchidos dinamicamente
// em runtime a partir dos modelos reais alocados (store.syncConnectionLists).
// Pontuação padrão 0 — você define a nota de cada modelo no modal.
export const DEFAULT_CONNECTION_CONFIG: ConnectionEngineConfig = {
  indicators: {
    equipment: {
      key: 'equipment',
      label: 'Equipamento (modelo)',
      description: 'Pontuação por modelo de equipamento alocado no contrato. O cliente soma a nota de cada modelo distinto que possui.',
      mode: 'manual',
      dynamic: true,
      indices: [],
      query: 'SELECT p.title, count(*) FROM patrimony_packing_list_items plis\n  JOIN patrimonies p ON p.id = plis.patrimony_id\n  ... GROUP BY p.title;',
    },

    // ── Qualidade do enlace (foto atual, AutoISP) ──
    opticalPower: rangeIndicator('opticalPower', 'Potência óptica (atenuação)',
      'Sinal óptico que chega na ONU do cliente, em dBm. É a medida direta da atenuação do enlace: quanto mais negativo, mais fraco o sinal e maior a chance de lentidão e queda intermitente.',
      RX_POWER_RANGES, Q_HEALTH),
    lanSpeed: catIndicator('lanSpeed', 'Velocidade da porta LAN',
      'Maior velocidade negociada entre as portas ethernet ativas da ONU. Cliente de plano alto ligado numa porta de 100 Mbps nunca alcança a velocidade contratada — e costuma culpar o provedor.',
      LAN_SPEED_INDICES, Q_LAN),
    wifiGeneration: catIndicator('wifiGeneration', 'Geração do Wi-Fi (ac/ax)',
      'Padrão de Wi-Fi que o equipamento do cliente suporta, derivado do modelo reportado por TR-069. Wi-Fi 4 (n) num plano de centenas de megas é gargalo garantido dentro da casa.',
      WIFI_GEN_INDICES, Q_CPE),
    wifiRssi: rangeIndicator('wifiRssi', 'Sinal do Wi-Fi na casa (RSSI)',
      'Força do sinal que os aparelhos do cliente recebem do roteador, em dBm — o Wi-Fi de dentro da casa, não o enlace de fibra. Pontua a MEDIANA dos dispositivos: o pior aparelho sozinho só diria quantos aparelhos a casa tem. Só ~20% dos CPEs reportam (depende do firmware); quem não reporta não pontua.',
      WIFI_RSSI_RANGES, Q_WIFI),
    cpeMemory: rangeIndicator('cpeMemory', 'Memória do roteador (CPE)',
      'Percentual de memória RAM em uso no roteador do cliente. É o mesmo sinal que a Int6 usa para abrir o chamado "MEMORIA RAM ALTA - ONT/ROTEADOR": roteador sem memória trava e derruba a navegação mesmo com o sinal óptico perfeito.',
      CPE_MEMORY_RANGES, Q_WIFI),
    cpeTemperature: rangeIndicator('cpeTemperature', 'Temperatura do roteador (CPE)',
      'Temperatura do roteador do cliente, reportada por TR-069. Diferente da "Temperatura da ONU", que é a do módulo óptico: esta é a do equipamento inteiro e denuncia aparelho em local abafado (dentro de armário, atrás da TV) antes de ele começar a reiniciar sozinho.',
      CPE_TEMPERATURE_RANGES, Q_WIFI),
    onuStatusNow: catIndicator('onuStatusNow', 'Status atual da ONU',
      'Como a ONU do contrato está no momento da carga — diferente dos indicadores de PPPoE abaixo, que contam eventos acumulados no período.',
      ONU_STATUS_NOW_INDICES, Q_HEALTH),
    fiberDistance: rangeIndicator('fiberDistance', 'Distância da fibra',
      'Distância medida entre a ONU e a OLT, em metros. Não é defeito por si só, mas explica atenuação alta e limita o que adianta trocar na casa do cliente.',
      DISTANCE_RANGES, Q_HEALTH),
    onuTemperature: rangeIndicator('onuTemperature', 'Temperatura da ONU',
      'Temperatura do módulo óptico da ONU. Acima de ~65 °C o transceptor começa a derivar e a taxa de erro sobe — costuma indicar equipamento em local abafado ou já degradado.',
      TEMPERATURE_RANGES, Q_HEALTH),
    // ── Quedas de PPPoE (eventos acumulados no período) ──
    onuPowerFail: onuIndicator('onuPowerFail', 'ONU — Queda de Energia (power_fail)',
      'Pontuação quando a ONU do contrato registrou queda por falta de energia no período (quedas de PPPoE — AutoISP).', -10),
    onuLossSignal: onuIndicator('onuLossSignal', 'ONU — Perda de Sinal (loss_signal)',
      'Pontuação quando a ONU do contrato registrou perda de sinal óptico no período (quedas de PPPoE — AutoISP).', -15),
    onuCritical: onuIndicator('onuCritical', 'ONU — Sinal Crítico (critical)',
      'Pontuação quando a ONU do contrato registrou status crítico no período (AutoISP).', -12),
    onuWarning: onuIndicator('onuWarning', 'ONU — Alerta de Sinal (warning)',
      'Pontuação quando a ONU do contrato registrou alerta de sinal no período (AutoISP).', -5),
    onuOk: onuIndicator('onuOk', 'ONU — Sinal OK (OK)',
      'Pontuação quando a ONU do contrato registrou status OK no período (AutoISP).', 0),
    onuUp: onuIndicator('onuUp', 'ONU — Retorno de Conexão (up)',
      'Pontuação quando a ONU do contrato registrou retorno de conexão no período (AutoISP).', 0),
  },
}

export function cloneDefaultConnectionConfig(): ConnectionEngineConfig {
  return {
    indicators: Object.fromEntries(
      Object.entries(DEFAULT_CONNECTION_CONFIG.indicators).map(([k, v]) => [
        k, { ...v, indices: v.indices.map((i) => ({ ...i })) },
      ]),
    ) as Record<ConnectionIndicatorKey, ConnectionIndicatorConfig>,
  }
}

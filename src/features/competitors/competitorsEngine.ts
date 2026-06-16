import type { Competitor, CompetitorData, CompetitorPlan, CompetitorInsight } from '@/types'

const RAW_COMPETITORS: Array<{
  id: string; name: string; city: string; neighborhood: string; street: string | null
  size: Competitor['size']; accessCount: number; entryDate: string
  plans: CompetitorPlan[]; technology: Competitor['technology']
}> = [
  {
    id: 'COMP-001', name: 'NetFibra RS', city: 'Porto Alegre', neighborhood: 'Zona Norte', street: 'Av. Sertório',
    size: 'grande', accessCount: 4200, entryDate: '2021-03-15',
    plans: [
      { name: 'Básico', speed: '100MB', price: 69.90 },
      { name: 'Plus', speed: '300MB', price: 89.90 },
      { name: 'Ultra', speed: '500MB', price: 109.90 },
      { name: 'Max', speed: '1GB', price: 139.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-002', name: 'VelocyNet', city: 'Canoas', neighborhood: 'Centro', street: 'Rua Guilherme Schell',
    size: 'médio', accessCount: 2100, entryDate: '2022-07-10',
    plans: [
      { name: 'Start', speed: '100MB', price: 64.90 },
      { name: 'Speed', speed: '300MB', price: 84.90 },
      { name: 'Power', speed: '500MB', price: 99.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-003', name: 'FibraCity', city: 'Novo Hamburgo', neighborhood: 'Operário', street: 'Av. Dr. Maurício Cardoso',
    size: 'médio', accessCount: 1850, entryDate: '2022-01-20',
    plans: [
      { name: 'Residencial 200', speed: '200MB', price: 74.90 },
      { name: 'Residencial 500', speed: '500MB', price: 99.90 },
      { name: 'Empresarial', speed: '1GB', price: 149.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-004', name: 'ConectaBr', city: 'São Leopoldo', neighborhood: 'Rio dos Sinos', street: 'Rua Independência',
    size: 'pequeno', accessCount: 870, entryDate: '2023-04-05',
    plans: [
      { name: 'Home 100', speed: '100MB', price: 59.90 },
      { name: 'Home 300', speed: '300MB', price: 79.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-005', name: 'TurboPix', city: 'Gravataí', neighborhood: 'Gravataí Centro', street: 'Av. Dom Pedro II',
    size: 'pequeno', accessCount: 630, entryDate: '2023-08-18',
    plans: [
      { name: 'Pix 100', speed: '100MB', price: 62.90 },
      { name: 'Pix 300', speed: '300MB', price: 82.90 },
      { name: 'Pix 600', speed: '600MB', price: 104.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-006', name: 'AgilNet', city: 'Cachoeirinha', neighborhood: 'Parque Eldorado', street: null,
    size: 'micro', accessCount: 310, entryDate: '2024-01-12',
    plans: [
      { name: 'Ágil 100', speed: '100MB', price: 55.90 },
      { name: 'Ágil 200', speed: '200MB', price: 69.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-007', name: 'InterNet RS', city: 'Alvorada', neighborhood: 'Jardim Alvorada', street: 'Av. Presidente Getúlio Vargas',
    size: 'pequeno', accessCount: 740, entryDate: '2022-11-30',
    plans: [
      { name: 'Residencial 200', speed: '200MB', price: 68.90 },
      { name: 'Residencial 500', speed: '500MB', price: 89.90 },
    ],
    technology: 'Radio',
  },
  {
    id: 'COMP-008', name: 'ConnectRS', city: 'Porto Alegre', neighborhood: 'Bom Fim', street: 'Rua Joaquim Nabuco',
    size: 'grande', accessCount: 3800, entryDate: '2020-09-01',
    plans: [
      { name: 'Fibra 200', speed: '200MB', price: 79.90 },
      { name: 'Fibra 400', speed: '400MB', price: 99.90 },
      { name: 'Fibra 800', speed: '800MB', price: 124.90 },
      { name: 'Fibra 1G', speed: '1GB', price: 149.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-009', name: 'SulNet', city: 'Viamão', neighborhood: 'Viamão Centro', street: 'Rua Padre Cacique',
    size: 'micro', accessCount: 280, entryDate: '2024-03-22',
    plans: [
      { name: 'Sul 100', speed: '100MB', price: 58.90 },
    ],
    technology: 'Radio',
  },
  {
    id: 'COMP-010', name: 'MegaFibra', city: 'Canoas', neighborhood: 'Mathias Velho', street: 'Av. Victor Barreto',
    size: 'médio', accessCount: 1450, entryDate: '2021-06-08',
    plans: [
      { name: 'Mega 200', speed: '200MB', price: 72.90 },
      { name: 'Mega 500', speed: '500MB', price: 95.90 },
      { name: 'Mega 1G', speed: '1GB', price: 129.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-011', name: 'RioFibra', city: 'Novo Hamburgo', neighborhood: 'Santo Afonso', street: null,
    size: 'micro', accessCount: 390, entryDate: '2023-11-14',
    plans: [
      { name: 'Rio 100', speed: '100MB', price: 54.90 },
      { name: 'Rio 300', speed: '300MB', price: 74.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-012', name: 'SpeedLink', city: 'São Leopoldo', neighborhood: 'Centro', street: 'Rua Dom João Becker',
    size: 'pequeno', accessCount: 560, entryDate: '2023-02-17',
    plans: [
      { name: 'Link 200', speed: '200MB', price: 66.90 },
      { name: 'Link 400', speed: '400MB', price: 86.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-013', name: 'IberNet', city: 'Porto Alegre', neighborhood: 'Sarandi', street: 'Av. Assis Brasil',
    size: 'grande', accessCount: 5100, entryDate: '2019-05-20',
    plans: [
      { name: 'Start', speed: '100MB', price: 69.90 },
      { name: 'Speed', speed: '300MB', price: 89.90 },
      { name: 'Turbo', speed: '600MB', price: 109.90 },
      { name: 'Ultra', speed: '1GB', price: 134.90 },
    ],
    technology: 'Fibra',
  },
  {
    id: 'COMP-014', name: 'RadioNET', city: 'Gravataí', neighborhood: 'Morada do Vale', street: null,
    size: 'micro', accessCount: 195, entryDate: '2024-05-01',
    plans: [
      { name: 'Rádio 50', speed: '50MB', price: 49.90 },
      { name: 'Rádio 100', speed: '100MB', price: 65.90 },
    ],
    technology: 'Radio',
  },
  {
    id: 'COMP-015', name: 'PrimeFibra', city: 'Cachoeirinha', neighborhood: 'Harmonia', street: 'Rua Harmonia',
    size: 'pequeno', accessCount: 480, entryDate: '2023-06-30',
    plans: [
      { name: 'Prime 100', speed: '100MB', price: 61.90 },
      { name: 'Prime 300', speed: '300MB', price: 81.90 },
      { name: 'Prime 500', speed: '500MB', price: 101.90 },
    ],
    technology: 'Fibra',
  },
]

const OUR_PRICE_MAP: Record<string, number> = {
  '100MB': 89.90,
  '200MB': 109.90,
  '300MB': 129.90,
  '500MB': 159.90,
  '1GB': 189.90,
}

export function buildCompetitorData(): CompetitorData {
  const competitors: Competitor[] = RAW_COMPETITORS.map((c) => ({
    ...c,
    lowestPrice: Math.min(...c.plans.map((p) => p.price)),
  }))

  const totalCompetitors = competitors.length
  const totalCompetitorAccesses = competitors.reduce((s, c) => s + c.accessCount, 0)

  // City breakdown
  const cityMap = new Map<string, { competitors: number; totalAccesses: number; priceSum: number; nameOfMost: string; mostCount: number }>()
  competitors.forEach((c) => {
    const e = cityMap.get(c.city) ?? { competitors: 0, totalAccesses: 0, priceSum: 0, nameOfMost: c.name, mostCount: 0 }
    e.competitors++
    e.totalAccesses += c.accessCount
    e.priceSum += c.lowestPrice
    if (c.accessCount > e.mostCount) { e.mostCount = c.accessCount; e.nameOfMost = c.name }
    cityMap.set(c.city, e)
  })
  const cityBreakdown = Array.from(cityMap.entries())
    .map(([city, v]) => ({
      city,
      competitors: v.competitors,
      totalAccesses: v.totalAccesses,
      avgLowestPrice: parseFloat((v.priceSum / v.competitors).toFixed(2)),
      mostPresent: v.nameOfMost,
    }))
    .sort((a, b) => b.totalAccesses - a.totalAccesses)

  const hotspotCity = cityBreakdown[0]?.city ?? ''
  const hotspotNeighborhood = competitors
    .filter((c) => c.city === hotspotCity)
    .sort((a, b) => b.accessCount - a.accessCount)[0]?.neighborhood ?? ''

  const avgLowestPrice = parseFloat(
    (competitors.reduce((s, c) => s + c.lowestPrice, 0) / totalCompetitors).toFixed(2)
  )
  const citiesAffected = cityMap.size

  // Size breakdown
  const sizeOrder = ['micro', 'pequeno', 'médio', 'grande']
  const sizeMap = new Map<string, { count: number; totalAccesses: number }>()
  competitors.forEach((c) => {
    const e = sizeMap.get(c.size) ?? { count: 0, totalAccesses: 0 }
    e.count++; e.totalAccesses += c.accessCount
    sizeMap.set(c.size, e)
  })
  const sizeBreakdown = sizeOrder
    .filter((s) => sizeMap.has(s))
    .map((size) => ({ size, ...sizeMap.get(size)! }))

  // Price comparison by speed tier
  const speedTiers = ['100MB', '200MB', '300MB', '500MB', '1GB']
  const priceComparison = speedTiers.map((speed) => {
    const prices = competitors.flatMap((c) => c.plans.filter((p) => p.speed === speed).map((p) => p.price))
    if (prices.length === 0) return null
    return {
      speed,
      ourPrice: OUR_PRICE_MAP[speed] ?? 0,
      avgCompetitorPrice: parseFloat((prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2)),
      minCompetitorPrice: Math.min(...prices),
    }
  }).filter(Boolean) as CompetitorData['priceComparison']

  // Entry timeline (monthly, last 18 months)
  const months = [
    '2024-08', '2024-09', '2024-10', '2024-11', '2024-12',
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05',
  ]
  const labels = [
    'Ago/24', 'Set/24', 'Out/24', 'Nov/24', 'Dez/24',
    'Jan/25', 'Fev/25', 'Mar/25', 'Abr/25', 'Mai/25',
  ]
  let cumulative = competitors.filter((c) => c.entryDate < '2024-08-01').length
  const entryTimeline = months.map((m, i) => {
    const newEntries = competitors.filter((c) => c.entryDate.startsWith(m)).length
    cumulative += newEntries
    return { month: labels[i], newEntries, cumulative }
  })

  const fiberCount = competitors.filter(c => c.technology === 'Fibra').length
  const fiberPct = Math.round((fiberCount / totalCompetitors) * 100)
  const largeCount = competitors.filter(c => c.size === 'grande').length
  const largeAccessPct = Math.round(
    (competitors.filter(c => c.size === 'grande').reduce((s, c) => s + c.accessCount, 0) / totalCompetitorAccesses) * 100
  )
  const tier100 = priceComparison.find(p => p.speed === '100MB')
  const highRiskCities = cityBreakdown.filter(c => c.competitors >= 3).length
  const recentEntrants = competitors.filter(c => c.entryDate >= '2023-01-01').length

  const insights: CompetitorInsight[] = [
    {
      finding: `Diferencial de preço de R$${((tier100?.ourPrice ?? 0) - (tier100?.minCompetitorPrice ?? 0)).toFixed(2)} na faixa 100MB representa o maior vetor de churn por custo — planos entry-level são o principal argumento dos concorrentes na abordagem proativa a clientes.`,
      confidence: 91, factor: 'price_gap_100mb', impact: 'high',
      affectedCount: Math.round(totalCompetitorAccesses * 0.35), churnMultiplier: 1.9,
    },
    {
      finding: `${fiberPct}% dos concorrentes mapeados operam com tecnologia Fibra — a vantagem técnica deixou de ser diferencial competitivo em ${citiesAffected} das ${citiesAffected} cidades cobertas, exigindo reposicionamento de valor.`,
      confidence: 88, factor: 'technology_parity', impact: 'high',
      affectedCount: fiberCount, churnMultiplier: 1.6,
    },
    {
      finding: `${largeCount} concorrentes de grande porte concentram ${largeAccessPct}% dos ${totalCompetitorAccesses.toLocaleString('pt-BR')} acessos totais mapeados — risco de campanhas agressivas de captação aumenta 2× em áreas de sobreposição geográfica.`,
      confidence: 85, factor: 'large_competitor_concentration', impact: 'high',
      affectedCount: largeCount, churnMultiplier: 2.0,
    },
    {
      finding: `${highRiskCities} cidade(s) com 3 ou mais concorrentes ativos apresentam risco de churn 1,7× maior que a média regional — ação de retenção proativa e pricing dinâmico são prioritários nessas praças.`,
      confidence: 82, factor: 'city_saturation', impact: 'medium',
      affectedCount: highRiskCities, churnMultiplier: 1.7,
    },
    {
      finding: `${recentEntrants} novos entrantes desde 2023 com foco em micro regiões e preços até 32% abaixo — padrão indica estratégia de saturação de bairros específicos antes de expansão para áreas centrais.`,
      confidence: 76, factor: 'new_entrants', impact: 'medium',
      affectedCount: recentEntrants, churnMultiplier: 1.4,
    },
    {
      finding: `Hotspot competitivo em ${hotspotCity} (${cityBreakdown[0]?.competitors ?? 0} concorrentes, ${(cityBreakdown[0]?.totalAccesses ?? 0).toLocaleString('pt-BR')} acessos) — monitoramento contínuo e campanhas de fidelização são essenciais para manter base ativa nessa cidade.`,
      confidence: 79, factor: 'hotspot_city', impact: 'medium',
      affectedCount: cityBreakdown[0]?.competitors ?? 0, churnMultiplier: 1.5,
    },
  ]

  return {
    competitors,
    totalCompetitors,
    totalCompetitorAccesses,
    citiesAffected,
    hotspotCity,
    hotspotNeighborhood,
    avgLowestPrice,
    sizeBreakdown,
    cityBreakdown,
    priceComparison,
    entryTimeline,
    insights,
  }
}

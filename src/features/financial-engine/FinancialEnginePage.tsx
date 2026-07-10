import { useEffect } from 'react'
import { DollarSign } from 'lucide-react'
import { realPaymentForms } from '@/data/realClients'
import { formatCurrency } from '@/utils/cn'
import { useAppStore } from '@/store/appStore'
import type { FinancialEngineData, FinancialEngineScore } from '@/types'
import type { DataColumn } from '@/components/ui/EngineDataModal'
import { EngineScreen } from '@/features/engines/EngineScreen'
import { FinancialEngineConfigModal } from './FinancialEngineConfigModal'

const DATA_COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Cliente', value: (c) => c.customerName },
  { key: 'city', label: 'Cidade', value: (c) => c.city },
  { key: 'plan', label: 'Plano', value: (c) => c.plan },
  { key: 'mrr', label: 'MRR', align: 'right', value: (c) => c.monthlyValue },
  { key: 'onTime', label: 'No prazo', align: 'right', value: (c) => c.signals.onTimeInvoices },
  { key: 'late', label: 'Atraso (pagas)', align: 'right', value: (c) => c.signals.lateInvoices },
  { key: 'overdue', label: 'Em aberto venc.', align: 'right', value: (c) => c.signals.overdueInvoices },
  { key: 'total', label: 'Total faturas', align: 'right', value: (c) => c.signals.totalInvoices },
  { key: 'reneg', label: 'Renegociações', align: 'right', value: (c) => c.signals.renegotiations },
  { key: 'trust', label: 'Desbloq. confiança', align: 'right', value: (c) => c.signals.trustReleases },
  { key: 'pay', label: 'Forma pagamento', value: (c) => c.signals.paymentForm || 'Não informado' },
]

export default function FinancialEnginePage() {
  const config = useAppStore((s) => s.financialConfig)
  const thresholds = useAppStore((s) => s.healthThresholds)
  const syncPaymentForms = useAppStore((s) => s.syncPaymentForms)
  // Formas de pagamento do modal de config ainda vêm do snapshot (carregado no boot).
  useEffect(() => { syncPaymentForms(realPaymentForms) }, [syncPaymentForms])

  return (
    <EngineScreen<FinancialEngineData, FinancialEngineScore>
      engineKey="financial"
      icon={<DollarSign size={18} className="text-[#fff]" />}
      title="Financeiro"
      subtitle="Score financeiro a partir das faturas, renegociações e desbloqueios — pontuado no servidor sobre a base completa."
      config={config}
      thresholds={thresholds}
      analyzedLabel="analisados"
      rankingTitle="Ranking de Risco Financeiro"
      rankingSubtitle="Clientes ordenados por Health Score financeiro (pior primeiro)"
      tableHeaders={['Revenue Risk', 'Faturas']}
      columns={[
        { header: 'Revenue Risk', sortKey: 'revenueRisk', cell: (s) => <span className="text-xs font-mono text-gray-300">{formatCurrency(s.revenueRisk)}</span> },
        { header: 'Faturas', sortKey: 'signals.lateInvoices', cell: (s) => <span className="text-[10px] font-mono"><span className="text-risk-low">{s.signals.onTimeInvoices}✓</span> · <span className="text-risk-critical">{s.signals.lateInvoices + s.signals.overdueInvoices}⨯</span></span> },
      ]}
      dataTitle="Dados — Financeiro"
      dataColumns={DATA_COLUMNS}
      buildAggregates={(rows, agg) => {
        const m = new Map<string, number>()
        rows.forEach((s) => { const k = s.signals.paymentForm || 'Não informado'; m.set(k, (m.get(k) ?? 0) + 1) })
        return [
          { title: 'Formas de pagamento (amostra)', entries: Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })) },
          { title: 'Adimplência mensal (base)', entries: (agg.monthly || []).map((x) => ({ label: x.month, value: `${x.onTime}✓ / ${x.late} atr / ${x.overdue} venc` })) },
        ]
      }}
      renderConfigModal={(open, onClose) => <FinancialEngineConfigModal open={open} onClose={onClose} />}
    />
  )
}

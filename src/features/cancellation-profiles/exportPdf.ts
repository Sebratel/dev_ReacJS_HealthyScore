// Exportação em PDF da tela de Cancelados — KPIs do período + as sugestões de
// pontuação por módulo. As libs (jspdf/autotable) são importadas dinamicamente
// para não entrar no bundle principal.
import type { SuggestionResult } from './suggestionsApi'
import type { IndicatorSuggestion } from './suggestionEngine'

const fmtPct = (r: number) => `${(r * 100).toFixed(r * 100 < 10 ? 1 : 0).replace('.', ',')}%`
const fmtLift = (l: number | null) => (l === null ? '—' : `${l.toFixed(2).replace('.', ',')}×`)
const fmtPts = (p: number | null) => (p === null ? '—' : `${p > 0 ? '+' : ''}${p}`)
const fmtDateBR = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Máximo de atributos por indicador no PDF (ordenados por impacto) — evita
// relatórios com centenas de páginas em indicadores como bairro/vendedor.
const MAX_ROWS = 15

export async function exportSuggestionsPdf(data: SuggestionResult, opts: { from: string; to: string }) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 40
  let y = M

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - M) { doc.addPage(); y = M }
  }

  // ── Cabeçalho ──
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20, 24, 38)
  doc.text('Cancelados — Pontuação Sugerida', M, y)
  y += 20
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110, 116, 130)
  doc.text(
    `Período de cancelamento: ${fmtDateBR(opts.from)} a ${fmtDateBR(opts.to)}  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`,
    M, y,
  )
  y += 22

  // ── KPIs ──
  const kpis = [
    ['Base ativa', data.activeCount.toLocaleString('pt-BR')],
    ['Cancelados no período', data.cancelledCount.toLocaleString('pt-BR')],
    ['Indicadores', String(data.indicatorCount)],
    ['Índices avaliados', String(data.indexCount)],
    ['Sinais de risco (lift > 1)', String(data.riskCount)],
  ]
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [kpis.map(([label]) => label)],
    body: [kpis.map(([, value]) => value)],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, halign: 'center', cellPadding: 5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  doc.setFontSize(8).setTextColor(130, 136, 150)
  doc.text(
    'Como ler: lift = prevalência do atributo entre quem cancelou ÷ prevalência na base ativa. Lift > 1 → sinal de risco (pontos negativos); lift < 1 → fator protetor (pontos positivos).',
    M, y, { maxWidth: pageW - 2 * M },
  )
  y += 24

  // ── Sugestões por módulo ──
  for (const group of data.groups) {
    ensureSpace(40)
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20, 24, 38)
    doc.text(group.engineLabel, M, y)
    doc.setDrawColor(210, 214, 224)
    doc.line(M + doc.getTextWidth(group.engineLabel) + 8, y - 3, pageW - M, y - 3)
    y += 14

    for (const ind of group.indicators) {
      const rows = buildIndicatorRows(ind)
      if (!rows.body.length) continue
      ensureSpace(70)

      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(45, 52, 70)
      doc.text(ind.indicatorLabel, M, y)
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120, 126, 140)
      doc.text(ind.description, M, y + 11, { maxWidth: pageW - 2 * M })
      y += 24

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [[ind.presence ? 'Condição' : 'Atributo', '% base ativa', '% cancelados', 'Lift', 'Sugestão (pts)']],
        body: rows.body,
        theme: 'striped',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, overflow: 'ellipsize' },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 210 },
          1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
          4: { halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: (hook) => {
          // Colore a coluna de sugestão: risco (−) vermelho, protetor (+) verde.
          if (hook.section === 'body' && hook.column.index === 4) {
            const raw = String(hook.cell.raw)
            if (raw.startsWith('+')) hook.cell.styles.textColor = [16, 145, 90]
            else if (raw.startsWith('-')) hook.cell.styles.textColor = [200, 45, 45]
          }
        },
      })
      y = (doc as any).lastAutoTable.finalY + 6

      if (rows.omitted > 0) {
        ensureSpace(14)
        doc.setFont('helvetica', 'italic').setFontSize(7.5).setTextColor(140, 146, 160)
        doc.text(`+ ${rows.omitted} atributo(s) de menor impacto omitido(s) · ${rows.insufficient} sem amostra suficiente`, M, y)
        y += 14
      } else if (rows.insufficient > 0) {
        ensureSpace(14)
        doc.setFont('helvetica', 'italic').setFontSize(7.5).setTextColor(140, 146, 160)
        doc.text(`${rows.insufficient} atributo(s) sem amostra suficiente para sugerir`, M, y)
        y += 14
      }
      y += 6
    }
    y += 8
  }

  // ── Rodapé com numeração ──
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(150, 156, 170)
    doc.text('Healthy Score Sebratel — Cancelados', M, pageH - 18)
    doc.text(`${i} / ${pages}`, pageW - M, pageH - 18, { align: 'right' })
  }

  doc.save(`cancelados-pontuacao-sugerida-${opts.from}-a-${opts.to}.pdf`)
}

// Ordena os índices por impacto (|pts| e lift) e limita a MAX_ROWS.
function buildIndicatorRows(ind: IndicatorSuggestion) {
  const valid = ind.indices.filter((i) => i.suggestedPoints !== null)
  const insufficient = ind.indices.length - valid.length
  const sorted = [...valid].sort((a, b) => {
    const pa = Math.abs(a.suggestedPoints ?? 0), pb = Math.abs(b.suggestedPoints ?? 0)
    if (pb !== pa) return pb - pa
    return Math.abs((b.lift ?? 1) - 1) - Math.abs((a.lift ?? 1) - 1)
  })
  const shown = sorted.slice(0, MAX_ROWS)
  const body = shown.map((i) => [i.label, fmtPct(i.activeRate), fmtPct(i.cancelledRate), fmtLift(i.lift), fmtPts(i.suggestedPoints)])
  return { body, omitted: sorted.length - shown.length, insufficient }
}

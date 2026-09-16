import { describe, it, expect } from 'vitest'
import { comparableOf } from './scoreHistory.mjs'

// A armadilha que este recorte existe para evitar: os insumos da engine de
// Conexão não chegam igual nos dois grupos. Medido no snapshot de 13/09/2026 —
// potência óptica em 95,1% dos ativos e 0% dos cancelados; quedas de PPPoE em
// 99,2% contra 46,4%. Como "sem dado não pontua", quem tem menos insumo perde
// menos ponto: 70,8 de score médio nos ativos contra 93,2 nos cancelados, 22
// pontos de ausência de medição. Comparar os dois direto inverte a leitura e
// faz quem cancelou parecer com conexão melhor do que quem ficou.
describe('comparabilidade do score por engine', () => {
  const ativo = { financial: 80, connection: 62, network: 90 }
  const cancelado = { financial: 40, connection: 100, network: 55 }

  it('mantém tudo quando o cliente tinha leitura de enlace', () => {
    expect(comparableOf(ativo, true)).toEqual(ativo)
  })

  it('omite Conexão de quem não tinha leitura de enlace', () => {
    const out = comparableOf(cancelado, false)
    expect(out.connection).toBeUndefined()
    expect(out.financial).toBe(40)
    expect(out.network).toBe(55)
  })

  it('não altera o objeto original — byEngine segue sendo o score real do dia', () => {
    const out = comparableOf(cancelado, false)
    expect(cancelado.connection).toBe(100)
    expect(out).not.toBe(cancelado)
  })

  it('trata ponto antigo (sem o campo) como desconhecido, não como "tinha"', () => {
    // Pontos gravados antes de `lk` existir chegam com hasLink null. Assumir
    // que tinham enlace deixaria o viés passar exatamente onde ele já está.
    expect(comparableOf(ativo, null).connection).toBeUndefined()
  })

  it('o viés que motivou o recorte: sem ele, quem saiu parece melhor', () => {
    const mediaDe = (pontos, engine) => {
      const vals = pontos.map((p) => p[engine]).filter((v) => v != null)
      return vals.reduce((a, b) => a + b, 0) / vals.length
    }
    // Três ativos com enlace medido e três cancelados sem nenhum sinal.
    const ativos = [{ connection: 55 }, { connection: 62 }, { connection: 70 }]
    const cancelados = [{ connection: 100 }, { connection: 100 }, { connection: 100 }]
    expect(mediaDe(cancelados, 'connection')).toBeGreaterThan(mediaDe(ativos, 'connection'))
    // Com o recorte, não sobra score de Conexão do lado sem enlace para
    // comparar — que é o resultado certo: a comparação não existe.
    const recortados = cancelados.map((c) => comparableOf(c, false))
    expect(recortados.every((c) => c.connection === undefined)).toBe(true)
  })
})

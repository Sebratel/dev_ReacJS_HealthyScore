// ─────────────────────────────────────────────────────────────────────────
// Guarda das rotas da API.
//
// Existe por causa de um erro real: ao remover um endpoint vizinho, a rota
// GET /api/monthly-cohort foi apagada junto e só o `import` sobrou. Import sem
// uso é JS válido, então `node --check` passou, o `tsc` não olha o servidor e o
// build do front não sabe de rotas — a falha só apareceu como 404 na tela.
//
// Lê o arquivo como TEXTO de propósito: importar server/index.mjs sobe o
// Express, abre porta e conecta em banco. Aqui basta provar que a rota está
// declarada e que todo import é usado.
// ─────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fonte = readFileSync(join(__dirname, 'index.mjs'), 'utf8')

// Rotas que alguma tela consome. Some uma daqui e a tela quebra com 404 —
// que é exatamente o que não pode passar em silêncio de novo.
const ROTAS = [
  ['get', '/api/monthly-cohort'],
  ['get', '/api/score-history/status'],
  ['get', '/api/clients/:id/score-history'],
  ['get', '/api/queries'],
]

describe('rotas declaradas em server/index.mjs', () => {
  for (const [metodo, caminho] of ROTAS) {
    it(`${metodo.toUpperCase()} ${caminho} existe`, () => {
      expect(fonte).toContain(`app.${metodo}('${caminho}'`)
    })
  }
})

describe('imports de server/index.mjs', () => {
  it('nenhum import fica órfão', () => {
    // Pega os nomes de cada `import { a, b } from '...'` e confere que cada um
    // aparece no corpo do arquivo. Um import que sobrou sozinho é o rastro de
    // um bloco removido pela metade.
    const nomes = []
    const re = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g
    let m
    while ((m = re.exec(fonte))) {
      for (const bruto of m[1].split(',')) {
        const nome = bruto.trim().split(/\s+as\s+/).pop()?.trim()
        if (nome) nomes.push(nome)
      }
    }
    expect(nomes.length).toBeGreaterThan(5)

    const corpo = fonte.replace(re, '')
    const orfaos = nomes.filter((n) => !new RegExp(`\\b${n}\\b`).test(corpo))
    expect(orfaos, `import(s) sem uso: ${orfaos.join(', ')}`).toEqual([])
  })
})

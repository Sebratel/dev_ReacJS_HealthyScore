// ─────────────────────────────────────────────────────────────────────────
// Criptografia dos segredos em repouso (hoje: a chave do provedor de IA).
// AES-256-GCM autenticado — adulteração é detectada na leitura.
// Formato do blob: iv:tag:texto, tudo em base64.
//
// A chave vem de APP_SECRET (env). Se não houver, é gerada uma e guardada em
// data/.secret, ao lado do roles.json — assim o cadastro funciona sem
// configuração extra, e como o diretório é um volume, sobrevive ao recriar o
// container. Definir APP_SECRET na stack continua sendo o caminho recomendado:
// com o segredo no volume, perder o volume é perder a chave cifrada.
//
// Mesmo desenho do comercial_pbi (dashboard/server/src/ia/cripto.js).
// ─────────────────────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './caminhos.mjs'

// Cache com o diretório junto: sem isso, trocar o volume (ou o IA_DATA_DIR nos
// testes) continuaria usando a chave do diretório anterior, e o .secret novo
// nunca seria escrito.
let cacheChave = null
let cacheDir = null

const arquivoDoSegredo = () => path.join(dataDir(), '.secret')

function segredo() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET
  const dir = dataDir()
  if (cacheChave && cacheDir === dir) return cacheChave

  const arquivo = arquivoDoSegredo()
  try {
    cacheDir = dir
    if (fs.existsSync(arquivo)) {
      cacheChave = fs.readFileSync(arquivo, 'utf8').trim()
      if (cacheChave) return cacheChave
    }
    cacheChave = randomBytes(48).toString('base64')
    fs.mkdirSync(path.dirname(arquivo), { recursive: true })
    fs.writeFileSync(arquivo, `${cacheChave}\n`, { encoding: 'utf8', mode: 0o600 })
    console.log(`[cripto] chave de cifra gerada em ${arquivo} — defina APP_SECRET no ambiente para controlá-la`)
    return cacheChave
  } catch (err) {
    throw new Error(
      'Não foi possível preparar a chave de cifra dos segredos. '
      + `Defina APP_SECRET no ambiente (ex.: openssl rand -base64 48). Detalhe: ${err.message}`,
    )
  }
}

const chave = () => createHash('sha256').update(segredo()).digest()

export function cifrar(texto) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', chave(), iv)
  const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`
}

export function decifrar(blob) {
  const [ivB, tagB, encB] = String(blob || '').split(':')
  if (!ivB || !tagB || !encB) throw new Error('Segredo gravado em formato inválido.')
  const decipher = createDecipheriv('aes-256-gcm', chave(), Buffer.from(ivB, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8')
}

// A cifra vem de env ou de arquivo gerado? A tela usa para recomendar o env.
export function origemDoSegredo() {
  return process.env.APP_SECRET ? 'env' : 'volume'
}

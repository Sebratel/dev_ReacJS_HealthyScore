// ─────────────────────────────────────────────────────────────────────────
// Criptografia simétrica para SEGREDOS em repouso (hoje: chave de API do
// provedor de IA). AES-256-GCM, que é autenticado — adulteração é detectada
// na hora de decifrar, em vez de devolver lixo silenciosamente.
//
// A chave deriva de APP_SECRET (env) por SHA-256. Formato do blob:
// iv:tag:ciphertext, em base64. O segredo em claro só existe em memória no
// instante de (de)cifrar — nunca no banco, nunca no frontend.
//
// Portado de apps/api/src/core/crypto.ts do Datahub, para os dois sistemas
// tratarem segredo do mesmo jeito.
// ─────────────────────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

function key() {
  const secret = process.env.APP_SECRET
  if (!secret) {
    // Mensagem acionável: quem cai aqui está numa tela tentando salvar um
    // segredo, e precisa saber o que fazer — não só o que faltou.
    throw new Error(
      'APP_SECRET ausente. É a chave que cifra segredos em repouso (chave de API ' +
      'do provedor de IA). Defina uma string longa e aleatória na stack ' +
      '(ex.: openssl rand -base64 48) e faça o redeploy. Guarde-a: trocá-la torna ' +
      'ilegível tudo que já foi cifrado.',
    )
  }
  return createHash('sha256').update(secret).digest() // 32 bytes
}

export function encryptSecret(plain) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function decryptSecret(blob) {
  const [ivB, tagB, encB] = String(blob).split(':')
  if (!ivB || !tagB || !encB) throw new Error('Blob de segredo inválido.')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8')
}

// Há chave configurada? (para a tela avisar em vez de estourar ao salvar.)
export function hasSecret() {
  return !!process.env.APP_SECRET
}

// Últimos 4 caracteres — o que a tela mostra para dar reconhecimento.
export function keyHint(plain) {
  const s = String(plain || '')
  return s.length <= 4 ? s : s.slice(-4)
}

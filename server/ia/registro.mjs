// ─────────────────────────────────────────────────────────────────────────
// Registro do provedor de IA: guarda a configuração em data/ia.json com a
// chave cifrada. A chave nunca sai numa resposta da API — só uma dica com os
// quatro últimos caracteres, para o admin reconhecer qual cadastrou.
//
// UM provedor ativo, não uma lista: o módulo de Planos de Ação precisa saber
// sem ambiguidade com que modelo cada plano foi gerado, e "qual é o padrão
// hoje" é pergunta que não deveria existir. Trocar de provedor é editar este.
//
// Fica em arquivo no volume (ao lado de roles.json e official-config.json), e
// não no MariaDB, por dois motivos: é do mesmo naipe das outras configs de
// runtime, e assim a tela de provedor continua funcionando quando o banco do
// módulo está fora. Mesmo desenho do comercial_pbi.
// ─────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { iaConfigPath } from './caminhos.mjs'
import { cifrar, decifrar, origemDoSegredo } from './cripto.mjs'
import { TIPOS, ROTULO_TIPO, MODELO_PADRAO, construir, provedorDoEnv } from './provedor.mjs'

function ler() {
  try {
    if (!fs.existsSync(iaConfigPath())) return null
    const raw = fs.readFileSync(iaConfigPath(), 'utf8').trim()
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    console.warn('[ia] não foi possível ler a configuração:', err.message)
    return null
  }
}

function gravar(dados) {
  const destino = iaConfigPath()
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, `${JSON.stringify(dados, null, 2)}\n`, 'utf8')
}

const dica = (chave) => (chave && chave.length > 4 ? `••••${chave.slice(-4)}` : null)

const tiposParaTela = () => TIPOS.map((id) => ({ id, label: ROTULO_TIPO[id] }))

// Visão pública: tudo menos a chave.
export function estado() {
  const salvo = ler()
  const env = provedorDoEnv()
  const comum = {
    tipos: tiposParaTela(),
    modelosPadrao: MODELO_PADRAO,
    segredo: origemDoSegredo(),
  }

  if (!salvo && !env) {
    return {
      ...comum,
      configurado: false, origem: null, tipo: 'anthropic',
      modelo: '', baseUrl: null, maxTokens: 16000, effort: null, dica: null,
    }
  }
  if (!salvo && env) {
    return {
      ...comum,
      configurado: true, origem: 'env',
      tipo: env.tipo, modelo: env.modelo, baseUrl: env.baseUrl,
      maxTokens: env.maxTokens, effort: env.effort, dica: dica(env.chave),
      aviso: 'Configuração vinda do .env. Cadastre pela tela para poder trocar sem redeploy.',
    }
  }
  return {
    ...comum,
    // O simulado é "configurado" sem chave nenhuma — é o ponto dele.
    configurado: !!salvo.chaveCifrada || salvo.tipo === 'simulado',
    origem: 'tela',
    tipo: salvo.tipo,
    modelo: salvo.modelo,
    baseUrl: salvo.baseUrl || null,
    maxTokens: salvo.maxTokens || 16000,
    effort: salvo.effort || null,
    dica: salvo.dica || null,
    atualizadoEm: salvo.atualizadoEm || null,
    atualizadoPor: salvo.atualizadoPor || null,
    ultimoTeste: salvo.ultimoTeste || null,
  }
}

// Configuração completa (com a chave em claro) para uso interno.
export function configuracaoAtiva() {
  const salvo = ler()
  if (salvo?.tipo === 'simulado') {
    return { tipo: 'simulado', modelo: 'simulado', chave: null, maxTokens: 0, origem: 'tela' }
  }
  if (salvo?.chaveCifrada) {
    try {
      return {
        tipo: salvo.tipo,
        modelo: salvo.modelo,
        chave: decifrar(salvo.chaveCifrada),
        baseUrl: salvo.baseUrl || null,
        maxTokens: salvo.maxTokens || 16000,
        effort: salvo.effort || null,
        origem: 'tela',
      }
    } catch (err) {
      // Acontece quando APP_SECRET muda (ou o volume com o .secret se perde).
      // Falhar claro é melhor do que cair no simulado sem ninguém perceber.
      console.warn('[ia] chave gravada não pôde ser lida:', err.message)
    }
  }
  return provedorDoEnv()
}

// Provedor executável + a config que o gerou. Sem nada cadastrado, cai no
// SIMULADO em vez de estourar: o módulo continua demonstrável, e a tela avisa.
export function provedorAtivo() {
  const cfg = configuracaoAtiva()
  if (!cfg) return { provedor: construir({ tipo: 'simulado' }), cfg: { tipo: 'simulado', modelo: 'simulado' }, simulado: true }
  return { provedor: construir(cfg), cfg, simulado: cfg.tipo === 'simulado' }
}

export function validar(entrada) {
  if (!TIPOS.includes(entrada.tipo)) {
    throw new Error(`Provedor inválido. Escolha ${TIPOS.map((t) => ROTULO_TIPO[t]).join(', ')}.`)
  }
  if (entrada.tipo !== 'simulado' && !entrada.modelo?.trim()) {
    throw new Error('Informe o modelo (ex.: claude-opus-5).')
  }
  if (entrada.baseUrl) {
    try {
      const u = new URL(entrada.baseUrl)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad')
    } catch {
      throw new Error('URL base inválida (use http ou https).')
    }
  }
  if (entrada.maxTokens != null && (entrada.maxTokens < 256 || entrada.maxTokens > 64000)) {
    throw new Error('O teto de tokens deve ficar entre 256 e 64.000.')
  }
}

// Salva. `chave` ausente mantém a atual; string vazia remove tudo.
export function salvar(entrada, porQuem) {
  validar(entrada)
  const atual = ler()
  const trocaChave = entrada.chave !== undefined && entrada.chave !== null
  const chave = trocaChave ? String(entrada.chave).trim() : null
  const simulado = entrada.tipo === 'simulado'

  if (trocaChave && !chave && !simulado) {
    if (fs.existsSync(iaConfigPath())) fs.unlinkSync(iaConfigPath())
    return estado()
  }
  if (!simulado && !atual?.chaveCifrada && !chave) {
    throw new Error('Informe a chave de API do provedor.')
  }

  gravar({
    tipo: entrada.tipo,
    modelo: simulado ? 'simulado' : entrada.modelo.trim(),
    baseUrl: entrada.baseUrl?.trim() || null,
    maxTokens: entrada.maxTokens || 16000,
    effort: entrada.effort || null,
    chaveCifrada: simulado ? null : (chave ? cifrar(chave) : atual.chaveCifrada),
    dica: simulado ? null : (chave ? dica(chave) : atual?.dica ?? null),
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: porQuem,
    // Teste antigo não vale para cadastro novo — sujaria a tela com um "ok"
    // que se refere a outra chave.
    ultimoTeste: chave || (atual && atual.tipo !== entrada.tipo) ? null : (atual?.ultimoTeste || null),
  })
  return estado()
}

export function remover() {
  if (fs.existsSync(iaConfigPath())) fs.unlinkSync(iaConfigPath())
  return estado()
}

// Modelos que a chave alcança — aceita uma chave ainda não salva, para o admin
// conferir antes de gravar.
export async function listarModelos({ tipo, chave, baseUrl }) {
  let cfg
  if (chave) {
    cfg = { tipo, modelo: '', chave, baseUrl: baseUrl || null }
  } else {
    cfg = configuracaoAtiva()
    if (!cfg) throw new Error('Nenhuma chave cadastrada.')
    if (tipo) cfg = { ...cfg, tipo }
    if (baseUrl !== undefined) cfg = { ...cfg, baseUrl }
  }
  return construir(cfg).modelos()
}

// Teste de conexão. Grava o resultado para a tela mostrar "última verificação".
export async function testar() {
  const { provedor } = provedorAtivo()
  const inicio = Date.now()
  let resultado
  try {
    const texto = await provedor.conversar(
      'Você é um teste de conectividade. Responda apenas: OK',
      'Responda apenas OK.',
    )
    resultado = { ok: true, ms: Date.now() - inicio, amostra: (texto || '').slice(0, 120) }
  } catch (err) {
    resultado = { ok: false, ms: Date.now() - inicio, erro: err.message }
  }
  const salvo = ler()
  if (salvo) gravar({ ...salvo, ultimoTeste: { ...resultado, em: new Date().toISOString() } })
  return resultado
}

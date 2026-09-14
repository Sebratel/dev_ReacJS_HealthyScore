// Onde vive o estado de runtime do módulo de IA. Um lugar só, porque o
// diretório precisa ser o MESMO que guarda roles.json e official-config.json:
// é o volume `./data` da stack, e é o que sobrevive a um redeploy.
//
// Resolvido a cada chamada, não congelado no import: as envs podem mudar
// depois de o módulo carregar (é assim nos testes, e é assim num processo que
// lê o .env tarde). Congelar isso já custou um caminho errado uma vez.
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function dataDir() {
  if (process.env.IA_DATA_DIR) return resolve(process.env.IA_DATA_DIR)
  // Deriva do ROLES_PATH quando existe — é assim que a stack aponta o volume.
  if (process.env.ROLES_PATH) return dirname(resolve(process.env.ROLES_PATH))
  return resolve(__dirname, '../../data')
}

export const iaConfigPath = () => join(dataDir(), 'ia.json')

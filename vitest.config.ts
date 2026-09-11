import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Os testes cobrem o backend do módulo de Planos de Ação. Ambiente node (não
// jsdom): nada aqui toca DOM, e a cadeia de imports chega nas engines .ts —
// que o Vite resolve sozinho.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.mjs', 'server/**/*.test.ts'],
  },
})

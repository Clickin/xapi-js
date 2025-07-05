import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    pool: "threads",
    exclude: [
      "**/node_modules/**",
      "**/coverage/**",
      "**/dist/**",
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
  include: ['test/**/*.test.ts'],
  },
})
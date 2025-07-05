import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ["packages/*"],
    pool: "threads",
    coverage: {
      provider: 'v8' // or 'v8'
    },
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
  },
})
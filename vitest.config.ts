import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ["packages/*"],
    coverage: {
      provider: 'v8' // or 'v8'
    },
  },
})
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ["packages/*"],
    pool: "threads",
    coverage: {
      provider: 'v8', // or 'v8'
      exclude: [
        ...configDefaults.exclude,
        '**/.{idea,git,cache,output,temp}/**',
        "**/node_modules/**",
        "**/dist/**",
        "**/coverage/**",
      ]
    },
    exclude: [
      ...configDefaults.exclude,
      '**/.{idea,git,cache,output,temp}/**',
    ]
  },
})
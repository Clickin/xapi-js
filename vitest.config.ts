import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ["packages/*"],
    pool: "threads",
    coverage: {
      provider: 'istanbul', // or 'v8'
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
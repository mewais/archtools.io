import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Exclude heavy directories from file watching
      ignored: ['**/tools/spike/**', '**/tools/verification/**', '**/node_modules/**'],
    },
  },
})

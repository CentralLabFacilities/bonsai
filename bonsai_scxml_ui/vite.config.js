import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep vendor dependencies together instead of importing the app chunk.
          includeDependenciesRecursively: true,
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:react(?:-dom)?|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'graph-vendor',
              test: /node_modules[\\/](?:@xyflow|@dagrejs|@tisoap)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/target/**', '**/target/**', '**/.pixi/**', '**/.container-home/**', '**/test-results/**', '**/playwright-report/**'],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
})

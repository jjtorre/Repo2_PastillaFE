import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // El minificador por defecto (Lightning CSS) reescribe
    // "@media (max-width: 768px)" como "@media (width<=768px)". Es sintaxis
    // de rango válida y equivalente, pero la entienden menos navegadores
    // antiguos y cuesta más de leer en el CSS publicado. esbuild conserva la
    // forma clásica.
    cssMinify: 'esbuild',
  },
})

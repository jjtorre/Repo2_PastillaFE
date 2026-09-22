import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registro del service worker.
//
// Va después de montar la aplicación y atado a 'load' a propósito: registrar
// antes compite por ancho de banda con los recursos que el usuario está
// esperando, y retrasa el primer render para no ganar nada.
//
// En desarrollo se omite. Un service worker sirviendo desde caché convierte
// cualquier cambio en un misterio de por qué no se ve.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      // Que falle no debe romper nada: la aplicación funciona igual con red.
      console.warn('No se pudo registrar el service worker:', e)
    })
  })
}

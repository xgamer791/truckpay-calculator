import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    {
      name: 'driverpay-cloud-source-entry',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace(
            /<!-- DRIVERPAY_CLOUD_FALLBACK_START -->[\s\S]*?<!-- DRIVERPAY_CLOUD_FALLBACK_END -->/,
            '<script type="module" src="/src/cloud/main.jsx"></script>',
          )
        },
      },
    },
    react(),
  ],
  base: '/truckpay-calculator/',
})

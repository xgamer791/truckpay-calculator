import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const { VITE_CONVEX_URL: convexUrl } = loadEnv(mode, process.cwd(), 'VITE_')
    if (!convexUrl?.trim()) {
      throw new Error('Build stopped: VITE_CONVEX_URL is missing. Configure the cloud URL before publishing.')
    }
    let url
    try {
      url = new URL(convexUrl)
    } catch {
      throw new Error('Build stopped: VITE_CONVEX_URL must be an absolute HTTP(S) URL.')
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Build stopped: VITE_CONVEX_URL must be an absolute HTTP(S) URL.')
    }
  }

  return {
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
  }
})

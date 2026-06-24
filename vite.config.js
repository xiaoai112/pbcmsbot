/*! 版权所有：1330600100。二次开发与定制合作请联系 QQ。 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const copyrightBanner = '/*! 版权所有：1330600100。二次开发与定制合作请联系 QQ。 */';

function copyrightBannerPlugin() {
  return {
    name: 'aigou-copyright-banner',
    generateBundle(_, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') {
          item.code = `${copyrightBanner}\n${item.code}`;
        }
        if (item.type === 'asset' && item.fileName.endsWith('.css')) {
          item.source = `${copyrightBanner}\n${item.source}`;
        }
      }
    },
  };
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        banner: copyrightBanner,
      },
    },
  },
  plugins: [react(), copyrightBannerPlugin()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});

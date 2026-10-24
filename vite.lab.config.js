import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
const release={version:process.env.GITHUB_SHA||`local-${Date.now()}`,builtAt:new Date().toISOString()};
export default defineConfig({
  define:{__APP_RELEASE__:JSON.stringify(release)},
  plugins: [react(), viteSingleFile(), {name:'release-manifest',apply:'build',generateBundle(){this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify(release)});}}], base: './',
  build: { outDir: 'dist-lab', rollupOptions: { input: 'lab.html' } },
});

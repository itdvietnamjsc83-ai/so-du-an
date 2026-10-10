import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
// Tạo sw.js liệt kê mọi tệp sau khi build để ứng dụng chạy được khi không có mạng.
const sw = () => ({
  name: 'sw', apply: 'build',
  generateBundle(_, bundle) {
    const files = ['./', ...Object.keys(bundle).map(f => './' + f), './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
    const v = pkg.version + '-' + Date.now().toString(36);
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: `const C='sda-${v}',F=${JSON.stringify(files)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;
if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{const y=x.clone();caches.open(C).then(c=>c.put('./',y));return x}).catch(()=>caches.match('./')));return}
e.respondWith(caches.match(r).then(h=>h||fetch(r).then(x=>{if(x.ok&&(r.url.startsWith(self.location.origin)||r.url.includes('fonts.g'))){const y=x.clone();caches.open(C).then(c=>c.put(r,y))}return x})))});` });
  },
});
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@tauri-apps/api/core': fileURLToPath(new URL('./src/tauri-stub.js', import.meta.url)) } },
  server: { port: 1430, fs: { allow: ['..'] } },
  plugins: [sw()],
  build: { target: 'es2020', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 3000 },
});

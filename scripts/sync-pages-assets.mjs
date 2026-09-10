// GitHub Pages serves main's index.html with fixed entry filenames. Keep that
// deployment and the Vite dist deployment on the same compiled scanner build.
// Change the cache key whenever asset contents change so older app links
// cannot keep loading a previous bundle after a new HTML page is deployed.
import { createHash } from 'node:crypto';
import { readFile, readdir, copyFile, mkdir, writeFile } from 'node:fs/promises';
const html=await readFile('dist/index.html','utf8');
const script=html.match(/<script\b[^>]*src="[^"]*\/assets\/([^"/]+\.js)"/);
const style=html.match(/<link\b[^>]*href="[^"]*\/assets\/([^"/]+\.css)"/);
if(!script||!style)throw new Error('Could not locate the built app entry assets.');
const sourceHtml=await readFile('index.html','utf8');
const fallback=/<!-- DRIVERPAY_CLOUD_FALLBACK_START -->[\s\S]*?<!-- DRIVERPAY_CLOUD_FALLBACK_END -->/;
if(!fallback.test(sourceHtml))throw new Error('Could not locate the production fallback entry.');
const version=async name=>createHash('sha256').update(await readFile(`dist/assets/${name}`)).digest('hex').slice(0,12);
const scriptVersion=await version(script[1]);
const styleVersion=await version(style[1]);
const updatedHtml=sourceHtml.replace(fallback,`<!-- DRIVERPAY_CLOUD_FALLBACK_START -->
    <link rel="stylesheet" href="/truckpay-calculator/assets/driverpay-cloud-v3.css?v=${styleVersion}">
    <script type="module" src="/truckpay-calculator/assets/driverpay-cloud-v3.js?v=${scriptVersion}"></script>
    <!-- DRIVERPAY_CLOUD_FALLBACK_END -->`);
await mkdir('assets',{recursive:true});
await copyFile(`dist/assets/${script[1]}`,'assets/driverpay-cloud-v3.js');
await copyFile(`dist/assets/${style[1]}`,'assets/driverpay-cloud-v3.css');
for(const name of await readdir('dist/assets')){
  if(name!==script[1]&&name!==style[1])await copyFile(`dist/assets/${name}`,`assets/${name}`);
}
await writeFile('index.html',updatedHtml);
// Keep legacy bookmarks working with either configured Pages source.
for (const name of ['app.html','404.html']) await copyFile(name,`dist/${name}`);
console.log('Synced production entry assets, cache versions, and scanner worker.');

// GitHub Pages serves main's index.html with fixed entry filenames. Keep that
// deployment and the Vite dist deployment on the same compiled scanner build.
import { readFile, readdir, copyFile, mkdir } from 'node:fs/promises';
const html=await readFile('dist/index.html','utf8');
const script=html.match(/<script\b[^>]*src="[^"]*\/assets\/([^"/]+\.js)"/);
const style=html.match(/<link\b[^>]*href="[^"]*\/assets\/([^"/]+\.css)"/);
if(!script||!style)throw new Error('Could not locate the built app entry assets.');
await mkdir('assets',{recursive:true});
await copyFile(`dist/assets/${script[1]}`,'assets/driverpay-cloud-v3.js');
await copyFile(`dist/assets/${style[1]}`,'assets/driverpay-cloud-v3.css');
for(const name of await readdir('dist/assets')){
  if(name!==script[1]&&name!==style[1])await copyFile(`dist/assets/${name}`,`assets/${name}`);
}
console.log('Synced production entry assets and scanner worker.');

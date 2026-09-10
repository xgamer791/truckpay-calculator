import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';

const base='https://xgamer791.github.io/truckpay-calculator/';
function script(file,id){
  const html=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
  return html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
}
const update=script('index.html','driverpay-update-check');
function run(source,path,remote='3.5.0',ok=true){
  const location=new URL(path,base);location.replace=vi.fn();
  const fetch=vi.fn(async()=>({ok,text:async()=>`<meta name="driverpay-build" content="${remote}">`}));
  vm.runInNewContext(source,{location,URL,fetch,document:{querySelector:()=>({getAttribute:()=>'3.4.1'})}});
  return {location,fetch};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

it.each(['','?v=320&t=old','index.html','index.html?v=330#history'])(
  'updates the saved link %s using the app root',async(path)=>{
    const {location,fetch}=run(update,path);
    await settle();
    const checked=new URL(fetch.mock.calls[0][0]);
    expect(checked.pathname).toBe('/truckpay-calculator/index.html');
    expect(fetch.mock.calls[0][1].cache).toBe('no-store');
    const target=new URL(location.replace.mock.calls[0][0]);
    expect(target.pathname).toBe('/truckpay-calculator/');
    expect(target.searchParams.get('v')).toBe('3.5.0');
    expect(target.hash).toBe(location.hash);
  }
);
it.each(['3.4.1','3.4.0','3.3.99','invalid'])(
  'does not reload or downgrade for %s',async(remote)=>{
    const {location}=run(update,'index.html',remote);
    await settle();expect(location.replace).not.toHaveBeenCalled();
  }
);
it('preserves the sign-in callback on an update',async()=>{
  const {location}=run(update,'index.html?code=one%2Btwo&state=account#history');
  await settle();
  const next=new URL(location.replace.mock.calls[0][0]);
  expect(next.searchParams.get('code')).toBe('one+two');
  expect(next.searchParams.get('state')).toBe('account');
  expect(next.hash).toBe('#history');
});
it('leaves the app usable if the update check fails',async()=>{
  const {location}=run(update,'','3.5.0',false);
  await settle();expect(location.replace).not.toHaveBeenCalled();
});
it.each(['app.html','404.html'])(
  '%s sends legacy paths to fresh current HTML without losing sign-in parameters',(file)=>{
    const {location}=run(script(file,'driverpay-legacy-redirect'),'old/path?code=abc&v=320&t=old#history');
    const next=new URL(location.replace.mock.calls[0][0]);
    expect(next.origin).toBe(location.origin);
    expect(next.pathname).toBe('/truckpay-calculator/');
    expect(next.searchParams.get('code')).toBe('abc');
    expect(next.searchParams.has('v')).toBe(false);
    expect(next.searchParams.has('t')).toBe(false);
    expect(next.searchParams.has('_')).toBe(true);
    expect(next.hash).toBe('#history');
  }
);

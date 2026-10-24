import assert from 'node:assert/strict';
import { checkVersion } from '../src/lab/version.js';
const href='https://monga-hub.github.io/officina/?setting=keep#registro';
let request;
const fetcher=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({version:'release-2'})};};
assert.deepEqual(await checkVersion({current:'release-2',href,fetcher}),{status:'current'});
assert.equal(request.options.cache,'no-store');
assert.equal(new URL(request.url).pathname,'/officina/version.json');
assert.ok(new URL(request.url).searchParams.has('_check'));
const newer=await checkVersion({current:'release-1',href,fetcher});
assert.equal(newer.status,'update');assert.equal(newer.attempted,false);
const target=new URL(newer.url);
assert.equal(target.origin,new URL(href).origin);
assert.equal(target.pathname,'/officina/');assert.equal(target.hash,'#registro');
assert.equal(target.searchParams.get('setting'),'keep');assert.equal(target.searchParams.get('v'),'release-2');
assert.ok(target.searchParams.has('_refresh'));
const stale=await checkVersion({current:'release-1',href:newer.url,fetcher});
assert.equal(stale.attempted,true,'Cached HTML must not auto-reload forever');
assert.deepEqual(await checkVersion({current:'release-2',href:newer.url,fetcher}),{status:'current'});
const direct=await checkVersion({current:'release-1',href:'https://example.com/officina/lab.html',fetcher});
assert.equal(new URL(direct.url).pathname,'/officina/lab.html');
for(const fetcher of [async()=>{throw new Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({version:'https://untrusted.example'})}),async()=>({ok:true,json:async()=>{throw new Error('invalid JSON');}})]) {
  assert.deepEqual(await checkVersion({current:'release-1',href,fetcher}),{status:'unavailable'});
}
const hanging=(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))));
assert.deepEqual(await checkVersion({current:'release-1',href,fetcher:hanging,timeout:5}),{status:'unavailable'});
assert.deepEqual(await checkVersion({current:null,href,fetcher:()=>assert.fail('Development must not check releases')}),{status:'local'});
assert.deepEqual(await checkVersion({current:'release-1',href:'file:///lab.html',fetcher:()=>assert.fail('Standalone file must still open')}),{status:'local'});
console.log('OK: current and outdated releases, cache bypass, same-origin navigation, reload loop prevention, offline/error/timeout and local files.');

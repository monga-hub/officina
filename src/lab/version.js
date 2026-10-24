// Only navigate within the current page; never change the origin that owns saved games.
export async function checkVersion({current,href,fetcher=fetch,timeout=4000}) {
  const page=new URL(href);
  if(!/^https?:$/.test(page.protocol)||!current)return {status:'local'};
  const manifest=new URL('version.json',page);
  manifest.searchParams.set('_check',Date.now());
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetcher(manifest.href,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('Version unavailable');
    const latest=await response.json();
    if(typeof latest.version!=='string'||!/^[-a-zA-Z0-9.]{1,100}$/.test(latest.version))throw new Error('Invalid version');
    if(latest.version===current)return {status:'current'};
    // A cached HTML response after one upgrade must not cause an endless reload loop.
    const attempted=page.searchParams.get('v')===latest.version;
    page.searchParams.set('v',latest.version);
    page.searchParams.set('_refresh',Date.now());
    return {status:'update',url:page.href,attempted};
  } catch { return {status:'unavailable'}; }
  finally { clearTimeout(timer); }
}

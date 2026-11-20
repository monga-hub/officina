// Requires chrome-devtools-axi and a local game server; all browser work is headless.
// node scripts/player-bands-layout-check.mjs http://127.0.0.1:5217/game.html /tmp/bands-proof
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const [url,output]=process.argv.slice(2);
assert(url&&output,'Pass the local game URL and an evidence directory outside the checkout.');
assert(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Use a local test server.');
const dir=resolve(output);
mkdirSync(dir,{recursive:true});
const env={...process.env,CHROME_DEVTOOLS_AXI_SESSION:`bands-check-${process.pid}`,
  CHROME_DEVTOOLS_AXI_HEADED:'0',CHROME_DEVTOOLS_AXI_AUTO_CONNECT:'0',
  CHROME_DEVTOOLS_AXI_BROWSER_URL:'',CHROME_DEVTOOLS_AXI_USER_DATA_DIR:`${dir}/profile-${process.pid}`};
const cli=(...args)=>execFileSync('chrome-devtools-axi',args,{env,encoding:'utf8',maxBuffer:8e6});
const run=source=>execFileSync('chrome-devtools-axi',['run'],{env,input:source,encoding:'utf8',maxBuffer:8e6});

function inspectLayout() {
  const all=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const contains=(a,b)=>b.x>=a.x-.5&&b.y>=a.y-.5&&b.right<=a.right+.5&&b.bottom<=a.bottom+.5;
  const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5;
  const failures=[];
  const check=(ok,label)=>{if(!ok)failures.push(label);};
  const name=e=>e.className||e.tagName;
  const separated=(elements,label)=>{
    const items=elements.filter(visible);
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)
      check(!overlaps(rect(items[i]),rect(items[j])),`${label}: ${name(items[i])} / ${name(items[j])}`);
  };
  const viewport={x:0,y:0,right:innerWidth,bottom:innerHeight};
  const table=document.querySelector('.physical-table');
  const bands=all('.physical-department',table);
  check(bands.length===3,'three player bands');
  check(document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight,'document overflow');
  separated(bands,'bands overlap');
  for(const band of bands) {
    const bounds=rect(band),label=band.getAttribute('aria-label');
    for(const e of all('*',band).filter(visible))check(contains(bounds,rect(e)),`${label}: escaped ${name(e)}`);
    separated([...band.children],`${label}: sections overlap`);
    const track=band.querySelector('.opposed-track');
    separated([...track.children],`${label}: track rows/footer overlap`);
    for(const cell of all('.opposed-cell',band)) {
      for(const e of [...cell.children].filter(visible))check(contains(rect(cell),rect(e)),`${label}: cell content ${name(e)}`);
      // Counters deliberately overlay their own artwork; labels and pins must not overlap them.
      const labelNode=cell.querySelector('small'),pin=cell.querySelector('.production-pin');
      const value=cell.querySelector('.amount-token')||cell.querySelector(':scope>span');
      const range=document.createRange();range.selectNodeContents(value);
      const valueRect=value.matches('.amount-token')?rect(value):rect(range);
      check(!overlaps(rect(labelNode),valueRect),`${label}: number/value overlap`);
      if(pin)check(!overlaps(rect(pin),valueRect),`${label}: pin/value overlap`);
    }
    const walker=document.createTreeWalker(band,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const text=walker.currentNode,e=text.parentElement;
      if(!text.textContent.trim()||!visible(e))continue;
      const range=document.createRange();range.selectNodeContents(text);
      check(contains(bounds,rect(range)),`${label}: text outside band (${text.textContent.trim()})`);
    }
  }
  separated(all('.play-factory-heading,.play-wallet',table),'heading/wallet overlap');
  for(const wallet of all('.play-wallet',table))separated([...wallet.children],'wallet counters overlap');
  for(const e of all('button,.physical-department,.approved-main-board,.play-wallet',table).filter(visible))
    check(contains(viewport,rect(e)),`outside viewport: ${name(e)}`);
  const board=table.querySelector('.approved-main-board');
  check(Math.abs(rect(board).width/rect(board).height-6253/4321)<.002,'whole board aspect ratio');
  const cards=all('.star-market .paper-card',table);
  check(cards.length===5,'five market cards');
  for(const card of cards) {
    const r=rect(card),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    check(card.contains(hit),'card center is obscured');
  }
  check(all('img',table).every(img=>img.complete&&img.naturalWidth>0),'missing image');
  return {viewport:[innerWidth,innerHeight,devicePixelRatio],failures,
    bands:bands.map(b=>({rect:rect(b),rows:all('.opposed-track-row',b).map(rect),footer:rect(b.querySelector('.opposed-track-foot'))})),
    board:rect(board),cards:cards.map(rect),wallet:table.querySelector('.play-wallet').textContent,
    departments:all('.department-cards-button',table).map(e=>e.textContent)};
}

const measures=[[1399,645,2],[1280,720,1],[1600,1000,1],[360,640,2],[1399,600,2],[1399,630,2],[1399,660,2],[1399,950,2],[1399,951,2],[1399,645,2]];
const results=[];
try {
  cli('open',url);
  run(`await page.wait('.game-start-controls button:not([disabled])');
    await page.click('.game-start-controls button');await page.wait('.physical-table');
    await page.click('.star-destination[data-node="Servizi"]');`);
  for(const populated of [false,true]) {
    if(populated) {
      run(`await page.eval(()=>{
        const key='mongames.officina-1907.guest.active.v1',local=JSON.parse(localStorage.getItem(key));
        const save=local.record.save,p=save.state.players[0];
        p.coins=99;p.welfareTokens=12;
        p.contractsWon=[{cardId:'layout-fixture',size:1,place:0,pv:12}];
        for(const resource of Object.keys(p.resources))p.resources[resource]=12;
        for(const d of Object.values(p.depts)) {
          const cards=save.config.workers.filter(w=>w.sector===d.sector);
          d.sopra=cards.slice(0,12).map(w=>w.id);d.sotto=cards.slice(12,15).map(w=>w.id);
          d.prod=20;d.tension=3;
        }
        const installed=new Set(Object.values(p.depts).flatMap(d=>[...d.sopra,...d.sotto]));
        for(const bank of Object.keys(save.state.banks))save.state.banks[bank]=save.state.banks[bank].filter(id=>!installed.has(id));
        save.paused=true;save.history=[];localStorage.setItem(key,JSON.stringify(local));
      });await page.open(${JSON.stringify(url)});await page.wait('.game-start-controls button:not([disabled])');
        await page.click('.game-start-controls button');await page.wait('.physical-table');`);
    }
    for(const [index,[width,height,dpr]] of measures.entries()) {
      cli('emulate','--viewport',`${width}x${height}x${dpr}`);
      const data=JSON.parse(run(`console.log(JSON.stringify(await page.eval(async()=>{
        await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));
        const inspect=${inspectLayout.toString()};
        const frames=[];for(let n=0;n<12;n++){await new Promise(requestAnimationFrame);frames.push(inspect());}
        return {...frames[11],stable:frames.every(f=>JSON.stringify(f)===JSON.stringify(frames[11]))};
      })));`));
      data.populated=populated;results.push(data);
      if(populated)assert(data.wallet.includes('99')&&data.wallet.includes('12 gettoni')&&data.departments.every(d=>d.includes('12 operai · 3 macchinari')),'Populated fixture loaded');
      if(index<4)cli('screenshot',`${dir}/${populated?'populated':'empty'}-${width}x${height}-dpr${dpr}.png`);
      console.log(`${populated?'populated':'empty'} ${width}x${height}@${dpr}: ${data.failures.length} failures, stable=${data.stable}`);
    }
  }
  cli('emulate','--viewport','1399x645x2');
  run(`await page.click('.player-board-enlarge');await page.wait('dialog[open]');`);
  const details=JSON.parse(run(`console.log(JSON.stringify(await page.eval(()=>{
    const dialog=document.querySelector('dialog[open]');return {open:!!dialog,label:dialog?.getAttribute('aria-label'),
      rows:[...dialog.querySelectorAll('.opposed-track-row')].map(e=>e.getBoundingClientRect().height),
      close:!!dialog.querySelector('.dialog-close')};
  })));`));
  cli('screenshot',`${dir}/enlarged.png`);
  writeFileSync(`${dir}/results.json`,JSON.stringify({results,details},null,2));
  assert(results.every(r=>r.failures.length===0&&r.stable),'Internal layout/resize regression; see results.json');
  assert(details.open&&details.close&&details.rows.length===15&&details.rows.every(h=>h>=25),'Enlarged tracks available');
} finally {
  cli('stop');
}

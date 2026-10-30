export const CARDS=[{"id": "internazionale", "name": "Fabbrica internazionale", "category": "Operai", "thresholds": [[2, 3, 4], [3, 4, 5], [4, 5, 6], [2, 3, 4]], "metric": "R1–R3: nazionalità diverse fra gli operai Sopra. R4: nazionalità rappresentate da almeno due operai Sopra, in tutta la fabbrica."}, {"id": "affiatata", "name": "Squadra affiatata", "category": "Operai", "thresholds": [[1, 2, 3], [2, 3, 4], [2, 3, 4], [2, 3, 4]], "metric": "Numero di operai Sopra della stessa nazionalità nello stesso reparto; conta soltanto il gruppo più numeroso."}, {"id": "cosmopoliti", "name": "Reparti cosmopoliti", "category": "Operai", "thresholds": [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]], "requirements": [2, 2, 3, 3], "metric": "Numero di reparti con almeno N nazionalità diverse fra gli operai Sopra. N per round: 2/2/3/3."}, {"id": "organico", "name": "Organico completo", "category": "Operai", "thresholds": [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]], "requirements": [1, 2, 3, 4], "metric": "Numero di reparti con almeno N operai Sopra. N per round: 1/2/3/4."}, {"id": "automazione", "name": "Automazione operativa", "category": "Impianti", "thresholds": [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]], "requirements": [1, 2, 2, 2], "development": [1, 1, 5, 9], "metric": "Numero di reparti con almeno N macchine e sviluppo almeno S, con una riga fisica raggiunta libera. N: 1/2/2/2; S: 1/1/5/9."}, {"id": "specializzato", "name": "Polo specializzato", "category": "Impianti", "thresholds": [[5, 7, 9], [8, 10, 12], [11, 13, 16], [13, 16, 18]], "metric": "Sviluppo del reparto più avanzato."}, {"id": "equilibrata", "name": "Fabbrica equilibrata", "category": "Impianti", "thresholds": [[2, 3, 5], [4, 6, 8], [6, 9, 11], [9, 11, 13]], "metric": "Sviluppo del reparto meno avanzato: tutti i tre devono raggiungere la soglia."}, {"id": "complementare", "name": "Impianto complementare", "category": "Impianti", "thresholds": [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]], "metric": "Numero di tipi diversi di macchina presenti in tutta la fabbrica in reparti con almeno una riga fisica raggiunta libera: Fisso, T, Continuità. Ogni tipo conta una sola volta."}, {"id": "benessere", "name": "Benessere progressivo", "category": "Gestione", "thresholds": [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]], "requirements": [1, 2, 2, 3], "development": [1, 1, 5, 9], "tension": [0, 1, 1, 1], "metric": "Numero di reparti qualificati. Operai minimi: 1/2/2/3; sviluppo minimo: 1/1/5/9; T massima: 0/1/1/1. Nessun bonus ulteriore per tre reparti: massimo 6 PV."}, {"id": "riserva", "name": "Riserva per il personale", "category": "Gestione", "thresholds": [[1, 2, 3], [2, 3, 4], [2, 3, 4], [2, 3, 4]], "metric": "Gettoni Welfare posseduti alla scadenza. Non si spendono per segnare; nessun requisito di operai, sviluppo o reparti."}, {"id": "bilancio", "name": "Bilancio solido", "category": "Gestione", "thresholds": [[4, 7, 10], [6, 10, 15], [10, 16, 24], [15, 25, 40]], "metric": "Marchi posseduti alla scadenza. Premio aggiuntivo rispetto alla conversione finale ordinaria; i marchi non si spendono."}, {"id": "finanziamento", "name": "Finanziamento mirato", "category": "Gestione", "thresholds": [[3, 5, 7], [3, 5, 7], [3, 5, 7], [3, 5, 7]], "metric": "Marchi versati personalmente durante questo round nei fondi che risultano attivi alla scadenza. Somma soltanto quei versamenti; i bottini non sono versamenti. Il contatore personale riparte ogni round."}];
const BY_ID=Object.fromEntries(CARDS.map(c=>[c.id,c]));
// A separate seeded shuffle preserves worker and contract draws.
export function objectiveDeck(seed) {
 let value=(seed^0x72657132)>>>0;
 const deck=CARDS.map(c=>c.id);
 for(let i=deck.length-1;i>0;i--){
  value=(value+0x6D2B79F5)|0;let t=Math.imul(value^(value>>>15),1|value);
  t=(t+Math.imul(t^(t>>>7),61|t))^t;
  const j=Math.floor(((t^(t>>>14))>>>0)/4294967296*(i+1));
  [deck[i],deck[j]]=[deck[j],deck[i]];
 }
 return deck;
}
export function initRoundObjectives(n,seed,bounds) {
 if(!Array.isArray(bounds)||bounds.length<1||bounds.length>4||!bounds.every((t,i)=>Number.isInteger(t)&&t>0&&(!i||t>bounds[i-1])))throw new Error('Le dodici richieste consentono da uno a quattro round.');
 const deck=objectiveDeck(seed);
 return {version:2,bounds:[...bounds],deck,round:0,active:deck.slice(0,3),banked:Array(n).fill(0),contributions:Array.from({length:n},()=>({economy:0,personnel:0,production:0})),completed:[],log:[]};
}
export const cardById=id=>BY_ID[id];
export function objectiveMetrics(state,p,workers){
 const ds=['terziario','secondario','primario'].map(r=>p.depts[r]);
 const nations=ds.flatMap(d=>d.sopra.map(id=>workers[id].nation));
 const counts=Object.values(nations.reduce((o,n)=>(o[n]=(o[n]||0)+1,o),{}));
 const departments=ds.map(d=>{const ns=d.sopra.map(id=>workers[id].nation);return {prod:d.prod,workers:d.sopra.length,nations:new Set(ns).size,machines:d.sotto.length,free:Math.ceil(d.prod/4)>d.tension,tension:d.tension,machineKinds:d.sotto.map(id=>{const e=workers[id].effect;return e.continuity?'continuita':e.verbo==='perOgni'?'tensione':'fisso';}),largestGroup:Math.max(0,...Object.values(ns.reduce((o,n)=>(o[n]=(o[n]||0)+1,o),{})))};});
 return {nations:new Set(nations).size,repeatedNations:counts.filter(n=>n>=2).length,largestGroup:Math.max(0,...departments.map(d=>d.largestGroup)),departments,maxProd:Math.max(...ds.map(d=>d.prod)),minProd:Math.min(...ds.map(d=>d.prod)),tokens:p.welfareTokens,coins:p.coins,donations:{...state.roundObjectives.contributions[p.id]},funds:{...state.roundRondel.funds}};
}
export function cardValue(c,x,r){const ds=x.departments;switch(c.id){
 case 'internazionale':return r<3?x.nations:x.repeatedNations;
 case 'affiatata':return x.largestGroup;
 case 'cosmopoliti':return ds.filter(d=>d.nations>=c.requirements[r]).length;
 case 'organico':return ds.filter(d=>d.workers>=c.requirements[r]).length;
 case 'automazione':return ds.filter(d=>d.machines>=c.requirements[r]&&d.prod>=c.development[r]&&d.free).length;
 case 'specializzato':return x.maxProd;
 case 'equilibrata':return x.minProd;
 case 'complementare':return new Set(ds.filter(d=>d.free).flatMap(d=>d.machineKinds)).size;
 case 'benessere':return ds.filter(d=>d.workers>=c.requirements[r]&&d.prod>=c.development[r]&&d.tension<=c.tension[r]).length;
 case 'riserva':return x.tokens;
 case 'bilancio':return x.coins;
 case 'finanziamento':return Object.entries(x.donations).reduce((n,[f,v])=>n+(x.funds[f]>={economy:3,personnel:4,production:3}[f]?v:0),0);
 default:throw new Error('Unknown objective '+c.id);
}}
export function cardPoints(id,x,r){const c=BY_ID[id],value=cardValue(c,x,r);let pv=0;for(let i=0;i<3;i++)if(value>=c.thresholds[r][i])pv=2*(i+1);return {id,name:c.name,value,pv};}
export function objectivePotential(state,p,workers){const rr=state.roundObjectives;if(!rr||rr.round>=rr.bounds.length)return 0;const x=objectiveMetrics(state,p,workers);return rr.active.reduce((n,id)=>n+cardPoints(id,x,rr.round).pv,0);}
export function settleRoundObjectives(state,turn,workers){
 const rr=state.roundObjectives;if(!rr||turn!==rr.bounds[rr.round]||rr.round>=rr.bounds.length||rr.completed.includes(turn))return;
 const awards=state.players.map(p=>{const metrics=objectiveMetrics(state,p,workers),cards=rr.active.map(id=>cardPoints(id,metrics,rr.round)),pv=cards.reduce((n,c)=>n+c.pv,0);rr.banked[p.id]+=pv;return {seat:p.id,metrics,cards,pv,banked:rr.banked[p.id]};});
 const round=rr.round+1;state.roundObjectives={...rr,round,active:round<rr.bounds.length&&!rr.preview?rr.deck.slice(round*3,round*3+3):[],contributions:state.players.map(()=>({economy:0,personnel:0,production:0})),completed:[...rr.completed,turn],log:rr.preview?rr.log:[...rr.log,{round,endTurn:turn,active:rr.active.slice(),awards}]};
}

export function validRoundObjectives(rr,n) {
 if(!rr||rr.version!==2||!Array.isArray(rr.bounds)||rr.bounds.length<1||rr.bounds.length>4||!rr.bounds.every((t,i)=>Number.isInteger(t)&&t>0&&(!i||t>rr.bounds[i-1]))||!Array.isArray(rr.deck)||rr.deck.length!==12||new Set(rr.deck).size!==12||!rr.deck.every(id=>BY_ID[id]))return false;
 if(!Number.isInteger(rr.round)||rr.round<0||rr.round>rr.bounds.length||rr.preview||!Array.isArray(rr.active)||JSON.stringify(rr.active)!==JSON.stringify(rr.round<rr.bounds.length?rr.deck.slice(rr.round*3,rr.round*3+3):[]))return false;
 if(!Array.isArray(rr.banked)||rr.banked.length!==n||!rr.banked.every(v=>Number.isInteger(v)&&v>=0)||!Array.isArray(rr.contributions)||rr.contributions.length!==n||!rr.contributions.every(c=>c&&Object.keys(c).length===3&&['economy','personnel','production'].every(f=>Number.isInteger(c[f])&&c[f]>=0)))return false;
 if(!Array.isArray(rr.completed)||JSON.stringify(rr.completed)!==JSON.stringify(rr.bounds.slice(0,rr.round))||!Array.isArray(rr.log)||rr.log.length!==rr.round)return false;
 return rr.log.every((row,i)=>row.round===i+1&&row.endTurn===rr.bounds[i]&&Array.isArray(row.awards)&&row.awards.length===n&&JSON.stringify(row.active)===JSON.stringify(rr.deck.slice(i*3,i*3+3))&&row.awards.every((a,seat)=>a.seat===seat&&Array.isArray(a.cards)&&a.cards.length===3&&a.cards.every((c,j)=>c.id===row.active[j]&&[0,2,4,6].includes(c.pv))&&a.pv===a.cards.reduce((total,c)=>total+c.pv,0)))&&rr.banked.every((pv,seat)=>pv===rr.log.reduce((total,row)=>total+row.awards[seat].pv,0));
}

export function cardRequirement(c,r) {
 const workers=c.requirements?.[r],development=c.development?.[r];
 switch(c.id){
  case 'internazionale':return r<3?'Nazionalità diverse nella fabbrica':'Nazionalità con almeno 2 operai nella fabbrica';
  case 'affiatata':return 'Gruppo della stessa nazionalità in un reparto';
  case 'cosmopoliti':return `Reparti con almeno ${workers} nazionalità`;
  case 'organico':return `Reparti con almeno ${workers} ${workers===1?'operaio':'operai'}`;
  case 'automazione':return `Reparti con ${workers} macchine, sviluppo ≥${development} e una riga libera`;
  case 'specializzato':return 'Sviluppo del reparto più avanzato';
  case 'equilibrata':return 'Sviluppo del reparto meno avanzato';
  case 'complementare':return 'Tipi diversi di macchina con una riga raggiunta libera';
  case 'benessere':return `Reparti con ≥${workers} operai, sviluppo ≥${development} e T≤${c.tension[r]}`;
  case 'riserva':return 'Gettoni Welfare conservati';
  case 'bilancio':return 'Marchi conservati';
  case 'finanziamento':return 'Tuoi marchi versati nel round in fondi attivi alla scadenza';
 }
}

export function cardHelp(c,r) {
 if(c.id==='finanziamento')return 'Somma i tuoi versamenti di questo round nei fondi attivi alla scadenza: Economia almeno 3 marchi, Personale 4, Produzione 3. Contano anche i contributi precedenti all’attivazione. I bottini non contano; il contatore personale riparte da zero a ogni round.';
 if(c.id==='riserva')return 'Conta tutti i tuoi gettoni rimasti, anche se acquistati nei round precedenti. Non servono requisiti di organico o sviluppo. I gettoni non vengono spesi per incassare il premio e restano utilizzabili per cure e protezioni.';
 if(c.id==='complementare')return 'Conta una sola volta ciascun tipo: Fisso, T e Continuità, in tutta la fabbrica. Il reparto deve avere almeno una riga fisica già raggiunta e libera dalla tensione. Una macchina T conta anche a tensione zero se il reparto ha una riga libera.';
 if(c.id==='automazione')return 'Conta i reparti con il numero indicato di macchinari Sotto, lo sviluppo minimo e almeno una riga fisica raggiunta libera dalla tensione.';
 if(c.id==='specializzato'||c.id==='equilibrata')return 'Si considera lo sviluppo raggiunto, non il numero di operai. La tensione non riduce il valore del tracciato di sviluppo.';
 if(c.id==='bilancio')return 'Conta i marchi posseduti alla scadenza, senza spenderli. I PV si aggiungono alla normale conversione dei marchi a fine partita; la cassa rimane disponibile nei round successivi.';
 return cardRequirement(c,r)+'. '+(c.id==='affiatata'?'Conta solo il gruppo più numeroso: non sommare gruppi di reparti diversi.':c.id==='internazionale'&&r===3?'Ogni nazionalità conta una volta se hai almeno due operai di quella nazionalità, anche in reparti diversi.':'Si contano solo gli operai Sopra e i requisiti raggiunti alla scadenza.');
}

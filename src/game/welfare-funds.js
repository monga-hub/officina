export const WELFARE_FUNDS=[
  {id:'economy',name:'Economia',threshold:3,policies:['innovation','reliability']},
  {id:'personnel',name:'Personale',threshold:4,policies:['integration','formation']},
  {id:'production',name:'Produzione',threshold:3,policies:['cooperation','mutualAid']},
];
export const fundBalances=state=>state.roundRondel?.funds;
export const policyFund=id=>WELFARE_FUNDS.find(f=>f.policies.includes(id));
export const policyBoosted=(state,id)=>{const f=policyFund(id);return !!f&&!!fundBalances(state)&&(fundBalances(state)[f.id]||0)>=f.threshold;};
export const boostedDescription={
  integration:'Assumere Sopra una nazionalità assente nel reparto costa 2 marchi in meno, minimo 1.',
  formation:'Ogni operaio assunto Sopra sviluppa il suo reparto di 2 passi aggiuntivi.',
  innovation:'Installare un macchinario costa 2 marchi in meno, minimo 1.',
  cooperation:'Produci con almeno due nazionalità fra gli operai Sopra: +2 marchi.',
  mutualAid:'A ogni produzione puoi convertire fino a 2 risorse appena prodotte, una per una, in altri tipi a scelta.',
  reliability:'Ogni commessa completata dà 4 marchi aggiuntivi.',
};
export function welfareAllocations(count){
  const out=[];
  for(let economy=0;economy<=count;economy++)for(let personnel=0;personnel<=count-economy;personnel++)out.push({economy,personnel,production:count-economy-personnel});
  return out;
}
// Replace the round record: search caches already key this object, and prior states stay immutable.
export function changeFund(state,id,amount){
  state.roundRondel={...state.roundRondel,funds:{...fundBalances(state),[id]:fundBalances(state)[id]+amount}};
  state.welfareBank=WELFARE_FUNDS.reduce((sum,f)=>sum+fundBalances(state)[f.id],0);
}
export const allocationLabel=allocation=>WELFARE_FUNDS.filter(f=>allocation?.[f.id]).map(f=>`${f.name} ${allocation[f.id]}`).join(' · ');

export const validFundThresholds=x=>!!x&&Object.keys(x).length===3&&WELFARE_FUNDS.every(f=>x[f.id]===f.threshold);
export const policyDescription=(state,policy)=>policyBoosted(state,policy.id)?{...policy,description:boostedDescription[policy.id],upgraded:true}:policy;

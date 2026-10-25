import { RESOURCE_OF } from '../game/data.js';

export const ART_NATION={Italiani:'IT',Francesi:'FR',Polacchi:'PL',Spagnoli:'SP',Tedeschi:'D',Greci:'GR'};
export const ART_SECTOR={Tessile:'T',Metallurgica:'M',Chimica:'C'};
export const cardArtKey=w=>`${ART_NATION[w.nation]}_${ART_SECTOR[w.sector]}`;
const quantity=(f,w)=>f.tipo==='moneta'?`${f.q} ${f.q===1?'marco':'marchi'}`:
  f.settore==='scelta'?`${f.q} ${f.q===1?'risorsa':'risorse'} a scelta`:
  `${f.q} ${RESOURCE_OF[f.settore==='carta'?w.sector:f.settore]?.toLowerCase()||'risorse'}`;
export function machineText(w) {
  const e=w.effect;
  if(e.verbo==='perOgni'&&e.f2?.conta==='tensione')return `${quantity(e.f1,w)} per livello di tensione prima della produzione`;
  if(e.verbo==='scambia')return `${quantity(e.f1,w)} → ${quantity(e.f2,w)}`;
  return `Prendi ${quantity(e.f1,w)}`;
}

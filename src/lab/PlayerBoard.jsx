import React from 'react';
import {rowPressureState} from '../game/row-pressure.js';
import {WORKER_BY_ID} from '../game/engine.js';
import {RESOURCE_OF,NATIONS_NUOVO} from '../game/data.js';
import RowProductionTrack from '../components/RowProductionTrack.jsx';
import {NationBadge} from './WorkerCard.jsx';
import ResourceIcon from './ResourceIcon.jsx';
import {Amount} from './GameSymbols.jsx';
import {approvedArt} from './approved-art.js';
const texture={Tessile:'textile-texture.jpg',Chimica:'chemical-texture.jpg',Metallurgica:'metal-texture.jpg'};
export function Department({state,player,role,onCards}) {
  const d=player.depts[role], p=rowPressureState(state,d);
  const nations=d.sopra.reduce((counts,id)=>{
    const nation=WORKER_BY_ID[id]?.nation;
    if(nation)counts[nation]=(counts[nation]||0)+1;
    return counts;
  },{});
  const cellLabel=pos=>{
    const c=state.tracks[role][pos];
    if(!c)return '—';
    const production=[c.res&&`${c.res} ${RESOURCE_OF[d.sector]}`,c.coins&&`${c.coins} marchi`].filter(Boolean).join(' + ')||'—';
    const reward=c.milestoneReward;
    return production+(reward?` · premio una tantum: ${reward.res||0} ${RESOURCE_OF[d.sector]}, ${reward.coins||0} marchi`:'');
  };
  const renderCell=pos=>{
    const c=state.tracks[role][pos];
    if(!c||!(c.res||c.coins))return '—';
    return <>{c.res>0&&<><Amount kind={d.sector} value={c.res}/></>}{c.coins>0&&<>{c.res>0?' + ':''}<Amount kind="coin" value={c.coins}/></>}</>;
  };
  return <section className="play-department physical-department" style={{backgroundImage:`url(${approvedArt(texture[d.sector])})`}} aria-label={`Reparto ${d.sector}`}>
    <header><h3><ResourceIcon resource={d.sector} department decorative/> {d.sector}</h3><span><b className="overview-available">{p.available}/{p.developed} righe · </b>Tensione <b>{d.tension}</b></span></header>
    <p className="play-row-count"><b>{p.available}/{p.developed}</b> righe utilizzabili{p.blocked>0&&<em> · {p.blocked} bloccate</em>}</p>
    {<RowProductionTrack tensionDirection={state.rowEconomy.tensionDirection} unlock={state.rowEconomy.productionUnlock} thresholds={state.rowEconomy.productionUnlock==='cells'?null:state.rowEconomy.productionThresholds} milestones={state.tracks[role].flatMap((c,i)=>c?.milestoneReward?[i]:[])} model={state.trackModel} prod={d.prod} tension={d.tension} wholeRows renderCell={renderCell} renderReward={pos=>{const reward=state.tracks[role][pos]?.milestoneReward;return reward?<em className="track-milestone-reward">★ {reward.res>0&&<Amount kind={d.sector} value={reward.res}/>} {reward.coins>0&&<Amount kind="coin" value={reward.coins}/>}</em>:null;}} cellTitle={cellLabel}/>}

    <button className="department-cards-button" onClick={()=>onCards(player.id,role)}><span>{d.sopra.length} operai · {d.sotto.length}{state.machineReserve?null:`/${state.slots[role].sotto}`} macchinari</span>{d.sopra.length>0&&<span className="department-nations" aria-label="Nazionalità assunte">{NATIONS_NUOVO.filter(nation=>nations[nation]).map(nation=><NationBadge key={nation} nation={nation} count={nations[nation]}/>)}</span>}<span aria-hidden="true">↗</span></button>
  </section>;
}
export default function PlayerBoard({state,player,onCards=()=>{}}) {
  const sectors=['Tessile','Chimica','Metallurgica'];
  const roles=Object.keys(player.depts).sort((a,b)=>sectors.indexOf(player.depts[a].sector)-sectors.indexOf(player.depts[b].sector));
  return <div className="player-strips" aria-label={`Plancia di ${player.name}`}>{roles.map(role=><Department key={role} state={state} player={player} role={role} onCards={onCards}/>)}</div>;
}

import { welfarePolicy } from '../game/welfare-rondel.js';
import React from 'react';
import { Amount, Development, MachineEffect } from './GameSymbols.jsx';
import { NATION_FLAGS_NUOVO, SECTOR_COLORS } from '../game/data.js';
import { hireCost } from '../game/engine.js';
import { cardArtKey, machineText } from './cards.js';

const art=import.meta.glob('./assets/workers/*.jpg',{eager:true,query:'?url',import:'default'});
export function NationBadge({nation,count}) {
  return <span className="nation-badge" aria-label={count==null?nation:`${nation}: ${count} ${count===1?'operaio':'operai'}`}><span className="nation-flag" aria-hidden="true">{NATION_FLAGS_NUOVO[nation]}</span>{count!=null&&<b>×{count}</b>}</span>;
}
export default function WorkerCard({worker:w,onInspect,side}) {
  const content=<><div className="paper-card-top"><b className="card-value">{w.v}</b><NationBadge nation={w.nation}/></div>
    <img className="card-portrait" src={art[`./assets/workers/${cardArtKey(w)}.jpg`]} alt=""/>
    <div className={`card-half ${side==='sopra'?'card-active-half':''}`}><Development value={w.v}/></div>
    <div className={`card-half card-machine ${side==='sotto'?'card-active-half':''}`}><MachineEffect worker={w}/></div></>;
  const props={className:'paper-card',style:{'--card-color':SECTOR_COLORS[w.sector]},'aria-label':`${w.nation}, ${w.sector}, valore ${w.v}. Sopra: sviluppo +${w.v}. Sotto: ${machineText(w)}`};
  return onInspect?<button type="button" {...props} onClick={onInspect}>{content}</button>:<article {...props}>{content}</article>;
}
export function HireChoices({worker:w,options,state,player,dispatch}) {
  return <div className="card-install-options">{options.map((cmd,i)=>{
    const sector=player.depts[cmd.role].sector, cost=hireCost(state,player,w,cmd.role,cmd.side);
    return <button key={i} className={cmd.side==='sopra'?'lab-primary':''} onClick={()=>dispatch(cmd)}>
      {cmd.side==='sopra'?`Sopra · assumi in ${sector}`:`Sotto · installa in ${sector}`} · <Amount kind="coin" value={cost}/>
      <small>{cmd.side==='sopra'?`Sviluppo +${Math.min(state.trackMax-player.depts[cmd.role].prod,w.v+(welfarePolicy(state,player)?.id==='formation'?1:0))}`:machineText(w)}</small>
    </button>;
  })}</div>;
}
export function HireCard({worker,options,state,player,dispatch}) {
  return <div className="illustrated-hire"><WorkerCard worker={worker}/><HireChoices worker={worker} options={options} state={state} player={player} dispatch={dispatch}/></div>;
}

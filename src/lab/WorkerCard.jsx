import React from 'react';
import { NATION_FLAGS, SECTOR_COLORS } from '../game/data.js';
import { hireCost } from '../game/engine.js';
import { cardArtKey, machineText } from './cards.js';

const art=import.meta.glob('./assets/workers/*.jpg',{eager:true,query:'?url',import:'default'});
export default function WorkerCard({worker:w,onInspect,side}) {
  const content=<><div className="paper-card-top"><b className="card-value">{w.v}</b><span>{w.sector}</span><span title={w.nation}>{NATION_FLAGS[w.nation]||'🇬🇷'}</span></div>
    <img className="card-portrait" src={art[`./assets/workers/${cardArtKey(w)}.jpg`]} alt=""/>
    <div className="card-nationality">{w.nation}</div>
    <div className={`card-half ${side==='sopra'?'card-active-half':''}`}><small>SOPRA · OPERAIO</small><strong>Sviluppo +{w.v}</strong></div>
    <div className={`card-half card-machine ${side==='sotto'?'card-active-half':''}`}><small>SOTTO · MACCHINARIO</small><strong>{machineText(w)}</strong></div></>;
  const props={className:'paper-card',style:{'--card-color':SECTOR_COLORS[w.sector]},'aria-label':`${w.nation}, ${w.sector}, valore ${w.v}. Sopra: sviluppo +${w.v}. Sotto: ${machineText(w)}`};
  return onInspect?<button type="button" {...props} onClick={onInspect}>{content}</button>:<article {...props}>{content}</article>;
}
export function HireChoices({worker:w,options,state,player,dispatch}) {
  return <div className="card-install-options">{options.map((cmd,i)=>{
    const sector=player.depts[cmd.role].sector, cost=hireCost(state,player,w,cmd.role,cmd.side);
    return <button key={i} className={cmd.side==='sopra'?'lab-primary':''} onClick={()=>dispatch(cmd)}>
      {cmd.side==='sopra'?`Sopra · assumi in ${sector}`:`Sotto · installa in ${sector}`} · {cost} M
      <small>{cmd.side==='sopra'?`Sviluppo +${w.v}`:machineText(w)}</small>
    </button>;
  })}</div>;
}
export function HireCard({worker,options,state,player,dispatch}) {
  return <div className="illustrated-hire"><WorkerCard worker={worker}/><HireChoices worker={worker} options={options} state={state} player={player} dispatch={dispatch}/></div>;
}

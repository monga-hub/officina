import React from 'react';

export default function TurnTrack({state}) {
  const current=state.roundRondel?.active?.endTurn??state.turn;
  const boundaries=[...(state.roundRondel?.bounds||[]),state.roundLimit];
  return <div className={`turn-track${state.roundLimit>40||boundaries.length>8?' turn-track-dense':''}`} style={{minWidth:Math.max(280,Math.min(720,state.roundLimit*13))}} aria-label={`Tracciato dei turni: turno ${current} di ${state.roundLimit}`}>
    {boundaries.map((end,index)=>{
      const start=(boundaries[index-1]||0)+1,final=end===state.roundLimit;
      return <div className="turn-period" key={end} style={{flex:end-start+1}}>
        <ol start={start} aria-label={`${index+1}° periodo`}>
          {Array.from({length:end-start+1},(_,i)=>start+i).map(turn=><li key={turn} aria-current={turn===current?'step':undefined} className={`${turn<current?'turn-past':''} ${turn===end?'turn-deadline':''}`} title={`Turno ${turn}${turn===end?final?' · Fine partita':' · Fine periodo: richieste e scelta della rondella':''}`}>{turn}</li>)}
        </ol>
        <span className="turn-period-label" title={`${index+1}° periodo · ${final?'Fine partita':'Scelta della rondella'}`}>{end-start<3?<b>{final?'Fine':'↻'}</b>:<>{index+1}° periodo <b>{final?'Fine partita':'↻ Rondella'}</b></>}</span>
      </div>;
    })}
  </div>;
}

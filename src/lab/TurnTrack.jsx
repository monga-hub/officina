import React from 'react';
import { CITY_CATEGORIES, CITY_HANDS, periodOf } from '../game/city-missions.js';
import { CALENDAR_MISSIONS } from '../game/calendar-missions.js';

export default function TurnTrack({state}) {
  const current=state.roundRondel?.active?.endTurn??state.turn;
  const boundaries=[...(state.roundRondel?.bounds||[]),state.roundLimit];
  const markers=state.calendarMissions;
  return <div className={`turn-track${markers?' turn-track-missions':state.roundLimit>40||boundaries.length>8?' turn-track-dense':''}`}
    style={markers?undefined:{minWidth:Math.max(280,Math.min(720,state.roundLimit*13))}}
    aria-label={`Tracciato dei turni: turno ${current} di ${state.roundLimit}`}>
    {boundaries.map((end,index)=>{
      const start=(boundaries[index-1]||0)+1,final=end===state.roundLimit;
      return <div className="turn-period" key={end} style={{flex:end-start+1}}>
        <ol start={start} aria-label={`${index+1}° periodo`}>
          {Array.from({length:end-start+1},(_,i)=>start+i).map(turn=>{
            const deadline=turn!==end?'':final?' · Fine partita':state.roundObjectives?' · Fine periodo: richieste e scelta della rondella':' · Fine periodo: scelta della rondella';
            return <li key={turn} aria-current={turn===current?'step':undefined}
              className={`${turn<current?'turn-past':''} ${turn===end?'turn-deadline':''}`} title={`Turno ${turn}${deadline}`}>
              {turn}
              {markers&&<span className="calendar-tokens">{markers.flatMap((row,seat)=>{
                const player=state.players[seat];
                const missions=state.cityMissions
                  ? CITY_HANDS[periodOf(turn)].map((id,i)=>({
                      ...CITY_CATEGORIES[i], id,
                      marker: i===0 ? player.contractsWon.find(lot=>lot.turn===turn) : row[id],
                    }))
                  : CALENDAR_MISSIONS.map(mission=>({...mission,marker:row[mission.id]}));
                return missions.flatMap(({id,name,symbol,marker})=>{
                  if(marker?.turn!==turn)return [];
                  const label=`${player.name} · ${name} · +${marker.points??marker.pv} PV`;
                  return <span key={`${seat}-${id}`} className="calendar-token" style={{backgroundColor:player.color,color:seat===3?'#29210a':undefined}}
                    role="img" aria-label={label} title={label}>{symbol}{seat+1}</span>;
                });
              })}</span>}
            </li>;
          })}
        </ol>
        {!markers&&<span className="turn-period-label" title={`${index+1}° periodo · ${final?'Fine partita':'Scelta della rondella'}`}>{end-start<3?<b>{final?'Fine':'↻'}</b>:<>{index+1}° periodo <b>{final?'Fine partita':'↻ Rondella'}</b></>}</span>}
      </div>;
    })}
  </div>;
}

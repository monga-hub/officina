import { WELFARE_POLICIES, welfarePolicyEnabled } from './welfare-rondel.js';
export function initRoundRondel(config,n,turns) {
  if(n!==3||turns!==28||JSON.stringify(config.bounds)!=='[9,18]'||JSON.stringify(config.firstSeats)!=='[0,1]'||config.maxSteps!==3||![0,1].includes(config.stepCost)||config.tokenCost!==1||config.tokenMax!==3)throw new Error('Unsupported round rondel experiment');
  return {...structuredClone(config),completed:[],active:null,log:[]};
}
export function beginRoundRondel(state,finishedTurn) {
  const rr=state.roundRondel;if(!rr)return false;
  const index=rr.bounds.indexOf(finishedTurn);if(index<0||rr.completed.includes(index))return false;
  const order=Array.from({length:state.nPlayers},(_,i)=>(rr.firstSeats[index]+i)%state.nPlayers);
  const snapshots=state.players.map(p=>({seat:p.id,coins:p.coins,position:p.welfarePosition,tokens:p.welfareTokens,benefits:{...p.welfareRondelStats.benefits}}));
  state.roundRondel={...rr,active:{index,endTurn:finishedTurn,order,at:0,resumeCurrent:state.current,snapshots}};
  state.phase='roundRondel';state.current=order[0];return true;
}
export function roundRondelCommands(state) {
  const rr=state.roundRondel;if(state.phase!=='roundRondel'||!rr?.active)return [];
  const p=state.players[state.current],commands=[{type:'keepRoundRondel'}];
  const freeEntry=rr.freeEntry&&p.welfarePosition==null;
  const limit=freeEntry?WELFARE_POLICIES.length:rr.maxSteps;
  for(let steps=1;steps<=limit&&steps*rr.stepCost<=p.coins;steps++){
    const position=((p.welfarePosition??0)+steps)%WELFARE_POLICIES.length;
    if(welfarePolicyEnabled(state,WELFARE_POLICIES[position]))commands.push({type:'advanceRoundRondel',steps,position});
  }
  return commands;
}
export function applyRoundRondel(state,command) {
  const rr=state.roundRondel,a=rr.active,p=state.players[state.current],from=p.welfarePosition;
  const steps=command.type==='advanceRoundRondel'?command.steps:0,cost=steps*rr.stepCost;
  if(steps){
    p.coins-=cost;p.coinsSpentBy.roundRondel=(p.coinsSpentBy.roundRondel||0)+cost;
    p.welfarePosition=command.position;
    p.welfareRondelStats.visits=[...p.welfareRondelStats.visits,{turn:state.turn,endTurn:a.endTurn,source:'round',position:p.welfarePosition,steps,cost}];
  }
  const record={round:a.index+1,endTurn:a.endTurn,turn:state.turn,seat:p.id,priority:a.at+1,from,to:p.welfarePosition,steps,cost,tokensGained:0,available:roundRondelCommands({...state,players:state.players.map(q=>q.id===p.id?{...q,coins:q.coins+cost,welfarePosition:from}:q)}),benefitsBefore:{...p.welfareRondelStats.benefits}};
  const log=[...rr.log,record],at=a.at+1;
  if(at<a.order.length){state.roundRondel={...rr,log,active:{...a,at}};state.current=a.order[at];return false;}
  state.roundRondel={...rr,log,active:null,completed:[...rr.completed,a.index]};state.current=a.resumeCurrent;return true;
}

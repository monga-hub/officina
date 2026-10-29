import {WELFARE_FUNDS,validFundThresholds} from './welfare-funds.js';
import { welfareDisplayPolicies, welfarePolicies, welfarePolicyEnabled, validPolicyOrder } from './welfare-rondel.js';
export const validRoundSchedule=config=>JSON.stringify([config.bounds,config.firstSeats])==='[[9,18],[0,1]]'||JSON.stringify([config.bounds,config.firstSeats])==='[[7,14,21],[0,1,2]]';
export function initRoundRondel(config,n,turns) {
  if(n!==3||turns!==28||!validRoundSchedule(config)||config.maxSteps!==3||![0,1].includes(config.stepCost)||config.tokenCost!==1||config.tokenMax!==3)throw new Error('Unsupported round rondel experiment');
  if(config.startingPolicy!==undefined&&(config.startingPolicy!=='affinity'||config.extraStepCost!==1||config.mandatoryMove!==true||config.freeEntry!==false))throw new Error('Unsupported starting policy');
  if(config.fundThresholds&&(config.startingPolicy!=='affinity'||!validFundThresholds(config.fundThresholds)))throw new Error('Invalid Welfare fund thresholds');
  if(config.policyOrder!==undefined&&(config.startingPolicy!=='affinity'||!validPolicyOrder(config.policyOrder)))throw new Error('Invalid rondel policy order');
  return {...structuredClone(config),...(config.fundThresholds?{funds:Object.fromEntries(WELFARE_FUNDS.map(f=>[f.id,0]))}:{}),completed:[],active:null,log:[]};
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
  const p=state.players[state.current],commands=rr.mandatoryMove?[]:[{type:'keepRoundRondel'}];
  const freeEntry=rr.freeEntry&&p.welfarePosition==null;
  const policies=welfarePolicies(state),order=rr.startingPolicy==='affinity'?welfareDisplayPolicies(state).map(p=>policies.indexOf(p)):policies.map((_,i)=>i);
  const limit=rr.extraStepCost?order.length-1:freeEntry?policies.length:rr.maxSteps;
  for(let steps=1;steps<=limit;steps++){
    const cost=roundRondelCost(rr,steps);if(cost>p.coins)break;
    const position=order[(Math.max(0,order.indexOf(p.welfarePosition??0))+steps)%order.length];
    if(welfarePolicyEnabled(state,policies[position]))commands.push({type:'advanceRoundRondel',steps,position});
  }
  return commands;
}
export function applyRoundRondel(state,command) {
  const rr=state.roundRondel,a=rr.active,p=state.players[state.current],from=p.welfarePosition;
  const steps=command.type==='advanceRoundRondel'?command.steps:0,cost=roundRondelCost(rr,steps);
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

export const roundRondelCost=(rr,steps)=>rr.extraStepCost?Math.max(0,steps-rr.maxSteps)*rr.extraStepCost:steps*rr.stepCost;

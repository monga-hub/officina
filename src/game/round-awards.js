// Experimental rewards: no action cost, PV or change to ordinary turn order.
import { SECTORS, RESOURCE_OF } from './data.js';
const ROLES = ['terziario','secondario','primario'];
export function initRoundAwards(config, nPlayers, roundLimit) {
  if (!config?.enabled) return null;
  if (nPlayers !== 3 || roundLimit !== 28 || JSON.stringify(config.bounds) !== '[9,18]' || config.places !== 2 || JSON.stringify(config.firstSeats) !== '[0,1]') throw new Error('Experimental awards require 3 players,28 turns,bounds9/18,2 places,first seats0/1');
  return { ...(config.rewardMode==='vouchers'?{rewardMode:'vouchers'}:{}), bounds:[9,18], places:2, firstSeats:[0,1], completed:[], active:null, log:[] };
}
export function roundAwardCards(round, mode) {
  if (mode==='vouchers') return roundAwardCards(round).map(card=>card.reward==='coins'?{...card,name:round?'Reclutamento avanzato':'Reclutamento',reward:'hireVoucher',amount:round?3:2}:card.reward==='resources'?{...card,name:round?'Ammodernamento avanzato':'Ammodernamento',reward:'machineVoucher',amount:round?3:2}:card);
  if (round !== 0 && round !== 1) throw new Error('Unknown award round');
  return round === 0 ? [
    { id:'polo',name:'Primo polo industriale',kind:'depth',threshold:6,reward:'coins',amount:3 },
    { id:'macchine',name:'Meccanizzazione iniziale',kind:'machines',threshold:2,reward:'resources',amount:1 },
    { id:'sviluppo',name:'Sviluppo coordinato',kind:'breadth',threshold:4,sectors:2,reward:'tokens',amount:2 },
  ] : [
    { id:'polo',name:'Polo industriale avanzato',kind:'depth',threshold:11,reward:'coins',amount:5 },
    { id:'macchine',name:'Rete di macchinari',kind:'machines',threshold:3,reward:'resources',amount:2 },
    { id:'sviluppo',name:'Fabbrica integrata',kind:'breadth',threshold:6,sectors:3,reward:'tokens',amount:3 },
  ];
}
export function roundAwardEligible(player, card) {
  const ds=ROLES.map(r=>player.depts[r]);
  if (card.kind==='depth') return ds.some(d=>d.prod>=card.threshold);
  if (card.kind==='breadth') return ds.filter(d=>d.prod>=card.threshold).length>=card.sectors;
  if (card.kind==='machines') return ds.reduce((n,d)=>n+d.sotto.length,0)>=card.threshold && ds.filter(d=>d.sotto.length).length>=2;
  throw new Error('Unknown award requirement');
}
export function beginRoundAwards(state, finishedTurn) {
  const awards=state.roundAwards;
  if (!awards) return false;
  const round=awards.bounds.indexOf(finishedTurn);
  if (round<0 || awards.completed.includes(round)) return false;
  const first=awards.firstSeats[round],order=Array.from({length:state.nPlayers},(_,i)=>(first+i)%state.nPlayers);
  const snapshots=state.players.map(p=>({seat:p.id,coins:p.coins,resources:{...p.resources},tokens:p.welfareTokens,departments:ROLES.map(role=>({role,prod:p.depts[role].prod,machines:p.depts[role].sotto.length,tension:p.depts[role].tension})),eligible:roundAwardCards(round,awards.rewardMode).filter(c=>roundAwardEligible(p,c)).map(c=>c.id)}));
  state.roundAwards={...awards,active:{round,endTurn:finishedTurn,order,index:0,claims:{},resumeCurrent:state.current,snapshots}};
  state.current=order[0]; state.phase='roundAwards';
  return true;
}
function resourceChoices(n,start=0,prefix=[]) {
  if (!n) return [prefix];
  return SECTORS.flatMap((sector,i)=>i<start?[]:resourceChoices(n-1,i,[...prefix,sector]));
}
export function roundAwardCommands(state) {
  const awards=state.roundAwards,a=awards?.active;
  if (state.phase!=='roundAwards'||!a) return [];
  const eligible=a.snapshots[state.current].eligible;
  const cards=roundAwardCards(a.round,awards.rewardMode).filter(c=>eligible.includes(c.id)&&(a.claims[c.id]||[]).length<awards.places);
  const commands=cards.flatMap(c=>c.reward==='resources'?resourceChoices(c.amount).map(resources=>({type:'claimRoundAward',cardId:c.id,resources})):[{type:'claimRoundAward',cardId:c.id}]);
  return commands.length?commands:[{type:'skipRoundAward'}];
}
// The caller has already checked legality and cloned the acting player.
export function applyRoundAward(state,command) {
  const awards=state.roundAwards,a=awards.active,p=state.players[state.current];
  const options=roundAwardCommands(state),card=roundAwardCards(a.round,awards.rewardMode).find(c=>c.id===command.cardId);
  const record={round:a.round+1,endTurn:a.endTurn,seat:p.id,priority:a.index+1,eligible:[...a.snapshots[p.id].eligible],available:[...new Set(options.filter(c=>c.type==='claimRoundAward').map(c=>c.cardId))],command:{...command},coins:0,tokens:0,resources:{},snapshot:a.snapshots[p.id]};
  const claims={...a.claims};
  if (command.type==='claimRoundAward') {
    if(card.reward==='hireVoucher'||card.reward==='machineVoucher') {
      const voucher={id:`r${a.round+1}-s${p.id}`,side:card.reward==='hireVoucher'?'sopra':'sotto',face:card.amount,earnedEndTurn:a.endTurn,usedTurn:null};
      p.roundAwardVouchers=[...p.roundAwardVouchers,voucher];record.voucher={...voucher};
    }
    else if(card.reward==='coins') {p.coins+=card.amount;p.coinsGained+=card.amount;p.coinsGainedBy.roundAwards=(p.coinsGainedBy.roundAwards||0)+card.amount;record.coins=card.amount;}
    else if(card.reward==='tokens') {p.welfareTokens+=card.amount;record.tokens=card.amount;}
    else {for(const sector of command.resources){const key=RESOURCE_OF[sector];p.resources[key]++;record.resources[key]=(record.resources[key]||0)+1;}p.resGainedBy.roundAwards=(p.resGainedBy.roundAwards||0)+card.amount;}
    claims[card.id]=[...(claims[card.id]||[]),p.id];record.card=card.name;
  }
  const log=[...awards.log,record],index=a.index+1;
  if(index<a.order.length){state.roundAwards={...awards,log,active:{...a,claims,index}};state.current=a.order[index];return false;}
  state.roundAwards={...awards,log,completed:[...awards.completed,a.round],active:null};
  state.current=a.resumeCurrent;return true;
}

// Oldest matching voucher is spent on the next positive-price purchase; one per action.
export function roundVoucherDiscount(player,side,cost) {
  if(cost<=0) return null;
  const voucher=player.roundAwardVouchers?.find(v=>v.side===side&&v.usedTurn===null);
  return voucher?{voucher,saved:Math.min(cost,voucher.face)}:null;
}
export function spendRoundVoucher(state,player,command,cost) {
  const use=roundVoucherDiscount(player,command.side,cost);
  if(!use) return;
  player.roundAwardVouchers=player.roundAwardVouchers.map(v=>v.id===use.voucher.id?{...v,usedTurn:state.turn}:v);
  player.roundAwardVoucherUses=[...player.roundAwardVoucherUses,{id:use.voucher.id,turn:state.turn,role:command.role,side:command.side,cardId:command.cardId,baseCost:cost,paid:cost-use.saved,face:use.voucher.face,saved:use.saved,lost:use.voucher.face-use.saved}];
}

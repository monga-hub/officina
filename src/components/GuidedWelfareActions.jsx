import React,{useState} from 'react';
import {currentPlayer} from '../game/engine.js';
import {WELFARE_FUNDS,fundBalances} from '../game/welfare-funds.js';
import {rowActionPreview} from './row-action-preview.js';
import {Amount} from './Amount.jsx';

export function welfareCommand(legal,count,targets){
  const funds=Object.fromEntries(WELFARE_FUNDS.map(f=>[f.id,targets.slice(0,count).filter(id=>id===f.id).length]));
  return legal.find(c=>c.type==='investWelfare'&&c.count===count&&WELFARE_FUNDS.every(f=>(c.funds?.[f.id]||0)===funds[f.id]));
}

function FundSelect({value,onChange,label,state}){
  const balances=fundBalances(state);
  return <label className="guided-field" data-welfare-fund={value}>{label}
    <select value={value} onChange={e=>onChange(e.target.value)}>
      {WELFARE_FUNDS.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
    <small>Saldo {balances[value]} · soglia {state.roundRondel.fundThresholds[value]}</small>
  </label>;
}

function WelfarePurchase({state,legal,dispatch}){
  const counts=[...new Set(legal.map(c=>c.count))];
  const [chosenCount,setCount]=useState(counts[0]);
  const [targets,setTargets]=useState(['economy','economy','economy']);
  const count=counts.includes(chosenCount)?chosenCount:counts[0];
  const command=welfareCommand(legal,count,targets);
  const preview=command&&rowActionPreview(state,command);
  return <section className="guided-welfare">
    <label className="guided-field">Quanti gettoni vuoi comprare?
      <select value={count} onChange={e=>setCount(Number(e.target.value))}>{counts.map(n=><option key={n} value={n}>{n} {n===1?'gettone':'gettoni'} · {n} {n===1?'marco':'marchi'}</option>)}</select>
    </label>
    <p>In quali fondi versi i marchi?</p>
    <div className="guided-funds">{Array.from({length:count},(_,i)=><FundSelect key={i} label={`Marco ${i+1}`} value={targets[i]} state={state} onChange={id=>setTargets(old=>old.map((v,j)=>j===i?id:v))}/>)}</div>
    {preview&&<div className="guided-summary">
      <strong>Paghi <Amount kind="coin" value={preview.cost}/> · ricevi {count} {count===1?'gettone':'gettoni'} 🌿</strong>
      <div className="fund-allocation">{WELFARE_FUNDS.filter(f=>command.funds[f.id]>0).map(f=><span key={f.id} className="fund-label" data-welfare-fund={f.id}>{f.name}: {fundBalances(state)[f.id]} → {fundBalances(state)[f.id]+command.funds[f.id]}</span>)}</div>
      <small>I nuovi gettoni sono utilizzabili dal prossimo turno.</small>
    </div>}
    <button className="primary" disabled={!command} onClick={()=>command&&dispatch(command)}>Compra {count} {count===1?'gettone':'gettoni'}</button>
  </section>;
}

function RepressionChoice({state,legal,dispatch}){
  const player=currentPlayer(state),roles=[...new Set(legal.map(c=>c.role))];
  const [chosenRole,setRole]=useState(roles[0]);
  const [fund,setFund]=useState('economy');
  const role=roles.includes(chosenRole)?chosenRole:roles[0];
  const command=legal.find(c=>c.role===role&&c.fund===fund);
  const preview=command&&rowActionPreview(state,command),first=preview?.departments[0];
  const category=WELFARE_FUNDS.find(f=>f.id===fund);
  const threshold=state.roundRondel.fundThresholds[fund];
  const balance=fundBalances(state)[fund];
  return <section className="guided-welfare">
    <label className="guided-field">In quale reparto?
      <select value={role} onChange={e=>setRole(e.target.value)}>{roles.map(r=><option key={r} value={r}>{player.depts[r].sector} · tensione {player.depts[r].tension}</option>)}</select>
    </label>
    <FundSelect label="Da quale fondo prelevi?" value={fund} onChange={setFund} state={state}/>
    {preview&&<div className="guided-summary">
      <strong>Incassi <Amount kind="coin" value={preview.income}/> · nessun costo</strong>
      <p>{first.before.sector}: tensione <b>{first.before.tension} → {first.after.tension}</b> · righe libere {first.before.available} → {first.after.available}</p>
      <span className="fund-label" data-welfare-fund={fund}>{category.name}: {balance} → {balance-preview.income} marchi</span>
      {balance>=threshold&&balance-preview.income<threshold&&<p>Il fondo scende sotto soglia: i suoi potenziamenti si disattivano.</p>}
      {preview.income===0&&<p>Questo fondo è vuoto: recuperi il reparto senza incassare.</p>}
      <small>Negli altri reparti: {preview.departments.slice(1).map(d=>`${d.before.sector} ${d.before.tension} → ${d.after.tension}`).join(' · ')}.</small>
    </div>}
    <button className="primary" disabled={!command} onClick={()=>command&&dispatch(command)}>Conferma repressione</button>
  </section>;
}

export default function GuidedWelfareActions({state,legal,dispatch}){
  const purchases=legal.filter(c=>c.type==='investWelfare'),repressions=legal.filter(c=>c.type==='repress');
  return <>{purchases.length>0&&<WelfarePurchase state={state} legal={purchases} dispatch={dispatch}/>}{repressions.length>0&&<RepressionChoice state={state} legal={repressions} dispatch={dispatch}/>}</>;
}

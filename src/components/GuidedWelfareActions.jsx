import React,{useState} from 'react';
import {currentPlayer} from '../game/engine.js';
import {WELFARE_FUNDS,fundBalances} from '../game/welfare-funds.js';
import {rowActionPreview} from './row-action-preview.js';
import {Amount} from './Amount.jsx';

export function welfareCommand(legal,count,targets){
  const funds=Object.fromEntries(WELFARE_FUNDS.map(f=>[f.id,targets.slice(0,count).filter(id=>id===f.id).length]));
  return legal.find(c=>c.type==='investWelfare'&&c.count===count&&WELFARE_FUNDS.every(f=>(c.funds?.[f.id]||0)===funds[f.id]));
}

function WelfarePurchase({state,legal,dispatch}){
  const [targets,setTargets]=useState([]);
  const count=targets.length,max=Math.max(...legal.map(c=>c.count));
  const command=welfareCommand(legal,count,targets);
  const preview=command&&rowActionPreview(state,command);
  return <section className="guided-welfare">
    <p>Distribuisci i marchi nei fondi: <b>ogni marco compra un gettone</b>, fino a {max}.</p>
    <div className="guided-fund-cards">{WELFARE_FUNDS.map(f=>{
      const allocated=targets.filter(id=>id===f.id).length;
      return <div className="guided-fund-card" data-welfare-fund={f.id} key={f.id}>
        <strong>{f.name}</strong><small>Saldo {fundBalances(state)[f.id]} · soglia {state.roundRondel.fundThresholds[f.id]}</small>
        <div className="guided-counter">
          <button aria-label={`Togli un marco da ${f.name}`} disabled={!allocated} onClick={()=>setTargets(old=>old.filter((_,i)=>i!==old.lastIndexOf(f.id)))}>−</button>
          <output aria-label={`Marchi a ${f.name}`}>{allocated}</output>
          <button aria-label={`Versa un marco in ${f.name}`} disabled={count>=max} onClick={()=>setTargets(old=>[...old,f.id])}>+</button>
        </div>
      </div>;
    })}</div>
    <div className="guided-summary" aria-live="polite">
      {preview?<><strong>Paghi <Amount kind="coin" value={preview.cost}/> · ricevi {count} {count===1?'gettone':'gettoni'} 🌿</strong>
        <div className="fund-allocation">{WELFARE_FUNDS.filter(f=>command.funds[f.id]>0).map(f=><span key={f.id} className="fund-label" data-welfare-fund={f.id}>{f.name}: {fundBalances(state)[f.id]} → {fundBalances(state)[f.id]+command.funds[f.id]}</span>)}</div>
        <small>I nuovi gettoni sono utilizzabili dal prossimo turno.</small></>:<span>Usa + per scegliere dove versare.</span>}
    </div>
    <button className="primary" disabled={!command} onClick={()=>command&&dispatch(command)}>{count?`Compra ${count} ${count===1?'gettone':'gettoni'}`:'Scegli i gettoni'}</button>
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
    <div className="guided-field" role="group" aria-label="Reparto da reprimere"><strong>In quale reparto?</strong>
      <div className="guided-options">{roles.map(r=><button key={r} aria-pressed={role===r} onClick={()=>setRole(r)}>{role===r&&'✓ '}{player.depts[r].sector}<small>Tensione {player.depts[r].tension}</small></button>)}</div>
    </div>
    <div className="guided-field" role="group" aria-label="Fondo da cui prelevare"><strong>Da quale fondo prelevi?</strong>
      <div className="guided-options">{WELFARE_FUNDS.map(f=><button key={f.id} data-welfare-fund={f.id} aria-pressed={fund===f.id} onClick={()=>setFund(f.id)}>{fund===f.id&&'✓ '}{f.name}<small>Saldo {fundBalances(state)[f.id]} · soglia {state.roundRondel.fundThresholds[f.id]}</small></button>)}</div>
    </div>
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

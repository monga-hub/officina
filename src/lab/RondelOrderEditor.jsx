import React, {useRef,useState} from 'react';
import {ALL_WELFARE_POLICIES,DEFAULT_ROUND_POLICY_ORDER,movePolicy} from '../game/welfare-rondel.js';
import {policyFund} from '../game/welfare-funds.js';

export default function RondelOrderEditor({c,set}){
  const order=c.roundRondel.policyOrder||DEFAULT_ROUND_POLICY_ORDER;
  const list=useRef(null),drag=useRef(null);
  const [dragging,setDragging]=useState(null),[target,setTarget]=useState(null),[message,setMessage]=useState('');
  function move(source,destination){
    if(source===destination)return;
    const next=movePolicy(order,source,destination);
    set({roundRondel:{...c.roundRondel,policyOrder:next}});
    setMessage(`${ALL_WELFARE_POLICIES.find(p=>p.id===source).name}: casella ${next.indexOf(source)+1}.`);
  }
  function finish(e,commit){
    const current=drag.current;drag.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(null);setTarget(null);
    if(commit&&current?.moved&&current.target)move(current.id,current.target);
  }
  return <section className="rondel-order-editor" aria-label="Ordine della rondella">
    <p>Trascina la maniglia di un’abilità sulla posizione desiderata. L’ordine va in senso orario e determina i passi effettivi. Affinità resta l’abilità iniziale, ovunque la metti.</p>
    <ol ref={list} className="rondel-order-list">{order.map((id,index)=>{
      const policy=ALL_WELFARE_POLICIES.find(p=>p.id===id),fund=policyFund(id);
      return <li key={id} data-rondel-id={id} className={`${dragging===id?'order-dragging':''} ${target===id&&dragging!==id?'order-target':''}`}>
        <button type="button" className="order-handle" aria-label={`Trascina ${policy.name}`} onPointerDown={e=>{
          if(e.button!==0)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);
          drag.current={id,x:e.clientX,y:e.clientY,moved:false,target:null};setDragging(id);setMessage('');
        }} onPointerMove={e=>{
          const current=drag.current;if(!current)return;
          if(Math.hypot(e.clientX-current.x,e.clientY-current.y)<6&&!current.moved)return;
          current.moved=true;
          const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-rondel-id]');
          current.target=over&&list.current.contains(over)?over.dataset.rondelId:null;setTarget(current.target);
        }} onPointerUp={e=>finish(e,true)} onPointerCancel={e=>finish(e,false)} onKeyDown={e=>{
          if(e.key==='ArrowUp'&&index>0){e.preventDefault();move(id,order[index-1]);}
          if(e.key==='ArrowDown'&&index<order.length-1){e.preventDefault();move(id,order[index+1]);}
          if(e.key==='Escape'){drag.current=null;setDragging(null);setTarget(null);}
        }}>⠿</button>
        <div><strong>{index+1}. {policy.name}</strong><small>{fund?`Fondo ${fund.name}`:'Partenza di tutti i giocatori'}</small></div>
        <div className="order-buttons"><button type="button" aria-label={`Sposta ${policy.name} prima`} disabled={index===0} onClick={()=>move(id,order[index-1])}>↑</button><button type="button" aria-label={`Sposta ${policy.name} dopo`} disabled={index===order.length-1} onClick={()=>move(id,order[index+1])}>↓</button></div>
      </li>;
    })}</ol>
    <p className="lab-muted">Puoi usare anche le frecce, oppure ↑ e ↓ sulla maniglia. L’ordine si salva insieme agli altri editor e vale per le nuove partite e simulazioni.</p>
    <p className="order-status" role="status">{message}</p>
  </section>;
}

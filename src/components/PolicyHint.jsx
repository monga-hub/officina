import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function PolicyHint({policy,children,fund}) {
  const anchor=useRef(null),timer=useRef(null),held=useRef(false),touch=useRef(false),id=useId();
  const [position,setPosition]=useState(null);
  const show=()=>{
    const box=anchor.current.getBoundingClientRect(),above=window.innerHeight-box.bottom<120;
    setPosition({left:Math.max(8,Math.min(box.left,window.innerWidth-276)),top:above?box.top-8:box.bottom+8,transform:above?'translateY(-100%)':undefined});
  };
  const hide=()=>{clearTimeout(timer.current);setPosition(null);};
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  return <span ref={anchor} className="policy-hint" tabIndex={0} aria-label={fund?`${policy.name} · Fondo ${fund.name}`:policy.name} aria-describedby={position?id:undefined}
    onPointerEnter={e=>{if(e.pointerType==='mouse'){touch.current=false;show();}}} onPointerLeave={hide}
    onFocus={()=>{if(!touch.current)show();}} onBlur={hide}
    onPointerDown={e=>{touch.current=e.pointerType!=='mouse';held.current=false;if(touch.current)timer.current=setTimeout(()=>{held.current=true;show();},450);}}
    onPointerUp={()=>{if(touch.current)hide();}} onPointerCancel={hide}
    onContextMenu={e=>e.preventDefault()} onClickCapture={e=>{if(held.current){e.preventDefault();e.stopPropagation();held.current=false;}}}>
    {children}
    {position&&createPortal(<span id={id} role="tooltip" className="policy-tooltip" style={position}><b>{policy.name}</b>{fund&&<span className="fund-label" data-welfare-fund={fund.id}>Fondo {fund.name}</span>}{policy.description}</span>,document.body)}
  </span>;
}

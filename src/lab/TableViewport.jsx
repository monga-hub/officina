import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Keep the desktop table together; dialogs live outside its scaled coordinate space.
export function TableOverlay({children}) {
  return createPortal(<div className="lab-shell play-table table-overlay">{children}</div>,document.body);
}
export default function TableViewport({children}) {
  const host=useRef(null), canvas=useRef(null), controls=useRef(null);
  const [size,setSize]=useState({width:1600,height:720,availableHeight:720});
  const [enlarged,setEnlarged]=useState(false);
  useLayoutEffect(()=>{
    const measure=()=>{
      const next={width:host.current.clientWidth,height:canvas.current.offsetHeight,
        availableHeight:Math.max(1,window.innerHeight-(controls.current?.offsetHeight||0))};
      setSize(old=>Object.keys(next).every(key=>old[key]===next[key])?old:next);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(host.current);observer.observe(canvas.current);observer.observe(controls.current);
    window.addEventListener('resize',measure);measure();
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  const compact=size.width<1254, width=compact?1600:size.width;
  const scale=compact&&!enlarged?Math.min(1,size.width/width,size.availableHeight/Math.max(1,size.height)):1;
  return <div ref={host} className={`table-fit-host${compact?' table-fit-compact':''}`}>
    <div ref={controls} className="table-fit-controls" hidden={!compact}>
      <button onClick={()=>setEnlarged(!enlarged)}>{enlarged?'Vista completa':'Ingrandisci'}</button>
      <span>{enlarged?'Scorri per esplorare il tavolo.':'Tutto il tavolo · ruota il telefono per vederlo più grande.'}</span>
    </div>
    <div className="table-fit-scroll">
      <div className="table-fit-space" style={{width:width*scale,height:size.height*scale}}>
        <div ref={canvas} className="table-fit-canvas" style={{width,transform:`scale(${scale})`,'--table-height':compact?'720px':'100dvh'}}>{children}</div>
      </div>
    </div>
  </div>;
}

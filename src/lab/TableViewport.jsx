import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Keep the desktop table together; dialogs live outside its scaled coordinate space.
export function TableOverlay({children}) {
  return createPortal(<div className="lab-shell play-table table-overlay">{children}</div>,document.body);
}
export default function TableViewport({children}) {
  const host=useRef(null), canvas=useRef(null);
  const [size,setSize]=useState({width:1600,height:720,tableHeight:720,availableHeight:720,tableTop:90});
  useLayoutEffect(()=>{
    const measure=()=>{
      const table=canvas.current.querySelector('.play-layout');
      const next={width:host.current.clientWidth,height:canvas.current.offsetHeight,
        tableHeight:table.offsetTop+Math.max(table.offsetHeight,table.scrollHeight)+8,tableTop:table.offsetTop,
        availableHeight:Math.max(1,window.innerHeight)};
      setSize(old=>Object.keys(next).every(key=>old[key]===next[key])?old:next);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(host.current);observer.observe(canvas.current);
    canvas.current.querySelectorAll('.play-factory,.play-contracts-side').forEach(element=>observer.observe(element));
    window.addEventListener('resize',measure);measure();
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  const compact=size.width<1254, width=compact?1600:size.width;
  const scale=Math.min(1,size.width/width,size.availableHeight/Math.max(1,size.tableHeight));
  const playHeight=Math.max(540,(compact?720:size.availableHeight)-size.tableTop-8);
  return <div ref={host} className={`table-fit-host${compact?' table-fit-compact':''}`}>
    <div className="table-fit-scroll">
      <div className="table-fit-space" style={{width:width*scale,height:size.tableHeight*scale}}>
        <div ref={canvas} className="table-fit-canvas" style={{width,transform:`scale(${scale})`,'--table-height':compact?'720px':'100dvh','--play-area-height':`${playHeight}px`}}>{children}</div>
      </div>
    </div>
  </div>;
}

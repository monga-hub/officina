import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Keep the desktop table together; dialogs live outside its scaled coordinate space.
export function TableOverlay({children}) {
  return createPortal(<div className="lab-shell play-table table-overlay">{children}</div>,document.body);
}
export default function TableViewport({children}) {
  const host=useRef(null), canvas=useRef(null);
  const [size,setSize]=useState({width:1600,height:720,tableHeight:720,availableHeight:720});
  useLayoutEffect(()=>{
    const measure=()=>{
      const table=canvas.current.querySelector('.play-layout');
      const next={width:host.current.clientWidth,height:canvas.current.offsetHeight,
        tableHeight:table.offsetTop+table.offsetHeight+8,
        availableHeight:Math.max(1,window.innerHeight)};
      setSize(old=>Object.keys(next).every(key=>old[key]===next[key])?old:next);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(host.current);observer.observe(canvas.current);
    window.addEventListener('resize',measure);measure();
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  const compact=size.width<1254, width=compact?1600:size.width;
  const scale=compact?Math.min(1,size.width/width,size.availableHeight/Math.max(1,size.tableHeight)):1;
  return <div ref={host} className={`table-fit-host${compact?' table-fit-compact':''}`}>
    <div className="table-fit-scroll">
      <div className="table-fit-space" style={{width:width*scale,height:size.height*scale}}>
        <div ref={canvas} className="table-fit-canvas" style={{width,transform:`scale(${scale})`,'--table-height':compact?'720px':'100dvh'}}>{children}</div>
      </div>
    </div>
  </div>;
}

import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function TableOverlay({children}) {
  return createPortal(<div className="lab-shell play-table table-overlay">{children}</div>,document.body);
}
export default function TableViewport({children}) {
  const host=useRef(null);
  const [width,setWidth]=useState(null);
  useLayoutEffect(()=>{
    const measure=()=>{
      // Floor fractional zoom widths so a rounded-up pixel cannot toggle scrollbars.
      const next=Math.floor(host.current.getBoundingClientRect().width);
      setWidth(old=>old===next?old:next);
    };
    const observer=new ResizeObserver(measure);
    observer.observe(host.current);measure();
    return()=>observer.disconnect();
  },[]);
  return <div ref={host} className="table-fit-host physical-fit"><div className="table-fit-canvas" style={{width:width??'100%'}}>{children}</div></div>;
}

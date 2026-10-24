import { useEffect, useRef, useState } from 'react';
import { checkVersion } from './version.js';
export const RELEASE=typeof __APP_RELEASE__==='undefined'?null:__APP_RELEASE__;
export default function useVersionCheck(busy) {
  const [result,setResult]=useState({status:'checking'}),[ready,setReady]=useState(false);
  const running=useRef(false);
  const check=async()=>{
    if(running.current)return;
    running.current=true;
    const next=await checkVersion({current:RELEASE?.version,href:window.location.href});
    setResult(next);setReady(true);running.current=false;
  };
  useEffect(()=>{
    check();
    const visible=()=>{if(document.visibilityState==='visible')check();};
    const restored=e=>{if(e.persisted)check();};
    document.addEventListener('visibilitychange',visible);
    window.addEventListener('pageshow',restored);
    window.addEventListener('online',visible);
    return()=>{document.removeEventListener('visibilitychange',visible);window.removeEventListener('pageshow',restored);window.removeEventListener('online',visible);};
  },[]);
  useEffect(()=>{
    if(result.status==='update'&&!result.attempted&&!busy)window.location.replace(result.url);
  },[result,busy]);
  return {result,ready,check};
}

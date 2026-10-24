import React from 'react';
import { RESOURCE_OF } from '../game/data.js';

export function Amount({kind,value,label}) {
  const resource=RESOURCE_OF[kind]||kind;
  const text=label||(kind==='coin'?`${value} marchi`:kind==='pv'?`${value} punti vittoria`:kind==='choice'?`${value} risorse a scelta`:`${value} ${resource.toLowerCase()}`);
  return <span className={`amount-token ${kind==='coin'?'amount-coin':kind==='pv'?'amount-pv':kind==='choice'?'amount-choice':`amount-resource resource-${resource}`}`} role="img" aria-label={text} title={text}>{value}</span>;
}

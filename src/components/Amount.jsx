import React from 'react';
import { RESOURCE_OF } from '../game/data.js';
import {resourceArt} from '../lab/approved-art.js';

export function Amount({kind,value,label}) {
  const resource=RESOURCE_OF[kind]||kind;
  const text=label||(kind==='coin'?`${value} marchi`:kind==='pv'?`${value} punti vittoria`:kind==='choice'?`${value} risorse a scelta`:`${value} ${resource.toLowerCase()}`);
  const art=resourceArt(kind);
  return <span style={art?{backgroundImage:`url(${art})`}:undefined} data-approved-art={art?'true':undefined} className={`amount-token ${kind==='coin'?'amount-coin':kind==='pv'?'amount-pv':kind==='choice'?'amount-choice':`amount-resource resource-${resource}`}`} role="img" aria-label={text} title={text}>{value}</span>;
}

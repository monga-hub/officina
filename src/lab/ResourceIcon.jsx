import React from 'react';
import { RESOURCE_OF } from '../game/data.js';
import {departmentArt,resourceArt} from './approved-art.js';

export default function ResourceIcon({resource, decorative=false, department=false}) {
  const name=RESOURCE_OF[resource]||resource;
  const art=department?departmentArt(resource):resourceArt(resource);
  return <span style={art?{backgroundImage:`url(${art})`}:undefined} data-approved-art={art?'true':undefined} className={`resource-mark resource-${name}`} role={decorative?undefined:'img'} aria-label={decorative?undefined:name} aria-hidden={decorative||undefined}/>;
}

import React from 'react';
import { RESOURCE_OF } from '../game/data.js';

export default function ResourceIcon({resource, decorative=false}) {
  const name=RESOURCE_OF[resource]||resource;
  return <span className={`resource-mark resource-${name}`} role={decorative?undefined:'img'} aria-label={decorative?undefined:name} aria-hidden={decorative||undefined}/>;
}

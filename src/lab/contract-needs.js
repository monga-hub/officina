import { RESOURCE_OF, SECTORS } from '../game/data.js';

export function contractNeeds(requirements, resources = {}) {
  return SECTORS.map(sector => {
    const resource=RESOURCE_OF[sector], required=requirements.filter(s=>s===sector).length;
    const owned=resources[resource]||0;
    return {resource,required,owned,missing:Math.max(0,required-owned)};
  }).filter(row=>row.required>0);
}
export function missingResources(rows) {
  return rows.filter(r=>r.missing>0).map(r=>`${r.missing} ${r.resource==='Tessuti'&&r.missing===1?'tessuto':r.resource==='Coloranti'&&r.missing===1?'colorante':r.resource.toLowerCase()}`).join(', ');
}

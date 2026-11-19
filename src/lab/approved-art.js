import manifest from './assets/approved/manifest.json';

const files=import.meta.glob('./assets/approved/*.{png,jpg}',{eager:true,query:'?url',import:'default'});
export const approvedArt=name=>files[`./assets/approved/${name}`];
export {manifest as approvedManifest};
const departments={Tessile:'textile',Chimica:'chemical',Metallurgica:'metal',Servizi:'welfare',Sindacato:'repression',Borsa:'city'};
const resources={Tessile:'textile',Tessuti:'textile',Chimica:'chemical',Coloranti:'chemical',Metallurgica:'metal',Acciaio:'metal'};
export const departmentArt=sector=>approvedArt(manifest.icons[departments[sector]]);
export const resourceArt=kind=>approvedArt(manifest.icons[kind==='coin'?'coin':`resource-${resources[kind]}`]);
export const policyArt=id=>approvedArt(manifest.policies[id]);

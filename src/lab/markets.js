// Each physical market is shared by its two neighbouring destinations.
export const STAR_MARKETS = [
  {bank:'A',nodes:['Tessile','Metallurgica'],x:20,y:1},
  {bank:'B',nodes:['Metallurgica','Chimica'],x:61,y:1},
  {bank:'C',nodes:['Chimica','Servizi'],x:80.5,y:53},
  {bank:'D',nodes:['Servizi','Sindacato'],x:40.5,y:58},
  {bank:'E',nodes:['Sindacato','Tessile'],x:0.5,y:53},
];
export const STAR_NODE_BANKS=Object.fromEntries(
  ['Tessile','Metallurgica','Chimica','Servizi','Sindacato'].map(node=>
    [node,STAR_MARKETS.filter(m=>m.nodes.includes(node)).map(m=>m.bank)])
);

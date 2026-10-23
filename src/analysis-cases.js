export function normalizeAnalysisCases(value){
  if(value==null)return [];
  if(!Array.isArray(value)||value.length>16)throw new Error('Lista de casos de análisis no válida.');
  const ids=new Set();
  return value.map((item,index)=>{
    if(!item||typeof item!=='object'||typeof item.id!=='string'||!/^c\d+$/.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>80||!['elastic','thermal','flow'].includes(item.mode)||!['source','lattice'].includes(item.target)||![0,1,2].includes(item.axis)||!['force','pressure','moment'].includes(item.loadType))throw new Error(`Caso ${index+1} no válido.`);
    for(const key of ['E','loadValue','conductivity','power','ambient'])if(!Number.isFinite(item[key]))throw new Error(`Parámetros del caso ${index+1} no válidos.`);
    for(const key of ['supportFace','loadFace'])if(typeof item[key]!=='string'||item[key].length>20||!/^$|^\d{1,2}$|^g:g\d+$/.test(item[key]))throw new Error(`Caras del caso ${index+1} no válidas.`);
    if(![-1,1].includes(item.loadSense))throw new Error(`Sentido del caso ${index+1} no válido.`);
    ids.add(item.id);
    return {...item,name:item.name.trim()};
  });
}

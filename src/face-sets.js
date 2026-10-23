export function normalizeFaceSets(value,faceCount){
  if(value==null)return [];
  if(!Array.isArray(value)||value.length>32)throw new Error('Demasiados grupos de caras en el proyecto.');
  const ids=new Set();
  return value.map((entry,index)=>{
    const id=entry?.id,name=entry?.name,faceIds=entry?.faceIds;
    if(typeof id!=='string'||!/^g\d+$/.test(id)||ids.has(id)||typeof name!=='string'||!name.trim()||name.length>80||!Array.isArray(faceIds)||!faceIds.length||faceIds.length>100)throw new Error(`Grupo de caras ${index+1} no válido.`);
    ids.add(id);
    const unique=[...new Set(faceIds)];
    if(unique.length!==faceIds.length||unique.some(faceId=>!Number.isInteger(faceId)||faceId<0||faceId>=faceCount||faceId>=100))throw new Error(`Caras fuera de la pieza en grupo ${index+1}.`);
    return {id,name:name.trim(),faceIds:unique};
  });
}

export function combineFaceGroups(groups,faceIds,name='Grupo'){
  const chosen=faceIds.map(id=>groups[id]);
  if(!chosen.length||chosen.some(group=>!group))throw new Error('El grupo contiene caras no disponibles.');
  const triangleIds=[...new Set(chosen.flatMap(group=>group.triangleIds))].sort((a,b)=>a-b);
  const areaMm2=chosen.reduce((sum,group)=>sum+group.areaMm2,0);
  const centroid=[0,1,2].map(axis=>chosen.reduce((sum,group)=>sum+group.centroid[axis]*group.areaMm2,0)/areaMm2);
  const vector=[0,1,2].map(axis=>chosen.reduce((sum,group)=>sum+group.normal[axis]*group.areaMm2,0));
  const length=Math.hypot(...vector);
  return {name,triangleIds,triangles:triangleIds.length,areaMm2,centroid,normal:vector.map(value=>length?value/length:0)};
}

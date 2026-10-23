export function createBodyRecords(positions,ranges,faceRanges=[]){
  if(!(positions instanceof Float32Array)||positions.length%9||!positions.length)throw new Error('Malla de cuerpos no válida.');
  const count=positions.length/9;
  if(!Array.isArray(ranges)||!ranges.length)ranges=[{name:'Pieza',first:0,last:count-1}];
  const bodies=[];let next=0;
  for(const [index,range] of ranges.entries()){
    if(!Number.isInteger(range.first)||!Number.isInteger(range.last)||range.first!==next||range.last<range.first||range.last>=count)throw new Error('Rangos de cuerpos no válidos.');
    const faces=faceRanges.filter(face=>face.first>=range.first&&face.last<=range.last).map(face=>({first:face.first-range.first,last:face.last-range.first,name:String(face.name||`Cara CAD ${index+1}`).slice(0,80)}));
    bodies.push({name:String(range.name||`Cuerpo ${index+1}`).slice(0,80),positions:new Float32Array(positions.subarray(range.first*9,(range.last+1)*9)),visible:true,faces});
    next=range.last+1;
  }
  if(next!==count)throw new Error('Los cuerpos no cubren toda la malla.');
  return bodies;
}

export function assembleVisibleBodies(bodies){
  const active=bodies.filter(body=>body.visible);
  if(!active.length)throw new Error('Debe quedar al menos un cuerpo visible.');
  const total=active.reduce((sum,body)=>sum+body.positions.length,0);
  if(total/9>80000)throw new Error('Se superó el límite de 80.000 triángulos.');
  const positions=new Float32Array(total),faces=[];let offset=0;
  for(const body of active){
    if(!(body.positions instanceof Float32Array)||body.positions.length%9||!body.positions.length)throw new Error('Un cuerpo no contiene triángulos válidos.');
    positions.set(body.positions,offset*9);
    for(const face of body.faces||[])faces.push({first:face.first+offset,last:face.last+offset,name:face.name});
    offset+=body.positions.length/9;
  }
  return {positions,cadFaces:faces};
}

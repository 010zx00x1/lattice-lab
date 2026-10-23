// Groups triangles that share an edge and whose normals differ by at most
// angleDegrees. This is a geometric aid, not a recovery of original CAD faces.
export function detectFaceGroups(positions,angleDegrees=30){
  if(!positions||positions.length%9)throw new Error('Triángulos no válidos.');
  if(!Number.isFinite(angleDegrees)||angleDegrees<0||angleDegrees>90)throw new Error('Ángulo no válido.');
  const count=positions.length/9;if(!count)return [];
  let max=0;for(const v of positions)max=Math.max(max,Math.abs(v));
  const tolerance=Math.max(1e-5,max*1e-6),vertices=new Map(),ids=new Int32Array(count*3),normals=new Float64Array(count*3),areas=new Float64Array(count),centroids=new Float64Array(count*3);
  let nextVertex=0;
  for(let t=0;t<count;t++){
    const base=t*9;
    for(let k=0;k<3;k++){
      const j=base+k*3,key=`${Math.round(positions[j]/tolerance)},${Math.round(positions[j+1]/tolerance)},${Math.round(positions[j+2]/tolerance)}`;
      if(!vertices.has(key))vertices.set(key,nextVertex++);
      ids[t*3+k]=vertices.get(key);
    }
    const ax=positions[base+3]-positions[base],ay=positions[base+4]-positions[base+1],az=positions[base+5]-positions[base+2];
    const bx=positions[base+6]-positions[base],by=positions[base+7]-positions[base+1],bz=positions[base+8]-positions[base+2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,magnitude=Math.hypot(nx,ny,nz);
    areas[t]=magnitude/2;if(magnitude){normals[t*3]=nx/magnitude;normals[t*3+1]=ny/magnitude;normals[t*3+2]=nz/magnitude;}
    for(let d=0;d<3;d++)centroids[t*3+d]=(positions[base+d]+positions[base+3+d]+positions[base+6+d])/3;
  }
  const parent=Int32Array.from({length:count},(_,i)=>i),rank=new Uint8Array(count),edges=new Map(),limit=Math.cos(angleDegrees*Math.PI/180)-1e-9;
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a,b)=>{a=root(a);b=root(b);if(a===b)return;if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;};
  for(let t=0;t<count;t++)for(const [u,v] of [[0,1],[1,2],[2,0]]){
    const a=ids[t*3+u],b=ids[t*3+v],key=a<b?`${a}:${b}`:`${b}:${a}`;
    const first=edges.get(key);
    if(first===undefined)edges.set(key,t);
    else{
      const dot=normals[t*3]*normals[first*3]+normals[t*3+1]*normals[first*3+1]+normals[t*3+2]*normals[first*3+2];
      if(dot>=limit)join(t,first);
    }
  }
  const groups=new Map();
  for(let t=0;t<count;t++){
    const r=root(t);if(!groups.has(r))groups.set(r,{triangles:0,triangleIds:[],areaMm2:0,centroid:[0,0,0],normal:[0,0,0]});
    const group=groups.get(r),area=areas[t];group.triangles++;group.triangleIds.push(t);group.areaMm2+=area;
    for(let d=0;d<3;d++){group.centroid[d]+=centroids[t*3+d]*area;group.normal[d]+=normals[t*3+d]*area;}
  }
  return [...groups.values()].map(group=>{
    group.centroid=group.centroid.map(v=>v/group.areaMm2);
    const magnitude=Math.hypot(...group.normal);group.normal=group.normal.map(v=>magnitude?v/magnitude:0);
    return group;
  }).sort((a,b)=>b.areaMm2-a.areaMm2);
}

// OCCT reports the inclusive triangle range of each original B-rep face.
// This mapping remains valid when mesh repair only changes winding, not count.
export function groupsFromFaceRanges(positions,ranges){
  if(!positions||positions.length%9||!Array.isArray(ranges))throw new Error('Caras CAD no válidas.');
  const triangleCount=positions.length/9,groups=[];
  for(const [index,range] of ranges.entries()){
    if(!Number.isInteger(range?.first)||!Number.isInteger(range?.last)||range.first<0||range.last<range.first||range.last>=triangleCount)throw new Error('Rango de cara CAD fuera de la malla.');
    const triangleIds=[],centroid=[0,0,0],normal=[0,0,0];let areaMm2=0;
    for(let t=range.first;t<=range.last;t++){
      triangleIds.push(t);
      const i=t*9,ax=positions[i+3]-positions[i],ay=positions[i+4]-positions[i+1],az=positions[i+5]-positions[i+2];
      const bx=positions[i+6]-positions[i],by=positions[i+7]-positions[i+1],bz=positions[i+8]-positions[i+2];
      const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,area=Math.hypot(nx,ny,nz)/2;
      areaMm2+=area;
      for(let d=0;d<3;d++)centroid[d]+=(positions[i+d]+positions[i+3+d]+positions[i+6+d])*area/3;
      normal[0]+=nx;normal[1]+=ny;normal[2]+=nz;
    }
    if(areaMm2<=0)continue;
    const length=Math.hypot(...normal);
    groups.push({name:typeof range.name==='string'?range.name.slice(0,80):`Cara CAD ${index+1}`,triangles:triangleIds.length,triangleIds,areaMm2,centroid:centroid.map(v=>v/areaMm2),normal:normal.map(v=>length?v/length:0)});
  }
  return groups;
}

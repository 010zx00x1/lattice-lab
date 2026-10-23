const key=p=>p.map(v=>Math.round(v*100000)).join(':');
export function faceBoundarySegments(faces){
  const edges=new Map();
  for(const triangles of faces){
    if(!triangles?.length||triangles.length%9)throw new Error('Caras de marco no válidas.');
    for(let t=0;t<triangles.length;t+=9){
      const p=[0,3,6].map(offset=>[triangles[t+offset],triangles[t+offset+1],triangles[t+offset+2]]);
      for(const [i,j] of [[0,1],[1,2],[2,0]]){
        const a=key(p[i]),b=key(p[j]),id=a<b?`${a}|${b}`:`${b}|${a}`;
        const existing=edges.get(id);
        if(existing)existing.count++;
        else edges.set(id,{a:p[i],b:p[j],count:1});
      }
    }
  }
  return [...edges.values()].filter(edge=>edge.count===1).map(({a,b})=>[a,b]);
}

export function edgeDistanceField({segments,inside,nx,ny,nz,start,step,radius}){
  if(!(radius>0))throw new Error('Ancho de marco no válido.');
  const dist=new Float32Array(nx*ny*nz);dist.fill(Infinity);
  const reach=radius+step,limit=reach*reach;
  for(const [a,b] of segments){
    const lo=[0,1,2].map(d=>Math.max(0,Math.ceil((Math.min(a[d],b[d])-reach-start[d])/step)));
    const hi=[0,1,2].map((d)=>Math.min([nx-1,ny-1,nz-1][d],Math.floor((Math.max(a[d],b[d])+reach-start[d])/step)));
    const ab=b.map((v,d)=>v-a[d]),len2=ab.reduce((sum,v)=>sum+v*v,0)||1;
    for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
      const id=z*nx*ny+y*nx+x;if(!inside[id])continue;
      const p=[start[0]+x*step,start[1]+y*step,start[2]+z*step];
      const t=Math.max(0,Math.min(1,ab.reduce((sum,v,d)=>sum+v*(p[d]-a[d]),0)/len2));
      const d2=p.reduce((sum,v,d)=>sum+(v-a[d]-t*ab[d])**2,0);
      if(d2<limit&&d2<dist[id]*dist[id])dist[id]=Math.sqrt(d2);
    }
  }
  return dist;
}

function trianglesForRows(positions){
  const tris=[];
  for(let i=0;i<positions.length;i+=9){
    const x0=positions[i],y0=positions[i+1],z0=positions[i+2];
    const ax=positions[i+3]-x0,ay=positions[i+4]-y0,az=positions[i+5]-z0;
    const bx=positions[i+6]-x0,by=positions[i+7]-y0,bz=positions[i+8]-z0;
    const det=ay*bz-by*az;if(Math.abs(det)<1e-10)continue;
    tris.push({x0,y0,z0,ax,bx,ay,by,az,bz,inv:1/det,ymin:Math.min(y0,y0+ay,y0+by),ymax:Math.max(y0,y0+ay,y0+by),zmin:Math.min(z0,z0+az,z0+bz),zmax:Math.max(z0,z0+az,z0+bz)});
  }
  return tris;
}
function rowHits(tris,y,z){
  const hits=[];
  for(const t of tris){
    if(y<t.ymin||y>t.ymax||z<t.zmin||z>t.zmax)continue;
    const ry=y-t.y0,rz=z-t.z0;
    const u=(ry*t.bz-t.by*rz)*t.inv,v=(t.ay*rz-ry*t.az)*t.inv;
    if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)hits.push(t.x0+u*t.ax+v*t.bx);
  }
  hits.sort((a,b)=>a-b);
  const unique=[];for(const h of hits)if(!unique.length||h-unique.at(-1)>1e-5)unique.push(h);
  return unique;
}
function inside(hits,x){
  let lo=0,hi=hits.length;
  while(lo<hi){const m=(lo+hi)>>1;if(hits[m]<x)lo=m+1;else hi=m;}
  return lo%2===1;
}
export function voxelizeMesh(positions,bounds,dims,{threshold=5,onProgress=()=>{}}={}){
  const [nx,ny,nz]=dims,size=bounds.max.map((v,i)=>v-bounds.min[i]),spacing=size.map((v,i)=>v/dims[i]);
  const occupied=new Uint8Array(nx*ny*nz),tris=trianglesForRows(positions);
  // Eight samples per cell. A majority threshold avoids turning every thin
  // surface that crosses a cell into a fully solid voxel.
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++){
    const rows=[];
    for(const oz of [.25,.75])for(const oy of [.25,.75])rows.push(rowHits(tris,bounds.min[1]+(j+oy)*spacing[1],bounds.min[2]+(k+oz)*spacing[2]));
    for(let i=0;i<nx;i++){
      let votes=0;
      for(const hits of rows)for(const ox of [.25,.75])if(inside(hits,bounds.min[0]+(i+ox)*spacing[0]))votes++;
      if(votes>=threshold)occupied[k*nx*ny+j*nx+i]=1;
    }
    if(j===0&&k%2===0)onProgress(k/nz);
  }
  return {occupied,nx,ny,nz,spacing};
}

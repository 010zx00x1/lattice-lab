// Connectivity of sampled solid nodes. This describes the material network,
// whereas disconnected mesh shells can also bound one connected hollow solid.
export function analyzeMaterialConnectivity(field,nx,ny,nz){
  const count=nx*ny*nz;
  if(field.length!==count)throw new Error('Rejilla de material incompatible.');
  const visited=new Uint8Array(count),queue=new Int32Array(count),sizes=[];
  const stride=nx*ny;
  let solids=0;
  for(let id=0;id<count;id++){
    if(!(field[id]>0))continue;
    solids++;
    if(visited[id])continue;
    visited[id]=1;queue[0]=id;
    let head=0,tail=1;
    while(head<tail){
      const at=queue[head++],x=at%nx,y=Math.floor(at/nx)%ny,z=Math.floor(at/stride);
      const neighbors=[];
      if(x>0)neighbors.push(at-1);if(x<nx-1)neighbors.push(at+1);
      if(y>0)neighbors.push(at-nx);if(y<ny-1)neighbors.push(at+nx);
      if(z>0)neighbors.push(at-stride);if(z<nz-1)neighbors.push(at+stride);
      for(const next of neighbors)if(!visited[next]&&field[next]>0){visited[next]=1;queue[tail++]=next;}
    }
    sizes.push(tail);
  }
  sizes.sort((a,b)=>b-a);
  const significantThreshold=Math.max(4,Math.ceil(solids*.001));
  return {solidNodes:solids,components:sizes.filter(size=>size>=significantThreshold).length,largestFraction:solids?sizes[0]/solids:0,allComponents:sizes.length};
}

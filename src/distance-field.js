// Two-pass 26-neighbour chamfer distance from interior grid nodes to exterior.
// Accurate to roughly one grid step; used only to create an exploratory skin.
export function distanceToExterior(inside,nx,ny,nz,step){
  const stride=nx*ny,size=inside.length,dist=new Float32Array(size);
  const forward=[],backward=[];
  for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0&&dz===0)continue;
    const item={dx,dy,dz,weight:Math.hypot(dx,dy,dz)*step};
    if(dz<0||dz===0&&dy<0||dz===0&&dy===0&&dx<0)forward.push(item);
    else backward.push(item);
  }
  for(let i=0;i<size;i++)dist[i]=inside[i]?Infinity:0;
  const update=(x,y,z,neighbors)=>{
    const id=z*stride+y*nx+x;if(!inside[id])return;
    let best=dist[id];
    for(const {dx,dy,dz,weight} of neighbors){
      const xx=x+dx,yy=y+dy,zz=z+dz;
      if(xx<0||xx>=nx||yy<0||yy>=ny||zz<0||zz>=nz)continue;
      best=Math.min(best,dist[zz*stride+yy*nx+xx]+weight);
    }
    dist[id]=best;
  };
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)update(x,y,z,forward);
  for(let z=nz-1;z>=0;z--)for(let y=ny-1;y>=0;y--)for(let x=nx-1;x>=0;x--)update(x,y,z,backward);
  return dist;
}

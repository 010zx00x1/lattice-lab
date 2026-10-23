import {pointTriangleDistance2} from './face-boundary.js';

// Distance from grid nodes inside the body to selected face triangles. Only
// nodes near the requested depth are visited; all others remain Infinity.
export function distanceToSelectedFaces({faces,inside,nx,ny,nz,start,step,depth}){
  if(!Number.isFinite(depth)||depth<=0)throw new Error('Profundidad de zona maciza no válida.');
  const count=nx*ny*nz,dist=new Float32Array(count);dist.fill(Infinity);
  const radius=depth+step,limit2=radius*radius,p=[0,0,0];
  for(const triangles of faces){
    if(!triangles?.length||triangles.length%9)throw new Error('Selecciona caras geométricas válidas.');
    for(let t=0;t<triangles.length;t+=9){
      const a=[triangles[t],triangles[t+1],triangles[t+2]],b=[triangles[t+3],triangles[t+4],triangles[t+5]],c=[triangles[t+6],triangles[t+7],triangles[t+8]];
      const lo=[0,1,2].map(d=>Math.max(0,Math.ceil((Math.min(a[d],b[d],c[d])-radius-start[d])/step)));
      const hi=[0,1,2].map((d)=>Math.min([nx-1,ny-1,nz-1][d],Math.floor((Math.max(a[d],b[d],c[d])+radius-start[d])/step)));
      for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
        const id=z*nx*ny+y*nx+x;if(!inside[id])continue;
        p[0]=start[0]+x*step;p[1]=start[1]+y*step;p[2]=start[2]+z*step;
        const d2=pointTriangleDistance2(p,a,b,c);
        if(d2<limit2&&d2<dist[id]*dist[id])dist[id]=Math.sqrt(d2);
      }
    }
  }
  return dist;
}

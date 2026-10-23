// Map a selected triangle region onto nodes of the low-resolution voxel mesh.
// The tolerance reflects the voxel discretization, not geometric CAD precision.
export function pointTriangleDistance2(p,a,b,c){
  const abx=b[0]-a[0],aby=b[1]-a[1],abz=b[2]-a[2],acx=c[0]-a[0],acy=c[1]-a[1],acz=c[2]-a[2];
  const apx=p[0]-a[0],apy=p[1]-a[1],apz=p[2]-a[2];
  const d1=abx*apx+aby*apy+abz*apz,d2=acx*apx+acy*apy+acz*apz;
  let qx,qy,qz;
  if(d1<=0&&d2<=0){[qx,qy,qz]=a;}
  else{
    const bpx=p[0]-b[0],bpy=p[1]-b[1],bpz=p[2]-b[2],d3=abx*bpx+aby*bpy+abz*bpz,d4=acx*bpx+acy*bpy+acz*bpz;
    if(d3>=0&&d4<=d3){[qx,qy,qz]=b;}
    else{
      const vc=d1*d4-d3*d2;
      if(vc<=0&&d1>=0&&d3<=0){const t=d1/(d1-d3);qx=a[0]+t*abx;qy=a[1]+t*aby;qz=a[2]+t*abz;}
      else{
        const cpx=p[0]-c[0],cpy=p[1]-c[1],cpz=p[2]-c[2],d5=abx*cpx+aby*cpy+abz*cpz,d6=acx*cpx+acy*cpy+acz*cpz;
        if(d6>=0&&d5<=d6){[qx,qy,qz]=c;}
        else{
          const vb=d5*d2-d1*d6;
          if(vb<=0&&d2>=0&&d6<=0){const t=d2/(d2-d6);qx=a[0]+t*acx;qy=a[1]+t*acy;qz=a[2]+t*acz;}
          else{
            const va=d3*d6-d5*d4;
            if(va<=0&&d4-d3>=0&&d5-d6>=0){const t=(d4-d3)/((d4-d3)+(d5-d6));qx=b[0]+t*(c[0]-b[0]);qy=b[1]+t*(c[1]-b[1]);qz=b[2]+t*(c[2]-b[2]);}
            else{const den=1/(va+vb+vc),v=vb*den,w=vc*den;qx=a[0]+abx*v+acx*w;qy=a[1]+aby*v+acy*w;qz=a[2]+abz*v+acz*w;}
          }
        }
      }
    }
  }
  return (p[0]-qx)**2+(p[1]-qy)**2+(p[2]-qz)**2;
}

export function rasterizeFaceNodes({triangles,occupied,nx,ny,nz,spacing,bounds}){
  if(!triangles?.length||triangles.length%9)throw new Error('Selecciona una cara geométrica válida.');
  const counts=[nx,ny,nz],stride=(nx+1)*(ny+1),mask=new Uint8Array((nx+1)*(ny+1)*(nz+1));
  const tolerance=.5*Math.hypot(...spacing),limit=tolerance*tolerance;
  const active=(x,y,z)=>{
    for(let dz=-1;dz<=0;dz++)for(let dy=-1;dy<=0;dy++)for(let dx=-1;dx<=0;dx++){
      const i=x+dx,j=y+dy,k=z+dz;
      if(i>=0&&i<nx&&j>=0&&j<ny&&k>=0&&k<nz&&occupied[k*nx*ny+j*nx+i])return true;
    }
    return false;
  };
  for(let t=0;t<triangles.length;t+=9){
    const a=Array.from(triangles.slice(t,t+3)),b=Array.from(triangles.slice(t+3,t+6)),c=Array.from(triangles.slice(t+6,t+9));
    const lo=[0,1,2].map(d=>Math.max(0,Math.ceil((Math.min(a[d],b[d],c[d])-tolerance-bounds.min[d])/spacing[d])));
    const hi=[0,1,2].map(d=>Math.min(counts[d],Math.floor((Math.max(a[d],b[d],c[d])+tolerance-bounds.min[d])/spacing[d])));
    for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
      const id=z*stride+y*(nx+1)+x;
      if(mask[id]||!active(x,y,z))continue;
      const p=[bounds.min[0]+x*spacing[0],bounds.min[1]+y*spacing[1],bounds.min[2]+z*spacing[2]];
      if(pointTriangleDistance2(p,a,b,c)<=limit)mask[id]=1;
    }
  }
  return mask;
}

export function extractFaceTriangles(positions,triangleIds){
  const selected=new Float32Array(triangleIds.length*9);
  for(let i=0;i<triangleIds.length;i++)selected.set(positions.subarray(triangleIds[i]*9,triangleIds[i]*9+9),i*9);
  return selected;
}

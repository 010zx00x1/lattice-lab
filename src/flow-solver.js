// Dimensionless pressure-potential network through connected empty voxels.
// Conductance is face area / center distance. It measures access/connectivity,
// not a physical flow rate or a Navier–Stokes solution.
function throughComponents(mask,nx,ny,nz,axis,low,high){
  const stride=nx*ny,seen=new Uint8Array(mask.length),through=new Uint8Array(mask.length);
  let connected=0;
  for(let start=0;start<mask.length;start++){
    if(!mask[start]||seen[start])continue;
    const list=[start];seen[start]=1;let atInlet=false,atOutlet=false;
    for(let head=0;head<list.length;head++){
      const id=list[head],x=id%nx,y=Math.floor(id/nx)%ny,z=Math.floor(id/stride);
      const at=[x,y,z][axis];if(at===low)atInlet=true;if(at===high)atOutlet=true;
      for(const next of [x?id-1:-1,x<nx-1?id+1:-1,y?id-nx:-1,y<ny-1?id+nx:-1,z?id-stride:-1,z<nz-1?id+stride:-1]){
        if(next>=0&&mask[next]&&!seen[next]){seen[next]=1;list.push(next);}
      }
    }
    if(atInlet&&atOutlet){for(const id of list)through[id]=1;connected+=list.length;}
  }
  return {through,connected};
}
function pressureSolve(mask,nx,ny,nz,spacing,axis,low,high){
  const n=mask.length,stride=nx*ny,edgeG=[0,1,2].map(a=>spacing[(a+1)%3]*spacing[(a+2)%3]/spacing[a]);
  const boundary=new Uint8Array(n),diag=new Float64Array(n),rhs=new Float64Array(n),edges=[];
  for(let id=0;id<n;id++)if(mask[id]){
    const at=[id%nx,Math.floor(id/nx)%ny,Math.floor(id/stride)][axis];
    if(at===low)boundary[id]=1;else if(at===high)boundary[id]=2;
  }
  for(let id=0;id<n;id++)if(mask[id]){
    const x=id%nx,y=Math.floor(id/nx)%ny,z=Math.floor(id/stride);
    for(const [a,next,valid] of [[0,id+1,x<nx-1],[1,id+nx,y<ny-1],[2,id+stride,z<nz-1]]){
      if(!valid||!mask[next])continue;
      const g=edgeG[a];edges.push([id,next,g]);diag[id]+=g;diag[next]+=g;
      if(boundary[id]===1&&!boundary[next])rhs[next]+=g;
      if(boundary[next]===1&&!boundary[id])rhs[id]+=g;
    }
  }
  for(let i=0;i<n;i++)if(boundary[i]||!mask[i])diag[i]=1;
  const product=(x,out)=>{
    out.fill(0);
    for(const [a,b,g] of edges){
      const delta=g*((boundary[a]?0:x[a])-(boundary[b]?0:x[b]));
      out[a]+=delta;out[b]-=delta;
    }
    for(let i=0;i<n;i++)if(boundary[i]||!mask[i])out[i]=x[i];
  };
  const x=new Float64Array(n),r=rhs.slice(),z=new Float64Array(n),p=new Float64Array(n),Ap=new Float64Array(n);
  let rz=0,base=0;for(let i=0;i<n;i++){z[i]=r[i]/diag[i];p[i]=z[i];rz+=r[i]*z[i];base+=rhs[i]*rhs[i];}
  base=Math.sqrt(base);let residual=base?1:0,iterations=0;
  for(;base&&iterations<700;iterations++){
    product(p,Ap);let pAp=0;for(let i=0;i<n;i++)pAp+=p[i]*Ap[i];
    if(!(pAp>0)||!Number.isFinite(pAp))throw new Error('La red de canales es inestable en esta resolución.');
    const alpha=rz/pAp;let norm=0;
    for(let i=0;i<n;i++){x[i]+=alpha*p[i];r[i]-=alpha*Ap[i];norm+=r[i]*r[i];}
    residual=Math.sqrt(norm)/base;if(residual<1e-7){iterations++;break;}
    let next=0;for(let i=0;i<n;i++){z[i]=r[i]/diag[i];next+=r[i]*z[i];}
    const beta=next/rz;for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];rz=next;
  }
  if(residual>.002||!Number.isFinite(residual))throw new Error('La presión no convergió; prueba otra resolución o geometría.');
  const pressure=new Float32Array(n);
  for(let i=0;i<n;i++)if(mask[i])pressure[i]=boundary[i]===1?1:boundary[i]===2?0:x[i];
  let flux=0;
  for(const [a,b,g] of edges){
    if(boundary[a]===1&&boundary[b]!==1)flux+=g*(1-pressure[b]);
    else if(boundary[b]===1&&boundary[a]!==1)flux+=g*(1-pressure[a]);
  }
  return {pressure,flux,iterations,residual};
}
export function solveFlow({solid,body,nx,ny,nz,spacing,axis=0}){
  const n=nx*ny*nz;
  if(solid.length!==n||body.length!==n||![0,1,2].includes(axis)||!spacing.every(h=>Number.isFinite(h)&&h>0))throw new Error('Geometría de flujo no válida.');
  let low=Infinity,high=-Infinity,bodyVoxels=0,fluidVoxels=0;
  const fluid=new Uint8Array(n),stride=nx*ny;
  for(let id=0;id<n;id++)if(body[id]){
    bodyVoxels++;const at=[id%nx,Math.floor(id/nx)%ny,Math.floor(id/stride)][axis];low=Math.min(low,at);high=Math.max(high,at);
    if(!solid[id]){fluid[id]=1;fluidVoxels++;}
  }
  if(!bodyVoxels||high-low<2)throw new Error('La pieza es demasiado pequeña para estimar el paso de fluido.');
  const bare=throughComponents(body,nx,ny,nz,axis,low,high);
  const baseline=pressureSolve(bare.through,nx,ny,nz,spacing,axis,low,high);
  if(!(baseline.flux>0))throw new Error('La pieza original no tiene paso entre las caras elegidas.');
  const found=throughComponents(fluid,nx,ny,nz,axis,low,high);
  const result=found.connected?pressureSolve(found.through,nx,ny,nz,spacing,axis,low,high):{pressure:new Float32Array(n),flux:0,iterations:0,residual:0};
  return {type:'flow',pressure:result.pressure,occupancy:found.through,nx,ny,nz,spacing,bodyVoxels,fluidVoxels,throughVoxels:found.connected,connectedFraction:fluidVoxels?found.connected/fluidVoxels:0,relativeConductance:Math.min(1,Math.max(0,result.flux/baseline.flux)),fluxIndex:result.flux,baselineFlux:baseline.flux,iterations:result.iterations,residual:result.residual,axis};
}

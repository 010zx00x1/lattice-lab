import {keepLargestComponent} from './elastic-solver.js';

// Cell-centered finite-volume conduction. Coordinates are mm, k is W/(m·K),
// and power is W. The minimum-axis face is held at ambient temperature.
export function solveThermal({occupied,nx,ny,nz,spacing,conductivity,power,ambient=20,axis=0,maxIterations=500,tolerance=1e-7}){
  if(![nx,ny,nz].every(n=>Number.isInteger(n)&&n>=2)||occupied.length!==nx*ny*nz)throw new Error('Vóxeles no válidos.');
  if(!spacing.every(h=>Number.isFinite(h)&&h>0)||!Number.isFinite(conductivity)||conductivity<=0||!Number.isFinite(power)||power<=0||!Number.isFinite(ambient))throw new Error('Parámetros térmicos no válidos.');
  if(![0,1,2].includes(axis))throw new Error('Eje no válido.');
  const largest=keepLargestComponent(occupied,nx,ny,nz);occupied=largest.occupied;
  if(largest.count<3)throw new Error('La resolución no conserva suficiente material conectado para simular.');
  const n=occupied.length,stride=nx*ny,dims=[nx,ny,nz],coord=(id)=>[id%nx,Math.floor(id/nx)%ny,Math.floor(id/stride)];
  let low=Infinity,high=-Infinity;
  for(let id=0;id<n;id++)if(occupied[id]){const at=coord(id)[axis];low=Math.min(low,at);high=Math.max(high,at);}
  if(high-low<1)throw new Error('La pieza es demasiado corta en el eje térmico para esta resolución.');
  const fixed=new Uint8Array(n),rhs=new Float64Array(n),hot=[];
  for(let id=0;id<n;id++)if(occupied[id]){
    const at=coord(id)[axis];if(at===low)fixed[id]=1;
    if(at===high)hot.push(id);
  }
  for(const id of hot)rhs[id]=power/hot.length;
  const k=conductivity/1000; // W/(m·K) → W/(mm·K)
  const conductance=[0,1,2].map(a=>k*spacing[(a+1)%3]*spacing[(a+2)%3]/spacing[a]);
  const edges=[],diag=new Float64Array(n);
  for(let id=0;id<n;id++)if(occupied[id]){
    const [x,y,z]=coord(id);
    for(const [a,next,valid] of [[0,id+1,x<nx-1],[1,id+nx,y<ny-1],[2,id+stride,z<nz-1]]){
      if(!valid||!occupied[next])continue;
      const g=conductance[a];edges.push([id,next,g]);diag[id]+=g;diag[next]+=g;
    }
  }
  for(let id=0;id<n;id++)if(fixed[id]||!occupied[id])diag[id]=1;
  const product=(x,out)=>{
    out.fill(0);
    for(const [a,b,g] of edges){
      const delta=g*((fixed[a]?0:x[a])-(fixed[b]?0:x[b]));
      out[a]+=delta;out[b]-=delta;
    }
    for(let id=0;id<n;id++)if(fixed[id]||!occupied[id])out[id]=x[id];
  };
  const theta=new Float64Array(n),r=rhs.slice(),z=new Float64Array(n),p=new Float64Array(n),Ap=new Float64Array(n);
  let rz=0,base=0;
  for(let i=0;i<n;i++){z[i]=r[i]/diag[i];p[i]=z[i];rz+=r[i]*z[i];base+=rhs[i]*rhs[i];}
  base=Math.sqrt(base);let residual=1,iterations=0;
  for(;iterations<maxIterations;iterations++){
    product(p,Ap);let pAp=0;for(let i=0;i<n;i++)pAp+=p[i]*Ap[i];
    if(!(pAp>0)||!Number.isFinite(pAp))throw new Error('El modelo térmico quedó inestable en esta resolución.');
    const alpha=rz/pAp;let norm2=0;
    for(let i=0;i<n;i++){theta[i]+=alpha*p[i];r[i]-=alpha*Ap[i];norm2+=r[i]*r[i];}
    residual=Math.sqrt(norm2)/base;if(residual<tolerance){iterations++;break;}
    let next=0;for(let i=0;i<n;i++){z[i]=r[i]/diag[i];next+=r[i]*z[i];}
    const beta=next/rz;for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];rz=next;
  }
  if(!Number.isFinite(residual)||residual>.001)throw new Error('El cálculo térmico no convergió.');
  let flow=0;
  for(const [a,b,g] of edges){
    if(fixed[a]&&!fixed[b])flow+=g*theta[b];
    else if(fixed[b]&&!fixed[a])flow+=g*theta[a];
  }
  const heatBalanceError=Math.abs(flow-power)/power;
  if(heatBalanceError>.01)throw new Error('El balance de calor no cerró; revisa la resolución.');
  const temperatureRise=new Float32Array(n);
  let maxRise=0,meanHotRise=0;
  for(let id=0;id<n;id++)if(occupied[id]){temperatureRise[id]=theta[id];maxRise=Math.max(maxRise,theta[id]);}
  for(const id of hot)meanHotRise+=theta[id]/hot.length;
  return {type:'thermal',temperatureRise,occupancy:occupied,nx,ny,nz,spacing,voxels:largest.count,discardedVoxels:largest.discarded,maxTemperature:ambient+maxRise,maxRise,meanHotRise,ambient,heatFlow:flow,heatBalanceError,iterations,residual,axis,length:(high-low)*spacing[axis]};
}

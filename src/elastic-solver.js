// Small-strain, isotropic linear elasticity on occupied 8-node voxel bricks.
// Length: mm; Young's modulus and stress: MPa (N/mm²); force: N.
import {distributeMoment} from './load-distribution.js';
const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const gauss=1/Math.sqrt(3);

function makeB(xi,eta,zeta,h){
  const B=Array.from({length:6},()=>new Float64Array(24));
  for(let a=0;a<8;a++){
    const [cx,cy,cz]=corners[a];
    const sx=cx?1:-1,sy=cy?1:-1,sz=cz?1:-1;
    const dx=sx*(1+sy*eta)*(1+sz*zeta)/(4*h[0]);
    const dy=sy*(1+sx*xi)*(1+sz*zeta)/(4*h[1]);
    const dz=sz*(1+sx*xi)*(1+sy*eta)/(4*h[2]);
    const p=a*3;
    B[0][p]=dx; B[1][p+1]=dy; B[2][p+2]=dz;
    B[3][p]=dy; B[3][p+1]=dx;
    B[4][p+1]=dz; B[4][p+2]=dy;
    B[5][p]=dz; B[5][p+2]=dx;
  }
  return B;
}
function constitutive(E,nu){
  const lambda=E*nu/((1+nu)*(1-2*nu)),mu=E/(2*(1+nu));
  const C=Array.from({length:6},()=>new Float64Array(6));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)C[i][j]=i===j?lambda+2*mu:lambda;
  for(let i=3;i<6;i++)C[i][i]=mu;
  return C;
}
function elementStiffness(h,C){
  const K=new Float64Array(24*24),volume=h[0]*h[1]*h[2];
  for(const xi of [-gauss,gauss])for(const eta of [-gauss,gauss])for(const zeta of [-gauss,gauss]){
    const B=makeB(xi,eta,zeta,h),CB=Array.from({length:6},()=>new Float64Array(24));
    for(let i=0;i<6;i++)for(let j=0;j<6;j++)if(C[i][j])for(let p=0;p<24;p++)CB[i][p]+=C[i][j]*B[j][p];
    for(let p=0;p<24;p++)for(let q=0;q<24;q++){
      let sum=0;for(let i=0;i<6;i++)sum+=B[i][p]*CB[i][q];
      K[p*24+q]+=sum*volume/8;
    }
  }
  return K;
}
export function keepLargestComponent(occupied,nx,ny,nz){
  const count=nx*ny*nz,seen=new Uint8Array(count),stride=nx*ny;
  let best=[];
  for(let start=0;start<count;start++){
    if(!occupied[start]||seen[start])continue;
    const list=[start];seen[start]=1;
    for(let head=0;head<list.length;head++){
      const id=list[head],x=id%nx,y=Math.floor(id/nx)%ny,z=Math.floor(id/stride);
      for(const next of [x? id-1:-1,x<nx-1?id+1:-1,y?id-nx:-1,y<ny-1?id+nx:-1,z?id-stride:-1,z<nz-1?id+stride:-1]){
        if(next>=0&&occupied[next]&&!seen[next]){seen[next]=1;list.push(next);}
      }
    }
    if(list.length>best.length)best=list;
  }
  const clean=new Uint8Array(count);for(const id of best)clean[id]=1;
  return {occupied:clean,count:best.length,discarded:occupied.reduce((n,v)=>n+v,0)-best.length};
}
export function solveElastic({occupied,nx,ny,nz,spacing,E,nu=0.3,force=0,moment=0,loadType='force',axis=0,boundary=null,maxIterations=900,tolerance=1e-5}){
  if(!Number.isFinite(E)||E<=0||!['force','moment'].includes(loadType)||loadType==='force'&&(!Number.isFinite(force)||force<=0)||loadType==='moment'&&(!Number.isFinite(moment)||moment<=0)||nu<0||nu>=.49)throw new Error('Material o carga no válidos.');
  if(![nx,ny,nz].every(n=>Number.isInteger(n)&&n>=2)||occupied.length!==nx*ny*nz)throw new Error('Vóxeles no válidos.');
  if(!spacing.every(h=>Number.isFinite(h)&&h>0))throw new Error('Escala no válida.');
  const largest=keepLargestComponent(occupied,nx,ny,nz);occupied=largest.occupied;
  if(largest.count<3)throw new Error('La resolución no conserva suficiente material conectado para simular.');
  const dims=[nx,ny,nz],nodeX=nx+1,nodeY=ny+1,nodeStride=nodeX*nodeY,nNodes=nodeStride*(nz+1),dofs=nNodes*3;
  const node=(x,y,z)=>z*nodeStride+y*nodeX+x;
  const elements=[];const active=new Uint8Array(nNodes);
  let low=Infinity,high=-Infinity;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    if(!occupied[z*nx*ny+y*nx+x])continue;
    const index=[x,y,z][axis];low=Math.min(low,index);high=Math.max(high,index+1);
    const ids=corners.map(([dx,dy,dz])=>node(x+dx,y+dy,z+dz));
    for(const id of ids)active[id]=1;
    elements.push({x,y,z,ids});
  }
  if(high-low<2)throw new Error('La pieza es demasiado corta en el eje de carga para esta resolución.');
  const fixed=new Uint8Array(dofs),rhs=new Float64Array(dofs),loadNodes=[];
  const direction=boundary?.direction||[0,1,2].map(d=>d===axis?1:0);
  if(boundary&&(!boundary.support||!boundary.load||boundary.support.length!==nNodes||boundary.load.length!==nNodes||direction.length!==3||!direction.every(Number.isFinite)||Math.abs(Math.hypot(...direction)-1)>1e-5))throw new Error('Condiciones de caras inválidas.');
  let supportCount=0;
  for(let z=0;z<=nz;z++)for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
    const id=node(x,y,z);if(!active[id])continue;
    const at=[x,y,z][axis];
    if(boundary?boundary.support[id]:at===low){for(let d=0;d<3;d++)fixed[id*3+d]=1;supportCount++;}
    if(boundary?boundary.load[id]:at===high)loadNodes.push(id);
  }
  if(!supportCount||!loadNodes.length)throw new Error('No se encontraron caras de apoyo y carga.');
  if(loadNodes.some(id=>fixed[id*3]))throw new Error('Las caras de apoyo y carga se solapan a esta resolución.');
  if(loadType==='moment'){
    const points=loadNodes.map(id=>[id%nodeX,Math.floor(id/nodeX)%nodeY,Math.floor(id/nodeStride)].map((value,d)=>value*spacing[d]));
    const forces=distributeMoment(points,direction,moment);
    for(let i=0;i<loadNodes.length;i++)for(let d=0;d<3;d++)rhs[loadNodes[i]*3+d]=forces[i][d];
  }else for(const id of loadNodes)for(let d=0;d<3;d++)rhs[id*3+d]=force*direction[d]/loadNodes.length;
  const C=constitutive(E,nu),K=elementStiffness(spacing,C),diag=new Float64Array(dofs),map=[];
  for(const el of elements){
    const ids=new Int32Array(24);for(let a=0;a<8;a++)for(let d=0;d<3;d++)ids[a*3+d]=el.ids[a]*3+d;
    map.push(ids);for(let p=0;p<24;p++)diag[ids[p]]+=K[p*24+p];
  }
  for(let i=0;i<dofs;i++)if(fixed[i]||!active[Math.floor(i/3)])diag[i]=1;
  const product=(v,out)=>{
    out.fill(0);
    const local=new Float64Array(24);
    for(const ids of map){
      for(let p=0;p<24;p++)local[p]=fixed[ids[p]]?0:v[ids[p]];
      for(let p=0;p<24;p++){
        let sum=0,offset=p*24;for(let q=0;q<24;q++)sum+=K[offset+q]*local[q];
        out[ids[p]]+=sum;
      }
    }
    for(let i=0;i<dofs;i++)if(fixed[i]||!active[Math.floor(i/3)])out[i]=v[i];
  };
  const u=new Float64Array(dofs),r=rhs.slice(),z=new Float64Array(dofs),p=new Float64Array(dofs),Ap=new Float64Array(dofs);
  let rz=0,base=0;for(let i=0;i<dofs;i++){z[i]=r[i]/diag[i];p[i]=z[i];rz+=r[i]*z[i];base+=rhs[i]*rhs[i];}
  base=Math.sqrt(base);let residual=1,iterations=0;
  for(;iterations<maxIterations;iterations++){
    product(p,Ap);let pAp=0;for(let i=0;i<dofs;i++)pAp+=p[i]*Ap[i];
    if(!(pAp>0)||!Number.isFinite(pAp))throw new Error('El modelo quedó inestable en esta resolución.');
    const alpha=rz/pAp;let norm2=0;
    for(let i=0;i<dofs;i++){u[i]+=alpha*p[i];r[i]-=alpha*Ap[i];norm2+=r[i]*r[i];}
    residual=Math.sqrt(norm2)/base;if(residual<tolerance){iterations++;break;}
    let next=0;for(let i=0;i<dofs;i++){z[i]=r[i]/diag[i];next+=r[i]*z[i];}
    const beta=next/rz;for(let i=0;i<dofs;i++)p[i]=z[i]+beta*p[i];rz=next;
  }
  if(!Number.isFinite(residual)||residual>1e-4)throw new Error('El cálculo no convergió; prueba una pieza más simple.');
  let maxDisplacement=0,meanLoaded=0;
  for(let id=0;id<nNodes;id++)if(active[id])maxDisplacement=Math.max(maxDisplacement,Math.hypot(u[id*3],u[id*3+1],u[id*3+2]));
  for(const id of loadNodes)for(let d=0;d<3;d++)meanLoaded+=u[id*3+d]*direction[d]/loadNodes.length;
  const B=makeB(0,0,0,spacing),stress=new Float32Array(occupied.length),values=[];
  for(let e=0;e<elements.length;e++){
    const ids=map[e],strain=new Float64Array(6),sigma=new Float64Array(6);
    for(let i=0;i<6;i++)for(let p=0;p<24;p++)strain[i]+=B[i][p]*u[ids[p]];
    for(let i=0;i<6;i++)for(let j=0;j<6;j++)sigma[i]+=C[i][j]*strain[j];
    const vm=Math.sqrt(Math.max(0,((sigma[0]-sigma[1])**2+(sigma[1]-sigma[2])**2+(sigma[2]-sigma[0])**2)/2+3*(sigma[3]**2+sigma[4]**2+sigma[5]**2)));
    const el=elements[e];stress[el.z*nx*ny+el.y*nx+el.x]=vm;values.push(vm);
  }
  values.sort((a,b)=>a-b);
  return {stress,occupancy:occupied,nx,ny,nz,spacing,voxels:largest.count,discardedVoxels:largest.discarded,maxDisplacement,meanLoadedDisplacement:meanLoaded,stress95:values[Math.floor((values.length-1)*.95)],stressMax:values.at(-1),iterations,residual,supportCount,loadCount:loadNodes.length,axis,length:(high-low)*spacing[axis],faceBoundary:!!boundary};
}

import {voxelizeMesh} from './voxelize.js';
import {latticeField} from './tpms.js';
import {keepLargestComponent,solveElastic} from './elastic-solver.js';

function sampleCandidate(body,bounds,dims,spacing,pattern,cell,wall,form){
  const [nx,ny,nz]=dims,occupied=new Uint8Array(body.length);
  let solids=0;
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const id=k*nx*ny+j*nx+i;if(!body[id])continue;
    let votes=0;
    for(const oz of [.25,.75])for(const oy of [.25,.75])for(const ox of [.25,.75]){
      const x=bounds.min[0]+(i+ox)*spacing[0],y=bounds.min[1]+(j+oy)*spacing[1],z=bounds.min[2]+(k+oz)*spacing[2];
      if(latticeField(x,y,z,pattern,cell,wall,0,form)>0)votes++;
    }
    if(votes>=5){occupied[id]=1;solids++;}
  }
  return {occupied,solids};
}

export function optimizeLattice({sourcePositions,bounds,pattern,cells,walls,E,force,axis,target,form='sheet',onProgress=()=>{}}){
  if(!Number.isFinite(E)||E<=0||!Number.isFinite(force)||force<=0||!Number.isFinite(target)||target<=0||![0,1,2].includes(axis))throw new Error('Objetivo estructural no válido.');
  const size=bounds.max.map((v,i)=>v-bounds.min[i]),max=Math.max(...size);
  const dims=size.map(v=>Math.max(3,Math.round(20*v/max)));
  onProgress(1);
  const {occupied:body,spacing}=voxelizeMesh(sourcePositions,bounds,dims,{threshold:4,onProgress:p=>onProgress(Math.round(1+p*15))});
  const bodyCount=body.reduce((n,v)=>n+v,0);
  if(bodyCount<20)throw new Error('La pieza ocupa muy pocos vóxeles para optimizar.');
  const uniqueCells=[...new Set(cells.map(Number))].filter(v=>Number.isFinite(v)&&v>0);
  const uniqueWalls=[...new Set(walls.map(Number))].filter(v=>Number.isFinite(v)&&v>=.12&&v<=.48);
  if(!uniqueCells.length||!uniqueWalls.length)throw new Error('No hay parámetros de búsqueda válidos.');
  const candidates=[];
  for(const cell of uniqueCells)for(const wall of uniqueWalls){
    const sample=sampleCandidate(body,bounds,dims,spacing,pattern,cell,wall,form);
    candidates.push({...sample,cell,wall,materialFraction:sample.solids/bodyCount});
    onProgress(16+Math.round(candidates.length/(uniqueCells.length*uniqueWalls.length)*20));
  }
  candidates.sort((a,b)=>a.materialFraction-b.materialFraction||a.cell-b.cell);
  let bestFallback=null,evaluated=0,rejected=0;
  for(const candidate of candidates){
    evaluated++;
    if(candidate.solids<5){rejected++;continue;}
    const largest=keepLargestComponent(candidate.occupied,...dims);
    if(largest.count/candidate.solids<.85){rejected++;continue;}
    try{
      const result=solveElastic({occupied:candidate.occupied,nx:dims[0],ny:dims[1],nz:dims[2],spacing,E,force,axis,maxIterations:650,tolerance:1e-4});
      const summary={cell:candidate.cell,wall:candidate.wall,reduction:1-candidate.materialFraction,displacement:result.maxDisplacement,stress95:result.stress95,residual:result.residual,discardedVoxels:result.discardedVoxels};
      if(!bestFallback||summary.displacement<bestFallback.displacement)bestFallback=summary;
      if(summary.displacement<=target){onProgress(100);return {...summary,feasible:true,target,evaluated,totalCandidates:candidates.length,rejected,grid:dims};}
    }catch{rejected++;}
    onProgress(36+Math.round(evaluated/candidates.length*62));
  }
  if(!bestFallback)throw new Error('Ninguna combinación produjo un modelo estructural conectado y convergente.');
  onProgress(100);
  return {...bestFallback,feasible:false,target,evaluated,totalCandidates:candidates.length,rejected,grid:dims};
}

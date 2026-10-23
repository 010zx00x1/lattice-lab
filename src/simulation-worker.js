import {voxelizeMesh} from './voxelize.js';
import {solveElastic} from './elastic-solver.js';
import {solveThermal} from './thermal-solver.js';
import {solveFlow} from './flow-solver.js';
import {rasterizeFaceNodes} from './face-boundary.js';

self.onmessage=({data})=>{
  try{
    const {positions,bounds,mode,axis}=data;
    const size=bounds.max.map((v,i)=>v-bounds.min[i]),max=Math.max(...size);
    const dims=size.map(v=>Math.max(3,Math.round(20*v/max)));
    const sample=voxelizeMesh(positions,bounds,dims,{threshold:5,onProgress:p=>self.postMessage({type:'progress',value:Math.round(p*(mode==='flow'?38:55))})});
    let result;
    if(mode==='flow'){
      self.postMessage({type:'progress',value:40});
      const body=voxelizeMesh(data.sourcePositions,bounds,dims,{threshold:4,onProgress:p=>self.postMessage({type:'progress',value:40+Math.round(p*30)})});
      self.postMessage({type:'progress',value:72});
      result=solveFlow({solid:sample.occupied,body:body.occupied,nx:sample.nx,ny:sample.ny,nz:sample.nz,spacing:sample.spacing,axis});
    }else if(mode==='thermal'){
      self.postMessage({type:'progress',value:60});
      result=solveThermal({...sample,conductivity:data.conductivity,power:data.power,ambient:data.ambient,axis});
    }else{
      self.postMessage({type:'progress',value:60});
      let boundary=null;
      if(data.faceBoundary){
        const args={...sample,bounds};
        boundary={
          support:rasterizeFaceNodes({...args,triangles:data.faceBoundary.support}),
          load:rasterizeFaceNodes({...args,triangles:data.faceBoundary.load}),
          direction:data.faceBoundary.direction
        };
      }
      result=solveElastic({...sample,E:data.E,nu:data.nu,force:data.force,moment:data.moment,loadType:data.loadType,axis,boundary});
    }
    const field=mode==='flow'?result.pressure:mode==='thermal'?result.temperatureRise:result.stress;
    self.postMessage({type:'done',result},[field.buffer,result.occupancy.buffer]);
  }catch(error){self.postMessage({type:'error',message:String(error.message||error)});}
};

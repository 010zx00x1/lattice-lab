export function sampleStress(stress,dims,bounds,x,y,z){
  const [nx,ny,nz]=dims;
  if(stress.length!==nx*ny*nz)throw new Error('Campo de esfuerzos incompatible.');
  const point=[x,y,z],lower=[],upper=[],blend=[];
  for(let axis=0;axis<3;axis++){
    const span=bounds.max[axis]-bounds.min[axis];
    const at=Math.max(0,Math.min(dims[axis]-1,(point[axis]-bounds.min[axis])/span*dims[axis]-.5));
    lower[axis]=Math.floor(at);upper[axis]=Math.min(dims[axis]-1,lower[axis]+1);blend[axis]=at-lower[axis];
  }
  let value=0;
  for(let dz=0;dz<=1;dz++)for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){
    const ix=dx?upper[0]:lower[0],iy=dy?upper[1]:lower[1],iz=dz?upper[2]:lower[2];
    const weight=(dx?blend[0]:1-blend[0])*(dy?blend[1]:1-blend[1])*(dz?blend[2]:1-blend[2]);
    value+=weight*stress[iz*nx*ny+iy*nx+ix];
  }
  return Math.max(0,value);
}

export function gradedWall(grade,x,y,z){
  const {stress,dims,bounds,stress95,minWall,maxWall}=grade;
  if(!Number.isFinite(stress95)||stress95<=0||!Number.isFinite(minWall)||!Number.isFinite(maxWall)||minWall<0||maxWall<minWall)throw new Error('Gradación no válida.');
  const relative=Math.min(1,sampleStress(stress,dims,bounds,x,y,z)/stress95);
  return minWall+(maxWall-minWall)*Math.sqrt(relative);
}

export function gradedCell(grade,x,y,z){
  const {stress,dims,bounds,stress95,minCell,maxCell}=grade;
  if(!Number.isFinite(stress95)||stress95<=0||!Number.isFinite(minCell)||!Number.isFinite(maxCell)||minCell<=0||maxCell<minCell)throw new Error('Gradación de celda no válida.');
  const relative=Math.min(1,sampleStress(stress,dims,bounds,x,y,z)/stress95);
  return maxCell-(maxCell-minCell)*Math.sqrt(relative);
}

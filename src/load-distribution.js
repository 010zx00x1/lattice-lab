// A force couple on a node patch with zero resultant force and a prescribed
// torque component about the chosen unit axis. Units: positions mm, moment Nmm.
export function distributeMoment(nodePoints,axis,momentNmm){
  if(!Array.isArray(nodePoints)||nodePoints.length<2||!nodePoints.every(point=>Array.isArray(point)&&point.length===3&&point.every(Number.isFinite))||!Array.isArray(axis)||axis.length!==3||!axis.every(Number.isFinite)||Math.abs(Math.hypot(...axis)-1)>1e-6||!Number.isFinite(momentNmm)||momentNmm<=0)throw new Error('Momento o parche de carga no válido.');
  const center=[0,1,2].map(d=>nodePoints.reduce((sum,p)=>sum+p[d],0)/nodePoints.length);
  const vectors=nodePoints.map(point=>{
    const x=point[0]-center[0],y=point[1]-center[1],z=point[2]-center[2];
    return [axis[1]*z-axis[2]*y,axis[2]*x-axis[0]*z,axis[0]*y-axis[1]*x];
  });
  const denominator=vectors.reduce((sum,v)=>sum+v[0]**2+v[1]**2+v[2]**2,0);
  if(denominator<1e-9)throw new Error('La cara cargada es demasiado pequeña para aplicar un momento.');
  return vectors.map(v=>v.map(component=>component*momentNmm/denominator));
}

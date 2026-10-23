export function normalizeWallZones(value){
  if(value==null)return [];
  if(!Array.isArray(value)||value.length>8)throw new Error('Se admiten hasta ocho zonas locales.');
  return value.map((zone,index)=>{
    if(!zone||!['sphere','box'].includes(zone.type)||!Array.isArray(zone.center)||zone.center.length!==3||!zone.center.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)||!Number.isFinite(zone.size)||zone.size<=0||zone.size>100000||!Number.isFinite(zone.wall)||zone.wall<.12||zone.wall>.48||!Number.isFinite(zone.blend)||zone.blend<0||zone.blend>10000)throw new Error(`Zona local ${index+1} no válida.`);
    return {type:zone.type,center:zone.center.slice(),size:zone.size,wall:zone.wall,blend:zone.blend};
  });
}

export function wallAtZones(x,y,z,base,zones){
  let result=base;
  for(const zone of zones){
    const [cx,cy,cz]=zone.center;
    let signed;
    if(zone.type==='sphere')signed=zone.size-Math.hypot(x-cx,y-cy,z-cz);
    else{
      const qx=Math.abs(x-cx)-zone.size/2,qy=Math.abs(y-cy)-zone.size/2,qz=Math.abs(z-cz)-zone.size/2;
      signed=-(Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0));
    }
    const t=zone.blend>0?Math.max(0,Math.min(1,(signed+zone.blend/2)/zone.blend)):+(signed>=0);
    const smooth=t*t*(3-2*t);
    result+=(zone.wall-result)*smooth;
  }
  return result;
}

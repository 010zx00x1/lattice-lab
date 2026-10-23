// Illustrative, isotropic bulk values. Printed parts require measured properties.
export const MATERIALS={
  prusament_pla:{name:'Prusament PLA',density:1.24,E:2.3,conductivity:.13,thermalEstimated:true,yield:51,source:'https://prusament.com/wp-content/uploads/2022/10/PLA_Prusament_TDS_2021_10_EN.pdf',sourceLabel:'Ficha Prusament PLA',technology:'fdm'},
  formlabs_nylon12:{name:'Formlabs Nylon 12',density:.99,E:1.9,conductivity:.25,thermalEstimated:true,ultimate:50,source:'https://formlabs.com/eu/materials/tds/nylon-12-powder/',sourceLabel:'Ficha Nylon 12',technology:'sls'},
  pla:{name:'PLA',density:1.24,E:3.6,conductivity:.13},
  petg:{name:'PETG',density:1.27,E:2.0,conductivity:.20},
  abs:{name:'ABS',density:1.04,E:2.1,conductivity:.18},
  aluminum:{name:'Aluminio',density:2.70,E:69,conductivity:205},
  steel:{name:'Acero',density:7.85,E:200,conductivity:45},
};

export const MACHINES={
  prusa_mk4s:{name:'Original Prusa MK4S',technology:'fdm',volume:[250,210,220],source:'https://www.prusa3d.com/product/original-prusa-mk4s-3d-printer-kit/'},
  formlabs_fuse1plus:{name:'Formlabs Fuse 1+ 30W',technology:'sls',volume:[165,165,300],source:'https://formlabs.com/3d-printers/fuse-1/tech-specs/'},
  none:{name:'Sin máquina definida',technology:'generic',volume:null,source:null},
};

export function fitsBuildVolume(dims,volume,verticalAxis=2){
  if(!volume)return true;
  if(dims.length!==3||dims.some(v=>!Number.isFinite(v)||v<0)||![0,1,2].includes(verticalAxis))return false;
  const horizontal=dims.filter((_,i)=>i!==verticalAxis),height=dims[verticalAxis];
  return height<=volume[2]+1e-6&&(horizontal[0]<=volume[0]+1e-6&&horizontal[1]<=volume[1]+1e-6||horizontal[1]<=volume[0]+1e-6&&horizontal[0]<=volume[1]+1e-6);
}

export function massGrams(volumeMm3,density){
  if(!Number.isFinite(volumeMm3)||volumeMm3<0||!Number.isFinite(density)||density<=0)throw new Error('Volumen o densidad no válido.');
  return volumeMm3*density/1000;
}

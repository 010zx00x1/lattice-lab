import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {latticeField} from '../src/tpms.js';
import {solveElastic,keepLargestComponent} from '../src/elastic-solver.js';

// A reproducible, coarse cube test in the print-independent X direction.
// These values are design suggestions, not measured material properties.
const patterns=['gyroid','schwarz','diamond','iwp','neovius','fks','frd','fcy','cubic','bcc','fcc','octa','octet'];
const walls=[.20,.28,.36,.44];
const lengths=20,cell=10,E=1000,force=10;
function sample(pattern,form,wall,n){
  const occupied=new Uint8Array(n**3),spacing=lengths/n;
  let solid=0;
  for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let votes=0;
    for(const dz of [.25,.75])for(const dy of [.25,.75])for(const dx of [.25,.75])
      votes+=latticeField((x+dx)*spacing,(y+dy)*spacing,(z+dz)*spacing,pattern,cell,wall,0,form)>0;
    const value=+(votes>=4);occupied[z*n*n+y*n+x]=value;solid+=value;
  }
  const component=keepLargestComponent(occupied,n,n,n);
  if(solid<.05*n**3||component.count/solid<.98)return null;
  try{
    const result=solveElastic({occupied,nx:n,ny:n,nz:n,spacing:[spacing,spacing,spacing],E,force,axis:0,maxIterations:750,tolerance:1e-4});
    const modulus=force*lengths/(lengths*lengths*result.meanLoadedDisplacement);
    return Number.isFinite(modulus)&&modulus>0?{density:solid/n**3,modulus,discarded:component.discarded,iterations:result.iterations}:null;
  }catch{return null;}
}
const entries=[];
for(const pattern of patterns){
  for(const form of ['cubic','bcc','fcc','octa','octet'].includes(pattern)?['beam']:['sheet','network']){
    for(const wall of walls){
      if(pattern==='frd'&&wall<(form==='network'?.34:.30)||pattern==='neovius'&&form==='network'&&wall<.34)continue;
      const coarse=sample(pattern,form,wall,12),fine=sample(pattern,form,wall,16);
      if(!coarse||!fine)continue;
      entries.push({pattern,form,wall,density:+fine.density.toFixed(4),relativeModulus:+(fine.modulus/E).toFixed(4),densityResolutionRange:[+Math.min(coarse.density,fine.density).toFixed(4),+Math.max(coarse.density,fine.density).toFixed(4)],modulusResolutionRange:[+Math.min(coarse.modulus,fine.modulus).toFixed(1),+Math.max(coarse.modulus,fine.modulus).toFixed(1)].map(v=>v/E)});
      process.stdout.write(`${pattern} ${form} ${wall}: ρ=${fine.density.toFixed(3)}, E*/E=${(fine.modulus/E).toFixed(3)}\n`);
    }
  }
}
const output={method:'Cubo propio de 20 mm; celda de 10 mm; carga axial X; rejillas de 12 y 16 vóxeles; ocho muestras por vóxel; E isotrópico de 1000 MPa y ν=0,30; apoyo X− y 10 N en X+.',entries};
const path=fileURLToPath(new URL('../src/library-data.json',import.meta.url));
await writeFile(path,`${JSON.stringify(output,null,2)}\n`);
process.stdout.write(`Wrote ${entries.length} entries to ${path}\n`);

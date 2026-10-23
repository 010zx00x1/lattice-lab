import calibration from './library-data.json' with {type:'json'};

const BEAMS=new Set(['cubic','bcc','fcc','octa','octet']);

export function libraryCandidates({mode,target,materialModulusGPa,minimumThickness=0,cell=10,limit=8}){
  if(!['density','stiffness'].includes(mode)||!Number.isFinite(target)||target<=0||!Number.isFinite(materialModulusGPa)||materialModulusGPa<=0)return [];
  const modulus=materialModulusGPa*1000;
  const entries=calibration.entries.filter(row=>row.density<.95&&(!BEAMS.has(row.pattern)||cell*row.wall*.7>=minimumThickness));
  const measured=entries.map(row=>({
    ...row,
    densityPercent:row.density*100,
    stiffnessMPa:row.relativeModulus*modulus,
    densityRangePercent:row.densityResolutionRange.map(value=>value*100),
    stiffnessRangeMPa:row.modulusResolutionRange.map(value=>value*modulus),
  }));
  const achievable=mode==='stiffness'?measured.filter(row=>row.stiffnessRangeMPa[0]>=target):measured;
  achievable.sort((a,b)=>mode==='density'?
    Math.abs(a.densityPercent-target)-Math.abs(b.densityPercent-target)||b.stiffnessMPa-a.stiffnessMPa:
    a.densityPercent-b.densityPercent||a.stiffnessMPa-b.stiffnessMPa);
  return achievable.slice(0,limit);
}

export {calibration};

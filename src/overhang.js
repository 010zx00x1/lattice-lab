const DIRECTIONS={'+X':[1,0,0],'-X':[-1,0,0],'+Y':[0,1,0],'-Y':[0,-1,0],'+Z':[0,0,1],'-Z':[0,0,-1]};

// Angle of a downward-facing triangle measured from a vertical wall.
// This is a geometric screening metric, not a support or slicer simulation.
export function analyzeOverhang(positions,direction='+Z',maxAngle=45){
  const build=DIRECTIONS[direction];
  if(!build||!Number.isFinite(maxAngle)||maxAngle<0||maxAngle>90)throw new Error('Reglas de voladizo no válidas.');
  if(!positions||positions.length%9)throw new Error('Malla no válida para analizar voladizos.');
  let min=Infinity,max=-Infinity;
  for(let i=0;i<positions.length;i+=3){
    const projection=positions[i]*build[0]+positions[i+1]*build[1]+positions[i+2]*build[2];
    if(!Number.isFinite(projection))throw new Error('La malla contiene coordenadas no válidas.');
    min=Math.min(min,projection);max=Math.max(max,projection);
  }
  const plateTolerance=Math.max(1e-6,(max-min)*1e-5);
  let totalAreaMm2=0,downwardAreaMm2=0,overhangAreaMm2=0,plateAreaMm2=0,overhangTriangles=0;
  for(let i=0;i<positions.length;i+=9){
    const ax=positions[i],ay=positions[i+1],az=positions[i+2];
    const bx=positions[i+3]-ax,by=positions[i+4]-ay,bz=positions[i+5]-az;
    const cx=positions[i+6]-ax,cy=positions[i+7]-ay,cz=positions[i+8]-az;
    const nx=by*cz-bz*cy,ny=bz*cx-bx*cz,nz=bx*cy-by*cx;
    const length=Math.hypot(nx,ny,nz);
    if(length<=1e-12)continue;
    const area=length/2;totalAreaMm2+=area;
    const pa=ax*build[0]+ay*build[1]+az*build[2];
    const pb=(ax+bx)*build[0]+(ay+by)*build[1]+(az+bz)*build[2];
    const pc=(ax+cx)*build[0]+(ay+cy)*build[1]+(az+cz)*build[2];
    if(Math.max(pa,pb,pc)-min<=plateTolerance){plateAreaMm2+=area;continue;}
    const downward=-(nx*build[0]+ny*build[1]+nz*build[2])/length;
    if(downward<=0)continue;
    downwardAreaMm2+=area;
    if(Math.asin(Math.min(1,downward))*180/Math.PI>maxAngle+1e-8){overhangAreaMm2+=area;overhangTriangles++;}
  }
  return {direction,maxAngle,totalAreaMm2,downwardAreaMm2,overhangAreaMm2,plateAreaMm2,overhangTriangles,overhangFraction:totalAreaMm2?overhangAreaMm2/totalAreaMm2:0};
}

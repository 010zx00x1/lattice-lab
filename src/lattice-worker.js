// Independent TPMS mesher. The source shape is sampled together with a
// periodic surface, then their intersection is polygonized with tetrahedra.
import { prepareMesh } from './mesh-quality.js';
import {latticeField} from './tpms.js';
import {distanceToExterior} from './distance-field.js';
import {gradedWall,gradedCell} from './grade.js';
import {distanceToSelectedFaces} from './face-solid-zone.js';
import {skinField,smoothUnion} from './skin-field.js';
import {analyzeMaterialConnectivity} from './material-connectivity.js';
import {conformalCoordinates,equidistantLayerField} from './spatial-layout.js';
import {normalizeWallZones,wallAtZones} from './local-wall-zones.js';
import {faceBoundarySegments,edgeDistanceField} from './rim-field.js';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
const TETRA = [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
const CORNERS = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];

function rowHits(mesh, y, z) {
  const hits = [];
  for (let i = 0; i < mesh.length; i += 9) {
    const x0=mesh[i], y0=mesh[i+1], z0=mesh[i+2];
    const x1=mesh[i+3], y1=mesh[i+4], z1=mesh[i+5];
    const x2=mesh[i+6], y2=mesh[i+7], z2=mesh[i+8];
    const a=y1-y0, b=y2-y0, c=z1-z0, d=z2-z0;
    const det=a*d-b*c;
    if (Math.abs(det)<1e-10) continue;
    const ry=y-y0, rz=z-z0;
    const u=(ry*d-b*rz)/det, v=(a*rz-ry*c)/det;
    // Include shared edges on both triangles, then merge duplicate hits below.
    // Excluding both copies of a diagonal can create false openings in CAD meshes.
    if (u>=-1e-9 && v>=-1e-9 && u+v<=1+1e-9) hits.push(x0+u*(x1-x0)+v*(x2-x0));
  }
  hits.sort((a,b)=>a-b);
  // Adjacent faces can report the same hit on a shared diagonal.
  const unique=[];
  for (const h of hits) if (!unique.length || Math.abs(h-unique[unique.length-1])>1e-5) unique.push(h);
  return unique;
}

function polygonize(pts, vals, out) {
  const inside=[], outside=[];
  for(let k=0;k<4;k++) (vals[k]>0?inside:outside).push(k);
  if(!inside.length||!outside.length) return;
  const edge=(i,j)=>{const a=vals[i], b=vals[j], t=a/(a-b);return [pts[i][0]+t*(pts[j][0]-pts[i][0]),pts[i][1]+t*(pts[j][1]-pts[i][1]),pts[i][2]+t*(pts[j][2]-pts[i][2])];};
  const ic=[0,0,0], oc=[0,0,0];
  for(const i of inside)for(let d=0;d<3;d++)ic[d]+=pts[i][d]/inside.length;
  for(const i of outside)for(let d=0;d<3;d++)oc[d]+=pts[i][d]/outside.length;
  const inward=[ic[0]-oc[0],ic[1]-oc[1],ic[2]-oc[2]];
  const tri=(a,b,c)=>{
    const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const flip=n[0]*inward[0]+n[1]*inward[1]+n[2]*inward[2]>0;
    const p=flip?[a,c,b]:[a,b,c];
    out.push(...p[0],...p[1],...p[2]);
  };
  if(inside.length===1){const a=inside[0];tri(edge(a,outside[0]),edge(a,outside[1]),edge(a,outside[2]));}
  else if(outside.length===1){const a=outside[0];tri(edge(a,inside[0]),edge(a,inside[1]),edge(a,inside[2]));}
  else {const a=edge(inside[0],outside[0]),b=edge(inside[0],outside[1]),c=edge(inside[1],outside[0]),d=edge(inside[1],outside[1]);tri(a,b,c);tri(b,d,c);}
}

self.onmessage=({data})=>{
  try {
    const {kind,bounds,positions,pattern,cell,wall,quality,skin=0,grade=null,cellGrade=null,solidZone=null,openSkin=null,selectedSkin=null,seed=0,form='sheet',layers=false,conformal=false,printAxis=2}=data;
    const wallZones=normalizeWallZones(data.wallZones),rim=Number(data.rim??0);
    if(!Number.isFinite(rim)||rim<0||rim>4||rim>0&&!(openSkin||selectedSkin))throw new Error('El marco requiere caras elegidas y un ancho de 0 a 4 mm.');
    if(!Number.isInteger(seed)||seed<0||seed>9999)throw new Error('Semilla Voronoi no válida.');
    if(!['sheet','network'].includes(form))throw new Error('Forma TPMS no válida.');
    if(typeof layers!=='boolean'||typeof conformal!=='boolean'||![0,1,2].includes(printAxis))throw new Error('Disposición espacial no válida.');
    if(layers&&conformal)throw new Error('Elige capas equidistantes o celdas conformes; la combinación no está validada.');
    if(cellGrade&&['voronoi','voronoi-bars','delaunay-bars','spinodal'].includes(pattern))throw new Error('La gradación de celda no está disponible para estructuras estocásticas.');
    const solidDepth=solidZone?.depth??0;
    if(solidZone&&(!Number.isFinite(solidDepth)||solidDepth<=0||solidDepth>20||solidZone.faces?.length!==2))throw new Error('Zonas macizas no válidas.');
    if(openSkin&&(!(skin>0)||!Array.isArray(openSkin.faces)||openSkin.faces.length<1||openSkin.faces.length>100))throw new Error('Caras sin piel no válidas.');
    if(selectedSkin&&(!(skin>0)||openSkin||!Array.isArray(selectedSkin.faces)||selectedSkin.faces.length<1||selectedSkin.faces.length>100))throw new Error('Caras de piel seleccionada no válidas.');
    const min=bounds.min,max=bounds.max, dims=max.map((n,i)=>n-min[i]);
    let step=(cellGrade?.minCell??cell)/(quality==='normal'?8:5);
    if(['cubic','bcc','fcc','octa','octet'].includes(pattern))step=Math.min(step,(cellGrade?.minCell??cell)*(grade?.minWall??wall)*.35*(quality==='normal'?.72:1));
    if(['voronoi','voronoi-bars','delaunay-bars','spinodal'].includes(pattern))step=Math.min(step,cell*(grade?.minWall??wall)*.25*(quality==='normal'?.72:1));
    if(layers)step=Math.min(step,cell*(grade?.minWall??wall)*.2);
    if(grade)step=Math.min(step,(cellGrade?.minCell??cell)*grade.minWall*.5);
    if(skin>0)step=Math.min(step,Math.max(.5,skin/2));
    if(solidDepth>0)step=Math.min(step,Math.max(.5,solidDepth/2));
    step=Math.max(step,Math.max(...dims)/70);
    const pad=step*1.5;
    const start=min.map(n=>n-pad), end=max.map(n=>n+pad);
    const nx=Math.ceil((end[0]-start[0])/step)+1,ny=Math.ceil((end[1]-start[1])/step)+1,nz=Math.ceil((end[2]-start[2])/step)+1;
    const stride=nx*ny, field=new Float32Array(nx*ny*nz),postProcess=skin>0||solidDepth>0||layers,body=postProcess?new Uint8Array(field.length):null;
    const topCache=new Map(),axes=[0,1,2].filter(axis=>axis!==printAxis);
    let conformalBvh=null,conformalGeometry=null;
    if(conformal&&kind==='mesh'){
      conformalGeometry=new THREE.BufferGeometry();conformalGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      conformalBvh=new MeshBVH(conformalGeometry,{targetLeafSize:10});
    }
    const evaluateLattice=(x,y,z,i,j,k,localCell,localWall)=>{
      if(!conformal)return latticeField(x,y,z,pattern,localCell,localWall,seed,form);
      const point=[x,y,z],indices=[i,j,k],key=`${indices[axes[0]]}:${indices[axes[1]]}`;
      let top=topCache.get(key);
      if(top===undefined){
        if(kind==='cube')top=max[printAxis];
        else if(kind==='sphere'){
          const transverse=axes.reduce((sum,axis)=>sum+point[axis]**2,0);
          top=Math.sqrt(Math.max(0,(dims[0]/2)**2-transverse));
        }else{
          const origin=[x,y,z];origin[printAxis]=max[printAxis]+pad*5;
          const direction=[0,0,0];direction[printAxis]=-1;
          const hit=conformalBvh.raycastFirst(new THREE.Ray(new THREE.Vector3(...origin),new THREE.Vector3(...direction)),THREE.DoubleSide,0,dims[printAxis]+pad*10);
          top=hit?origin[printAxis]-hit.distance:max[printAxis];
        }
        topCache.set(key,top);
      }
      return latticeField(...conformalCoordinates(x,y,z,top,printAxis),pattern,localCell,localWall,seed,form);
    };
    let bodyNodes=0, solidNodes=0;
    for(let k=0;k<nz;k++){
      const z=start[2]+k*step;
      for(let j=0;j<ny;j++){
        const y=start[1]+j*step;
        const hits=kind==='mesh'?rowHits(positions,y,z):null;
        let hitIndex=0;
        for(let i=0;i<nx;i++){
          const x=start[0]+i*step;
          let shape;
          if(kind==='cube') shape=Math.min(dims[0]/2-Math.abs(x),dims[1]/2-Math.abs(y),dims[2]/2-Math.abs(z));
          else if(kind==='sphere') shape=dims[0]/2-Math.hypot(x,y,z);
          else {
            while(hitIndex<hits.length&&hits[hitIndex]<x)hitIndex++;
            const inside=hitIndex%2===1;
            const d=Math.min(hitIndex<hits.length?Math.abs(hits[hitIndex]-x):step,hitIndex>0?Math.abs(x-hits[hitIndex-1]):step,step);
            shape=inside?d:-d;
          }
          const index=k*stride+j*nx+i;
          if(shape>0){bodyNodes++;if(body)body[index]=1;}
          if(postProcess)field[index]=shape;
          else{
            const localCell=cellGrade?gradedCell(cellGrade,x,y,z):cell;
            const localWall=wallAtZones(x,y,z,grade?gradedWall(grade,x,y,z):wall,wallZones);
            const f=Math.min(shape,evaluateLattice(x,y,z,i,j,k,localCell,localWall));
            if(f>0)solidNodes++;
            field[index]=f;
          }
        }
      }
      if(k%5===0)self.postMessage({type:'progress',value:Math.round(k/nz*45)});
    }
    if(postProcess){
      if(solidDepth>0)self.postMessage({type:'progress',value:46});
      const distances=skin>0&&!selectedSkin||layers?distanceToExterior(body,nx,ny,nz,step):null;
      const openDistances=openSkin?distanceToSelectedFaces({faces:openSkin.faces,inside:body,nx,ny,nz,start,step,depth:skin+2*step}):null;
      const selectedDistances=selectedSkin?distanceToSelectedFaces({faces:selectedSkin.faces,inside:body,nx,ny,nz,start,step,depth:skin+2*step}):null;
      const rimDistances=rim>0?edgeDistanceField({segments:faceBoundarySegments((openSkin||selectedSkin).faces),inside:body,nx,ny,nz,start,step,radius:rim/2}):null;
      const faceDistances=solidDepth>0?distanceToSelectedFaces({faces:solidZone.faces,inside:body,nx,ny,nz,start,step,depth:solidDepth}):null;
      for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
        const index=k*stride+j*nx+i;if(!body[index])continue;
        const x=start[0]+i*step,y=start[1]+j*step,z=start[2]+k*step;
        const localCell=cellGrade?gradedCell(cellGrade,x,y,z):cell;
        const localWall=wallAtZones(x,y,z,grade?gradedWall(grade,x,y,z):wall,wallZones);
        const lattice=evaluateLattice(x,y,z,i,j,k,localCell,localWall);
        const blend=openSkin?Math.max(0,Math.min(1,(skin+2*step-openDistances[index])/step)):0;
        const smoothing=step*.6*blend;
        const shell=selectedSkin?skin-selectedDistances[index]:skinField(skin,distances?.[index],openDistances?.[index],smoothing);
        const withSkin=smoothUnion(lattice,shell,smoothing);
        const layer=layers?equidistantLayerField(x,y,z,distances[index],localCell,localWall,printAxis):-Infinity;
        const withLayers=smoothUnion(withSkin,layer,layers?step*.25:0);
        const withRim=rim>0?smoothUnion(withLayers,rim/2-rimDistances[index],step*.25):withLayers;
        const f=Math.min(field[index],Math.max(withRim,solidDepth>0?solidDepth-faceDistances[index]:-Infinity));
        if(f>0)solidNodes++;
        field[index]=f;
      }
      self.postMessage({type:'progress',value:48});
    }
    conformalGeometry?.dispose();
    const materialConnectivity=analyzeMaterialConnectivity(field,nx,ny,nz);
    const out=[];
    const id=(i,j,k)=>k*stride+j*nx+i;
    for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
      const pts=CORNERS.map(([dx,dy,dz])=>[start[0]+(i+dx)*step,start[1]+(j+dy)*step,start[2]+(k+dz)*step]);
      const vals=CORNERS.map(([dx,dy,dz])=>field[id(i+dx,j+dy,k+dz)]);
      if(vals.every(v=>v<=0)||vals.every(v=>v>0))continue;
      for(const t of TETRA)polygonize(t.map(n=>pts[n]),t.map(n=>vals[n]),out);
    }
    const mesh=new Float32Array(out);
    self.postMessage({type:'progress',value:90});
    const cleaned=prepareMesh(mesh,{repair:false,minComponentTriangles:100});
    self.postMessage({type:'done',positions:cleaned.positions,report:cleaned.report,materialConnectivity,triangleCount:cleaned.positions.length/9,reduction:bodyNodes?Math.max(0,1-solidNodes/bodyNodes):0,grid:[nx,ny,nz],step,solidDepth,openSkinFaceCount:openSkin?.faces.length||0,selectedSkinFaceCount:selectedSkin?.faces.length||0,rim,layers,conformal},[cleaned.positions.buffer]);
  }catch(error){self.postMessage({type:'error',message:String(error.message||error)});}
};

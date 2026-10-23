import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';

// Sample an inward normal ray from area-stratified triangle centers. This is
// a directional surface thickness estimate, not a global minimum wall proof.
export function measureSurfaceThickness(positions,{maxSamples=640,epsilon=.002}={}){
  if(!(positions instanceof Float32Array)||!positions.length||positions.length%9)throw new Error('Malla no válida para medir el grosor.');
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const bvh=new MeshBVH(geometry,{targetLeafSize:10});
  geometry.computeBoundingBox();
  const diag=geometry.boundingBox.getSize(new THREE.Vector3()).length();
  const triangleCount=positions.length/9,areas=new Float64Array(triangleCount);
  let totalArea=0;
  for(let i=0;i<triangleCount;i++){
    const p=i*9,ax=positions[p+3]-positions[p],ay=positions[p+4]-positions[p+1],az=positions[p+5]-positions[p+2];
    const bx=positions[p+6]-positions[p],by=positions[p+7]-positions[p+1],bz=positions[p+8]-positions[p+2];
    totalArea+=Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)*.5;areas[i]=totalArea;
  }
  if(totalArea<=0)throw new Error('Malla sin área medible.');
  const samples=Math.min(maxSamples,triangleCount),values=[];
  for(let sample=0;sample<samples;sample++){
    const target=totalArea*(sample+.5)/samples;
    let lo=0,hi=triangleCount-1;
    while(lo<hi){const mid=(lo+hi)>>>1;if(areas[mid]<target)lo=mid+1;else hi=mid;}
    const p=lo*9;
    const a=new THREE.Vector3(positions[p],positions[p+1],positions[p+2]);
    const b=new THREE.Vector3(positions[p+3],positions[p+4],positions[p+5]);
    const c=new THREE.Vector3(positions[p+6],positions[p+7],positions[p+8]);
    const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize().negate();
    const origin=a.add(b).add(c).multiplyScalar(1/3).addScaledVector(normal,epsilon);
    const hit=bvh.raycastFirst(new THREE.Ray(origin,normal),THREE.DoubleSide,epsilon,diag);
    if(hit&&hit.distance>epsilon&&hit.distance<diag)values.push(hit.distance+epsilon);
  }
  values.sort((a,b)=>a-b);
  geometry.dispose();
  return {samples,hits:values.length,coverage:values.length/samples,minimum:values[0]??null,p05:values.length?values[Math.floor((values.length-1)*.05)]:null,median:values.length?values[Math.floor((values.length-1)*.5)]:null};
}

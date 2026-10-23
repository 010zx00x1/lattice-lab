import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {detectFaceGroups} from '../src/face-groups.js';
import {extractFaceTriangles,rasterizeFaceNodes} from '../src/face-boundary.js';
import {solveElastic} from '../src/elastic-solver.js';

const bar={occupied:new Uint8Array(12*4*4).fill(1),nx:12,ny:4,nz:4,spacing:[2,2,2],E:200000,force:100,axis:0};
const bounds={min:[-12,-4,-4],max:[12,4,4]};

test('opposing detected faces reproduce an axial bar boundary condition',()=>{
  const cube=new THREE.BoxGeometry(24,8,8).toNonIndexed();
  const positions=cube.getAttribute('position').array,groups=detectFaceGroups(positions);
  const left=groups.find(group=>group.normal[0]<-.9),right=groups.find(group=>group.normal[0]>.9);
  assert.equal(left.triangleIds.length,2);
  const support=rasterizeFaceNodes({...bar,bounds,triangles:extractFaceTriangles(positions,left.triangleIds)});
  const load=rasterizeFaceNodes({...bar,bounds,triangles:extractFaceTriangles(positions,right.triangleIds)});
  const result=solveElastic({...bar,boundary:{support,load,direction:[1,0,0]}});
  const automatic=solveElastic(bar);
  assert.equal(result.supportCount,25);
  assert.equal(result.loadCount,25);
  assert.ok(Math.abs(result.meanLoadedDisplacement/automatic.meanLoadedDisplacement-1)<1e-8);
});

test('a smaller load patch changes the elastic response',()=>{
  const support=new Uint8Array((13)*(5)*(5)),load=new Uint8Array(support.length);
  for(let z=0;z<=4;z++)for(let y=0;y<=4;y++)support[z*65+y*13]=1;
  for(let z=1;z<=3;z++)for(let y=1;y<=3;y++)load[z*65+y*13+12]=1;
  const localized=solveElastic({...bar,boundary:{support,load,direction:[1,0,0]}});
  const compression=solveElastic({...bar,boundary:{support,load,direction:[-1,0,0]}});
  const whole=solveElastic(bar);
  assert.equal(localized.loadCount,9);
  assert.ok(localized.meanLoadedDisplacement>whole.meanLoadedDisplacement*1.05);
  assert.ok(localized.stress95>whole.stress95*1.05);
  assert.ok(Math.abs(compression.stress95/localized.stress95-1)<1e-8);
});

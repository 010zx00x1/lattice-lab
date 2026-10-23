import test from 'node:test';
import assert from 'node:assert/strict';
import {distributeMoment} from '../src/load-distribution.js';
import {normalizeAnalysisCases} from '../src/analysis-cases.js';
import {solveElastic} from '../src/elastic-solver.js';
import {createProject,readProject} from '../src/project.js';
import * as THREE from 'three';

test('nodal moment has zero net force and the requested torque',()=>{
  const points=[[0,-2,-2],[0,2,-2],[0,2,2],[0,-2,2]],axis=[1,0,0],forces=distributeMoment(points,axis,120);
  for(let d=0;d<3;d++)assert.ok(Math.abs(forces.reduce((sum,force)=>sum+force[d],0))<1e-10);
  const torque=points.reduce((sum,p,i)=>sum+p[1]*forces[i][2]-p[2]*forces[i][1],0);
  assert.ok(Math.abs(torque-120)<1e-10);
});

test('elastic response to a moment scales linearly',()=>{
  const input={occupied:new Uint8Array(5*3*3).fill(1),nx:5,ny:3,nz:3,spacing:[2,2,2],E:2300,nu:.3,axis:0,loadType:'moment'};
  const low=solveElastic({...input,moment:30});
  const high=solveElastic({...input,moment:60});
  assert.ok(low.maxDisplacement>0);
  assert.ok(Math.abs(high.maxDisplacement/low.maxDisplacement-2)<.05);
  assert.ok(Math.abs(high.stress95/low.stress95-2)<.05);
});

test('saved analysis cases retain independent load settings',()=>{
  const base={mode:'elastic',target:'source',axis:0,supportFace:'g:g0',loadFace:'1',loadSense:1,loadType:'pressure',loadValue:.4,E:2.3,conductivity:.13,power:5,ambient:20};
  const cases=normalizeAnalysisCases([{...base,id:'c0',name:'Presión'}, {...base,id:'c1',name:'Torsión',loadType:'moment',loadValue:120}]);
  assert.equal(cases[0].loadValue,.4);
  assert.equal(cases[1].loadType,'moment');
  assert.throws(()=>normalizeAnalysisCases([...cases,{...cases[0],name:'Duplicado'}]));
  const positions=new Float32Array(new THREE.BoxGeometry(20,20,20).toNonIndexed().getAttribute('position').array);
  const opened=readProject(JSON.parse(JSON.stringify(createProject({positions,name:'Ensayo',type:'STL',settings:{analysisCases:cases}}))));
  assert.deepEqual(normalizeAnalysisCases(opened.settings.analysisCases),cases);
});

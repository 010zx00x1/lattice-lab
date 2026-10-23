import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFaceSets,combineFaceGroups} from '../src/face-sets.js';
import {createProject,readProject} from '../src/project.js';
import * as THREE from 'three';

test('named face sets survive project settings and combine geometric boundaries',()=>{
  const groups=[
    {triangleIds:[0,1],areaMm2:4,centroid:[-1,0,0],normal:[-1,0,0]},
    {triangleIds:[2,3],areaMm2:6,centroid:[1,0,0],normal:[1,0,0]},
  ];
  const saved=[{id:'g0',name:'  zona de carga  ',faceIds:[0,1]}];
  const restored=normalizeFaceSets(JSON.parse(JSON.stringify(saved)),groups.length);
  assert.deepEqual(restored,[{id:'g0',name:'zona de carga',faceIds:[0,1]}]);
  const boundary=combineFaceGroups(groups,restored[0].faceIds,restored[0].name);
  assert.deepEqual(boundary.triangleIds,[0,1,2,3]);
  assert.equal(boundary.areaMm2,10);
  assert.equal(boundary.centroid[0],.2);
});

test('face sets reject overlapping identifiers and faces outside the current piece',()=>{
  assert.throws(()=>normalizeFaceSets([{id:'g0',name:'A',faceIds:[0]},{id:'g0',name:'B',faceIds:[1]}],2));
  assert.throws(()=>normalizeFaceSets([{id:'g1',name:'A',faceIds:[2]}],2));
  assert.throws(()=>normalizeFaceSets([{id:'g1',name:'A',faceIds:[0,0]}],2));
});

test('project roundtrip keeps named groups and their support, load, and opening assignments',()=>{
  const positions=new Float32Array(new THREE.BoxGeometry(20,20,20).toNonIndexed().getAttribute('position').array);
  const settings={faceSets:[{id:'g0',name:'Apoyo',faceIds:[0,1]}],sourceSupportFace:'g:g0',sourceLoadFace:'2',openSkinFaces:['3','4'],solidZoneDepth:2};
  const loaded=readProject(JSON.parse(JSON.stringify(createProject({positions,name:'Caja',type:'STL',settings}))));
  assert.deepEqual(normalizeFaceSets(loaded.settings.faceSets,6),settings.faceSets);
  assert.equal(loaded.settings.sourceSupportFace,'g:g0');
  assert.deepEqual(loaded.settings.openSkinFaces,['3','4']);
  assert.equal(loaded.settings.solidZoneDepth,2);
});

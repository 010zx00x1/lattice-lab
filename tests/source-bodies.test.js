import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBodyRecords,assembleVisibleBodies} from '../src/source-bodies.js';
import {createProject,readProject} from '../src/project.js';

test('hiding a CAD body changes the active mesh without losing its saved geometry',()=>{
  const first=new THREE.BoxGeometry(10,10,10).translate(-12,0,0).toNonIndexed().getAttribute('position').array;
  const second=new THREE.BoxGeometry(10,10,10).translate(12,0,0).toNonIndexed().getAttribute('position').array;
  const all=new Float32Array(first.length+second.length);all.set(first);all.set(second,first.length);
  const bodies=createBodyRecords(all,[{name:'Izquierda',first:0,last:11},{name:'Derecha',first:12,last:23}],[{name:'Izquierda · cara 1',first:0,last:1},{name:'Derecha · cara 1',first:12,last:13}]);
  bodies[0].visible=false;
  const active=assembleVisibleBodies(bodies);
  assert.equal(active.positions.length,second.length);
  assert.deepEqual(active.cadFaces,[{name:'Derecha · cara 1',first:0,last:1}]);
  const saved=createProject({positions:active.positions,bodies,name:'Dos cuerpos',type:'STEP',settings:{sourceScale:2}});
  assert.equal(saved.version,2);
  const restored=readProject(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.bodies.length,2);
  assert.equal(restored.bodies[0].visible,false);
  assert.deepEqual(Array.from(restored.positions),Array.from(second));
  restored.bodies[0].visible=true;
  assert.equal(assembleVisibleBodies(restored.bodies).positions.length,all.length);
});

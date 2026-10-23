import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {measureSurfaceThickness} from '../src/thickness-sampling.js';

function cube(size){return new Float32Array(new THREE.BoxGeometry(size,size,size).toNonIndexed().getAttribute('position').array);}
function hollowCube(outer,inner){
  const outside=cube(outer),inside=cube(inner),reversed=new Float32Array(inside);
  for(let i=0;i<reversed.length;i+=9)for(let d=0;d<3;d++)[reversed[i+3+d],reversed[i+6+d]]=[reversed[i+6+d],reversed[i+3+d]];
  const shell=new Float32Array(outside.length+inside.length);shell.set(outside);shell.set(reversed,outside.length);return shell;
}

test('normal ray sampling reads a solid cube and a two-millimetre hollow wall',()=>{
  const solid=measureSurfaceThickness(cube(20),{maxSamples:12});
  assert.equal(solid.coverage,1);
  assert.ok(Math.abs(solid.p05-20)<1e-4);
  const shell=measureSurfaceThickness(hollowCube(20,16),{maxSamples:24});
  assert.equal(shell.coverage,1);
  assert.ok(Math.abs(shell.p05-2)<1e-4);
});

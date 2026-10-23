import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry} from 'three';
import {voxelizeMesh} from '../src/voxelize.js';

test('ray sampling keeps the expected volume of a closed inner cube',()=>{
  const cube=new BoxGeometry(20,20,20).toNonIndexed();
  const bounds={min:[-20,-20,-20],max:[20,20,20]};
  const sampled=voxelizeMesh(cube.getAttribute('position').array,bounds,[20,20,20]);
  assert.equal(sampled.occupied.reduce((total,solid)=>total+solid,0),1000);
  assert.deepEqual(sampled.spacing,[2,2,2]);
  cube.dispose();
});

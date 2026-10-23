import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry} from 'three';
import {optimizeLattice} from '../src/optimize-lattice.js';

const cube=new BoxGeometry(40,40,40).toNonIndexed();
const base={sourcePositions:cube.getAttribute('position').array,bounds:{min:[-20,-20,-20],max:[20,20,20]},pattern:'gyroid',cells:[10],walls:[.24],E:2000,force:10,axis:0};

test('parametric search finds a feasible lattice under a displacement limit',()=>{
  const result=optimizeLattice({...base,target:.005});
  assert.equal(result.feasible,true);
  assert.equal(result.cell,10);
  assert.equal(result.wall,.24);
  assert.ok(result.displacement<=.005);
  assert.ok(result.reduction>0&&result.reduction<1);
});

test('parametric search reports an unattainable limit honestly',()=>{
  const result=optimizeLattice({...base,target:1e-8});
  assert.equal(result.feasible,false);
  assert.ok(result.displacement>result.target);
});

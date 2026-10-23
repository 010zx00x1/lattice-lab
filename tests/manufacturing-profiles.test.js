import test from 'node:test';
import assert from 'node:assert/strict';
import {MACHINES,MATERIALS,fitsBuildVolume} from '../src/materials.js';

test('machine volume check respects the chosen print axis and horizontal rotation',()=>{
  const prusa=MACHINES.prusa_mk4s.volume;
  assert.equal(fitsBuildVolume([230,200,210],prusa,2),true);
  assert.equal(fitsBuildVolume([230,200,210],prusa,0),false);
  assert.equal(fitsBuildVolume([200,230,210],prusa,2),true);
  assert.equal(fitsBuildVolume([300,300,300],MACHINES.formlabs_fuse1plus.volume,2),false);
  assert.equal(fitsBuildVolume([300,300,300],null,2),true);
});

test('sourced material profiles separate yield from ultimate strength',()=>{
  assert.equal(MATERIALS.prusament_pla.yield,51);
  assert.equal(MATERIALS.formlabs_nylon12.ultimate,50);
  assert.equal(MATERIALS.formlabs_nylon12.yield,undefined);
  assert.ok(MATERIALS.prusament_pla.source.startsWith('https://'));
  assert.ok(MACHINES.formlabs_fuse1plus.source.startsWith('https://'));
});

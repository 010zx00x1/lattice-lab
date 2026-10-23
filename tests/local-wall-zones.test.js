import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWallZones,wallAtZones} from '../src/local-wall-zones.js';

test('sphere and box zones blend into surrounding wall thickness',()=>{
  const zones=normalizeWallZones([{type:'sphere',center:[0,0,0],size:5,wall:.4,blend:2}]);
  assert.equal(wallAtZones(0,0,0,.2,zones),.4);
  assert.equal(wallAtZones(10,0,0,.2,zones),.2);
  assert.ok(Math.abs(wallAtZones(5,0,0,.2,zones)-.3)<1e-12);
  const box=normalizeWallZones([{type:'box',center:[2,0,0],size:4,wall:.3,blend:0}]);
  assert.equal(wallAtZones(2,0,0,.2,box),.3);
  assert.equal(wallAtZones(5,0,0,.2,box),.2);
});

test('local wall zone parameters are validated and overlap order is stable',()=>{
  const zones=normalizeWallZones([{type:'sphere',center:[0,0,0],size:5,wall:.4,blend:1},{type:'box',center:[0,0,0],size:2,wall:.3,blend:1}]);
  assert.equal(wallAtZones(0,0,0,.2,zones),.3);
  assert.throws(()=>normalizeWallZones([{type:'sphere',center:[0,0,0],size:0,wall:.4,blend:1}]));
  assert.throws(()=>normalizeWallZones(Array(9).fill(zones[0])));
});

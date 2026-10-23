import test from 'node:test';
import assert from 'node:assert/strict';
import {distanceToSelectedFaces} from '../src/face-solid-zone.js';

test('selected face preserves only a local depth band',()=>{
  const face=new Float32Array([
    -2,-2,2, 2,-2,2, 2,2,2,
    -2,-2,2, 2,2,2, -2,2,2
  ]);
  const nx=7,ny=7,nz=7,id=(x,y,z)=>z*nx*ny+y*nx+x;
  const inside=new Uint8Array(nx*ny*nz).fill(1);
  const dist=distanceToSelectedFaces({faces:[face],inside,nx,ny,nz,start:[-3,-3,-3],step:1,depth:2});
  assert.equal(dist[id(3,3,5)],0);
  assert.equal(dist[id(3,3,4)],1);
  assert.equal(dist[id(3,3,3)],2);
  assert.equal(dist[id(3,3,1)],Infinity);
  assert.ok(dist[id(6,6,3)]>2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {solveFlow} from '../src/flow-solver.js';

const nx=8,ny=4,nz=4,n=nx*ny*nz,body=new Uint8Array(n).fill(1),spacing=[1,1,1];
const id=(x,y,z)=>z*nx*ny+y*nx+x;

test('an unobstructed rectangular channel has unit relative conductance',()=>{
  const result=solveFlow({solid:new Uint8Array(n),body,nx,ny,nz,spacing,axis:0});
  assert.ok(Math.abs(result.relativeConductance-1)<1e-6);
  assert.equal(result.connectedFraction,1);
  assert.ok(Math.abs(result.pressure[id(3,2,2)]-4/7)<1e-5);
  assert.ok(result.residual<1e-6);
});

test('a sealed cross-section blocks the through-flow path',()=>{
  const solid=new Uint8Array(n);
  for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)solid[id(4,y,z)]=1;
  const result=solveFlow({solid,body,nx,ny,nz,spacing,axis:0});
  assert.equal(result.relativeConductance,0);
  assert.equal(result.throughVoxels,0);
});

test('a narrow connected channel has lower conductance than the open body',()=>{
  const solid=new Uint8Array(n).fill(1);
  for(let x=0;x<nx;x++)solid[id(x,1,1)]=0;
  const result=solveFlow({solid,body,nx,ny,nz,spacing,axis:0});
  assert.ok(result.relativeConductance>0&&result.relativeConductance<.1);
  assert.equal(result.connectedFraction,1);
});

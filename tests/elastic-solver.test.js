import test from 'node:test';
import assert from 'node:assert/strict';
import {solveElastic} from '../src/elastic-solver.js';

const bar={occupied:new Uint8Array(12*4*4).fill(1),nx:12,ny:4,nz:4,spacing:[2,2,2],E:200000,force:100,axis:0};

test('axial bar displacement and stress agree with elementary elasticity',()=>{
  const result=solveElastic(bar);
  const expectedDisplacement=bar.force*(bar.nx*bar.spacing[0])/(bar.E*(bar.ny*bar.spacing[1])*(bar.nz*bar.spacing[2]));
  const expectedStress=bar.force/((bar.ny*bar.spacing[1])*(bar.nz*bar.spacing[2]));
  assert.ok(Math.abs(result.meanLoadedDisplacement/expectedDisplacement-1)<.04);
  assert.ok(Math.abs(result.stress95/expectedStress-1)<.15);
  assert.ok(result.residual<1e-4);
});

test('linear response scales with force and Young modulus',()=>{
  const base=solveElastic(bar);
  const doubledForce=solveElastic({...bar,force:bar.force*2});
  const doubledModulus=solveElastic({...bar,E:bar.E*2});
  assert.ok(Math.abs(doubledForce.maxDisplacement/base.maxDisplacement-2)<1e-7);
  assert.ok(Math.abs(doubledModulus.maxDisplacement/base.maxDisplacement-.5)<1e-7);
  assert.ok(Math.abs(doubledModulus.stress95/base.stress95-1)<1e-7);
});

test('disconnected material is removed before solving',()=>{
  const occupied=new Uint8Array(6*3*3);
  for(let x=0;x<4;x++)for(let y=0;y<3;y++)for(let z=0;z<3;z++)occupied[z*18+y*6+x]=1;
  occupied[5]=1;
  const result=solveElastic({occupied,nx:6,ny:3,nz:3,spacing:[1,1,1],E:1000,force:10,axis:0});
  assert.equal(result.discardedVoxels,1);
  assert.equal(result.voxels,36);
});

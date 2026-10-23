import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleSurface,sampleTriangles,rasterizeSamples} from '../src/software-preview.js';

test('software preview limits samples without modifying source triangles',()=>{
  const positions=new Float32Array(100*9);
  for(let i=0;i<positions.length;i+=9){positions.set([0,0,0,1,0,0,0,1,0],i);}
  const samples=sampleSurface(positions,10);
  assert.equal(samples.length,60);
  assert.equal(positions.length,900);
  assert.ok(Math.abs(samples[0]-1/3)<1e-6);
  assert.ok(Math.abs(samples[1]-1/3)<1e-6);
  assert.equal(samples[2],0);
  const detail=sampleTriangles(positions,10);
  assert.equal(detail.length,120);
  assert.deepEqual([...detail.slice(0,9)],[0,0,0,1,0,0,0,1,0]);
});

test('software preview keeps the nearest visible sample',()=>{
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const samples=new Float32Array([0,0,.5,0,-1,0,0,0,-.5,0,1,0]);
  const pixels=new Uint8ClampedArray(5*5*4),depth=new Float32Array(25);
  rasterizeSamples(samples,matrix,5,5,pixels,depth,{radius:0});
  const center=3*5+3;
  assert.equal(depth[center],-.5);
  assert.ok(pixels[center*4+1]>180);
  assert.equal(pixels[center*4+3],255);
});

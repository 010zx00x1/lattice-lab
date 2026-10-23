import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleStress,gradedWall,gradedCell} from '../src/grade.js';

test('stress field interpolates between voxel centers and increases wall',()=>{
  const stress=new Float32Array([0,100,0,100,0,100,0,100]);
  const dims=[2,2,2],bounds={min:[0,0,0],max:[2,2,2]};
  assert.ok(Math.abs(sampleStress(stress,dims,bounds,1,1,1)-50)<1e-6);
  const grade={stress,dims,bounds,stress95:100,minWall:.15,maxWall:.4};
  assert.equal(gradedWall(grade,.5,.5,.5),.15);
  assert.equal(gradedWall(grade,1.5,.5,.5),.4);
  assert.ok(gradedWall(grade,1,.5,.5)>.15);
});

test('stress field shrinks local cell size toward high-stress regions',()=>{
  const stress=new Float32Array([0,100,0,100,0,100,0,100]);
  const grade={stress,dims:[2,2,2],bounds:{min:[0,0,0],max:[2,2,2]},stress95:100,minCell:6,maxCell:10};
  assert.equal(gradedCell(grade,.5,.5,.5),10);
  assert.equal(gradedCell(grade,1.5,.5,.5),6);
  assert.ok(gradedCell(grade,1,.5,.5)<10);
  assert.ok(gradedCell(grade,1,.5,.5)>6);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {faceBoundarySegments,edgeDistanceField} from '../src/rim-field.js';

const square=new Float32Array([0,0,0,2,0,0,2,2,0,0,0,0,2,2,0,0,2,0]);
test('the shared diagonal is excluded from a selected face rim',()=>{
  const segments=faceBoundarySegments([square]);
  assert.equal(segments.length,4);
  const field=edgeDistanceField({segments,inside:new Uint8Array(5*5*3).fill(1),nx:5,ny:5,nz:3,start:[-1,-1,-1],step:1,radius:1});
  const id=(x,y,z)=>z*25+y*5+x;
  assert.equal(field[id(1,1,1)],0);
  assert.equal(field[id(2,2,1)],1);
});

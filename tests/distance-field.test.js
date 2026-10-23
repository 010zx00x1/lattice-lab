import test from 'node:test';
import assert from 'node:assert/strict';
import {distanceToExterior} from '../src/distance-field.js';

test('skin distance grows toward the interior of a cube',()=>{
  const mask=new Uint8Array(5**3);
  for(let z=1;z<=3;z++)for(let y=1;y<=3;y++)for(let x=1;x<=3;x++)mask[z*25+y*5+x]=1;
  const distance=distanceToExterior(mask,5,5,5,1);
  assert.equal(distance[0],0);
  assert.equal(distance[1*25+2*5+2],1);
  assert.equal(distance[2*25+2*5+2],2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMaterialConnectivity} from '../src/material-connectivity.js';

test('a connected hollow shell is one material component',()=>{
  const n=9,field=new Float32Array(n**3).fill(-1);
  for(let z=1;z<=7;z++)for(let y=1;y<=7;y++)for(let x=1;x<=7;x++){
    if(x===1||x===7||y===1||y===7||z===1||z===7)field[z*n*n+y*n+x]=1;
  }
  const report=analyzeMaterialConnectivity(field,n,n,n);
  assert.equal(report.components,1);
  assert.equal(report.largestFraction,1);
});

test('separate solids are reported independently',()=>{
  const field=new Float32Array(12*4*4).fill(-1),id=(x,y,z)=>z*48+y*12+x;
  for(let z=0;z<4;z++)for(let y=0;y<4;y++)for(let x=0;x<12;x++)if(x<3||x>8)field[id(x,y,z)]=1;
  const report=analyzeMaterialConnectivity(field,12,4,4);
  assert.equal(report.components,2);
  assert.equal(report.largestFraction,.5);
});

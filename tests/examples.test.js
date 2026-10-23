import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES,createExample} from '../src/examples.js';
import {prepareMesh} from '../src/mesh-quality.js';

test('mechanical examples are distinct closed solids ready for the lattice workflow',()=>{
  const volumes=[];
  for(const id of ['hinge','bracket','rod','rocker']){
    const example=createExample(id),geometry=example.geometry;
    const report=prepareMesh(geometry.getAttribute('position').array,{repair:false}).report;
    assert.equal(example.kind,'mesh');
    assert.equal(report.valid,true,id);
    assert.equal(report.components,1,id);
    assert.equal(report.boundaryEdges,0,id);
    assert.ok(report.volumeMm3>10000,id);
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.max.x-geometry.boundingBox.min.x>70,id);
    volumes.push(Math.round(report.volumeMm3));
    geometry.dispose();
  }
  assert.equal(new Set(volumes).size,4);
  assert.equal(Object.keys(EXAMPLES).length,6);
});

test('recommended settings generate valid lattices for every mechanical example',async()=>{
  let generated;
  globalThis.self={postMessage(message){if(message.type==='done')generated=message;}};
  await import('../src/lattice-worker.js');
  for(const id of ['hinge','bracket','rod','rocker']){
    const example=createExample(id),geometry=example.geometry;
    geometry.computeBoundingBox();
    const {min,max}=geometry.boundingBox;
    generated=undefined;
    self.onmessage({data:{
      kind:'mesh',positions:new Float32Array(geometry.getAttribute('position').array),
      bounds:{min:min.toArray(),max:max.toArray()},pattern:'gyroid',
      cell:example.cell,wall:example.wall,skin:0,quality:'draft'
    }});
    assert.ok(generated,id);
    assert.equal(generated.report.valid,true,id);
    assert.equal(generated.materialConnectivity.components,1,id);
    geometry.dispose();
  }
});

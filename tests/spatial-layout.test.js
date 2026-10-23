import test from 'node:test';
import assert from 'node:assert/strict';
import {conformalCoordinates,equidistantLayerField} from '../src/spatial-layout.js';
import * as THREE from 'three';

test('equidistant bands follow inward depth and retain drainage openings',()=>{
  assert.ok(equidistantLayerField(5,5,5,5,10,.4,2)>0);
  assert.ok(equidistantLayerField(5,5,5,10,10,.4,2)<0);
  assert.ok(equidistantLayerField(0,0,5,5,10,.4,2)<0);
  assert.ok(equidistantLayerField(5,5,5,15,10,.4,2)>0);
});

test('conformal depth is measured from the top surface on the selected axis',()=>{
  assert.deepEqual(conformalCoordinates(2,3,4,12,2),[2,3,8]);
  assert.deepEqual(conformalCoordinates(2,3,4,10,0),[8,3,4]);
});

test('perforated layers and conformal coordinates generate closed connected material on a cube',async()=>{
  let generated;
  globalThis.self={postMessage(message){if(message.type==='done')generated=message;}};
  await import('../src/lattice-worker.js');
  for(const variant of [{layers:true},{conformal:true}]){
    generated=undefined;
    self.onmessage({data:{kind:'cube',bounds:{min:[-12,-12,-12],max:[12,12,12]},pattern:'gyroid',cell:10,wall:.4,skin:1.2,quality:'draft',printAxis:2,...variant}});
    assert.equal(generated.report.valid,true,JSON.stringify(variant));
    assert.equal(generated.materialConnectivity.components,1,JSON.stringify(variant));
  }
});

test('conformal cells use the sloped top of an imported closed mesh',async()=>{
  const geometry=new THREE.BoxGeometry(24,24,24).toNonIndexed(),positions=new Float32Array(geometry.getAttribute('position').array);
  for(let i=0;i<positions.length;i+=3)if(positions[i+2]>0)positions[i+2]+=.2*positions[i];
  let generated;
  globalThis.self??={};self.postMessage=message=>{if(message.type==='done')generated=message;};
  await import('../src/lattice-worker.js');
  self.onmessage({data:{kind:'mesh',positions,bounds:{min:[-12,-12,-12],max:[12,12,14.4]},pattern:'gyroid',cell:10,wall:.4,skin:1.2,quality:'draft',conformal:true,printAxis:2}});
  assert.equal(generated.report.valid,true);
  assert.equal(generated.materialConnectivity.components,1);
});

test('skin can be limited to a selected planar face',async()=>{
  const face=new Float32Array([12,-12,-12,12,12,-12,12,12,12,12,-12,-12,12,12,12,12,-12,12]);
  let generated;
  globalThis.self??={};self.postMessage=message=>{if(message.type==='done')generated=message;};
  await import('../src/lattice-worker.js');
  self.onmessage({data:{kind:'cube',bounds:{min:[-12,-12,-12],max:[12,12,12]},pattern:'gyroid',cell:10,wall:.4,skin:1.2,quality:'draft',selectedSkin:{faces:[face]}}});
  assert.equal(generated.report.valid,true);
  assert.equal(generated.selectedSkinFaceCount,1);
  assert.equal(generated.materialConnectivity.components,1);
  generated=undefined;
  self.onmessage({data:{kind:'cube',bounds:{min:[-12,-12,-12],max:[12,12,12]},pattern:'gyroid',cell:10,wall:.4,skin:1.2,rim:1.2,quality:'draft',selectedSkin:{faces:[face]}}});
  assert.equal(generated.report.valid,true);
  assert.equal(generated.materialConnectivity.components,1);
  assert.equal(generated.rim,1.2);
});

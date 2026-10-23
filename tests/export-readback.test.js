import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STLExporter} from 'three/addons/exporters/STLExporter.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {unzipSync,strFromU8} from 'fflate';
import {create3MF} from '../src/three-mf.js';
import {prepareMesh} from '../src/mesh-quality.js';

test('generated lattice survives STL and 3MF serialization with millimetre dimensions',async()=>{
  let generated;
  globalThis.self={postMessage(message){if(message.type==='done')generated=message;}};
  await import('../src/lattice-worker.js');
  self.onmessage({data:{kind:'cube',bounds:{min:[-10,-10,-10],max:[10,10,10]},pattern:'gyroid',cell:8,wall:.34,quality:'draft'}});
  assert.equal(generated.report.valid,true);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(generated.positions,3));
  geometry.computeVertexNormals();
  const originalBox=new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));

  const stl=new STLExporter().parse(new THREE.Mesh(geometry),{binary:true});
  const imported=new STLLoader().parse(stl.buffer).getAttribute('position').array;
  const checked=prepareMesh(new Float32Array(imported),{repair:false});
  assert.equal(checked.report.valid,true);
  assert.equal(checked.report.triangles,generated.triangleCount);
  const stlBox=new THREE.Box3().setFromArray(imported);
  for(const axis of ['x','y','z']){
    assert.ok(Math.abs(stlBox.min[axis]-originalBox.min[axis])<1e-4,axis);
    assert.ok(Math.abs(stlBox.max[axis]-originalBox.max[axis])<1e-4,axis);
  }

  const files=unzipSync(create3MF(generated.positions));
  const xml=strFromU8(files['3D/3dmodel.model']);
  assert.match(xml,/<model unit="millimeter"/);
  assert.equal((xml.match(/<triangle v1=/g)||[]).length,generated.triangleCount);
  const vertices=[...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)];
  assert.ok(vertices.length>100);
  for(const [index,axis] of ['x','y','z'].entries()){
    let min=Infinity,max=-Infinity;
    for(const match of vertices){const value=Number(match[index+1]);min=Math.min(min,value);max=Math.max(max,value);}
    assert.ok(Math.abs(min-originalBox.min[axis])<1e-4,axis);
    assert.ok(Math.abs(max-originalBox.max[axis])<1e-4,axis);
  }
});

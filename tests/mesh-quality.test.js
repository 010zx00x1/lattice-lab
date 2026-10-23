import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { prepareMesh } from '../src/mesh-quality.js';
import { create3MF, unitScale3MF } from '../src/three-mf.js';
import {detectFaceGroups} from '../src/face-groups.js';
import {extractFaceTriangles} from '../src/face-boundary.js';
import { unzipSync, strFromU8 } from 'fflate';

const cube = () => new Float32Array(new THREE.BoxGeometry(40, 40, 40).toNonIndexed().getAttribute('position').array);

test('detects a closed cube and its physical volume', () => {
  const { report } = prepareMesh(cube(), { repair: false });
  assert.equal(report.valid, true);
  assert.equal(report.boundaryEdges, 0);
  assert.equal(report.components, 1);
  assert.ok(Math.abs(report.volumeMm3 - 64000) < 0.01);
});

test('repairs inconsistent face orientation', () => {
  const input = cube();
  for (let j = 0; j < 3; j++) [input[3 + j], input[6 + j]] = [input[6 + j], input[3 + j]];
  assert.equal(prepareMesh(input, { repair: false }).report.valid, false);
  const { report } = prepareMesh(input);
  assert.equal(report.valid, true);
  assert.ok(report.flippedTriangles + report.flippedShells > 0);
});

test('caps a small planar hole but blocks a missing full face', () => {
  const dense = new THREE.BoxGeometry(40, 40, 40, 10, 10, 10).toNonIndexed().getAttribute('position').array;
  const smallHole = new Float32Array(dense.slice(9));
  const fixed = prepareMesh(smallHole).report;
  assert.equal(fixed.valid, true);
  assert.equal(fixed.holesFilled, 1);
  const fullFaceMissing = new Float32Array(cube().slice(18));
  const blocked = prepareMesh(fullFaceMissing).report;
  assert.equal(blocked.valid, false);
  assert.equal(blocked.boundaryEdges, 4);
});

test('blocks non manifold input', () => {
  const mesh = cube();
  const duplicate = new Float32Array(mesh.length + 9);
  duplicate.set(mesh); duplicate.set(mesh.slice(0, 9), mesh.length);
  const { report } = prepareMesh(duplicate);
  assert.equal(report.valid, false);
  assert.ok(report.nonManifoldEdges > 0);
});

test('generated gyroid exports as one closed component after removing edge fragments', async () => {
  let generated;
  globalThis.self = { postMessage(message) { if (message.type === 'done') generated = message; } };
  await import('../src/lattice-worker.js');
  self.onmessage({ data: { kind: 'cube', bounds: { min: [-20, -20, -20], max: [20, 20, 20] }, pattern: 'gyroid', cell: 10, wall: 0.26, quality: 'draft' } });
  assert.ok(generated);
  assert.equal(generated.report.valid, true);
  assert.equal(generated.report.components, 1);
  assert.ok(generated.report.removedComponents > 0);
  assert.equal(generated.triangleCount, generated.positions.length / 9);
  // A triangulated CAD/STL solid takes the general scanline path rather than
  // the analytic cube path, including scanlines on shared face diagonals.
  self.onmessage({ data: { kind: 'mesh', positions: cube(), bounds: { min: [-20, -20, -20], max: [20, 20, 20] }, pattern: 'gyroid', cell: 10, wall: 0.26, quality: 'draft' } });
  assert.equal(generated.report.valid, true);
  assert.equal(generated.report.components, 1);
});

test('selected top face opens the skin and keeps the generated mesh valid', async()=>{
  let generated;
  globalThis.self.postMessage=message=>{if(message.type==='done')generated=message;};
  await import('../src/lattice-worker.js');
  const source=cube(),top=detectFaceGroups(source,30).find(group=>group.normal[2]>.9);
  const input={kind:'cube',bounds:{min:[-20,-20,-20],max:[20,20,20]},pattern:'gyroid',cell:10,wall:.26,quality:'draft',skin:2};
  const topArea=positions=>{
    let area=0;
    for(let i=0;i<positions.length;i+=9){
      if([2,5,8].some(offset=>Math.abs(positions[i+offset]-20)>1e-4))continue;
      const dx1=positions[i+3]-positions[i],dy1=positions[i+4]-positions[i+1],dx2=positions[i+6]-positions[i],dy2=positions[i+7]-positions[i+1];
      area+=Math.abs(dx1*dy2-dy1*dx2)/2;
    }
    return area;
  };
  self.onmessage({data:input});
  assert.equal(generated.materialConnectivity.components,1);
  const closedArea=topArea(generated.positions);
  self.onmessage({data:{...input,openSkin:{faces:[extractFaceTriangles(source,top.triangleIds)]}}});
  assert.equal(generated.report.valid,true);
  assert.equal(generated.openSkinFaceCount,1);
  assert.ok(topArea(generated.positions)<closedArea*.5);
});

test('3MF export has a valid package root, indexed triangles, and millimetre units', () => {
  const packageBytes = create3MF(cube());
  const files = unzipSync(packageBytes);
  assert.ok(files['[Content_Types].xml']);
  assert.ok(files['_rels/.rels']);
  const model = strFromU8(files['3D/3dmodel.model']);
  assert.match(model, /unit="millimeter"/);
  assert.equal((model.match(/<triangle /g) || []).length, 12);
  assert.equal((model.match(/<vertex /g) || []).length, 8);
  assert.equal(unitScale3MF(packageBytes.buffer), 1);
});

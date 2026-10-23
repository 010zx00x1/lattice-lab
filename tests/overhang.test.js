import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry} from 'three';
import {analyzeOverhang} from '../src/overhang.js';

test('flat build-plate face is excluded while a cube has no overhangs',()=>{
  const mesh=new BoxGeometry(20,20,20).toNonIndexed().getAttribute('position').array;
  const result=analyzeOverhang(mesh,'+Z',45);
  assert.equal(result.overhangAreaMm2,0);
  assert.ok(Math.abs(result.plateAreaMm2-400)<1e-4);
  assert.ok(Math.abs(result.totalAreaMm2-2400)<1e-4);
});

test('orientation and threshold change the descending surface classification',()=>{
  const mesh=new BoxGeometry(20,20,20).toNonIndexed().rotateX(Math.PI/4).getAttribute('position').array;
  const lenient=analyzeOverhang(mesh,'+Z',60);
  const strict=analyzeOverhang(mesh,'+Z',30);
  assert.equal(lenient.overhangAreaMm2,0);
  assert.ok(strict.overhangAreaMm2>300);
  assert.ok(strict.overhangFraction>0);
});

test('rejects invalid rules and coordinates',()=>{
  assert.throws(()=>analyzeOverhang(new Float32Array(9),'+Q',45));
  assert.throws(()=>analyzeOverhang(new Float32Array(9),'+Z',91));
  const invalid=new Float32Array(9);invalid[2]=NaN;
  assert.throws(()=>analyzeOverhang(invalid));
});

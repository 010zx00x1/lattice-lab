import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {detectFaceGroups,groupsFromFaceRanges} from '../src/face-groups.js';

test('cube has six planar face regions at 30 degrees',()=>{
  const cube=new THREE.BoxGeometry(40,40,40).toNonIndexed();
  const groups=detectFaceGroups(cube.getAttribute('position').array,30);
  assert.equal(groups.length,6);
  assert.ok(groups.every(group=>group.triangles===2&&Math.abs(group.areaMm2-1600)<1e-6));
});

test('a smooth sphere is one connected region at 30 degrees',()=>{
  const sphere=new THREE.SphereGeometry(22,32,20).toNonIndexed();
  const groups=detectFaceGroups(sphere.getAttribute('position').array,30);
  assert.equal(groups.length,1);
});

test('CAD face ranges retain the original triangle assignments and areas',()=>{
  const positions=new THREE.BoxGeometry(40,40,40).toNonIndexed().getAttribute('position').array;
  const ranges=Array.from({length:6},(_,i)=>({first:2*i,last:2*i+1,name:`CAD ${i+1}`}));
  const groups=groupsFromFaceRanges(positions,ranges);
  assert.equal(groups.length,6);
  assert.deepEqual(groups[2].triangleIds,[4,5]);
  assert.equal(groups[2].name,'CAD 3');
  assert.ok(groups.every(group=>Math.abs(group.areaMm2-1600)<1e-6));
  assert.throws(()=>groupsFromFaceRanges(positions,[{first:10,last:12}]));
});

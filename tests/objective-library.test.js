import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryCandidates,calibration} from '../src/objective-library.js';

test('calibration contains connected candidates from every periodic family',()=>{
  assert.equal(new Set(calibration.entries.map(row=>row.pattern)).size,13);
  for(const row of calibration.entries){
    assert.ok(row.density>0&&row.density<=1);
    assert.ok(row.relativeModulus>0);
    assert.ok(row.densityResolutionRange[0]<=row.density&&row.density<=row.densityResolutionRange[1]);
    assert.ok(row.modulusResolutionRange[0]<=row.relativeModulus+.0001&&row.relativeModulus<=row.modulusResolutionRange[1]+.0001);
  }
});

test('stiffness recommendation is conservative across the two resolutions and scales with material',()=>{
  const base=libraryCandidates({mode:'stiffness',target:900,materialModulusGPa:2.3});
  assert.ok(base.length>0);
  assert.ok(base.every(row=>row.stiffnessRangeMPa[0]>=900));
  const doubled=libraryCandidates({mode:'stiffness',target:1800,materialModulusGPa:4.6});
  assert.deepEqual(doubled.map(row=>[row.pattern,row.form,row.wall]),base.map(row=>[row.pattern,row.form,row.wall]));
  assert.deepEqual(libraryCandidates({mode:'stiffness',target:1e9,materialModulusGPa:2.3}),[]);
});

test('beam recommendations respect nominal minimum thickness',()=>{
  const candidates=libraryCandidates({mode:'density',target:30,materialModulusGPa:2.3,minimumThickness:3});
  assert.ok(candidates.every(row=>row.form!=='beam'||10*row.wall*.7>=3));
});

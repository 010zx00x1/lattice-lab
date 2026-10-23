import test from 'node:test';
import assert from 'node:assert/strict';
import {skinField} from '../src/skin-field.js';

test('a chosen face removes the skin band while distant faces keep it',()=>{
  assert.equal(skinField(2,0.5),1.5);
  assert.equal(skinField(2,0.5,0.5),-1.5);
  assert.ok(Math.abs(skinField(2,0.5,1.9)+0.1)<1e-10);
  assert.equal(skinField(2,0.5,3),1);
  assert.equal(skinField(0,0.5),-Infinity);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DesignHistory} from '../src/design-history.js';

test('design history undoes, redoes and discards a replaced branch',()=>{
  const history=new DesignHistory(3),start={wall:.2,zones:[]};history.reset(start);
  start.zones.push({wall:.4});
  history.push({wall:.3,zones:[]});history.push({wall:.4,zones:[]});
  assert.deepEqual(history.undo(),{wall:.3,zones:[]});
  history.push({wall:.35,zones:[]});
  assert.equal(history.redo(),null);
  assert.deepEqual(history.undo(),{wall:.3,zones:[]});
  assert.deepEqual(history.undo(),{wall:.2,zones:[]});
  assert.equal(history.undo(),null);
});

test('history limit retains recent edits',()=>{
  const history=new DesignHistory(2);history.reset({n:0});history.push({n:1});history.push({n:2});
  assert.deepEqual(history.undo(),{n:1});
  assert.equal(history.undo(),null);
});

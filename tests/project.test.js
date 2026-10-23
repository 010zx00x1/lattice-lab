import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,readProject} from '../src/project.js';

test('project stores source geometry and settings losslessly',()=>{
  const positions=new Float32Array([0,0,0,1,0,0,0,1,0]);
  const wallZones=[{type:'sphere',center:[0,0,0],size:10,wall:.4,blend:2}];
  const saved=createProject({positions,name:'pieza',type:'STL',settings:{pattern:'bcc',wall:.27,wallZones,skin:2,sourceScale:25.4,cadFaces:[{first:0,last:0,name:'Cara CAD'}],openSkinFaces:['0','4']}});
  const restored=readProject(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(Array.from(restored.positions),Array.from(positions));
  assert.equal(restored.settings.pattern,'bcc');
  assert.equal(restored.settings.sourceScale,25.4);
  assert.deepEqual(restored.settings.cadFaces,[{first:0,last:0,name:'Cara CAD'}]);
  assert.deepEqual(restored.settings.openSkinFaces,['0','4']);
  assert.deepEqual(restored.settings.wallZones,wallZones);
});

test('rejects damaged project geometry',()=>{
  const saved=createProject({positions:new Float32Array(9),settings:{}});
  saved.positions='AAAA';
  assert.throws(()=>readProject(saved));
});

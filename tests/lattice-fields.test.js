import test from 'node:test';
import assert from 'node:assert/strict';
import {latticeField} from '../src/tpms.js';

test('each beam cell has solid struts and periodic values',()=>{
  for(const pattern of ['cubic','bcc','fcc','octa','octet']){
    const atNode=pattern==='octa'?latticeField(0,5,5,pattern,10,.3):latticeField(0,0,0,pattern,10,.3);
    assert.ok(atNode>0,`${pattern} node`);
    const a=latticeField(1.3,2.7,3.1,pattern,10,.3);
    const b=latticeField(11.3,2.7,3.1,pattern,10,.3);
    assert.ok(Math.abs(a-b)<1e-9,`${pattern} periodic`);
  }
});

test('beam thickness increases solid region',()=>{
  for(const pattern of ['cubic','bcc','fcc','octa','octet']){
    const thin=latticeField(1.2,1.1,1.4,pattern,10,.15);
    const thick=latticeField(1.2,1.1,1.4,pattern,10,.45);
    assert.ok(thick>thin,pattern);
  }
});

test('seeded Voronoi foam is repeatable, irregular, and contains walls and pores',()=>{
  const samples=[];
  for(let z=0;z<18;z+=3)for(let y=0;y<18;y+=3)for(let x=0;x<18;x+=3)samples.push(latticeField(x+.7,y+1.1,z+1.3,'voronoi',10,.26,17));
  assert.ok(samples.some(v=>v>0));
  assert.ok(samples.some(v=>v<0));
  assert.equal(latticeField(8.1,5.2,3.7,'voronoi',10,.26,17),latticeField(8.1,5.2,3.7,'voronoi',10,.26,17));
  assert.notEqual(latticeField(8.1,5.2,3.7,'voronoi',10,.26,17),latticeField(8.1,5.2,3.7,'voronoi',10,.26,18));
});

test('stochastic approximations respond to their seed and contain solid and pore regions',()=>{
  for(const pattern of ['voronoi-bars','delaunay-bars','spinodal']){
    const values=[];
    for(let z=0;z<20;z+=2.5)for(let y=0;y<20;y+=2.5)for(let x=0;x<20;x+=2.5)values.push(latticeField(x+.27,y+.43,z+.11,pattern,10,.4,4));
    assert.ok(values.some(value=>value>0),`${pattern} solid`);
    assert.ok(values.some(value=>value<0),`${pattern} pore`);
    assert.equal(latticeField(3.1,5.2,7.3,pattern,10,.4,4),latticeField(3.1,5.2,7.3,pattern,10,.4,4));
    assert.notEqual(latticeField(3.1,5.2,7.3,pattern,10,.4,4),latticeField(3.1,5.2,7.3,pattern,10,.4,5));
  }
});

test('stochastic examples generate closed connected material with a shallow skin',async()=>{
  let generated;
  globalThis.self??={};
  self.postMessage=message=>{if(message.type==='done')generated=message;};
  await import('../src/lattice-worker.js');
  for(const pattern of ['voronoi-bars','delaunay-bars','spinodal']){
    generated=undefined;
    self.onmessage({data:{kind:'cube',bounds:{min:[-12,-12,-12],max:[12,12,12]},pattern,cell:10,wall:.4,seed:4,skin:1.2,quality:'draft'}});
    assert.ok(generated,pattern);
    assert.equal(generated.report.valid,true,pattern);
    assert.equal(generated.materialConnectivity.components,1,pattern);
  }
});

test('additional TPMS families are periodic and have both solid and pore regions',()=>{
  const signatures=[];
  for(const pattern of ['iwp','neovius','fks','frd','fcy']){
    const values=[];
    for(let z=0;z<7;z++)for(let y=0;y<7;y++)for(let x=0;x<7;x++)values.push(latticeField((x+.21)*10/7,(y+.37)*10/7,(z+.13)*10/7,pattern,10,.26));
    assert.ok(values.some(value=>value>0),`${pattern} solid`);
    assert.ok(values.some(value=>value<0),`${pattern} pore`);
    const sample=latticeField(1.3,2.7,3.1,pattern,10,.26);
    assert.ok(Math.abs(sample-latticeField(11.3,2.7,3.1,pattern,10,.26))<1e-9,`${pattern} periodic`);
    signatures.push(values.slice(0,12).map(value=>Math.round(value*100)).join(','));
  }
  assert.equal(new Set(signatures).size,5);
});

test('additional TPMS families produce closed connected material with tuned cube settings',async()=>{
  let generated;
  globalThis.self??={};
  self.postMessage=message=>{if(message.type==='done')generated=message;};
  await import('../src/lattice-worker.js');
  for(const [pattern,cell,wall] of [['iwp',9,.26],['neovius',10,.26],['fks',10,.26],['frd',8,.30],['fcy',10,.26]]){
    generated=undefined;
    self.onmessage({data:{kind:'cube',bounds:{min:[-20,-20,-20],max:[20,20,20]},pattern,cell,wall,skin:0,quality:'draft'}});
    assert.ok(generated,pattern);
    assert.equal(generated.report.valid,true,pattern);
    assert.equal(generated.materialConnectivity.components,1,pattern);
  }
});

test('TPMS network form differs from a sheet and produces connected material',async()=>{
  assert.notEqual(latticeField(1.3,2.7,3.1,'gyroid',10,.26,0,'sheet'),latticeField(1.3,2.7,3.1,'gyroid',10,.26,0,'network'));
  let generated;
  globalThis.self.postMessage=message=>{if(message.type==='done')generated=message;};
  await import('../src/lattice-worker.js');
  for(const [pattern,cell,wall] of [['gyroid',10,.26],['neovius',10,.34],['frd',8,.34]]){
    generated=undefined;
    self.onmessage({data:{kind:'cube',bounds:{min:[-20,-20,-20],max:[20,20,20]},pattern,form:'network',cell,wall,skin:0,quality:'draft'}});
    assert.ok(generated,pattern);
    assert.equal(generated.report.valid,true,pattern);
    assert.equal(generated.materialConnectivity.components,1,pattern);
  }
});

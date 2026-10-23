import test from 'node:test';
import assert from 'node:assert/strict';
import {solveThermal} from '../src/thermal-solver.js';

const bar={occupied:new Uint8Array(12*4*4).fill(1),nx:12,ny:4,nz:4,spacing:[2,2,2],conductivity:15,power:5,ambient:20,axis:0};

test('a solid bar follows Fourier conduction and balances input heat',()=>{
  const result=solveThermal(bar);
  const length=(bar.nx-1)*bar.spacing[0];
  const area=bar.ny*bar.spacing[1]*bar.nz*bar.spacing[2];
  const expected=bar.power*length/((bar.conductivity/1000)*area);
  assert.ok(Math.abs(result.meanHotRise/expected-1)<1e-5);
  assert.ok(Math.abs(result.heatFlow/bar.power-1)<1e-5);
  assert.ok(result.residual<1e-6);
});

test('temperature rise scales with power and inverse conductivity',()=>{
  const base=solveThermal(bar);
  const power=solveThermal({...bar,power:bar.power*2});
  const conductivity=solveThermal({...bar,conductivity:bar.conductivity*2});
  assert.ok(Math.abs(power.maxRise/base.maxRise-2)<1e-7);
  assert.ok(Math.abs(conductivity.maxRise/base.maxRise-.5)<1e-7);
});

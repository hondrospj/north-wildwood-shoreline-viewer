import test from 'node:test';
import assert from 'node:assert/strict';
import {yearColor} from '../core.mjs';

test('oldest shorelines are red, midpoint years are yellow, and newest shorelines are green',()=>{
  assert.equal(yearColor(1771,1771,2025),'rgb(239,68,68)');
  assert.equal(yearColor(1898,1771,2025),'rgb(250,204,21)');
  assert.equal(yearColor(2025,1771,2025),'rgb(34,197,94)');
});

test('intermediate colors follow calendar-year spacing, including unevenly recorded years',()=>{
  const colors=[1800,1850,1900,1950,2000].map(year=>yearColor(year,1800,2000));
  assert.deepEqual(colors,['rgb(239,68,68)','rgb(245,136,45)','rgb(250,204,21)','rgb(142,201,58)','rgb(34,197,94)']);
  const sparseYears=[1800,1850,2000], denseYears=[1800,1850,1900,1950,2000];
  assert.equal(yearColor(sparseYears[1],sparseYears[0],sparseYears.at(-1)),yearColor(denseYears[1],denseYears[0],denseYears.at(-1)));
});

test('years outside the archive clamp to its endpoints, and reversed bounds preserve chronological meaning',()=>{
  assert.equal(yearColor(1700,1771,2025),yearColor(1771,1771,2025));
  assert.equal(yearColor(2100,1771,2025),yearColor(2025,1771,2025));
  assert.equal(yearColor(1850,2000,1800),yearColor(1850,1800,2000));
  assert.equal(yearColor(2025,2025,2025),'rgb(34,197,94)');
});

test('invalid inputs use a neutral color rather than an invalid CSS value or a misleading age',()=>{
  for(const invalid of [undefined,null,NaN,Infinity,'',' ','unknown']){
    assert.equal(yearColor(invalid,1771,2025),'rgb(148,163,184)');
    assert.equal(yearColor(1900,invalid,2025),'rgb(148,163,184)');
    assert.equal(yearColor(1900,1771,invalid),'rgb(148,163,184)');
  }
  assert.equal(yearColor('2025','1771','2025'),'rgb(34,197,94)');
});

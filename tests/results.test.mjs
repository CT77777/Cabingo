import assert from 'node:assert/strict';
import {summarizeResult,parseBest,selectBest} from '../public/results.mjs';
const base={practice:false,endReason:'complete',grade:'clean',safetyErrors:0,mistakes:0,comfort:95,elapsed:60,tasks:[],hazards:[]};
for(const [patch,stars] of [[{},3],[{comfort:94},2],[{mistakes:1},2],[{safetyErrors:1},1],[{safetyErrors:2},0],[{endReason:'timeout'},0],[{practice:true},null]])assert.equal(summarizeResult({...base,...patch}).stars,stars);
assert.equal(summarizeResult({...base,practice:true}).record,null);
for(const raw of ['bad','null','{}','{"version":2}',JSON.stringify({version:1,stars:3,safetyErrors:0,comfort:101,elapsed:60}),JSON.stringify({version:1,stars:3,safetyErrors:0,comfort:95,elapsed:-1})])assert.equal(parseBest(raw),null);
const r=summarizeResult(base).record;assert.deepEqual(parseBest(JSON.stringify(r)),r);assert.equal(selectBest(r,{...r}),r);assert.equal(selectBest(r,{...r,elapsed:61}),r);assert.equal(selectBest(r,{...r,elapsed:59}).elapsed,59);
assert(summarizeResult({...base,safetyErrors:1}).advice.includes('安全'));
console.log('PASS rating boundaries, advice priority, practice isolation and best-record validation');

for(const patch of [{endReason:'timeout',grade:'incomplete'},{safetyErrors:2}])assert.equal(summarizeResult({...base,...patch}).record,null);
assert.equal(parseBest(JSON.stringify({...r,stars:0})),null,'discard legacy failed best record');

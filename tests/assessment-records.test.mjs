import assert from 'node:assert/strict';
import {ASSESSMENT_STORAGE_KEY,parseAssessmentBest,prepareAssessmentSave,selectAssessmentBest} from '../public/assessment-records.mjs';
const record=(patch={})=>({chapterId:'boarding',questionVersion:2,total:5,stars:3,incorrect:0,safetyErrors:0,elapsed:50,...patch});
assert.equal(ASSESSMENT_STORAGE_KEY,'cabingo-assessment-best-v1');
for(const raw of [null,'bad','[]','null','{}','{"version":9}'])assert.deepEqual(parseAssessmentBest(raw),{version:1,records:{}});
const first=prepareAssessmentSave(null,record());assert(first.updated&&first.writable);assert.equal(first.data.records['boarding:2'].elapsed,50);
for(const candidate of [record(),record({elapsed:60}),record({stars:2,incorrect:1,elapsed:10})]){
 const next=prepareAssessmentSave(first.raw,candidate);assert(!next.updated);assert.equal(next.raw,null);assert.deepEqual(next.data,first.data);
}
const faster=prepareAssessmentSave(first.raw,record({elapsed:49}));assert(faster.updated);assert.equal(faster.data.records['boarding:2'].elapsed,49);
const twoStars=record({stars:2,incorrect:1});assert.equal(selectAssessmentBest(twoStars,record()).stars,3);
const a=record({questionVersion:3,total:8,stars:1,incorrect:3}),b=record({questionVersion:3,total:8,stars:1,incorrect:2,elapsed:60});
assert.equal(selectAssessmentBest(a,b).incorrect,2,'fewer mistakes precede time');
let raw=first.raw;for(const candidate of [record({questionVersion:3}),record({chapterId:'preflight',total:6})])raw=prepareAssessmentSave(raw,candidate).raw;
assert.equal(Object.keys(parseAssessmentBest(raw).records).length,3,'chapters and question versions remain separate');
assert.equal(selectAssessmentBest(record(),record({questionVersion:3})).questionVersion,2);
for(const candidate of [record({stars:0}),record({safetyErrors:1}),record({incorrect:NaN}),record({elapsed:-1}),record({elapsed:91}),record({total:6}),record({chapterId:'__proto__'}),record({stars:2})]){
 const result=prepareAssessmentSave(first.raw,candidate);assert(!result.updated);assert.equal(result.raw,null);assert.deepEqual(result.data,first.data);
}
for(const source of ['{"version":2,"records":{},"future":true}','{"version":99}']){const result=prepareAssessmentSave(source,record());assert.equal(result.raw,null);assert(!result.writable);}
const malformed=JSON.stringify({version:1,records:{'boarding:2':record({stars:99}),'preflight:2':record({chapterId:'preflight',total:6}),'boarding:1':record()}});
assert.deepEqual(Object.keys(parseAssessmentBest(malformed).records),['preflight:2']);
// Always compare with the latest raw save rather than overwriting another tab's stronger record.
const latest=prepareAssessmentSave(first.raw,record({elapsed:30}));const stale=prepareAssessmentSave(latest.raw,record({elapsed:45}));assert(!stale.updated);assert.equal(stale.data.records['boarding:2'].elapsed,30);
console.log('PASS assessment records: validation, scoring invariants, better-only replacement, ties, chapter/version separation, future-schema protection and latest-save merge');
// Chapter 2 v4 stores points and overdue counts without replacing older rules.
const v4=(patch={})=>record({chapterId:'preflight',questionVersion:4,total:5,score:100,late:0,...patch});
const initialV4=prepareAssessmentSave(raw,v4());assert(initialV4.updated);assert.equal(initialV4.data.records['preflight:4'].score,100);assert(initialV4.data.records['preflight:2']);
const delayed=v4({score:90,late:1,stars:2,elapsed:10});assert.equal(selectAssessmentBest(delayed,v4({score:80,late:2,stars:2,elapsed:1})).score,90,'points precede speed');
assert.equal(selectAssessmentBest(v4({score:80,late:2,stars:2}),delayed).score,90);
for(const candidate of [v4({score:99}),v4({late:6}),v4({late:-1}),v4({score:90,late:1}),v4({score:100,late:1}),v4({total:6}),v4({score:0,late:5,incorrect:3,stars:1})])assert(!prepareAssessmentSave(initialV4.raw,candidate).updated);
const restored=prepareAssessmentSave(initialV4.raw,v4({elapsed:49}));assert(restored.updated);assert.equal(restored.data.records['preflight:4'].late,0);
console.log('PASS chapter 2 v4 record invariants, score ordering and legacy preservation');

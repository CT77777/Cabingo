import assert from 'node:assert/strict';
import {CHAPTERS,DEFAULT_CHAPTER_ID,getChapter} from '../public/chapters/index.mjs';
import {createState} from '../public/preflight.mjs';
assert.equal(DEFAULT_CHAPTER_ID,'preflight');assert.equal(CHAPTERS.length,9);
assert.equal(new Set(CHAPTERS.map(c=>c.id)).size,CHAPTERS.length);
assert.deepEqual(CHAPTERS.map(c=>c.order),[1,2,3,4,5,6,7,8,9]);
const preflight=getChapter('preflight');assert.equal(preflight.order,2);assert.equal(preflight.duration,100);assert.equal(preflight.handoffTokens,1);assert.equal(preflight.tasks.length,5);assert.equal(preflight.available,true);
assert.equal(getChapter('boarding').available,true);assert.equal(getChapter('__proto__'),null);assert.equal(getChapter(null),null);
assert(Object.isFrozen(CHAPTERS));assert(Object.isFrozen(preflight.tasks));assert(Object.isFrozen(preflight.tasks[0]));assert(Object.isFrozen(preflight.lessons.handoff));
const state=createState({seed:7});assert.equal(state.chapter,2);assert.equal(state.chapterId,'preflight');assert.equal(state.duration,100);assert.equal(state.handsOn,false);state.tasks[0].title='local only';assert.notEqual(preflight.tasks[0].title,'local only');
assert.equal(createState({chapterId:'boarding'}).duration,90);assert.throws(()=>createState({chapterId:'unknown'}),RangeError);

for(const chapter of CHAPTERS.filter(c=>c.available)){for(const key of ['code','phaseLabel','briefTitle','briefDescription'])assert.equal(typeof chapter[key],'string');assert.deepEqual([...chapter.tutorial].sort(),Object.keys(chapter.lessons).sort());}
console.log('PASS chapter registry ordering, immutable data, preflight identity and unsupported chapter guards');

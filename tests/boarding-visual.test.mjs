import assert from 'node:assert/strict';
import * as game from '../public/preflight.mjs';
import * as boarding from '../public/boarding.mjs';
import {passengerPose} from '../public/presentation.mjs';
const make=()=>{const s=game.createState({chapterId:'boarding',contextual:true,guidedBoarding:true,seed:7});game.start(s);return s;};
const s=make();assert.equal(s.lesson?.id,'boardingWelcome','guided chapter starts with a central welcome');
const original=JSON.stringify(s);for(let i=0;i<600;i++)game.tick(s,.1,{z:1});assert.equal(JSON.stringify(s),original);
game.dismissLesson(s);assert.equal(s.elapsed,0);s.player.z=2.2;game.tick(s,.1);game.interact(s);assert.equal(s.dialog.id,'guide');
const good=s.dialog.choices.findIndex(c=>c.good);assert.equal(game.choose(s,good),false,'observation precedes first judgement');
assert(boarding.inspectBoardingClue(s,'pass'));assert.equal(game.choose(s,good),false);assert(boarding.inspectBoardingClue(s,'map'));
const before={safety:s.safety,comfort:s.comfort,completed:s.completed};assert(game.choose(s,good));assert.equal(s.events.filter(e=>e.type==='correct').length,1);assert.deepEqual({safety:s.safety,comfort:s.comfort,completed:s.completed},before);assert(!game.choose(s,good));
for(let i=0;i<20;i++)game.tick(s,.1);assert(s.tasks.find(t=>t.id==='guide').done);assert(s.boarding.actors.filter(a=>a.status==='pending').length===5,'extra traffic waits for teaching to finish');
const ready=make();game.dismissLesson(ready);ready.boarding.tutorialStep=3;ready.player.z=8.3;game.tick(ready,.1);assert.equal(ready.lesson?.id,'boardingReady');assert(!ready.boarding.formal);assert.equal(ready.elapsed,0);game.dismissLesson(ready);assert(ready.boarding.formal);assert.equal(ready.boarding.time,0,'formal arrivals begin a fresh staggered timeline');assert.equal(ready.elapsed,0);game.tick(ready,.1);assert.equal(ready.elapsed,.1);
for(const variant of [0,1,2]){const evidence=boarding.boardingEvidence({id:'seat',variant});assert.equal(evidence[0].kind,'pass');assert.equal(evidence[1].kind,'pass');assert.equal(evidence[2].kind,'map');assert.equal(evidence[1].seat,['5C','4B','4C'][variant]);assert.equal(evidence[1].day,variant===2?16:15);assert(!evidence.some(e=>e.value?.includes('右側')));}
const happy=passengerPose({reaction:{type:'correct',age:.2}}),neutral=passengerPose();assert(happy.smile>.7);assert(happy.rightArmX<-.3);assert.notEqual(happy.headX,neutral.headX);
const reduced=passengerPose({reaction:{type:'correct',age:.2},reducedMotion:true});assert(reduced.smile>.7);assert.equal(reduced.headX,passengerPose({reducedMotion:true}).headX);
console.log('PASS visual evidence, guided observation gates, safe teaching, manual countdown start and happy correct reaction');

const {createBoardingEvidence}=await import('../public/boarding-ui.mjs');
const doc={createElement(tag){return {tag,children:[],dataset:{},attrs:{},className:'',textContent:'',append(...nodes){this.children.push(...nodes);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(){}};}};
const flatten=n=>[n.textContent,...n.children.flatMap(flatten)].filter(Boolean).join(' ');
for(const variant of [0,1,2]){const cards=createBoardingEvidence(doc,boarding.boardingEvidence({id:'seat',variant}));const text=cards.map(flatten).join(' ');assert(text.includes(['5C','4B','4C'][variant]));assert(text.includes(variant===2?'16 OCT':'15 OCT'));assert(!/右側|今日|明日/.test(text),'visual evidence presents fields instead of a judgement');assert(cards.every(c=>!('good' in c.dataset)));assert.equal(cards[2].children[1].children[0].children.map(n=>n.textContent).join(' '),'6 D C │ B A','map matches the screen camera with nose below');}
const back=createBoardingEvidence(doc,boarding.boardingEvidence({id:'guide'}),{interactive:true});assert.equal(back[0].dataset.revealed,'false');assert.equal(back[1].dataset.revealed,'false');
const face=createBoardingEvidence(doc,boarding.boardingEvidence({id:'guide'}),{interactive:true,examined:['pass']});assert.equal(face[0].dataset.revealed,'true');assert.equal(face[1].dataset.revealed,'false');
console.log('PASS graphic ticket dates, seat map orientation and deliberate reveal without answer markup');

assert.deepEqual(passengerPose({time:2,style:3,reaction:{type:'correct',age:5}}),passengerPose({time:2,style:3}),'celebration expires and normal idle returns');

assert.equal(passengerPose({mood:'waiting',reaction:{type:'mistake',age:5}}).browAngle,passengerPose({mood:'waiting'}).browAngle,'expired mistake returns to waiting mood');

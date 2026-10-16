// Legacy service-phase engine coverage; final-cabin-check.test.mjs covers the current preflight policy.
import assert from 'node:assert/strict';
import {joystickVector,countdownPresentation} from '../public/interaction.mjs';
assert.deepEqual(joystickVector(3,4,48),{x:0,y:0,knobX:3,knobY:4});
const a=joystickVector(48,0,48);assert.equal(a.x,1);assert.equal(a.y,0);
const b=joystickVector(100,-100,48);assert(Math.abs(Math.hypot(b.x,b.y)-1)<1e-9);assert(Math.abs(Math.hypot(b.knobX,b.knobY)-48)<1e-9);
assert.equal(joystickVector(NaN,0).x,0);
for(const status of ['briefing','finished'])assert.equal(countdownPresentation({status,duration:100,elapsed:80}).visible,false);
assert.equal(countdownPresentation({status:'playing',duration:100,elapsed:69.9}).visible,false);
assert.equal(countdownPresentation({status:'playing',duration:100,elapsed:70}).level,'warning');
assert.equal(countdownPresentation({status:'playing',duration:100,elapsed:90}).level,'critical');
assert.equal(countdownPresentation({status:'playing',practice:true,duration:100,elapsed:90}).visible,false);
console.log('PASS joystick deadzone/clamp/diagonal and countdown 30/10 second boundaries');
const game=await import('../public/preflight.mjs');
function startReady(s){s.phase='service-training';game.start(s);if(s.lesson?.id==='serviceIntro')game.dismissLesson(s);}
for(const practice of [false,true]){
 const s=game.createState({seed:1,contextual:true,practice});startReady(s);const t=s.tasks.find(t=>t.id==='belt');s.player.z=t.z-.8;game.interact(s);
 const order=s.dialog.choices.map(c=>c.id);game.choose(s,s.dialog.choices.findIndex(c=>!c.good));
 assert(s.recovery);assert.equal(s.recovery.ready,practice);assert.equal(s.lesson,null);
 if(!practice)for(let i=0;i<20;i++)game.tick(s,.1);
 assert(s.recovery.ready);const elapsed=s.elapsed;game.tick(s,.1);assert.equal(s.elapsed,elapsed);
 assert(game.ackRecovery(s));assert.deepEqual(s.dialog.choices.map(c=>c.id),order);assert.equal(s.safetyErrors,practice?0:1);
}
const s=game.createState({contextual:true});startReady(s);s.lessonSeen=['aisle'];s.elapsed=69.95;game.tick(s,.1);game.tick(s,.1);
assert.equal(s.events.filter(e=>e.type==='time-warning'&&e.detail.level===30).length,1);
s.elapsed=89.95;game.tick(s,.1);game.tick(s,.1);assert.equal(s.events.filter(e=>e.type==='time-warning'&&e.detail.level===10).length,1);
console.log('PASS centered recovery penalty/read freeze/retry order and one-shot time warnings');
const {serviceItemPose,passengerPose}=await import('../public/presentation.mjs');
const route={source:{x:.5,y:1.1,z:2},hand:{x:0,y:1.2,z:3},dest:{x:1.25,y:1.04,z:4}};
assert.deepEqual(serviceItemPose({...route,progress:.2}).item,route.source);
assert.deepEqual(serviceItemPose({...route,progress:1}).item,route.dest);
for(const p of [.2,.5,.7]){const before=serviceItemPose({...route,progress:p-1e-7}).item,after=serviceItemPose({...route,progress:p+1e-7}).item;assert(Math.hypot(before.x-after.x,before.y-after.y,before.z-after.z)<1e-5);}
assert.notEqual(passengerPose({mood:'waiting'}).browAngle,passengerPose({mood:'happy'}).browAngle);
assert.notEqual(passengerPose({mood:'curious'}).mouthScale,passengerPose({mood:'happy'}).mouthScale);
console.log('PASS item starts at visible container, continuous pickup/delivery and passenger expressions');
const fs=await import('node:fs');
for(const file of ['index.html','main.js','preflight.mjs','chapters/preflight.mjs']){
 const source=fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
 assert(!/按 E(?!nter|sc)/.test(source));assert(!source.includes('空白鍵nter'));assert(!source.includes('空白鍵sc'));assert(!source.includes('水杯出場'));assert(!source.includes('毯子起床'));
}
assert.equal(countdownPresentation({status:'playing',duration:100,elapsed:75}).visible,false);
const queued=game.createState({contextual:true});startReady(queued);const qb=queued.tasks.find(t=>t.id==='belt');queued.player.z=qb.z-.8;game.interact(queued);game.choose(queued,queued.dialog.choices.findIndex(c=>!c.good));queued.tasks.find(t=>t.id==='water').patience=.1;for(let i=0;i<20;i++)game.tick(queued,.1);assert(queued.recovery.ready);game.ackRecovery(queued);assert.equal(queued.lesson?.id,'aisle');
for(const practice of [true,false]){const q=game.createState({contextual:true,practice});startReady(q);q.tasks.find(t=>t.id==='bag').done=true;const t=q.tasks.find(t=>t.id==='water');q.player.z=t.z-.8;game.interact(q);game.choose(q,q.dialog.choices.findIndex(c=>c.id==='serve'));assert.equal(q.action.duration,3);for(let i=0;i<29;i++)game.tick(q,.1);assert(!t.done);game.tick(q,.1);assert(t.done);}

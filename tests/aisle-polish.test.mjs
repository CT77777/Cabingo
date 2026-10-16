import assert from 'node:assert/strict';
import * as game from '../public/preflight.mjs';
import {serviceTrayPresentation} from '../public/presentation.mjs';
function open(id,{variant=0,contextual=false}={}){const s=game.createState({seed:7,practice:true,contextual});game.start(s);const t=s.tasks.find(t=>t.id===id);t.active=true;t.variant=variant;s.player.z=t.z-.8;game.interact(s);return {s,t};}
for(const variant of [0,1]){const {s}=open('bag',{variant});const stow=s.dialog.choices.find(c=>c.id==='stow');assert(stow.good,'visible empty destination must accept generic stow');}
for(const property of ['token','busy']){const {s}=open('water');game.closeDialog(s);if(property==='token')s.handoffTokens=0;else s.handoffJob={taskId:'blanket',remaining:10};game.interact(s);assert(!s.dialog.choices.some(c=>c.handoff));}
const {s,t}=open('water');game.closeDialog(s);t.acknowledged=true;game.interact(s);assert(s.dialog.choices.some(c=>c.defer),'recording remains available until actually completed');
const {s:wait}=open('water');assert(wait.dialog.choices.find(c=>c.ack).label.includes('起飛後'));assert(!wait.dialog.choices.find(c=>c.ack).tags.some(t=>t.includes('12')));
for(const x of [-.5,0,.5])for(const angle of [-Math.PI/2,0,Math.PI/2,Math.PI]){const p={x,z:7,angle},q=serviceTrayPresentation(p);assert(Math.hypot(q.x-x,q.z-7)<=.5);assert((q.x-x)*Math.sin(angle)+(q.z-7)*Math.cos(angle)>0,'tray stays in front of crew');}
console.log('PASS stow follows visible bin, unavailable actions hidden, purposeful wait and handheld tray reach');
function returnFixture({contextual=true,practice=true,handsOn=true}={}){const s=game.createState({seed:7,practice,contextual,handsOn});game.start(s);while(s.lesson)game.dismissLesson(s);s.lessonSeen=['aisle','serviceIntro'];s.tasks.forEach(t=>t.patience=999);const t=s.tasks.find(t=>t.id==='water');s.hazards=[{id:'hazard-water',taskId:'water',row:t.row,x:0,z:t.z,done:false}];s.player.x=0;s.player.z=t.z-.9;game.updateNear(s);assert(game.interact(s));return s;}
for(const contextual of [true,false])for(const practice of [true,false]){
 const s=returnFixture({contextual,practice}),hazard=s.hazards[0],start={x:s.player.x,z:s.player.z};
 assert(!s.action.escort&&!s.action.interaction,'one deliberate interaction starts automatic return');
 assert.equal(game.interact(s),false,'repeat interaction cannot create another action');
 game.tick(s,.1,{x:1,z:1});assert(!hazard.done,'return is not instant');
 game.pause(s);const before=JSON.stringify(s);game.tick(s,.1);assert.equal(JSON.stringify(s),before,'pause freezes return');game.resume(s);
 let guard=0;while(s.action&&guard++<100)game.tick(s,.1,{x:1,z:1});
 assert(guard<100);assert(hazard.done);assert.deepEqual({x:s.player.x,z:s.player.z},start,'no movement required');
 assert(!s.tasks.find(t=>t.id==='water').done,'original service still pending');assert.equal(s.hazardsCleared,1);
 for(let i=0;i<10;i++)game.tick(s,.1);assert.equal(s.hazardsCleared,1);assert.equal(s.events.filter(e=>e.type==='hazard-clear').length,1);
}
const expired=returnFixture({practice:false});expired.elapsed=99.99;game.tick(expired,.1);assert.equal(expired.endReason,'timeout');assert(!expired.hazards[0].done);
console.log('PASS one-interaction return animation, frozen movement/pause, pending service, single credit and deadline');

const {s:trapped,t:waiting}=open('water');game.closeDialog(trapped);trapped.handoffTokens=0;waiting.acknowledged=true;game.interact(trapped);
const record=trapped.dialog.choices.find(c=>c.defer&&c.ack);assert(record&&record.good,'there is always a safe way to record a request without a handoff token');

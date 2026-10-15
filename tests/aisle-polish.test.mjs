import assert from 'node:assert/strict';
import * as game from '../public/preflight.mjs';
import {trolleyPresentation} from '../public/presentation.mjs';
function open(id,{variant=0,contextual=false}={}){const s=game.createState({seed:7,practice:true,contextual});game.start(s);const t=s.tasks.find(t=>t.id===id);t.active=true;t.variant=variant;s.player.z=t.z-.8;game.interact(s);return {s,t};}
for(const variant of [0,1]){const {s}=open('bag',{variant});const stow=s.dialog.choices.find(c=>c.id==='stow');assert(stow.good,'visible empty destination must accept generic stow');}
for(const property of ['token','busy']){const {s}=open('water');game.closeDialog(s);if(property==='token')s.handoffTokens=0;else s.handoffJob={taskId:'blanket',remaining:10};game.interact(s);assert(!s.dialog.choices.some(c=>c.handoff));}
const {s,t}=open('water');game.closeDialog(s);t.acknowledged=true;game.interact(s);assert(!s.dialog.choices.some(c=>c.ack));
const {s:wait}=open('water');assert(wait.dialog.choices.find(c=>c.ack).label.includes('先'));assert(!wait.dialog.choices.find(c=>c.ack).tags.some(t=>t.includes('12')));
for(const x of [-.5,0,.5])for(const angle of [-Math.PI/2,0,Math.PI/2,Math.PI]){const p={x,z:7,angle},q=trolleyPresentation(p);assert(Math.hypot(q.x-x,q.z-7)<=.5);}
console.log('PASS stow follows visible bin, unavailable actions hidden, purposeful wait and trolley reach');
function escortFixture(){const s=game.createState({seed:7,practice:true,contextual:true});game.start(s);while(s.lesson)game.dismissLesson(s);s.lessonSeen=['aisle','serviceIntro'];s.tasks.forEach(t=>t.patience=999);const t=s.tasks.find(t=>t.id==='water');s.hazards=[{id:'hazard-water',taskId:'water',row:t.row,x:0,z:t.z,done:false}];s.player.x=0;s.player.z=t.z-.9;game.updateNear(s);assert(game.interact(s));return s;}
const e=escortFixture();assert(e.action.escort,'contextual aisle interaction must permit physical escort');const hazard=e.hazards[0];for(let i=0;i<100;i++)game.tick(e,.1);assert(!hazard.done,'waiting never clears escort');
const goal=e.action.escort.goal;let guard=0;while(e.action&&guard++<300){game.tick(e,.02,{x:goal.x-e.player.x,z:goal.z-e.player.z});}assert(!e.action);assert(hazard.done);assert(e.player.z!==hazard.z-.9);
const frozen=escortFixture();game.pause(frozen);const before=JSON.stringify(frozen);game.tick(frozen,.1,{x:1,z:1});assert.equal(JSON.stringify(frozen),before);assert(game.cancelEscort(frozen));assert(!frozen.hazards[0].done);
console.log('PASS escort needs real movement, reaches a safe beacon, pauses and cancels without credit');
const expired=escortFixture();expired.practice=false;expired.elapsed=99.99;game.tick(expired,.1,{x:1,z:0});assert.equal(expired.endReason,'timeout');assert(!expired.hazards[0].done);
const leashed=escortFixture();const lh=leashed.hazards[0];leashed.player.z=lh.z-2.2;game.tick(leashed,.02);assert.equal(leashed.action,null);assert(!lh.done);
const blocked=escortFixture(),bg=blocked.action.escort.goal;blocked.hazards.push({id:'new-block',taskId:'blanket',x:0,z:bg.z,done:false});game.tick(blocked,.02);assert.equal(blocked.action,null);assert(!blocked.hazards[0].done);

const {s:trapped,t:waiting}=open('water');game.closeDialog(trapped);trapped.handoffTokens=0;waiting.acknowledged=true;game.interact(trapped);
const exit=trapped.dialog.choices.findIndex(c=>c.leave);assert(exit>=0,'blocked service retains a free safety-first exit');
const snapshot={elapsed:trapped.elapsed,safety:trapped.safety,comfort:trapped.comfort,mistakes:trapped.mistakes,safetyErrors:trapped.safetyErrors,servicePenalty:trapped.servicePenalty,patience:waiting.patience};assert(game.choose(trapped,exit));assert.equal(trapped.dialog,null);assert.equal(trapped.action,null);assert(!waiting.done);assert.deepEqual({elapsed:trapped.elapsed,safety:trapped.safety,comfort:trapped.comfort,mistakes:trapped.mistakes,safetyErrors:trapped.safetyErrors,servicePenalty:trapped.servicePenalty,patience:waiting.patience},snapshot);

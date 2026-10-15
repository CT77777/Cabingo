import assert from 'node:assert/strict';
import * as game from '../public/preflight.mjs';
const s=game.createState({seed:7,handsOn:true,practice:true});game.start(s);
const bag=s.tasks.find(t=>t.id==='bag');s.player.z=bag.z-.8;game.interact(s);game.choose(s,s.dialog.choices.findIndex(c=>c.good));
assert(s.action.interaction);const before=s.action.time;for(let i=0;i<100;i++)game.tick(s,.05);assert.equal(s.action.time,before,'idle time does not complete hands-on work');
let guard=0;while(s.action&&guard++<20){const step=s.action.interaction.steps[s.action.interaction.index];game.actionInput(s,'press');if(step.mode==='hold'){for(let i=0;i<14;i++)game.tick(s,.05);game.actionInput(s,'release');}}
assert(!s.action);assert(bag.done);assert(guard<20);
assert.equal(s.safetyErrors,0);
for(const id of ['bag','belt','tray'])for(let v=0;v<3;v++){const q=game.createState({seed:7,handsOn:true});game.start(q);const t=q.tasks.find(x=>x.id===id);t.variant=v;q.player.z=t.z-.8;game.interact(q);assert(q.dialog.choices.some(c=>c.humorous));assert.equal(q.dialog.choices.length,3);assert(q.dialog.choices.some(c=>c.good));}
console.log('PASS hands-on completion, idle gating and humorous-choice coverage');
// Every actual task and branch completes through deliberate steps.
function finishWork(s){let n=0;while(s.action&&n++<12){const i=s.action.interaction;assert(i);const step=i.steps[i.index];game.actionInput(s,'press');if(step.mode==='hold'){for(let j=0;j<14;j++)game.tick(s,.05);game.actionInput(s,'release');}}assert(!s.action);}
for(const id of ['bag','belt','tray','water','blanket','question'])for(let v=0;v<3;v++){
 const q=game.createState({seed:7,handsOn:true,practice:true});game.start(q);q.tasks.find(t=>t.id==='bag').done=id!=='bag';const t=q.tasks.find(x=>x.id===id);t.variant=v;t.active=true;q.player.z=t.z-.8;game.interact(q);game.choose(q,q.dialog.choices.findIndex(c=>c.good&&!c.handoff&&!c.ack));finishWork(q);assert(t.done,`${id}/${v}`);
}
const hold=game.createState({seed:7,handsOn:true,practice:true});game.start(hold);const b=hold.tasks.find(t=>t.id==='bag');b.variant=0;hold.player.z=b.z-.8;game.interact(hold);game.choose(hold,hold.dialog.choices.findIndex(c=>c.good));game.actionInput(hold,'press');game.tick(hold,.1);game.actionInput(hold,'release');assert(hold.action.interaction.retry);assert.equal(hold.action.interaction.index,0);assert.equal(hold.mistakes,0);game.actionInput(hold,'press');for(let n=0;n<25;n++)game.tick(hold,.05);game.actionInput(hold,'release');assert(hold.action.interaction.retry);game.actionInput(hold,'press');game.tick(hold,.1);game.pause(hold);assert(!hold.action.interaction.held);game.resume(hold);finishWork(hold);assert(b.done);
const handoff=game.createState({seed:7,handsOn:true,practice:true});game.start(handoff);const w=handoff.tasks.find(t=>t.id==='water');handoff.player.z=w.z-.8;game.interact(handoff);game.choose(handoff,handoff.dialog.choices.findIndex(c=>c.handoff));finishWork(handoff);assert(w.assigned);assert.equal(handoff.handoffJob.remaining,12);for(let n=0;n<240;n++)game.tick(handoff,.05);assert(w.done);assert.equal(handoff.handoffTokens,0);
console.log('PASS all hands-on task variants, early/late release, cancellation and background handoff');
const interrupted=game.createState({seed:7,handsOn:true});game.start(interrupted);const ib=interrupted.tasks.find(t=>t.id==='bag');ib.variant=0;interrupted.player.z=ib.z-.8;game.interact(interrupted);game.choose(interrupted,interrupted.dialog.choices.findIndex(c=>c.good));game.actionInput(interrupted,'press');interrupted.tasks.find(t=>t.id==='water').patience=.1;game.tick(interrupted,.1);assert.equal(interrupted.lesson?.id,'aisle');assert.equal(interrupted.action.interaction.held,false,'first lesson cancels a held action');game.actionInput(interrupted,'release');game.dismissLesson(interrupted);game.tick(interrupted,.1);assert.equal(interrupted.action.interaction.fill,0);finishWork(interrupted);assert(ib.done);

for(const id of ['belt','water']){
 const q=game.createState({seed:7,handsOn:true,practice:true});game.start(q);q.tasks.find(t=>t.id==='bag').done=true;const t=q.tasks.find(t=>t.id===id);t.variant=0;t.active=true;q.player.z=t.z-.8;game.interact(q);game.choose(q,q.dialog.choices.findIndex(c=>c.good&&!c.handoff&&!c.ack));game.actionInput(q,'press');game.actionInput(q,'press');for(let n=0;n<8;n++)game.tick(q,.05);assert(q.action.time/q.action.duration<.75,'hold cannot reach success before accepted release');game.actionInput(q,'release');assert(!t.done);finishWork(q);assert(t.done);
}
for(const id of ['bag','belt','tray']){
 const outcomes=new Set(),labels=new Map();for(let seed=1;seed<=40;seed++)for(let variant=0;variant<3;variant++){
  const q=game.createState({seed,handsOn:true});game.start(q);const t=q.tasks.find(t=>t.id===id);t.variant=variant;q.player.z=t.z-.8;game.interact(q);const funny=q.dialog.choices.find(c=>c.humorous);outcomes.add(funny.good);if(labels.has(funny.id))assert.equal(labels.get(funny.id),funny.label,'joke copy describes action, never reveals variant');labels.set(funny.id,funny.label);
 }assert.equal(outcomes.size,2,'humor can be correct or wrong');assert.equal(labels.size,3,'every action may receive humorous wording');
}

const cap=game.createState({seed:7,handsOn:true,practice:true});game.start(cap);cap.tasks.find(t=>t.id==='bag').done=true;const ct=cap.tasks.find(t=>t.id==='water');cap.player.z=ct.z-.8;game.interact(cap);game.choose(cap,cap.dialog.choices.findIndex(c=>c.id==='serve'));game.actionInput(cap,'press');game.actionInput(cap,'press');for(let n=0;n<24;n++)game.tick(cap,.05);assert(cap.action.time/cap.action.duration<=.725,'late release still cannot claim success');

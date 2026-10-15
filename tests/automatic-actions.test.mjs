import assert from 'node:assert/strict';
import * as game from '../public/preflight.mjs';
function finishWork(s){let n=0;while(s.action&&n++<600)game.tick(s,.05);assert(!s.action);}
for(const id of ['bag','belt','tray','water','blanket','question'])for(let v=0;v<3;v++){
 const q=game.createState({seed:7,practice:true});game.start(q);q.tasks.find(t=>t.id==='bag').done=id!=='bag';const t=q.tasks.find(x=>x.id===id);t.variant=v;t.active=true;q.player.z=t.z-.8;game.interact(q);
 assert(q.dialog.choices.every(c=>c.tags.every(tag=>!tag.includes('步操作'))));
 game.choose(q,q.dialog.choices.findIndex(c=>c.good&&!c.handoff&&!c.ack));assert(q.action);assert(!q.action.interaction);
 game.tick(q,.05);assert(!t.done,'processing retains its duration');game.pause(q);const time=q.action.time;game.tick(q,.1);assert.equal(q.action.time,time);game.resume(q);finishWork(q);assert(t.done,`${id}/${v}`);
}
const handoff=game.createState({seed:7,practice:true});game.start(handoff);const w=handoff.tasks.find(t=>t.id==='water');handoff.player.z=w.z-.8;game.interact(handoff);game.choose(handoff,handoff.dialog.choices.findIndex(c=>c.handoff));finishWork(handoff);assert(w.assigned);assert.equal(handoff.handoffJob.remaining,12);for(let n=0;n<240;n++)game.tick(handoff,.05);assert(w.done);assert.equal(handoff.handoffTokens,0);
for(const id of ['bag','belt','tray']){
 const outcomes=new Set(),labels=new Map();for(let seed=1;seed<=40;seed++)for(let variant=0;variant<3;variant++){
  const q=game.createState({seed,practice:true});game.start(q);const t=q.tasks.find(t=>t.id===id);t.variant=variant;q.player.z=t.z-.8;game.interact(q);const funny=q.dialog.choices.find(c=>c.humorous);outcomes.add(funny.good);if(labels.has(funny.id))assert.equal(labels.get(funny.id),funny.label,'joke copy describes action, never reveals variant');labels.set(funny.id,funny.label);
 }assert.equal(outcomes.size,2,'humor can be correct or wrong');assert.equal(labels.size,3,'every action may receive humorous wording');
}

console.log('PASS automatic task variants, pause, background handoff and humorous choices');

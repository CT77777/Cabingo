import assert from 'node:assert/strict';
import {createState,start,tick,interact,choose,closeDialog,pause,resume,canStand,chapterReady,targets,ackRecovery} from '../public/preflight.mjs';
import {boardingEvidence,boardingPassable,boardingTaskActor,boardingTaskComplete} from '../public/boarding.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
function create(seed=7,practice=false){const s=createState({chapterId:'boarding',seed,contextual:true,practice});start(s);return s;}
const steps=(s,n)=>{for(let i=0;i<n;i++)tick(s,.1);};
function walk(s,z,goalX=0){
 for(let i=0;i<600&&Math.hypot(s.player.x-goalX,s.player.z-z)>1.02;i++){
  const queue=[{x:s.player.x,z:s.player.z,path:[]}],seen=new Set();let route=null,escape=null;
  for(let j=0;j<queue.length&&j<20000;j++){
   const n=queue[j],key=`${n.x.toFixed(2)},${n.z.toFixed(2)}`;if(seen.has(key))continue;seen.add(key);
   if(Math.abs(n.x)>=1&&(!escape||n.path.length<escape.path.length))escape=n;
   if(Math.hypot(n.x-goalX,n.z-z)<=.96){route=n.path;break;}
   for(const [dx,dz] of [[0,.1],[0,-.1],[.1,0],[-.1,0]]){const x=n.x+dx,zz=n.z+dz;if(Math.abs(x)>2.75||!canStand(s,x,zz))continue;queue.push({x,z:zz,path:[...n.path,{x:dx,z:dz}]});}
  }
  if(!route?.length){if(escape?.path.length)route=escape.path;else{tick(s,.1);assert.notEqual(s.status,'finished','traffic must clear before deadline');continue;}}
  tick(s,.1/2.35,route[0]);assert.notEqual(s.status,'finished','route deadline');
 }
 assert(Math.hypot(s.player.x-goalX,s.player.z-z)<=1.02,`walk to ${z}, seed ${s.seed} at ${JSON.stringify(s.player)}`);
}
function complete(s,id){const t=s.tasks.find(t=>t.id===id);if(id==='seat'&&!s.boarding.formal)walk(s,9,.5);for(let i=0;i<250&&!targets(s).some(x=>x.id===id);i++)tick(s,.1);let opened=false;for(let attempt=0;attempt<20&&!opened;attempt++){const target=targets(s).find(x=>x.id===id);walk(s,target?.z??t.z,target?.x??0);opened=interact(s)&&s.dialog?.id===id;}assert(opened,`${id} opens`);assert.equal(s.dialog?.id,id);const good=s.dialog.choices.findIndex(c=>c.good);assert.equal(s.dialog.choices.filter(c=>c.good).length,1);choose(s,good);steps(s,25);assert(t.done,`${id} done`);}
const s=create();assert.equal(s.duration,90);assert.equal(s.handoffTokens,0);assert.equal(s.boarding.tutorialStep,0);steps(s,350);assert.equal(s.elapsed,0);assert.equal(s.safetyErrors,0);assert.equal(s.boarding.congestionEvents,0);assert(s.tasks.filter(t=>t.active&&!t.done).length<=3);
for(const stop of [pause,x=>{x.dialog={id:'guide'};},x=>{x.lesson={id:'test'};}]){const a=create();steps(a,10);stop(a);const before=copy(a);steps(a,30);assert.deepEqual(copy(a),before,'all actor/congestion clocks freeze');}
for(let seed=0;seed<30;seed++){
 const r=create(seed);const t=r.tasks.find(t=>t.id==='seat');assert.equal(boardingEvidence(t).length,3);const a=r.boarding.actors.find(a=>a.id==='seat-misread');assert.equal(t.variant===1?a.side:t.variant===2?a.departing:a.row,t.variant===1?'left':t.variant===2?true:4);
}
for(const reducedMotion of [false,true])for(const seed of [0,1,7])for(const slow of [false,true]){
 const r=create(seed);r.reducedMotion=reducedMotion;
 complete(r,'guide');if(slow)steps(r,310);assert.equal(r.boarding.tutorialStep,2);assert.equal(r.elapsed,0);
 complete(r,'bag');if(slow)steps(r,310);assert.equal(r.boarding.tutorialStep,3);assert.equal(r.elapsed,0);
 complete(r,'seat');assert(r.boarding.formal);complete(r,'family');walk(r,1.5);
 for(let i=0;i<300&&!chapterReady(r);i++)tick(r,.1);
 assert(chapterReady(r),`all seven actors must reach seat/exit: ${JSON.stringify(r.boarding.actors)}`);walk(r,1.5);interact(r);assert.equal(r.endReason,'complete');assert.equal(r.grade,'clean',`clean ${seed} slow${slow}`);assert.equal(r.boarding.congestionEvents,0);assert(r.elapsed<90);
}
// Formal-mode tutorial mistakes still use free recovery before the clock starts.
const teaching=create();teaching.player.z=2.2;tick(teaching,.1);interact(teaching);
assert.equal(teaching.dialog.id,'guide');choose(teaching,teaching.dialog.choices.findIndex(c=>!c.good));
assert(teaching.recovery.ready);const frozenTeaching=copy(teaching.boarding);steps(teaching,50);
assert.deepEqual(copy(teaching.boarding),frozenTeaching);assert.equal(teaching.elapsed,0);assert.equal(teaching.mistakes,0);assert.equal(teaching.safetyErrors,0);assert.equal(teaching.action,null);
assert(ackRecovery(teaching));choose(teaching,teaching.dialog.choices.findIndex(c=>c.good));steps(teaching,30);assert(teaching.tasks.find(t=>t.id==='guide').done);
// One dispute only; every variant must use the evidence, never the text's tone.
const variants=new Set();for(let seed=0;seed<30;seed++){
 const r=create(seed,true),t=r.tasks.find(t=>t.id==='seat');variants.add(t.variant);
 r.boarding.formal=true;r.boarding.tutorialStep=4;t.active=true;r.player.z=t.z-1;for(const a of r.boarding.actors)if(a.taskId==='seat'){a.status='waiting';a.z=9-(a.id==='seat-misread'?.75:0);}
 interact(r);assert.equal(r.dialog.id,'seat');assert.equal(r.dialog.choices.filter(c=>c.good).length,1);
 choose(r,r.dialog.choices.findIndex(c=>!c.good));assert(!t.done);assert(r.recovery.ready);ackRecovery(r);choose(r,r.dialog.choices.findIndex(c=>c.good));steps(r,25);assert(t.done);assert.equal(r.safetyErrors,0);assert.equal(r.tasks.filter(t=>t.id==='seat').length,1);
}assert.equal(variants.size,3);
const congestion=create();congestion.boarding.formal=true;for(const a of congestion.boarding.actors){a.status='waiting';a.hold=true;}steps(congestion,81);assert.equal(congestion.boarding.congestionEvents,1);const errors=congestion.safetyErrors;steps(congestion,100);assert.equal(congestion.safetyErrors,errors,'one penalty per congestion episode');for(const a of congestion.boarding.actors)a.status='seated';steps(congestion,1);assert.equal(congestion.boarding.congestionTime,0);for(const a of congestion.boarding.actors)a.status='waiting';steps(congestion,81);assert.equal(congestion.boarding.congestionEvents,2);
const collision=create(),a=boardingTaskActor(collision,'guide');assert(!canStand(collision,a.x,a.z));collision.player.x=a.x;collision.player.z=a.z;assert(boardingPassable(collision,a.x-.2,a.z),'overlap can escape');
const moving=create();moving.boarding.formal=true;const family=moving.tasks.find(t=>t.id==='family'),parent=moving.boarding.actors.find(a=>a.id==='parent');family.active=true;parent.status='walking';parent.z=6;moving.player.z=5.1;assert.equal(targets(moving).find(t=>t.id==='family').z,6);assert(interact(moving));assert.equal(moving.dialog.id,'family');
// Opposing traffic after a slow tutorial must drain without a permanent queue.
for(const seed of [0,1,7])for(const x of [-.5,0,.5]){const r=create(seed,true);r.player.z=8.2;r.player.x=.5;r.boarding.time=10;for(const id of ['guide','bag']){const t=r.tasks.find(t=>t.id===id);t.done=true;boardingTaskComplete(r,t);}steps(r,200);for(const id of ['seat','family']){const t=r.tasks.find(t=>t.id===id);t.done=true;boardingTaskComplete(r,t);}r.player.z=1.5;r.player.x=x;steps(r,600);assert(chapterReady(r),`opposing queue must drain for seed${seed}, crew x${x}: ${JSON.stringify(r.boarding.actors)}`);}
const heldBag=create();heldBag.player.z=8;const incoming=heldBag.boarding.actors[0];incoming.status='walking';incoming.hold=false;incoming.x=-.52;incoming.z=4;steps(heldBag,100);assert(incoming.z<=4.31,'queue must reserve clearance while bag owner is still on hold');
const edge=create(7);edge.boarding.tutorialStep=3;edge.player.x=.55;edge.player.z=7.95;for(const t of edge.tasks){t.active=true;if(['guide','bag'].includes(t.id))t.done=true;}for(const a of edge.boarding.actors)if(a.taskId==='seat'){a.status='waiting';a.z=a.id==='seat-owner'?9:8.25;a.x=a.id==='seat-owner'?.28:-.28;}assert(!targets(edge).some(t=>t.id==='seat'),'no formal task target outside the formal trigger');interact(edge);assert.equal(edge.dialog,null);tick(edge,.05,{x:0,z:1});assert(edge.boarding.formal);assert(targets(edge).some(t=>t.id==='seat'));
const retreat=create(7);for(const a of retreat.boarding.actors)a.status='seated';const lead=retreat.boarding.actors.find(a=>a.id==='seat-owner'),tail=retreat.boarding.actors.find(a=>a.id==='seat-misread');Object.assign(lead,{x:-.28,z:1.5,status:'walking',hold:true});Object.assign(tail,{x:.52,z:1.2,status:'walking',hold:true});retreat.player.x=.2;retreat.player.z=.9;tick(retreat,.1);assert(tail.z<=1.2,'retreat cannot bypass FIFO by advancing toward an earlier traveler');assert(lead.z>1.5);
const deadline=create();deadline.boarding.formal=true;deadline.elapsed=89.95;deadline.action={kind:'task',taskId:'seat',time:1.49,duration:1.5,choice:{}};tick(deadline,.1);assert.equal(deadline.endReason,'timeout');assert(!deadline.tasks.find(t=>t.id==='seat').done);
console.log('PASS boarding tutorial, full walking routes, paused traffic, three seat variants, congestion hysteresis, collisions, reduced motion and deadline');

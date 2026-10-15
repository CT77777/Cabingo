import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Real vendored Three geometry, materials and camera matrices; only WebGLRenderer
// is a spy. These are scene/projection checks, NOT GPU rendering or browser QA.
// The temporary .mjs copies avoid changing the existing CommonJS package type.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cabin-scene-test-'));
const source=fs.readFileSync(path.join(root,'public/scene.js'),'utf8');
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const report={kind:'real Three scene and projection with mocked WebGLRenderer',browserUsed:false,gpuRenderingVerified:false,sourceSha256:sha256(source),projectionCases:0,overviewCorners:0,nearbyRingPoints:0,variantCases:0,bagAnimationFrames:0,maxBagFrameTravel:0,checks:[]};
let lastScene,lastCamera,rendererDisposals=0,renderCount=0;
globalThis.__CabinMockRenderer=class {
  shadowMap={}; setPixelRatio(n){this.pixelRatio=n;} setSize(w,h){this.width=w;this.height=h;}
  render(scene,camera){lastScene=scene;lastCamera=camera;renderCount++;} dispose(){rendererDisposals++;}
};
const approx=(a,b,message='')=>assert(Math.abs(a-b)<1e-8,`${message}: ${a} versus ${b}`);
const object=name=>{const result=lastScene.getObjectByName(name);assert(result,`object ${name} exists`);return result;};
try {
  fs.copyFileSync(path.join(root,'public/boarding.mjs'),path.join(temp,'boarding.mjs'));
  fs.copyFileSync(path.join(root,'public/presentation.mjs'),path.join(temp,'presentation.mjs'));
  fs.copyFileSync(path.join(root,'public/vendor/three.core.min.js'),path.join(temp,'three.core.mjs'));
  fs.writeFileSync(path.join(temp,'three.module.mjs'),fs.readFileSync(path.join(root,'public/vendor/three.module.min.js'),'utf8').replaceAll('./three.core.min.js','./three.core.mjs'));
  const transformed=source.replace("import * as THREE from './vendor/three.module.min.js';","import * as Three from './three.module.mjs';\nconst THREE={...Three,WebGLRenderer:globalThis.__CabinMockRenderer};");
  assert.notEqual(transformed,source,'only scene renderer import is replaced');
  fs.writeFileSync(path.join(temp,'scene.mjs'),transformed);
  const {Box3,Vector3,PerspectiveCamera}=await import(pathToFileURL(path.join(temp,'three.core.mjs')));
  const {createCabinView,createProjectionCamera,projectGamePoint,screenInputToWorld,INTERACTION_RADIUS,CABIN_ROWS}=await import(pathToFileURL(path.join(temp,'scene.mjs')));
  assert.deepEqual(CABIN_ROWS,[3,5,7,9,11,13]);assert.equal(INTERACTION_RADIUS,1.1);
  assert.deepEqual(screenInputToWorld(1,1),{x:-1,z:1});
  for(const mode of ['follow','overview'])for(const aspect of [.7,1,1.6,2.2])for(const z of [1.5,7,13,15]) {
    const camera=createProjectionCamera(mode,{z},aspect),width=800*aspect,height=800;
    const center=projectGamePoint(camera,{x:0,y:.13,z},width,height);
    const right=projectGamePoint(camera,{x:-.3,y:.13,z},width,height);
    const up=projectGamePoint(camera,{x:0,y:.13,z:z+.3},width,height);
    assert(right.x>center.x,`${mode} screen-right is -x`);assert(up.y<center.y,`${mode} screen-up is +z`);approx(camera.position.x,0);report.projectionCases++;
    if(mode==='overview')for(const x of [-3,3])for(const end of [0,16]) {
      assert(projectGamePoint(camera,{x,y:.13,z:end},width,height).visible,`overview includes cabin end ${aspect},${x},${end}`);report.overviewCorners++;
    }
    if(mode==='follow')for(const targetZ of [z-.95,z+.95])for(const x of [-1.1,1.1]) {
      assert(projectGamePoint(camera,{x,y:.15,z:targetZ},width,height).visible,`follow includes nearby ring ${aspect},${z}`);report.nearbyRingPoints++;
    }
  }
  report.checks.push('Both exact-centreline cameras preserve screen-relative controls','Overview includes the entire 6 × 16 cabin; follow includes nearby interaction ring');
  const handlers={},canvas={clientWidth:1000,clientHeight:700,addEventListener(n,f){handlers[n]=f;},removeEventListener(n){delete handlers[n];}};
  let lost=0;const view=createCabinView(canvas,{onContextLost(){lost++;}});
  const makeState=(variant=0,side='left',z=7)=>({status:'playing',player:{x:0,z:z-.9,angle:0,step:0},cameraMode:'follow',tasks:[
    {id:'bag',row:(z-3)/2,z,side,variant,active:true,done:false},
    {id:'belt',row:3,z:9,side,variant,active:true,done:false},
    {id:'tray',row:4,z:11,side,variant,active:true,done:false},
    {id:'water',row:0,z:3,side:'right',active:true,done:false},
    {id:'blanket',row:1,z:5,side:'left',active:true,done:false},
    {id:'question',row:5,z:13,side:'right',active:true,done:false}],
    hazards:[{id:'hazard-water',taskId:'water',z:4.2,done:false}],near:'bag',renderTargets:[
      {id:'bag',x:0,z,kind:'safety',label:'行李',active:true},
      {id:'belt',x:0,z:9,kind:'safety',label:'安全帶',active:true},
      {id:'tray',x:0,z:11,kind:'safety',label:'餐桌',active:true},
      {id:'water',x:0,z:3,kind:'service',label:'水',active:true},
      {id:'hazard-water',x:0,z:4.2,kind:'hazard',label:'走道旅客',active:true}]});
  view.render(makeState(),.016);
  const passengers=[];lastScene.traverse(o=>{if(/^passenger-\d+-\d+$/.test(o.name))passengers.push(o);});
  assert.equal(passengers.length,24,'24 articulated passengers');
  const head=object('passenger-0-0').getObjectByName('head');const beforeHead=head.rotation.y;
  view.render(makeState(),.8);assert.notEqual(head.rotation.y,beforeHead,'idle animation changes');
  const paused=makeState();paused.status='paused';view.render(paused,.1);const frozenHead=head.rotation.y;view.render(paused,1);approx(head.rotation.y,frozenHead);
  let previousBagGroup=null,oldObjectiveDisposed=0;
  for(const side of ['left','right'])for(const variant of [0,1,2])for(const z of [3,7,13]) {
    const s=makeState(variant,side,z),result=view.render(s,.016);
    assert.equal(result.selectedId,'bag');assert(result.labels.length>=5);
    const evidenceLabels=result.labels.filter(l=>l.kind==='detail').map(l=>l.text);
    assert.deepEqual(evidenceLabels,variant===0?['空櫃']:variant===1?['已滿','可用空櫃']:['已收妥']);
    for(const label of result.labels) {
      assert.equal(typeof label.id,'string');assert.equal(typeof label.text,'string');assert.equal(typeof label.visible,'boolean');assert.equal(typeof label.near,'boolean');assert(Number.isFinite(label.x)&&Number.isFinite(label.y));
    }
    const ring=object('interaction-radius-1.1');assert.equal(ring.geometry.parameters.outerRadius,1.1);approx(ring.scale.x,1);approx(ring.position.x,0);approx(ring.position.z,z);
    let rings=0;lastScene.traverse(o=>{if(o.geometry?.type==='RingGeometry')rings++;});assert.equal(rings,1,'only one interaction ring');
    const bagGroup=object('objective-bag');if(previousBagGroup)assert.equal(previousBagGroup.parent,null,'old variant/row detached');previousBagGroup=bagGroup;
    lastScene.updateMatrixWorld(true);
    for(const name of ['available-bin','full-bin']){const bin=bagGroup.getObjectByName(name);if(bin){const bounds=new Box3().setFromObject(bin);assert(bounds.min.x>=-3.1&&bounds.max.x<=3.1,'bin and open door stay inside cabin');}}
    const bag=object('task-luggage');approx(bag.position.y,variant===2?2.43:.46);if(variant!==2)approx(bag.position.x,0,'floor bag matches collision centre');
    assert.equal(Boolean(bagGroup.getObjectByName('full-bin')),variant===1);
    assert.equal(object('unfastened-belt').visible,variant!==2);assert.equal(object('fastened-belt').visible,variant===2);
    assert.equal(object('passenger-phone').visible,variant===0);assert.equal(object('belt-picture-card').visible,variant===1);
    assert.equal(object('tray-objects').visible,variant===1);assert.equal(object('cup-in-hand').visible,variant===1);
    approx(object('folding-tray').rotation.x,variant===2?-Math.PI/2:0);
    let glows=0;bagGroup.traverse(o=>{if(o.material?.emissive?.getHex()&&o.material.emissiveIntensity>.3){glows++;o.material.addEventListener('dispose',()=>oldObjectiveDisposed++);}});assert(glows>0,'selected bag glows');
    for(const id of ['belt','tray','water','blanket','question']) object(`objective-${id}`).traverse(o=>{if(o.material?.emissive?.getHex())assert(o.material.emissiveIntensity===0||o.material.emissiveIntensity===.3,'unselected objective has no selection glow');});
    assert.equal(lastScene.children.filter(n=>n.name==='objective-bag').length,1);report.variantCases++;
  }
  assert(oldObjectiveDisposed>0,'per-object materials disposed when variants/rows change');
  report.checks.push('All three variants on both cabin sides at front, middle and rear rows have correct visible cues','Single ring outer radius exactly 1.1 with no scaling; selected-object emissive cue','DOM label contract uses finite CSS-pixel positions, visible/near flags and physical-bin evidence');
  for(const side of ['left','right'])for(const variant of [0,1]) {
    const s=makeState(variant,side);s.action={kind:'task',taskId:'bag',time:0,duration:6};
    let previous=null;
    for(let i=0;i<=360;i++) {
      s.action.time=i/60;view.render(s,1/60);const p=object('task-luggage').position.clone();
      if(previous)report.maxBagFrameTravel=Math.max(report.maxBagFrameTravel,p.distanceTo(previous));previous=p;report.bagAnimationFrames++;
      if(i===180)for(const mode of ['paused','dialog','lesson']) {
        const before=object('task-luggage').position.clone(),cameraBefore=lastCamera.position.clone();
        if(mode==='paused')s.status='paused';else s[mode]={id:'bag'};
        view.render(s,10);assert(object('task-luggage').position.equals(before),`bag frozen by ${mode}`);if(mode!=='dialog')assert(lastCamera.position.equals(cameraBefore),`camera frozen by ${mode}`);
        s.status='playing';s.dialog=null;s.lesson=null;
      }
    }
    const bag=object('task-luggage'),destinationSide=(side==='left'?-1:1)*(variant===1?-1:1);
    approx(bag.position.x,destinationSide*2.3);approx(bag.position.y,2.43);approx(bag.position.z,7);
    approx(object('available-bin').getObjectByName('bin-door').rotation.z,0,'destination door closed');
    assert(new Box3().setFromObject(object('available-bin')).containsBox(new Box3().setFromObject(bag)),'scaled bag fits inside compact closed bin');
    s.tasks[0].done=true;s.action=null;view.render(s,.016);approx(bag.position.x,destinationSide*2.3,'completed bag retained');
  }
  assert(report.maxBagFrameTravel<.04,'no bag teleport between 60fps frames');
  report.checks.push('Continuous lift → travel → placement → door closure for both sides and both unstowed variants','Paused, dialog and lesson frames freeze bag positions and camera easing','Stowed bag remains inside the closed destination bin after action ends');
  for(const variant of [0,1,2]) {
    const q=makeState();q.tasks.find(t=>t.id==='question').variant=variant;q.near='question';q.player.z=12.2;
    q.renderTargets.push({id:'question',x:0,z:13,kind:'service',label:'何時出發',active:true});
    const result=view.render(q,.016),board=result.labels.find(l=>l.id==='question-board');
    assert(board,'selected information board has DOM evidence');assert.equal(board.text,variant===0?'尚無確認預估':'預估稍後 · 可能調整');
    assert.equal(board.kind,'detail');assert(Number.isFinite(board.x)&&Number.isFinite(board.y));
  }
  report.checks.push('Question-board evidence matches all three information variants; bag-bin labels match visible storage state');
  const s=makeState();view.render(s,.016);assert(lastScene.children.filter(o=>o.isLight).length>=3,'lit scene');
  s.action={kind:'clear-hazard',taskId:'water',hazardId:'hazard-water',time:0,duration:5};
  assert.equal(view.render(s,.016).selectedId,'hazard-water');approx(object('interaction-radius-1.1').position.z,4.2);
  s.action=null;s.hazards[0].done=true;view.render(s,.016);assert.equal(object('standing-hazard-water').visible,false);
  // Freeze walking pose even if a caller accidentally changes its step counter.
  s.player.walking=true;s.player.step=1;view.render(s,.016);
  const crew=object('player'),body=crew.children[0],bodyY=body.position.y;
  for(const mode of ['paused','dialog','lesson']) {
    if(mode==='paused')s.status='paused';else s[mode]={id:'test'};
    s.player.step+=1;view.render(s,.016);approx(body.position.y,bodyY,`walking pose frozen by ${mode}`);
    s.status='playing';s.dialog=null;s.lesson=null;
  }
  s.reducedMotion=true;view.render(s,.016);approx(body.position.y,0,'reduced motion removes walk bob');
  const {decisionPose}=await import(pathToFileURL(path.join(temp,'presentation.mjs')));
  for(const aspect of [390/844,1272/807])for(const side of ['left','right']){
    const pose=decisionPose({player:{x:0,z:6},task:{id:'bag',z:7,side,variant:1},aspect});
    const c=new PerspectiveCamera(pose.fov,aspect,.1,110);c.position.set(...pose.position);c.lookAt(...pose.target);c.updateMatrixWorld();
    for(const point of [[0,.46,7],[-2.3,3,7],[2.3,3,7]]){const v=new Vector3(...point).project(c);assert(Math.abs(v.x)<.95);assert((1-v.y)/2<.58,'bag evidence above bottom choice panel');assert((1-v.y)/2>.13,'evidence below top HUD');}
  }
  const checkOnly=makeState(2);checkOnly.action={id:33,kind:'task',taskId:'bag',time:2,duration:4,choice:{id:'check'}};
  view.render(checkOnly,.016);
  const checkingCrew=object('player').children[0];assert(Math.abs(checkingCrew.children.find(o=>o.type==='Group'&&o.position.x<0)?.rotation.x||0)<.7,'checking stowed bag does not lift arms overhead');
  const attending=object('passenger-2-1').getObjectByName('head');
  assert(attending.rotation.y<0,'left-side passenger looks right toward aisle crew');
  const reactionState=makeState();reactionState.runId='reaction-test';reactionState.events=[{seq:1,type:'mistake',taskId:'bag'}];view.render(reactionState,0);const headBefore=object('passenger-2-1').getObjectByName('head').rotation.y;view.render(reactionState,.1);assert.notEqual(object('passenger-2-1').getObjectByName('head').rotation.y,headBefore,'selected passenger still shakes head on mistake');
  const closeup=makeState();closeup.dialog={id:'bag'};const elapsedBefore=closeup.elapsed;
  for(let i=0;i<40;i++)view.render(closeup,1/60);
  assert.notEqual(lastCamera.position.x,0,'safety decision moves to shoulder view while reading');
  assert.equal(closeup.elapsed,elapsedBefore);
  assert.equal(typeof view.getScreenPosition,'function');
  const pinned=view.render(makeState(),.016).labels.find(l=>l.id==='bag');
  assert.equal(pinned.anchor.x,-1.25,'task label anchored at passenger');
  const headAnchor=object('passenger-2-1').getObjectByName('head').getWorldPosition(new Vector3());approx(pinned.anchor.y,headAnchor.y+.31,'anchor follows the animated head');
  const hiddenReport=view.render({...makeState(),player:{x:0,z:12,angle:0,step:0}},.016).labels;assert(!hiddenReport.some(l=>l.id==='report'),'distant report marker does not cover crew');
  view.render(closeup,.016);const fadeMaterial=object('available-bin').children.find(o=>o.material).material;assert(fadeMaterial.version>0,'fade invalidates opaque shader');const fadeVersion=fadeMaterial.version;view.render(closeup,.016);assert.equal(fadeMaterial.version,fadeVersion,'do not invalidate shader every frame');assert(object('available-bin').children.some(o=>o.material?.opacity<1),'bin fades in safety closeup');
  view.render(makeState(),.016);assert(object('available-bin').children.filter(o=>o.material).every(o=>o.material.opacity===1),'bin opacity restores after closeup');
  const deliveryState=makeState();deliveryState.action={id:77,kind:'task',taskId:'water',time:4,duration:8,choice:{id:'serve'}};
  deliveryState.action.time=0;view.render(deliveryState,.016);assert(object('service-trolley').visible);assert(object('galley-supply').visible);const initialCup=object('delivery-water');approx(initialCup.position.x,.5,'item begins at trolley');approx(initialCup.position.z,deliveryState.player.z-.6,'item begins inside source beside player');deliveryState.action.time=4;
  view.render(deliveryState,.016);const cup=object('delivery-water');assert(cup.visible);const cupAt=cup.position.clone();
  deliveryState.status='paused';view.render(deliveryState,1);assert(cup.position.equals(cupAt));
  deliveryState.status='playing';deliveryState.action=null;deliveryState.tasks.find(t=>t.id==='water').done=true;view.render(deliveryState,.016);assert(cup.visible);approx(cup.position.x,1.25);
  const colleagueState=makeState();colleagueState.elapsed=4;colleagueState.handoffJob={taskId:'water',remaining:7};
  view.render(colleagueState,.016);const colleague=object('coworker'),at=colleague.position.clone();assert(at.z>.7&&at.z<2.4);assert(object('delivery-water').visible);
  colleagueState.status='paused';view.render(colleagueState,1);assert(colleague.position.equals(at));
  colleagueState.status='playing';colleagueState.handoffJob.remaining=.5;view.render(colleagueState,.016);assert(object('delivery-water').visible);
  colleagueState.handoffJob=null;const delegatedWater=colleagueState.tasks.find(t=>t.id==='water');delegatedWater.done=true;delegatedWater.handoff=true;delegatedWater.completedAt=12;colleagueState.elapsed=12;const completedLabels=view.render(colleagueState,.016).labels;assert(completedLabels.some(l=>l.id==='coworker'&&l.text.includes('已送達')));
  colleagueState.elapsed=22;assert(!view.render(colleagueState,.016).labels.some(l=>l.id==='coworker'),'settled colleague does not block report labels');
  const engine=await import(pathToFileURL(path.join(root,'public/preflight.mjs')));
  const boarding=engine.createState({chapterId:'boarding',seed:7,contextual:true});engine.start(boarding);boarding.renderTargets=engine.targets(boarding);view.render(boarding,.016);
  const walker=object('boarding-walking-elder');assert(walker.visible);approx(walker.position.z,3);assert(!object('returning-elder').visible);
  boarding.player.z=2;engine.interact(boarding);const visibleClues=view.render(boarding,.016).labels;assert(visibleClues.some(l=>l.id==='boarding-pass-0'&&l.text.includes('3C')));
  const frozenBoarding=JSON.stringify(boarding.boarding);view.render(boarding,1);assert.equal(JSON.stringify(boarding.boarding),frozenBoarding,'scene never moves rules actors');
  engine.closeDialog(boarding);const guide=boarding.tasks.find(t=>t.id==='guide');guide.done=true;const elder=boarding.boarding.actors[0];elder.status='seated';elder.x=1.25;elder.z=7;
  view.render(boarding,.016);assert(!walker.visible);assert(object('boarding-seated-elder').visible);
  const next=engine.createState({characterMemory:{elder:{helped:true,mistakes:0}}});next.renderTargets=engine.targets(next);view.render(next,.016);assert(object('returning-elder').visible);assert(!object('boarding-seated-elder').visible);
  report.checks.push('Boarding standing/seated actors and physical passes follow rule state; evidence labels and returning elder persist across chapters');
  const allGeometry=new Set(),allMaterials=new Set();lastScene.traverse(o=>{if(o.geometry)allGeometry.add(o.geometry);if(o.material)allMaterials.add(o.material);});
  let geometryDisposals=0,materialDisposals=0;
  for(const g of allGeometry)g.addEventListener('dispose',()=>geometryDisposals++);
  for(const m of allMaterials)m.addEventListener('dispose',()=>materialDisposals++);
  handlers.webglcontextlost({preventDefault(){}});assert.equal(lost,1);
  view.dispose();view.dispose();assert.equal(rendererDisposals,1);assert.equal(handlers.webglcontextlost,undefined);
  assert.equal(geometryDisposals,allGeometry.size);assert.equal(materialDisposals,allMaterials.size);assert.deepEqual(view.render(s,.016),{labels:[]});
  report.checks.push('Clear-hazard selection stays on the actual standing passenger; cleared passenger disappears','Pause/dialog/lesson freeze walking pose; reduced motion removes walk bob','Context loss surfaces callback; visible geometries/materials and renderer disposed exactly once');
  report.renderCalls=renderCount;report.geometryDisposals=geometryDisposals;report.materialDisposals=materialDisposals;report.passed=true;
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/preflight-3d-scene-test-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  delete globalThis.__CabinMockRenderer;fs.rmSync(temp,{recursive:true,force:true});
}

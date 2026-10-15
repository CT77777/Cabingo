'use strict';
// Production controller code runs unchanged after removing its ESM import and
// final asynchronous scene boot. DOM, storage and the Three view are test doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),mainSource=fs.readFileSync(path.join(root,'public/main.js'),'utf8'),html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const results=[],traces={},copy=x=>JSON.parse(JSON.stringify(x));
const near=(a,b,message='')=>assert(Math.abs(a-b)<1e-7,`${message}: ${a} versus ${b}`);
function harness(logic,{seed=1701,handsOn=true,contextual=false,reducedMotion=false,phone=false,chapterId='preflight',storage={},storageReadError=false,storageWriteError=false}={}) {
  const ids={},windowEvents={},documentEvents={},raf=[],calls={render:0,dispose:0,reload:0,errors:[]};let document;
  class Element {
    constructor(tag='div',id){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.parentNode=null;this.dataset={};this.style={};this.attrs={};this.events={};this.hidden=false;this.disabled=false;this.textContent='';this.className='';this.captures=[];this.open=false;this.classList={toggle:(name,on)=>{const c=new Set(this.className.split(/\s+/).filter(Boolean));if(on)c.add(name);else c.delete(name);this.className=[...c].join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
    addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
    dispatch(name,event={}){const e={type:name,target:this,detail:0,prevented:0,preventDefault(){this.prevented++;},...event};for(const fn of this.events[name]||[])fn(e);return e;}
    click(event={}){if(!this.disabled)return this.dispatch('click',event);}
    append(...children){for(const c of children){c.parentNode=this;this.children.push(c);}}
    replaceChildren(...children){for(const c of this.children)c.parentNode=null;this.children=[];this.append(...children);}
    querySelector(selector){for(const c of this.children){if(selector==='button'&&c.tagName==='BUTTON')return c;const found=c.querySelector(selector);if(found)return found;}return null;}
    getBoundingClientRect(){return {left:0,top:0,right:116,bottom:116,width:this.id==='joystick'?116:0,height:this.id==='joystick'?116:0};}
    focus(){document.activeElement=this;}
    scrollIntoView(){this.scrolled=true;}
    setAttribute(name,value){this.attrs[name]=String(value);}
    setPointerCapture(id){this.captures.push(id);}
  }
  for(const m of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=ids[m[2]]=new Element(m[1],m[2]);e.hidden=/\bhidden(?:\s|>|=)/.test(m[0]);e.disabled=/\bdisabled(?:\s|>|=)/.test(m[0]);e.open=/\bopen(?:\s|>|=)/.test(m[0]);}
  ids.decisionCard.append(ids.choices,ids.closeDecision);ids.lessonCard.append(ids.lessonContinue);ids.pauseCard.append(ids.resumeButton,ids.restartButton,ids.modeButton);ids.resultCard.append(ids.nextChapterButton,ids.replayButton,ids.resultMenuButton);ids.briefCard.append(ids.startButton,ids.practiceButton);
  const buttons=['up','left','down','right'].map(dir=>{const b=new Element('button');b.dataset.dir=dir;return b;});
  document={body:new Element('body'),hidden:false,activeElement:ids.sceneCanvas,getElementById:id=>{assert(ids[id],`unknown DOM ID ${id}`);return ids[id];},createElement:tag=>new Element(tag),querySelectorAll:selector=>{assert.equal(selector,'[data-dir]');return buttons;},addEventListener:(name,fn)=>(documentEvents[name]??=[]).push(fn)};
  const motion={matches:reducedMotion,listener:null,addEventListener(name,fn){this.listener=fn;}},phoneMedia={matches:phone,listener:null,addEventListener(name,fn){this.listener=fn;}};
  const window={addEventListener:(name,fn)=>(windowEvents[name]??=[]).push(fn)};
  const fakeView={labels:[],render(){calls.render++;return {labels:this.labels};},dispose(){calls.dispose++;}};
  const testMath=Object.create(Math);testMath.random=()=>seed/1e9;
  const context=vm.createContext({document,window,matchMedia:q=>q.includes('max-width')?phoneMedia:motion,location:{reload(){calls.reload++;}},localStorage:{getItem:key=>{if(storageReadError)throw Error('read blocked');return storage[key]??null;},setItem:(key,value)=>{if(storageWriteError)throw Error('write blocked');storage[key]=String(value);}},requestAnimationFrame:fn=>{raf.push(fn);return raf.length;},console:{...console,error:(...args)=>calls.errors.push(args.map(String))},Math:testMath,Set,Map,String,Number,Error,encodeURIComponent,...logic,parseCampaign:(raw,options)=>{const c=logic.parseCampaign(raw,options);if(chapterId==='preflight'&&!raw){if(!c.unlockedChapterIds.includes('preflight'))c.unlockedChapterIds.push('preflight');c.currentChapterId='preflight';}return c;},createState:opts=>logic.createState({...opts,handsOn,contextual}),createCabinAudio:()=>({unlock(){calls.unlock=(calls.unlock||0)+1;return Promise.resolve(true);},setPreferences(p){calls.audioPrefs={...p};},setMode(mode){calls.audioMode=mode;},play(e){(calls.audioEvents??=[]).push(e);},reset(){calls.audioResets=(calls.audioResets||0)+1;},dispose(){calls.audioDisposals=(calls.audioDisposals||0)+1;},getStatus(){return 'ready';}}),__fakeView:fakeView});
  let source=mainSource.replace(/import\s+\{[^\n]+\}\s+from\s+'\.\/preflight\.mjs(?:\?v=[^']+)?';\s*\n/,'');
  assert.notEqual(source,mainSource,'expected production preflight import');
  source=source.replace(/^import[^\n]+;\s*\n/gm,'');
  assert(/refresh\(true\);boot\(\);\s*$/.test(source),'expected final boot call');
  source=source.replace(/refresh\(true\);boot\(\);\s*$/,'refresh(true);');
  source+='\nready=true;view=__fakeView;hide("loading",true);$("startButton").disabled=false;$("practiceButton").disabled=false;refresh(true);window.__test={getState:()=>state,frame,keys,touch,held,fail,refresh,updateLabels,screenInputToWorld};';
  vm.runInContext(source,context,{filename:'public/main.js (unaltered production controller body)'});
  const api=window.__test;let time=0;
  function dispatch(name,event={}){const e={type:name,key:'',code:'',repeat:false,target:document.activeElement,metaKey:false,ctrlKey:false,altKey:false,prevented:0,preventDefault(){this.prevented++;},...event};for(const fn of windowEvents[name]||[])fn(e);return e;}
  function step(n=1){for(let i=0;i<n;i++){time+=1000/60;api.frame(time);}return api.getState();}
  const key=(code,key=code,extra={})=>dispatch('keydown',{code,key,...extra}),up=(code,key=code)=>dispatch('keyup',{code,key});
  function tap(code,keyValue=code,extra={}){const e=key(code,keyValue,extra);up(code,keyValue);return e;}
  function begin(practice=false){ids[practice?'practiceButton':'startButton'].click({detail:1});assert.equal(api.getState().status,'playing');if(api.getState().lesson?.id==='serviceIntro')ids.lessonContinue.click({detail:1});}
  function approach(practice=false){begin(practice);key('ArrowUp');for(let i=0;i<100&&api.getState().near!=='belt';i++)step();up('ArrowUp');assert.equal(api.getState().near,'belt');}
  function open(practice=false){approach(practice);tap('Space','Process',{isComposing:true});step();assert.equal(api.getState().dialog.id,'belt');}
  function choice(predicate,{release=true,codePrefix='Digit'}={}){const index=typeof predicate==='number'?predicate:api.getState().dialog.choices.findIndex(predicate);assert(index>=0);const code=`${codePrefix}${index+1}`;key(code,'Process',{isComposing:true});if(release)up(code,'Process');return code;}
  function finishWork(){let n=0;while(api.getState().action&&n++<12){const step=api.getState().action.interaction.steps[api.getState().action.interaction.index];key('Space');if(step.mode==='hold')stepFrames(42);up('Space');}assert(!api.getState().action);function stepFrames(n){step(n);}}
  function dismiss(){ids.lessonContinue.click({detail:1});assert.equal(api.getState().lesson,null);}
  return {ids,buttons,api,document,motion,phoneMedia,calls,raf,storage,fakeView,Element,dispatch,key,up,tap,step,begin,approach,open,choice,dismiss,finishWork,state:()=>api.getState(),button:dir=>({get captures(){return ids.joystick.captures;},dispatch(type,event){const offset={up:[0,-42],down:[0,42],left:[-42,0],right:[42,0]}[dir];return ids.joystick.dispatch(type,{...event,clientX:58+offset[0],clientY:58+offset[1]});}}),visibility(hidden){document.hidden=hidden;for(const fn of documentEvents.visibilitychange||[])fn();}};
}
(async()=>{
  const logic={...await import(pathToFileURL(path.join(root,'public/preflight.mjs'))),...await import(pathToFileURL(path.join(root,'public/presentation.mjs'))),...await import(pathToFileURL(path.join(root,'public/results.mjs'))),...await import(pathToFileURL(path.join(root,'public/chapters/index.mjs'))),...await import(pathToFileURL(path.join(root,'public/campaign.mjs'))),...await import(pathToFileURL(path.join(root,'public/interaction.mjs'))),...await import(pathToFileURL(path.join(root,'public/boarding.mjs')))};
  const test=(name,fn)=>{try{fn();results.push({name,passed:true});console.log('PASS',name);}catch(error){results.push({name,passed:false,error:error.message,stack:error.stack});console.error('FAIL',name,'\n ',error.message);}};
  test('Space opens dialogue once without inherited key-up selecting the first choice; E is retired',()=>{
    const h=harness(logic);h.approach();h.tap('KeyE');assert.equal(h.state().dialog,null);
    h.key('Space',' ');assert(h.state().dialog);const before=copy(h.state());
    h.up('Space',' ');h.ids.choices.children[0].click({detail:0});assert.deepEqual(copy(h.state()),before);
    h.key('Space',' ');h.up('Space',' ');h.ids.choices.children[0].click({detail:0});assert.notDeepEqual(copy(h.state()),before);
  });
  test('Production wrong choices use central recovery, freeze after the formal penalty and preserve retry order',()=>{
    for(const practice of [false,true]){
      const h=harness(logic,{contextual:true});h.open(practice);const order=h.state().dialog.choices.map(c=>c.id);h.choice(c=>!c.good);
      assert.equal(h.ids.recoveryOverlay.hidden,false);assert(h.ids.gameSurface.inert);assert.equal(h.ids.decisionCard.hidden,true);
      assert.equal(h.document.activeElement,h.ids.recoveryTitle);h.ids.recoveryContinue.click({detail:1});
      if(!practice){assert(h.state().recovery);h.step(122);}
      else assert(h.state().dialog);
      if(!practice){const elapsed=h.state().elapsed;h.step(200);assert.equal(h.state().elapsed,elapsed);h.ids.recoveryContinue.click({detail:1});}
      assert.deepEqual(h.state().dialog.choices.map(c=>c.id),order);assert(!h.ids.gameSurface.inert);
    }
  });
  test('Joystick ignores a second finger, clears on blur, and supports partial analog speed',()=>{
    const h=harness(logic);h.begin(true);h.ids.joystick.dispatch('pointerdown',{pointerId:7,clientX:58,clientY:38});h.step(5);const slow=h.state().player.z-1.5;
    assert(slow>0);h.ids.joystick.dispatch('pointerdown',{pointerId:8,clientX:58,clientY:100});h.step(5);assert(h.state().player.z>1.5+slow);
    h.dispatch('blur');h.ids.resumeButton.click({detail:1});const z=h.state().player.z;h.step(10);near(h.state().player.z,z);
    const fast=harness(logic);fast.begin(true);fast.key('ArrowUp');fast.step(5);assert(fast.state().player.z-1.5>slow);
  });
  test('Thirty-second warning has a separate banner and sound, no repeated cue or practice countdown',()=>{
    const h=harness(logic,{contextual:true});h.begin();h.state().lessonSeen=['aisle'];h.state().elapsed=69.99;h.step(2);
    assert.equal(h.ids.timeWarning.hidden,false);assert.equal(h.ids.timeWarningTitle.textContent,'最後 30 秒');
    assert.equal(h.calls.audioEvents.filter(e=>e.type==='time-warning').length,1);h.step(20);assert.equal(h.calls.audioEvents.filter(e=>e.type==='time-warning').length,1);
    h.tap('Escape');const elapsed=h.state().elapsed;h.step(50);assert.equal(h.state().elapsed,elapsed);
    h.ids.resumeButton.click({detail:1});h.state().elapsed=89.99;h.step(2);assert.equal(h.ids.timeWarning.dataset.level,'critical');assert.equal(h.calls.audioEvents.filter(e=>e.type==='time-warning').length,2);
    const p=harness(logic);p.begin(true);p.state().elapsed=90;p.step();assert.equal(p.ids.timeWarning.hidden,true);
  });
  test('Production recovery survives pause and blur; fresh Space and Enter acknowledge without selecting through',()=>{
    for(const key of ['Space','Enter','NumpadEnter'])for(const stop of ['pause','blur']){
      const h=harness(logic,{contextual:true});h.open();h.choice(c=>!c.good);h.step(30);
      if(stop==='pause')h.tap('Escape');else h.dispatch('blur');const before=copy(h.state());h.step(100);assert.deepEqual(copy(h.state()),before);
      h.ids.resumeButton.click({detail:1});h.step(100);assert(h.state().recovery.ready);h.key(key);assert(h.state().dialog);assert.equal(h.state().action,null);
      h.key(key,key,{repeat:true});h.up(key);h.ids.choices.children[0].click({detail:0});assert(h.state().dialog);assert.equal(h.state().action,null);
    }
  });
  test('Timeout and WebGL failure during recovery never leave an invisible blocking overlay',()=>{
    const h=harness(logic,{contextual:true});h.open();h.state().elapsed=99.9;h.choice(c=>!c.good);h.step(10);assert.equal(h.state().status,'finished');assert.equal(h.state().recovery,null);assert(h.ids.recoveryOverlay.hidden);assert(!h.ids.gameSurface.inert);
    const f=harness(logic,{contextual:true});f.open(true);f.choice(c=>!c.good);f.api.fail(Error('context lost'));assert(f.ids.recoveryOverlay.hidden);assert(!f.ids.webglError.hidden);
  });
  test('Pause controls keep native Enter and Space activation when a recovery is behind them',()=>{
    for(const code of ['Enter','NumpadEnter','Space']){
      const h=harness(logic,{contextual:true});h.open(true);h.choice(c=>!c.good);h.tap('Escape');assert.equal(h.state().status,'paused');
      const event=h.key(code,code,{target:h.ids.resumeButton});assert.equal(event.prevented,0);if(code==='Space')h.up(code);h.ids.resumeButton.click({detail:0});if(code!=='Space')h.up(code);assert.equal(h.state().status,'playing');assert(h.state().recovery);
    }
  });
  test('Opening service demo is centered, freezes real resources and demonstrates waiting and background delivery',()=>{
    const storage={},h=harness(logic,{contextual:true,storage});h.ids.startButton.click({detail:1});
    assert.equal(h.state().lesson.id,'serviceIntro');assert(!h.ids.lessonOverlay.hidden);assert(h.ids.gameSurface.inert);
    h.step(200);assert.equal(h.state().elapsed,0);assert.equal(h.state().handoffTokens,1);
    h.ids.demoWait.click({detail:1});assert.equal(h.ids.demoPatience.value,17);h.ids.demoHandoff.click({detail:1});h.ids.demoSafety.click({detail:1});h.step(180);
    const phase=h.ids.demoStatus.textContent;h.tap('Escape');h.step(300);assert.equal(h.ids.demoStatus.textContent,phase);h.ids.resumeButton.click({detail:1});h.step(600);
    assert(h.ids.demoDeliver.classList.contains('active'));assert.equal(h.state().elapsed,0);assert.equal(h.state().handoffTokens,1);assert.equal(h.state().handoffJob,null);
    h.ids.lessonContinue.click({detail:1});assert.equal(h.state().lesson,null);assert(!h.ids.gameSurface.inert);assert(JSON.parse(storage['cabin3d-lessons-v2']).includes('serviceIntro'));
  });
  test('Demo keyboard repeats cannot skip steps and focus always lands on an enabled control',()=>{
    for(const code of ['Enter','NumpadEnter']){
      const h=harness(logic,{contextual:true});h.ids.startButton.click({detail:1});h.ids.demoWait.focus();h.key(code);h.ids.demoWait.click({detail:0});
      assert.equal(h.document.activeElement,h.ids.demoSafety);const repeated=h.key(code,code,{repeat:true});assert(repeated.prevented>0);
      h.ids.demoSafety.click({detail:0});assert.equal(h.ids.demoSafety.disabled,false,'held Enter must not activate next control');h.up(code);
      h.key(code);h.ids.demoSafety.click({detail:0});h.up(code);assert.equal(h.document.activeElement,h.ids.demoHandoff);
      h.key(code);h.ids.demoHandoff.click({detail:0});h.up(code);assert(h.ids.demoSafety.disabled,'completed safety step stays complete');assert.equal(h.document.activeElement,h.ids.lessonContinue);assert(!h.document.activeElement.disabled);
    }
  });
  test('Escort accepts real direction keys, hides loading and can cancel from pause without clearing the hazard',()=>{
    for(const cancel of [true,false]){
      const h=harness(logic,{contextual:true});h.begin(true);const s=h.state(),t=s.tasks.find(t=>t.id==='water');s.lessonSeen=['aisle','serviceIntro'];s.tasks.forEach(t=>t.patience=999);s.hazards=[{id:'hazard-water',taskId:t.id,row:t.row,x:0,z:t.z,done:false}];s.player.x=0;s.player.z=t.z-.9;h.step();h.tap('Space');assert(s.action.escort);assert(h.ids.actionBox.hidden);assert(h.ids.interactButton.hidden);
      h.step(100);assert(!s.hazards[0].done);
      if(cancel){h.tap('Escape');assert(!h.ids.cancelEscortButton.hidden);h.ids.cancelEscortButton.click({detail:1});assert.equal(s.action,null);assert(!s.hazards[0].done);assert.equal(h.document.activeElement,h.ids.resumeButton);continue;}
      const goal=s.action.escort.goal;let guard=0;while(s.action&&guard++<200){const dx=goal.x-s.player.x,dz=goal.z-s.player.z;const x=dx>.03?'ArrowLeft':dx<-.03?'ArrowRight':null,z=dz>.03?'ArrowUp':dz<-.03?'ArrowDown':null;if(x)h.key(x);if(z)h.key(z);h.step();if(x)h.up(x);if(z)h.up(z);}
      assert(guard<200);assert(s.hazards[0].done);assert.equal(s.tasks.find(t=>t.id==='water').done,false);
    }
  });
  test('Boarding keyboard and touch both advance untimed teaching and freeze traffic on blur',()=>{
    for(const phone of [false,true]){const h=harness(logic,{chapterId:'boarding',contextual:true,phone});assert.equal(h.state().chapterId,'boarding');assert.equal(h.ids.chapterTag.textContent,'BOARDING / 01');h.begin();
      if(phone)h.button('up').dispatch('pointerdown',{pointerId:42});else h.key('ArrowUp');h.step(20);if(phone)h.button('up').dispatch('pointerup',{pointerId:42});else h.up('ArrowUp');
      assert.equal(h.state().boarding.tutorialStep,1);assert.equal(h.state().elapsed,0);h.ids.interactButton.click({detail:1});assert.equal(h.state().dialog.id,'guide');assert.equal(h.ids.evidenceCards.children.length,1);const frozen=copy(h.state().boarding);h.step(60);assert.deepEqual(copy(h.state().boarding),frozen);h.choice(c=>c.good);h.step(110);assert(h.state().tasks.find(t=>t.id==='guide').done);assert.equal(h.state().elapsed,0);h.dispatch('blur');const paused=copy(h.state());h.step(120);assert.deepEqual(copy(h.state()),paused);assert(!h.ids.awayOverlay.hidden);h.ids.awayResumeButton.click({detail:1});assert.equal(h.state().status,'playing');
    }
  });
  test('Formal boarding saves elder continuity and enters the newly unlocked preflight chapter',()=>{
    const h=harness(logic,{chapterId:'boarding',contextual:true});h.begin();const s=h.state();for(const t of s.tasks)t.done=true;for(const a of s.boarding.actors)a.status='seated';s.boarding.formal=true;s.status='finished';s.endReason='complete';s.grade='clean';s.comfort=100;h.api.refresh(true);
    const saved=JSON.parse(h.storage['cabin3d-campaign-v2']);assert.equal(saved.bestStars.boarding,3);assert(saved.unlockedChapterIds.includes('preflight'));assert(saved.characterMemory.elder.helped);assert.equal(h.storage['cabin3d-best-v1'],undefined);assert.equal(h.ids.nextChapterButton.hidden,false);h.ids.nextChapterButton.click({detail:1});assert.equal(h.state().chapterId,'preflight');assert.equal(h.state().characterMemory.elder.helped,true);assert.equal(h.state().status,'briefing');
  });
  test('A formal completion refuses to downgrade future campaign data',()=>{
    const raw=JSON.stringify({version:99,preserve:true}),h=harness(logic,{storage:{'cabin3d-campaign-v2':raw}});h.begin();const s=h.state();s.status='finished';s.endReason='complete';s.grade='clean';s.comfort=100;h.api.refresh(true);assert.equal(h.storage['cabin3d-campaign-v2'],raw);
  });
  test('Only successful formal boarding may claim help given during boarding',()=>{
    for(const chapterId of ['boarding','preflight'])for(const outcome of ['timeout','retry','success']){const h=harness(logic,{chapterId});h.begin();const s=h.state(),elder=s.tasks.find(t=>t.characterId==='elder');elder.done=true;s.status='finished';s.endReason=outcome==='timeout'?'timeout':'complete';s.grade=outcome==='timeout'?'incomplete':outcome==='retry'?'retry':'clean';s.safetyErrors=outcome==='retry'?2:0;s.comfort=100;h.api.refresh(true);const saved=h.storage['cabin3d-campaign-v2'];assert.equal(!!(saved&&JSON.parse(saved).characterMemory.elder?.helped),chapterId==='boarding'&&outcome==='success');if(chapterId==='preflight'||outcome!=='success')assert.equal(h.document.activeElement,h.ids.replayButton);}
  });
  test('Acknowledging a boarding lesson preserves remembered lessons from preflight',()=>{
    const storage={'cabin3d-lessons-v2':'["aisle","handoff"]'},h=harness(logic,{chapterId:'boarding',storage});h.begin();h.state().lesson={id:'correction',title:'test',copy:'test'};h.api.refresh(true);h.dismiss();assert.deepEqual(JSON.parse(storage['cabin3d-lessons-v2']).sort(),['aisle','correction','handoff']);
  });
  test('Normal 60 Hz teaching inputs do not wedge the first passengers at the held bag',()=>{
    for(const seed of [0,1,7,1701]){const h=harness(logic,{chapterId:'boarding',contextual:true,seed});h.begin();h.step(600);h.key('ArrowUp');h.step(20);h.up('ArrowUp');h.tap('Space');h.choice(c=>c.good);h.step(110);h.key('ArrowUp');h.step(65);h.up('ArrowUp');h.tap('Space');assert.equal(h.state().dialog?.id,'bag');h.choice(c=>c.good);h.step(130);h.key('ArrowLeft');h.step(14);h.up('ArrowLeft');h.key('ArrowUp');h.step(144);h.up('ArrowUp');h.step(600);assert(h.state().boarding.actors.find(a=>a.id==='elder').status==='seated',`elder seed${seed}`);assert(h.state().boarding.actors.find(a=>a.id==='bag-owner').status==='seated',`bag-owner seed${seed}`);}
  });
  test('Aisle warning persists until every obstruction is cleared and points in screen directions',()=>{
    const h=harness(logic);h.begin(true);const s=h.state(),task=s.tasks.find(t=>t.id==='water');
    s.hazards=[{id:'hazard-water',taskId:task.id,x:0,z:4,row:task.row,done:false},{id:'hazard-blanket',taskId:'blanket',x:0,z:10,row:4,done:false}];s.player.x=0;s.player.z=1;h.api.refresh(true);
    assert.equal(h.ids.aisleAlert.hidden,false);assert.equal(h.ids.aisleAlertTitle.textContent,'走道受阻 · 2 件待處理');assert(h.ids.aisleAlertDirection.textContent.includes('↑ 往畫面上方'));
    s.player.z=5.5;h.api.refresh(true);assert(h.ids.aisleAlertDirection.textContent.includes('↓ 往畫面下方'));
    s.player.z=4;s.player.x=2;h.api.refresh(true);assert(h.ids.aisleAlertDirection.textContent.includes('→ 往畫面右方'));
    s.player.x=-2;h.api.refresh(true);assert(h.ids.aisleAlertDirection.textContent.includes('← 往畫面左方'));
    s.player.x=0;s.near='hazard-water';h.api.refresh(true);assert(h.ids.aisleAlertDirection.textContent.includes('已靠近紅圈'));s.action={kind:'correction',time:0,duration:2,choice:{feedback:'修正'}};h.api.refresh(true);assert(!h.ids.aisleAlertDirection.textContent.includes('按 E'));s.action=null;
    s.near=null;h.api.refresh(true);assert(!h.ids.aisleAlertDirection.textContent.includes('完成目前互動'));assert(h.ids.aisleAlertDirection.textContent.includes('確認互動目標'));
    s.hazards[0].done=true;h.api.refresh(true);assert.equal(h.ids.aisleAlertTitle.textContent,'走道受阻 · 1 件待處理');assert(h.ids.aisleAlertDirection.textContent.includes('↑ 往畫面上方'));
    h.dispatch('blur');assert.equal(h.ids.aisleAlert.hidden,true);h.ids.awayResumeButton.click({detail:1});assert.equal(h.ids.aisleAlert.hidden,false);
    s.hazards[1].done=true;h.api.refresh(true);assert.equal(h.ids.aisleAlert.hidden,true);
    s.hazards[1].done=false;s.status='finished';h.api.refresh(true);assert.equal(h.ids.aisleAlert.hidden,true);
  });
  test('Hands-on keyboard and pointer complete work, idle and cancelled holds do not',()=>{
    for(const input of ['keyboard','pointer']){
      const h=harness(logic,{handsOn:true});h.open(true);h.choice(c=>c.good);h.step(120);assert(h.state().action);assert.equal(h.state().action.interaction.index,0);
      let guard=0;while(h.state().action&&guard++<10){const i=h.state().action.interaction,step=i.steps[i.index];
        if(input==='keyboard'){h.key('Space');if(step.mode==='hold')h.step(42);h.up('Space');}
        else {h.ids.interactButton.dispatch('pointerdown',{pointerId:1});if(step.mode==='hold')h.step(42);h.ids.interactButton.dispatch('pointerup',{pointerId:1});h.ids.interactButton.click({detail:1});}
      }
      assert(!h.state().action);assert(h.state().tasks.find(t=>t.id==='belt').done);assert.equal(h.state().safetyErrors,0);
    }
    const h=harness(logic,{handsOn:true});h.approach(true);h.state().tasks.find(t=>t.id==='belt').variant=0;h.tap('Space');h.choice(c=>c.good);h.tap('Space');assert.equal(h.state().action.interaction.steps[1].mode,'hold');h.key('Space');h.step(20);h.dispatch('blur');assert.equal(h.state().action.interaction.held,false);h.ids.resumeButton.click({detail:1});h.step(100);assert(h.state().action);assert.equal(h.state().action.interaction.fill,0);
  });
  test('Sound unlocks only on deliberate start and pause/blur/pagehide stop audio',()=>{
    const h=harness(logic);assert.equal(h.calls.unlock,undefined);h.begin();assert.equal(h.calls.unlock,1);h.step();
    const demand=h.calls.audioEvents.filter(e=>e.type==='demand').length;h.step(10);assert.equal(h.calls.audioEvents.filter(e=>e.type==='demand').length,demand);
    h.tap('Escape');assert.equal(h.calls.audioMode,'paused');h.ids.resumeButton.click({detail:1});assert.equal(h.calls.audioMode,'playing');h.dispatch('blur');assert.equal(h.calls.audioMode,'paused');h.dispatch('pagehide');assert.equal(h.calls.audioDisposals,1);
  });
  test('A lesson interrupts touch hold without trapping the next pointer',()=>{const h=harness(logic);h.approach(true);h.state().tasks.find(t=>t.id==='belt').variant=0;h.tap('Space');h.choice(c=>c.good);h.tap('Space');h.ids.interactButton.dispatch('pointerdown',{pointerId:1});h.state().tasks.find(t=>t.id==='water').patience=.1;h.step();assert.equal(h.state().lesson?.id,'aisle');assert(!h.state().action.interaction.held);h.dismiss();h.ids.interactButton.dispatch('pointerdown',{pointerId:2});assert(h.state().action.interaction.held,'new pointer works even without old pointerup');h.step(42);h.ids.interactButton.dispatch('pointerup',{pointerId:2});assert(!h.state().action);assert(h.ids.holdMeter.hidden,'meter hides after final hold');});
  test('Escape resumes when the music slider is focused',()=>{const h=harness(logic);h.begin();h.tap('Escape');h.ids.musicSlider.focus();h.tap('Escape');assert.equal(h.state().status,'playing');});
  test('Focus loss uses a blocking overlay; focus alone never resumes; Enter/Space do',()=>{
    for(const code of ['Enter','Space','NumpadEnter']){const h=harness(logic);h.begin();h.step(10);h.dispatch('blur');assert.equal(h.ids.awayOverlay?.hidden,false);assert(h.ids.gameSurface.inert);const frozen=copy(h.state());h.dispatch('focus');h.step(60);assert.deepEqual(copy(h.state()),frozen);h.tap(code);assert.equal(h.state().status,'playing');assert(h.ids.awayOverlay.hidden);assert(!h.ids.gameSurface.inert);}
  });
  test('Inherited Space/Enter clicks and repeats cannot dismiss the focus overlay',()=>{
    for(const code of ['Space','Enter','NumpadEnter']){const h=harness(logic);h.begin();h.key(code);h.dispatch('blur');h.key(code,code,{repeat:true});assert.equal(h.up(code).prevented,1);assert.equal(h.state().status,'paused');assert(!h.ids.awayOverlay.hidden);h.tap(code);assert.equal(h.state().status,'playing');}
  });
  test('A held resume key cannot activate the restored decision, lesson or manual pause',()=>{
    for(const destination of ['decision','lesson','manual'])for(const code of ['Enter','Space','NumpadEnter']){
      const h=harness(logic);if(destination==='decision')h.open();else if(destination==='lesson'){h.open();h.choice(c=>!c.good);}else{h.begin();h.tap('Escape');}
      h.dispatch('blur');h.key(code);const afterResume=copy(h.state());const repeat=h.key(code,code,{repeat:true}),release=h.up(code);assert.equal(repeat.prevented,1);assert.equal(release.prevented,1);assert.deepEqual(copy(h.state()),afterResume);
    }
  });
  test('A fresh non-repeat press works even when the old keyup happened outside the game',()=>{const h=harness(logic);h.begin();h.key('Enter');h.dispatch('blur');h.key('Enter');assert.equal(h.state().status,'playing');assert.equal(h.key('Enter','Enter',{repeat:true}).prevented,1);assert.equal(h.up('Enter').prevented,1);});
  test('The focus overlay traps Tab and blocks gameplay; hidden pages cannot resume',()=>{
    const h=harness(logic);h.begin();h.visibility(true);h.step();const before=copy(h.state());h.tap('Tab');assert.equal(h.document.activeElement,h.ids.awayResumeButton);h.tap('KeyC');h.tap('Space');h.tap('Enter');h.ids.awayResumeButton.click({detail:1});h.step(20);assert.deepEqual(copy(h.state()),before);h.visibility(false);h.ids.awayResumeButton.click({detail:1});assert.equal(h.state().status,'playing');
  });
  test('Returning from focus overlay preserves a decision and an existing manual pause',()=>{
    const h=harness(logic);h.open();const d=copy(h.state().dialog);h.dispatch('blur');h.ids.awayResumeButton.click({detail:1});assert.equal(h.state().status,'playing');assert.deepEqual(copy(h.state().dialog),d);
    h.tap('Escape');h.dispatch('blur');h.ids.awayResumeButton.click({detail:1});assert.equal(h.state().status,'paused');assert(!h.ids.pauseCard.hidden);h.ids.resumeButton.click({detail:1});assert.equal(h.state().status,'playing');
  });
  test('Production contextual mode completes the chosen action without extra E inputs',()=>{const h=harness(logic,{contextual:true});h.open(true);h.choice(c=>c.good);assert(h.state().action);assert(!h.state().action.interaction);assert(h.ids.interactButton.disabled);assert(!h.ids.actionLabel.textContent.includes('秒'));assert(!h.ids.interactLabel.textContent.includes('修正'));const elapsed=h.state().elapsed;h.tap('Escape');h.step(100);assert.equal(h.state().elapsed,elapsed);h.ids.resumeButton.click({detail:1});h.step(130);assert(h.state().tasks.find(t=>t.id==='belt').done);assert(!h.state().action);});
  test('Chapter menu exposes preflight as chapter2 and rejects unfinished choices',()=>{const h=harness(logic);assert.equal(h.state().chapterId,'preflight');assert.equal(h.state().chapter,2);assert.equal(h.ids.chapterTag.textContent,'PRE-FLIGHT / 02');assert.equal(h.ids.chapterList.children.length,9);const boarding=h.ids.chapterList.children.find(b=>b.dataset.chapter==='takeoff');assert(boarding.disabled);const before=copy(h.state());boarding.dispatch('click',{detail:1});assert.deepEqual(copy(h.state()),before);h.begin();assert.equal(h.ids.chapterLabel.textContent,'第 2 章');});
  test('Campaign migration and formal completion preserve preflight records',()=>{const legacy={version:1,stars:2,safetyErrors:0,comfort:90,elapsed:60};const h=harness(logic,{storage:{'cabin3d-best-v1':JSON.stringify(legacy)}});assert(h.ids.chapterList.children.find(b=>b.dataset.chapter==='preflight').children.some(n=>n.textContent.includes('★★☆')));h.begin();assert.equal(h.storage['cabin3d-campaign-v2'],undefined);let c;const s=h.state();s.status='finished';s.endReason='complete';s.grade='clean';s.comfort=99;h.api.refresh(true);c=JSON.parse(h.storage['cabin3d-campaign-v2']);assert.equal(c.bestStars.preflight,3);assert(c.unlockedChapterIds.includes('takeoff'));assert(!c.characterMemory.elder);h.api.refresh(true);assert.equal(JSON.parse(h.storage['cabin3d-campaign-v2']).bestStars.preflight,3);});
  test('Starting or reselecting the current chapter never overwrites a newer or concurrent save',()=>{for(const raw of [JSON.stringify({version:3,marker:'future'}),JSON.stringify({...logic.createCampaign(),bestStars:{preflight:3}})]){const h=harness(logic);h.storage['cabin3d-campaign-v2']=raw;h.ids.chapterList.children.find(b=>b.dataset.chapter==='preflight').click({detail:1});assert.equal(h.state().chapterId,'preflight');assert.equal(h.storage['cabin3d-campaign-v2'],raw);h.begin();assert.equal(h.storage['cabin3d-campaign-v2'],raw);assert.equal(h.state().status,'playing');}});
  test('Campaign storage denial and malformed data do not block practice or award progress',()=>{for(const options of [{storageReadError:true},{storageWriteError:true},{storage:{'cabin3d-campaign-v2':'bad'}}]){const h=harness(logic,options);h.begin(true);const s=h.state();s.status='finished';s.endReason='complete';s.grade='clean';h.api.refresh(true);const raw=h.storage['cabin3d-campaign-v2'];if(raw&&raw!=='bad')assert.deepEqual(JSON.parse(raw).bestStars,{});assert.equal(h.ids.resultStars.textContent,'不計星等');}});
  test('Manual pause uses the full-screen inert modal and keeps settings optional',()=>{const h=harness(logic);h.begin();h.tap('Escape');assert.equal(h.state().status,'paused');assert(!h.ids.awayOverlay.hidden);assert(h.ids.focusPauseCard.hidden);assert(!h.ids.pauseCard.hidden);assert(h.ids.gameSurface.inert);assert.equal(h.ids.awayOverlay.attrs['aria-labelledby'],'pauseTitle');const elapsed=h.state().elapsed;h.step(90);assert.equal(h.state().elapsed,elapsed);h.ids.pauseInfoButton.click({detail:1});assert(!h.ids.rulesPanel.hidden);h.ids.resumeButton.click({detail:1});assert.equal(h.state().status,'playing');assert(h.ids.awayOverlay.hidden);assert(!h.ids.gameSurface.inert);});
  test('Information stays collapsed until i is requested, with timers frozen while reading',()=>{
    const h=harness(logic);h.begin();assert(h.ids.rulesPanel?.hidden);h.ids.infoButton.click({detail:1});assert.equal(h.state().status,'paused');assert(!h.ids.rulesPanel.hidden);const elapsed=h.state().elapsed;h.step(100);assert.equal(h.state().elapsed,elapsed);h.ids.infoButton.click({detail:1});assert.equal(h.state().status,'playing');assert(h.ids.rulesPanel.hidden);
  });
  test('In-modal rules never resume play and pause audio controls stay in sync',()=>{const h=harness(logic);h.begin();h.ids.infoButton.click({detail:1});assert(!h.ids.rulesPanel.hidden);h.ids.pauseInfoButton.click({detail:1});assert.equal(h.state().status,'paused');assert(h.ids.rulesPanel.hidden);h.ids.pauseVolumeSlider.value='27';h.ids.pauseVolumeSlider.dispatch('input');assert.equal(h.ids.volumeSlider.value,'27');h.ids.pauseMuteButton.click({detail:1});assert.equal(h.ids.volumeSlider.value,'0');assert.equal(h.ids.pauseVolumeSlider.value,'0');h.ids.pauseMuteButton.click({detail:1});assert.equal(h.ids.volumeSlider.value,'27');});
  test('Unified speaker and slider mute together and restore the previous nonzero level',()=>{
    const h=harness(logic);h.ids.volumeSlider.value='63';h.ids.volumeSlider.dispatch('input');h.ids.muteButton.click({detail:1});assert.equal(h.ids.volumeSlider.value,'0');assert.equal(h.ids.muteButton.attrs['title'],'取消靜音');h.ids.muteButton.click({detail:1});assert.equal(h.ids.volumeSlider.value,'63');h.ids.volumeSlider.value='0';h.ids.volumeSlider.dispatch('input');assert.equal(h.calls.audioPrefs.muted,true);h.ids.muteButton.click({detail:1});assert.equal(h.calls.audioPrefs.volume,.63);assert.equal(h.calls.audioPrefs.muted,false);
  });
  test('Volume preferences and explicit mute update controls safely',()=>{const h=harness(logic);h.ids.volumeSlider.value='0';h.ids.volumeSlider.dispatch('input');assert.equal(h.calls.audioPrefs.volume,0);assert.equal(h.calls.audioPrefs.muted,true);h.ids.muteButton.click({detail:1});assert.equal(h.calls.audioPrefs.muted,false);assert.equal(h.ids.muteButton.attrs['aria-pressed'],'false');});
  test('New-round sound reset and practice result do not write formal best records',()=>{const h=harness(logic);h.begin(true);const previous=h.state().runId;h.ids.restartButton.click({detail:1});assert.notEqual(h.state().runId,previous);assert.equal(h.calls.audioResets,2);const s=h.state();s.status='finished';s.endReason='complete';s.grade='clean';h.api.refresh(true);assert.equal(h.storage['cabin3d-best-v1'],undefined);assert.equal(h.ids.resultStars.textContent,'不計星等');});
  test('Storage read/write denial leaves sound controls and formal result usable',()=>{for(const mode of ['read','write']){const h=harness(logic,{storageReadError:mode==='read',storageWriteError:mode==='write'});h.begin();h.ids.muteButton.click({detail:1});const s=h.state();s.status='finished';s.grade='clean';s.endReason='complete';s.comfort=95;h.api.refresh(true);assert(h.ids.resultStars.textContent.includes('3 / 3'));assert(h.ids.bestRecord.textContent.includes('此瀏覽器最佳紀錄'));}});
  test('A practice mistake emits exactly once per deliberate retry, never per held key',()=>{const h=harness(logic);h.open(true);const key=h.choice(c=>!c.good,{release:false});const n=h.calls.audioEvents.filter(e=>e.type==='mistake').length;assert.equal(n,1);h.key(key,'Process',{repeat:true});h.step(20);assert.equal(h.calls.audioEvents.filter(e=>e.type==='mistake').length,n);h.up(key);h.choice(c=>!c.good);assert.equal(h.calls.audioEvents.filter(e=>e.type==='mistake').length,n+1);});
  test('Formal best records update once per round and malformed preferences do not erase a valid best',()=>{const saved={version:1,stars:3,safetyErrors:0,comfort:100,elapsed:50};const h=harness(logic,{storage:{'cabin3d-audio-v1':'bad','cabin3d-best-v1':JSON.stringify(saved)}});h.begin();const s=h.state();s.status='finished';s.endReason='complete';s.grade='clean';s.comfort=95;s.elapsed=60;h.api.refresh(true);assert(h.ids.bestRecord.textContent.includes('服務 100'));assert.equal(JSON.parse(h.storage['cabin3d-best-v1']).comfort,100);});
  test('Start buttons launch the requested mode and focus canvas exactly once',()=>{
    for(const practice of [false,true]){const h=harness(logic);assert.equal(h.state().status,'briefing');h.step(10);assert.equal(h.state().elapsed,0);h.begin(practice);assert.equal(h.state().practice,practice);assert.equal(h.document.activeElement,h.ids.sceneCanvas);assert.equal(h.ids.briefCard.hidden,true);const before=copy(h.state());h.ids.startButton.click();h.ids.practiceButton.click();assert.deepEqual(copy(h.state()),before);}
  });
  test('Physical WASD under IME and arrows map screen right to world -x and up to +z in both cameras',()=>{
    for(const camera of ['follow','overview'])for(const [arrow,physical,axis,sign] of [['ArrowUp','KeyW','z',1],['ArrowDown','KeyS','z',-1],['ArrowLeft','KeyA','x',1],['ArrowRight','KeyD','x',-1]]){
      const a=harness(logic),b=harness(logic);a.begin();b.begin();if(camera==='overview'){a.tap('KeyC');b.tap('KeyC');}const before=a.state().player[axis];assert.equal(a.key(arrow).prevented,1);assert.equal(b.key(physical,'Process',{isComposing:true}).prevented,1);a.step(6);b.step(6);near(a.state().player[axis],b.state().player[axis]);assert((b.state().player[axis]-before)*sign>0,`${camera} ${physical}`);a.up(arrow);b.up(physical);const stopped=copy(b.state().player);b.step(10);near(b.state().player.x,stopped.x);near(b.state().player.z,stopped.z);
    }
  });
  test('Touch directions use the same screen-relative mapping as keyboard in both cameras',()=>{
    for(const camera of ['follow','overview'])for(const [dir,code] of [['up','ArrowUp'],['down','ArrowDown'],['left','ArrowLeft'],['right','ArrowRight']]){const a=harness(logic),b=harness(logic);a.begin();b.begin();if(camera==='overview'){a.tap('KeyC');b.tap('KeyC');}a.key(code);const event=b.button(dir).dispatch('pointerdown',{pointerId:7});assert.equal(event.prevented,1);a.step(6);b.step(6);near(a.state().player.x,b.state().player.x);near(a.state().player.z,b.state().player.z);assert.deepEqual(b.button(dir).captures,[7]);}
  });
  test('Physical Space and digits work with IME Process without a select-through',()=>{const h=harness(logic);h.approach();assert.equal(h.key('Space','Process',{isComposing:true}).prevented,1);assert.equal(h.state().dialog.id,'belt');assert.equal(h.state().action,null);assert.equal(h.document.activeElement,h.ids.decisionTitle);h.key('Space','Process',{repeat:true,isComposing:true});assert.equal(h.state().action,null);h.up('Space');h.choice(c=>c.good);assert.equal(h.state().action.kind,'task');assert.equal(h.state().mistakes,0);assert.equal(h.state().dialog,null);traces.ime=copy(h.state());});
  test('Numpad choice digits and missing/Unidentified code fallback are supported',()=>{for(const prefix of ['Digit','Numpad']){const h=harness(logic);h.open();h.choice(c=>c.good,{codePrefix:prefix});assert.equal(h.state().action.kind,'task');}for(const event of [{code:'',key:'w'},{code:'Unidentified',key:'W'},{code:'',key:'ArrowUp'}]){const h=harness(logic);h.begin();h.dispatch('keydown',event);h.step(5);assert(h.state().player.z>1.5);h.dispatch('keyup',event);const z=h.state().player.z;h.step();near(h.state().player.z,z);}});
  test('Auto-repeat moves but does not open, select, dismiss, pause or toggle camera',()=>{const h=harness(logic);h.begin();h.key('KeyW','Process',{repeat:true});h.step(12);h.up('KeyW');assert.equal(h.state().near,'belt');h.key('Space','Process',{repeat:true});assert.equal(h.state().dialog,null);h.tap('Space');h.key('Digit1','Process',{repeat:true});assert.equal(h.state().action,null);h.key('Escape','Escape',{repeat:true});assert.equal(h.state().status,'playing');h.key('KeyC','c',{repeat:true});assert.equal(h.state().cameraMode,'follow');});
  test('Modifier shortcuts and editable fields never become gameplay input',()=>{for(const props of [{ctrlKey:true},{metaKey:true},{altKey:true},{target:{tagName:'INPUT'}},{target:{tagName:'TEXTAREA'}},{target:{tagName:'SELECT'}},{target:{tagName:'DIV',isContentEditable:true}}]){const h=harness(logic);h.begin();assert.equal(h.key('ArrowUp','ArrowUp',props).prevented,0);h.key('KeyC','c',props);h.step(5);near(h.state().player.z,1.5);assert.equal(h.state().cameraMode,'follow');}});
  test('Opposite controls cancel; touch and keyboard release independently',()=>{const h=harness(logic);h.begin();h.key('KeyW');h.key('KeyS');h.step(5);near(h.state().player.z,1.5);h.up('KeyS');h.button('up').dispatch('pointerdown',{pointerId:8});h.up('KeyW');h.step(5);assert(h.state().player.z>1.5);h.button('up').dispatch('pointerup',{pointerId:8});const z=h.state().player.z;h.step(5);near(h.state().player.z,z);});
  test('Pointer up, cancel and lost capture release touch movement',()=>{for(const end of ['pointerup','pointercancel','lostpointercapture']){const h=harness(logic);h.begin();h.button('right').dispatch('pointerdown',{pointerId:3});h.step(5);assert(h.state().player.x<0);h.button('right').dispatch(end,{pointerId:3});const p=copy(h.state().player);h.step(5);near(h.state().player.x,p.x);assert.equal(h.api.touch.size,0);}});
  test('Open decisions freeze timers and reject movement; Close returns focus to canvas',()=>{const h=harness(logic);h.open();h.step();const before=copy(h.state());h.key('ArrowUp');h.button('up').dispatch('pointerdown',{pointerId:4});h.step(100);assert.deepEqual(copy(h.state()),before);assert.equal(h.api.keys.size,0);assert.equal(h.api.touch.size,0);h.ids.closeDecision.click({detail:1});assert.equal(h.state().dialog,null);assert.equal(h.document.activeElement,h.ids.sceneCanvas);const z=h.state().player.z;h.step(5);near(h.state().player.z,z);});
  test('First correction tip and correction action freeze together until deliberate continuation',()=>{const h=harness(logic);h.open();const code=h.choice(c=>!c.good,{release:false});assert.equal(h.state().lesson.id,'correction');assert.equal(h.state().action.kind,'correction');assert.equal(h.ids.decisionCard.hidden,true);assert.equal(h.ids.lessonCard.hidden,false);assert.equal(h.document.activeElement,h.ids.lessonContinue);h.step();const before=copy(h.state());h.key(code,'Process',{repeat:true});h.ids.lessonContinue.dispatch('click',{detail:0});h.step(100);assert.deepEqual(copy(h.state()),before);h.up(code);h.dismiss();h.step();assert(h.state().action.time>0);traces.firstTip=copy(h.state());});
  test('A Space press inherited from the previous panel cannot dismiss the first tip on key-up',()=>{const h=harness(logic);h.open();h.key('Space',' ');const code=h.choice(c=>!c.good,{release:false});h.up(code);assert.equal(h.state().lesson.id,'correction');h.up('Space',' ');h.ids.lessonContinue.dispatch('click',{detail:0});assert.equal(h.state().lesson?.id,'correction','synthetic native Space key-up click must not dismiss a newly focused tip');});
  test('Repeated native Enter click cannot dismiss first tip; a fresh Enter can',()=>{const h=harness(logic);h.open();const index=h.state().dialog.choices.findIndex(c=>!c.good);h.ids.choices.children[index].focus();h.key('Enter','Enter');h.ids.choices.children[index].click({detail:0});assert.equal(h.state().lesson.id,'correction');h.key('Enter','Enter',{repeat:true});h.ids.lessonContinue.dispatch('click',{detail:0});assert.equal(h.state().lesson.id,'correction');h.up('Enter','Enter');h.key('Enter','Enter');h.ids.lessonContinue.dispatch('click',{detail:0});assert.equal(h.state().lesson,null);h.up('Enter','Enter');});
  test('Fresh Space, Enter and NumpadEnter work after suppressing inherited tip activation',()=>{
    for(const code of ['Space','Enter','NumpadEnter']){const h=harness(logic);h.open();h.key(code,code==='Space'?' ':code);const digit=h.choice(c=>!c.good,{release:false});h.up(digit);h.up(code);h.ids.lessonContinue.dispatch('click',{detail:0});assert.equal(h.state().lesson?.id,'correction');h.key(code,code==='Space'?' ':code);if(code==='Space')h.up(code,' ');h.ids.lessonContinue.dispatch('click',{detail:0});assert.equal(h.state().lesson,null,`${code} fresh activation`);if(code!=='Space')h.up(code);}
  });
  test('Assistive-technology click without held keys and deliberate pointer click can acknowledge tips',()=>{
    const h=harness(logic);h.open();const index=h.state().dialog.choices.findIndex(c=>!c.good);h.ids.choices.children[index].dispatch('click',{detail:0});assert.equal(h.state().lesson?.id,'correction');h.ids.lessonContinue.dispatch('click',{detail:0});assert.equal(h.state().lesson,null);
    const pointer=harness(logic);pointer.open();pointer.key('Space',' ');pointer.choice(c=>!c.good,{release:false});pointer.ids.lessonContinue.dispatch('click',{detail:1});assert.equal(pointer.state().lesson,null);
  });
  test('Formal correction shows its reason through demand updates and completes after exactly 2 active seconds',()=>{
    const h=harness(logic);h.open();h.ids.closeDecision.click({detail:1});h.step(260);h.tap('Space');
    const wrong=h.state().dialog.choices.find(c=>!c.good);h.choice(c=>!c.good);
    assert.equal(h.state().action.duration,2);assert(h.ids.lessonCopy.textContent.includes(wrong.feedback));
    assert.equal(h.ids.feedback.textContent,wrong.feedback);h.step(100);near(h.state().action.time,0);
    h.dismiss();const at=h.state().elapsed;h.step(35);assert.equal(h.state().tasks.find(t=>t.id==='blanket').active,true);
    assert.equal(h.ids.feedback.textContent,wrong.feedback,'new passenger notices cannot hide the correction reason');
    h.step(84);assert(h.state().action);h.tap('Space');assert.equal(h.state().dialog,null);h.step();
    assert.equal(h.state().action,null);near(h.state().elapsed,at+2);assert.equal(h.state().safetyErrors,1);assert.equal(h.state().safety,80);
    h.tap('Space');assert.equal(h.state().dialog.id,'belt');
  });
  test('Formal 2-second correction pauses and blurs without granting early retry or losing remaining time',()=>{
    for(const stop of [h=>h.tap('Escape'),h=>h.dispatch('blur'),h=>h.visibility(true)]){
      const h=harness(logic);h.open();h.choice(c=>!c.good);h.dismiss();h.step(45);near(h.state().action.time,.75);
      stop(h);assert.equal(h.state().status,'paused');h.step();const frozen=copy(h.state());h.step(200);h.tap('Digit1');assert.deepEqual(copy(h.state()),frozen);
      h.visibility(false);h.dispatch('focus');assert.equal(h.state().status,'paused');h.ids.resumeButton.click({detail:1});
      h.step(74);assert(h.state().action);h.tap('Space');assert.equal(h.state().dialog,null);h.step();assert.equal(h.state().action,null);
      assert.equal(h.state().safetyErrors,1);assert.equal(h.state().safety,80);h.tap('Space');assert.equal(h.state().dialog.id,'belt');
    }
  });
  test('Practice wrong choice keeps buttons, specific feedback, focus and score ready for immediate correction',()=>{
    const h=harness(logic);h.open(true);const before=copy(h.state()),buttons=[...h.ids.choices.children],dialog=h.state().dialog;
    const wrong=dialog.choices.find(c=>!c.good);h.choice(c=>!c.good);
    assert.equal(h.state().dialog,dialog);assert.deepEqual(h.ids.choices.children,buttons);
    assert.equal(h.state().action,null);assert.equal(h.state().lesson,null);assert.equal(h.ids.lessonCard.hidden,true);assert.equal(h.ids.actionBox.hidden,true);
    assert.equal(h.ids.decisionCard.hidden,false);assert(h.ids.decisionDescription.textContent.includes(wrong.feedback));
    assert.equal(h.ids.decisionDescription.textContent,h.state().dialog.recoveryFeedback);assert.equal(h.ids.decisionDescription.dataset.kind,'warning');
    assert.equal(h.document.activeElement,h.ids.decisionTitle);assert.equal(h.state().elapsed,before.elapsed);
    assert.equal(h.state().mistakes,0);assert.equal(h.state().safetyErrors,0);assert.equal(h.state().safety,100);assert.equal(h.state().servicePenalty,0);
    h.step();const frozen=copy(h.state());h.step(200);assert.deepEqual(copy(h.state()),frozen);
    h.choice(c=>c.good);assert.equal(h.state().dialog,null);assert.equal(h.state().action.kind,'task');assert.equal(h.ids.decisionCard.hidden,true);
    assert.equal(h.document.activeElement,h.ids.sceneCanvas);h.finishWork();
    assert.equal(h.state().tasks.find(t=>t.id==='belt').done,true);assert.equal(h.state().mistakes,0);
    traces.practiceImmediate={feedback:wrong.feedback,completed:h.state().completed,elapsed:h.state().elapsed};
  });
  test('Practice held digits and duplicate non-repeat events cannot select again until a fresh press',()=>{
    for(const codePrefix of ['Digit','Numpad']){
      const h=harness(logic);h.open(true);const code=h.choice(c=>!c.good,{release:false,codePrefix});
      const serial=h.state().dialog.retrySerial,order=h.state().dialog.choices.map(c=>c.id),before=copy(h.state());
      h.key(code,'Process',{repeat:true,isComposing:true});h.key(code,'Process',{repeat:false,isComposing:true});
      assert.deepEqual(copy(h.state()),before);assert.equal(h.state().dialog.retrySerial,serial);
      h.up(code);h.choice(c=>!c.good,{codePrefix});assert.equal(h.state().dialog.retrySerial,serial+1);
      assert.deepEqual(h.state().dialog.choices.map(c=>c.id),order);assert.equal(h.state().action,null);assert.equal(h.state().lesson,null);
      h.choice(c=>c.good,{codePrefix});assert.equal(h.state().action.kind,'task');
    }
  });
  test('Practice native Enter and NumpadEnter repeats cannot activate the reopened choice; fresh presses can',()=>{
    for(const code of ['Enter','NumpadEnter']){
      const h=harness(logic);h.open(true);const wrong=h.state().dialog.choices.findIndex(c=>!c.good),good=h.state().dialog.choices.findIndex(c=>c.good);
      h.ids.choices.children[wrong].focus();h.key(code);h.ids.choices.children[wrong].click({detail:0});
      const before=copy(h.state());h.key(code,code,{repeat:true});h.ids.choices.children[good].click({detail:0});
      h.key(code,code,{repeat:false});h.ids.choices.children[wrong].click({detail:0});assert.deepEqual(copy(h.state()),before);
      h.up(code);h.ids.choices.children[good].click({detail:0});assert.deepEqual(copy(h.state()),before,'inherited native click stays suppressed after release');
      h.key(code);h.ids.choices.children[good].click({detail:0});assert.equal(h.state().action.kind,'task');h.up(code);
    }
  });
  test('Practice inherited Space key-up cannot select again, while a fresh Space completes its chosen action',()=>{
    const h=harness(logic);h.open(true);const good=h.state().dialog.choices.findIndex(c=>c.good);
    h.ids.choices.children[good].focus();h.key('Space',' ');const digit=h.choice(c=>!c.good,{release:false});
    const before=copy(h.state());h.key('Space',' ',{repeat:true});h.ids.choices.children[good].click({detail:0});assert.deepEqual(copy(h.state()),before);
    h.up(digit);h.up('Space',' ');h.ids.choices.children[good].click({detail:0});assert.deepEqual(copy(h.state()),before);
    h.key('Space',' ');h.up('Space',' ');h.ids.choices.children[good].click({detail:0});assert.equal(h.state().action.kind,'task');
  });
  test('Practice direct Space choice permits a deliberate fresh retry without a forced lesson',()=>{
    const h=harness(logic);h.open(true);const wrong=h.state().dialog.choices.findIndex(c=>!c.good),good=h.state().dialog.choices.findIndex(c=>c.good);
    h.ids.choices.children[wrong].focus();h.key('Space',' ');h.up('Space',' ');h.ids.choices.children[wrong].click({detail:0});
    assert.equal(h.state().action,null);assert.equal(h.state().lesson,null);assert(h.state().dialog.recoveryFeedback);
    h.ids.choices.children[good].focus();h.key('Space',' ');h.up('Space',' ');h.ids.choices.children[good].click({detail:0});assert.equal(h.state().action.kind,'task');
  });
  test('Practice deliberate pointer and assistive clicks can retry, including while an old key is held',()=>{
    for(const detail of [0,1]){
      const h=harness(logic);h.open(true);const wrong=h.state().dialog.choices.findIndex(c=>!c.good),good=h.state().dialog.choices.findIndex(c=>c.good);
      if(detail)h.key('Enter');h.ids.choices.children[wrong].click({detail});assert.equal(h.state().action,null);
      h.ids.choices.children[wrong].click({detail});assert.equal(h.state().dialog.retrySerial,2);assert.equal(h.state().safetyErrors,0);
      h.ids.choices.children[good].click({detail});assert.equal(h.state().action.kind,'task');
    }
  });
  test('Practice retry feedback survives pause and blur; switching to formal resets feedback and first-tip eligibility',()=>{
    const storage={},h=harness(logic,{storage});h.open(true);h.choice(c=>!c.good);const dialog=copy(h.state().dialog);
    for(const stop of [()=>h.tap('Escape'),()=>h.dispatch('blur')]){
      stop();h.step();const before=copy(h.state());h.step(100);assert.deepEqual(copy(h.state()),before);
      h.ids.resumeButton.click({detail:1});assert.deepEqual(copy(h.state().dialog),dialog);assert.equal(h.ids.decisionDescription.textContent,dialog.recoveryFeedback);
      assert.equal(h.ids.decisionCard.hidden,false);assert.equal(h.state().action,null);
    }
    assert(!h.state().lessonSeen.includes('correction'));assert.equal(storage['cabin3d-lessons-v2'],undefined);
    h.tap('Escape');h.ids.modeButton.click({detail:1});h.open();assert.equal(h.state().practice,false);
    assert.equal(h.state().dialog.recoveryFeedback,undefined);assert.equal(h.ids.decisionDescription.dataset.kind,'normal');
    h.choice(c=>!c.good);assert.equal(h.state().action.duration,2);assert.equal(h.state().lesson.id,'correction');assert.equal(h.state().safetyErrors,1);
  });
  test('First tip is shown once, saved after acknowledgement and preserved over round resets',()=>{const storage={},h=harness(logic,{storage});h.open();h.choice(c=>!c.good);h.dismiss();assert.deepEqual(JSON.parse(storage['cabin3d-lessons-v2']),['correction']);h.step(130);assert.equal(h.state().action,null);h.tap('Space');h.choice(c=>!c.good);assert.equal(h.state().lesson,null);h.tap('Escape');h.ids.restartButton.click({detail:1});assert(h.state().lessonSeen.includes('correction'));const second=harness(logic,{storage});second.open();second.choice(c=>!c.good);assert.equal(second.state().lesson,null);});
  test('Malformed storage is ignored safely and unknown remembered tips are filtered',()=>{for(const value of ['not-json','{}','null']){const h=harness(logic,{storage:{'cabin3d-lessons-v2':value}});assert.deepEqual(copy(h.state().lessonSeen),[]);}const h=harness(logic,{storage:{'cabin3d-lessons-v2':'["correction","invalid"]'}});assert.deepEqual(copy(h.state().lessonSeen),['correction']);});
  test('Pause preserves decision content, order, reading freeze and restores button focus',()=>{const h=harness(logic);h.open();const d=copy(h.state().dialog);h.tap('Escape');assert.equal(h.state().status,'paused');assert.equal(h.document.activeElement,h.ids.resumeButton);assert.equal(h.ids.decisionCard.hidden,true);h.step();const before=copy(h.state());h.tap('Digit1');h.step(100);assert.deepEqual(copy(h.state()),before);h.ids.resumeButton.click({detail:1});assert.deepEqual(copy(h.state().dialog),d);assert.equal(h.document.activeElement,h.ids.decisionTitle);});
  test('Blur freezes a first tip and its action; focus never resumes automatically',()=>{const h=harness(logic);h.open();h.choice(c=>!c.good);h.dispatch('blur');assert.equal(h.state().status,'paused');h.step();const before=copy(h.state());h.step(100);h.dispatch('focus');assert.deepEqual(copy(h.state()),before);assert.equal(h.api.keys.size,0);assert.equal(h.api.touch.size,0);h.ids.resumeButton.click({detail:1});assert.equal(h.state().lesson.id,'correction');assert.equal(h.document.activeElement,h.ids.lessonContinue);h.step(100);near(h.state().action.time,0);});
  test('Blur and document-hidden pause active timers and require explicit resume',()=>{for(const hide of [h=>h.dispatch('blur'),h=>h.visibility(true)]){const h=harness(logic);h.open();h.choice(c=>c.good);h.step(20);hide(h);assert.equal(h.state().status,'paused');h.step();const before=copy(h.state());h.visibility(false);h.dispatch('focus');h.step(200);assert.deepEqual(copy(h.state()),before);h.ids.resumeButton.click({detail:1});h.step();assert.equal(h.state().action.time,before.action.time);h.finishWork();assert(h.state().tasks.find(t=>t.id==='belt').done);}});
  test('Movement pressed during action cannot leak into movement after completion',()=>{const h=harness(logic);h.open();h.choice(c=>c.good);const p=copy(h.state().player);h.key('ArrowUp');h.button('up').dispatch('pointerdown',{pointerId:9});h.step(10);h.finishWork();assert.equal(h.state().action,null);assert.equal(h.state().tasks.find(t=>t.id==='belt').done,true);assert.equal(h.api.keys.size,0);assert.equal(h.api.touch.size,0);near(h.state().player.x,p.x);near(h.state().player.z,p.z);assert.equal(h.document.activeElement,h.ids.sceneCanvas);});
  test('Practice restart preserves mode, camera and accessibility while clearing round penalties and progress',()=>{const h=harness(logic,{reducedMotion:true});h.begin(true);h.key('ArrowUp');h.step(12);h.up('ArrowUp');h.tap('Space');h.choice(c=>!c.good);assert.equal(h.state().safetyErrors,0);assert.equal(h.state().safety,100);assert.equal(h.state().action,null);assert.equal(h.state().lesson,null);h.ids.closeDecision.click({detail:1});h.step(20);h.tap('KeyC');h.tap('Escape');const previous=h.state();h.ids.restartButton.click({detail:1});assert.notEqual(h.state(),previous);assert.equal(h.state().practice,true);assert.equal(h.state().cameraMode,'overview');assert.equal(h.state().reducedMotion,true);assert.equal(h.state().elapsed,0);assert.equal(h.state().action,null);assert.equal(h.state().completed,0);assert.equal(h.state().handoffTokens,1);near(h.state().player.z,1.5);assert.equal(h.ids.clock.textContent,'練習');});
  test('Returning from practice to menu then formal resets mode, state and countdown',()=>{const h=harness(logic);h.begin(true);h.step(20);h.tap('Escape');h.ids.modeButton.click({detail:1});assert.equal(h.state().status,'briefing');assert.equal(h.state().practice,false);assert.equal(h.ids.briefCard.hidden,false);h.begin(false);assert.equal(h.state().elapsed,0);assert.equal(h.ids.clock.textContent,'01:40');assert.equal(h.state().practice,false);});
  test('A complete chapter is playable through production movement, E, choice and replay handlers',()=>{
    const h=harness(logic,{seed:1,handsOn:true}),route=[];h.begin();
    function walk(z){let frames=0;while(Math.abs(h.state().player.z-z)>.025&&frames++<1000){assert.equal(h.state().status,'playing');assert.equal(h.state().lesson,null);const code=z>h.state().player.z?'ArrowUp':'ArrowDown';h.key(code);h.step();h.up(code);}assert(frames<1000,`walk reached ${h.state().player.z}, wanted ${z}`);}
    for(const id of ['belt','water','tray','bag','blanket']){const task=h.state().tasks.find(t=>t.id===id);walk(task.z-.85);let guard=0;while(!task.active&&guard++<1000)h.step();assert(task.active);h.tap('Space','Process',{isComposing:true});assert.equal(h.state().dialog?.id,id);h.choice(c=>c.good&&!c.handoff&&!c.ack&&c.id!=='ask');guard=0;while(h.state().action&&guard++<1000){const step=h.state().action.interaction.steps[h.state().action.interaction.index];h.key('Space');if(step.mode==='hold')h.step(42);h.up('Space');}assert(guard<1000);assert.equal(task.done,true);route.push({id,time:h.state().elapsed,x:h.state().player.x,z:h.state().player.z});}
    walk(1.5);h.tap('Space','Process',{isComposing:true});assert.equal(h.state().status,'finished');assert.equal(h.state().grade,'clean');assert.equal(h.state().completed,5);assert.equal(h.ids.resultCard.hidden,false);assert.equal(h.document.activeElement,h.ids.replayButton);assert(h.ids.resultDetails.textContent.includes('檢查 3/3 · 服務 2/2'));assert(h.ids.resultDetails.textContent.includes('回報完成'));h.step();const before=copy(h.state());h.key('ArrowUp');h.step(100);assert.deepEqual(copy(h.state()),before);traces.fullControllerRoute={route,result:copy(h.state())};h.ids.replayButton.click({detail:1});assert.equal(h.state().status,'playing');assert.equal(h.state().completed,0);assert.equal(h.state().elapsed,0);assert.equal(h.state().grade,null);assert.equal(h.document.activeElement,h.ids.sceneCanvas);
  });
  test('Report prompt and scene marker wait for all work; premature E is ignored',()=>{
    for(const phone of [false,true]){
      const h=harness(logic,{phone});h.begin(true);h.step();
      assert.equal(h.state().near,'report');assert.equal(h.ids.interactButton.hidden,true);
      assert(!h.state().renderTargets.some(t=>t.id==='report'));
      const before=copy(h.state());h.tap('Space');assert.deepEqual(copy(h.state()),before);
      for(const task of h.state().tasks){task.done=true;task.active=true;}
      for(const hazard of h.state().hazards)hazard.done=true;
      h.api.refresh(true);h.step();assert.equal(h.ids.interactButton.hidden,false);
      assert.equal(h.ids.interactLabel.textContent,'回報巡艙');assert(h.state().renderTargets.some(t=>t.id==='report'));
      h.ids.interactButton.click({detail:1});assert.equal(h.state().status,'finished');
    }
  });
  test('Upper aisle alert replaces duplicate lower guidance, preserving current action feedback',()=>{
    const h=harness(logic);h.begin(true);h.state().hazards.push({id:'test-hazard',x:0,z:5,row:1,side:'left',done:false});
    h.api.refresh(true);assert.equal(h.ids.aisleAlert.hidden,false);assert.equal(h.ids.guidance.hidden,true);
    h.state().action={kind:'correction',choice:{feedback:'請再觀察'},time:0,duration:2};
    h.api.refresh(true);assert.equal(h.ids.guidance.hidden,false);assert.equal(h.ids.actionBox.hidden,false);
    h.state().action=null;h.state().hazards[0].done=true;h.api.refresh(true);
    assert.equal(h.ids.aisleAlert.hidden,true);assert.equal(h.ids.guidance.hidden,false);
  });
  test('Mobile task list starts collapsed; desktop expanded; live media changes update safely',()=>{for(const phone of [false,true]){const h=harness(logic,{phone});assert.equal(h.ids.taskDetails.open,!phone);h.phoneMedia.matches=!phone;h.phoneMedia.listener();assert.equal(h.ids.taskDetails.open,phone);h.motion.matches=true;h.motion.listener();assert.equal(h.state().reducedMotion,true);}});
  test('Scene target labels use returned view coordinates and hide stale labels without intercepting controls',()=>{const h=harness(logic);h.fakeView.labels=[{id:'belt',visible:true,kind:'safety',near:true,text:'安全帶',x:100,y:200}];h.step();const label=h.ids.targetLabels.children[0];assert.equal(label.children.length,2);assert.equal(label.children[0].tagName,'IMG');assert.equal(label.children[1].textContent,'安全帶');assert.equal(label.style.backgroundImage,undefined);assert.equal(label.className,'target-label safety near expanded');assert.equal(label.style.left,'100px');assert.equal(label.style.top,'200px');h.fakeView.labels=[];h.step();assert.equal(label.hidden,true);});
  test('Label writes are batched before measuring and compact/detail transitions keep one icon',()=>{const h=harness(logic);h.Element.prototype.getBoundingClientRect=function(){if(this.className.includes('target-label')){assert.equal(h.ids.targetLabels.children.length,2,'all label writes precede measurements');return {width:100,height:32};}return {width:0,height:0};};h.fakeView.labels=[{id:'belt',visible:true,kind:'safety',near:true,icon:'alert',text:'安全帶',x:150,y:200},{id:'detail',visible:true,kind:'detail',text:'空櫃',x:350,y:200}];h.step();assert.equal(h.calls.errors.length,0);const label=h.ids.targetLabels.children[0],detail=h.ids.targetLabels.children[1];assert.equal(detail.children.length,1);const icon=label.children[0];h.step();assert.equal(label.children[0],icon,'same content reuses its image');h.fakeView.labels[0].near=false;h.step();assert.equal(label.children.length,2);assert.equal(label.children[1].textContent,'');assert(label.className.includes('compact'));});
  test('Fatal WebGL failure guards all retained controls, keyboard, touch and frame updates',()=>{const h=harness(logic);h.open();h.choice(c=>c.good);h.step(10);h.api.fail(new Error('WebGL disabled by browser'));assert.equal(h.ids.loading.hidden,true);assert.equal(h.ids.webglError.hidden,false);assert.equal(h.document.body.dataset.panel,'error');for(const id of ['startButton','practiceButton','interactButton','pauseButton','cameraButton'])assert.equal(h.ids[id].disabled,true,id);const before=copy(h.state()),renders=h.calls.render,fallback=h.ids.sceneStatus.textContent;for(const code of ['Escape','Space','KeyW','KeyA','KeyS','KeyD','ArrowUp','Digit1','Numpad2','KeyC'])assert.equal(h.key(code,'Process').prevented,0);for(const id of ['startButton','practiceButton','interactButton','closeDecision','lessonContinue','pauseButton','resumeButton','restartButton','replayButton','modeButton','resultMenuButton','cameraButton'])h.ids[id].dispatch('click',{detail:1});h.button('up').dispatch('pointerdown',{pointerId:9});h.step(200);assert.deepEqual(copy(h.state()),before);assert.equal(h.calls.render,renders);assert.equal(h.ids.sceneStatus.textContent,fallback);assert.equal(h.api.keys.size,0);assert.equal(h.api.touch.size,0);assert.equal(h.calls.errors.length,1);h.ids.reloadButton.click();assert.equal(h.calls.reload,1);traces.fatalFallback={status:h.state().status,sceneStatus:fallback,renderCount:renders};});
  test('View render exceptions enter fatal fallback and stop later renderer calls',()=>{const h=harness(logic);h.begin();h.fakeView.render=()=>{throw new Error('render failed');};h.step();assert.equal(h.ids.webglError.hidden,false);assert.equal(h.state().status,'paused');const before=copy(h.state());h.step(100);assert.deepEqual(copy(h.state()),before);});
  test('Pagehide disposes once, freezes frames, and BFCache pageshow requests reload',()=>{const h=harness(logic);h.begin();h.key('ArrowUp');h.step(3);h.dispatch('pagehide');h.dispatch('pagehide');assert.equal(h.calls.dispose,1);const before=copy(h.state()),renders=h.calls.render;h.step(100);assert.deepEqual(copy(h.state()),before);assert.equal(h.calls.render,renders);assert.equal(h.api.keys.size,0);h.dispatch('pageshow',{persisted:false});assert.equal(h.calls.reload,0);h.dispatch('pageshow',{persisted:true});assert.equal(h.calls.reload,1);});
  const result={generatedAt:new Date().toISOString(),suite:'Preflight 3D actual production controller in VM DOM stub',command:'node tests/preflight-3d-input.test.cjs',mainSha256:crypto.createHash('sha256').update(mainSource).digest('hex'),logicSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'public/preflight.mjs'))).digest('hex'),summary:{total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length},notes:['Production event handler bodies and frame loop run unchanged; only ESM import and final scene boot are replaced.','Real preflight.mjs logic is imported; interaction routes use production listeners and frame inputs, with no task/score/position teleports.','DOM, localStorage, media queries and Three view are stubs. No browser was launched.','Native Enter/Space defaults are modeled as explicit event sequences; browser key event/default-action timing and visual layout still require native verification.'],results,traces};fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/preflight-3d-input-results.json'),JSON.stringify(result,null,2)+'\n');console.log(`\n${result.summary.passed}/${result.summary.total} preflight input tests passed; ${result.summary.failed} failed.`);if(result.summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});

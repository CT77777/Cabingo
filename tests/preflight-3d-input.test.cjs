'use strict';
// Production controller code runs unchanged after removing its ESM import and
// final asynchronous scene boot. DOM, storage and the Three view are test doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),mainSource=fs.readFileSync(path.join(root,'public/main.js'),'utf8'),html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const results=[],traces={},copy=x=>JSON.parse(JSON.stringify(x));
const near=(a,b,message='')=>assert(Math.abs(a-b)<1e-7,`${message}: ${a} versus ${b}`);
function harness(logic,{seed=1701,handsOn=true,contextual=false,guidedBoarding=false,reducedMotion=false,phone=false,chapterId='preflight',storage={},storageReadError=false,storageWriteError=false}={}) {
  const ids={},windowEvents={},documentEvents={},raf=[],calls={render:0,dispose:0,reload:0,errors:[]};let document;
  class Element {
    constructor(tag='div',id){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.parentNode=null;this.dataset={};this.style={setProperty(name,value){this[name]=value;}};this.attrs={};this.events={};this.hidden=false;this.disabled=false;this.textContent='';this.className='';this.captures=[];this.open=false;this.classList={toggle:(name,on)=>{const c=new Set(this.className.split(/\s+/).filter(Boolean));if(on)c.add(name);else c.delete(name);this.className=[...c].join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
    addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
    dispatch(name,event={}){const e={type:name,target:this,detail:0,prevented:0,preventDefault(){this.prevented++;},...event};for(const fn of this.events[name]||[])fn(e);return e;}
    click(event={}){if(!this.disabled)return this.dispatch('click',event);}
    append(...children){for(const c of children){c.parentNode=this;this.children.push(c);}}
    replaceChildren(...children){for(const c of this.children)c.parentNode=null;this.children=[];this.append(...children);}
    querySelector(selector){for(const c of this.children){if(selector.toUpperCase()===c.tagName)return c;const found=c.querySelector(selector);if(found)return found;}return null;}
    getClientRects(){return this.hidden?[]:[{width:100,height:30}];}
    querySelectorAll(selector){const tags=selector.split(',').map(t=>t.toUpperCase());return this.children.flatMap(c=>[...(tags.includes(c.tagName)?[c]:[]),...c.querySelectorAll(selector)]);}
    getBoundingClientRect(){return {left:0,top:0,right:116,bottom:116,width:this.id==='joystick'?116:0,height:this.id==='joystick'?116:0};}
    focus(){document.activeElement=this;}
    scrollIntoView(){this.scrolled=true;}
    setAttribute(name,value){this.attrs[name]=String(value);}
    setPointerCapture(id){this.captures.push(id);}
  }
  for(const m of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=ids[m[2]]=new Element(m[1],m[2]);e.hidden=/\bhidden(?:\s|>|=)/.test(m[0]);e.disabled=/\bdisabled(?:\s|>|=)/.test(m[0]);e.open=/\bopen(?:\s|>|=)/.test(m[0]);}
  ids.decisionCard.append(ids.choices,ids.closeDecision);ids.lessonCard.append(ids.lessonContinue);ids.pauseCard.append(ids.resumeButton,ids.restartButton,ids.modeButton);ids.resultCard.append(ids.nextChapterButton,ids.replayButton,ids.resultMenuButton,ids.resultDetails,ids.bestRecord,ids.resultCodexButton);ids.resultCard.append(ids.retryTaskList);ids.retryOverlay.append(ids.closeRetry,ids.retryTitle,ids.retryQuestion,ids.retryFeedback,ids.retryComparison,ids.retryReturn);ids.retryQuestion.append(ids.retryQuote,ids.retryContext,ids.retryEvidence,ids.retryChoices);ids.retryComparison.append(ids.retryComparisonTitle,ids.retryBefore,ids.retryAfter,ids.retryComparisonNote,ids.retryAgain);ids.resultOverlay.append(ids.resultCard);ids.briefCard.append(ids.startButton,ids.assessmentButton);
  ids.codexOverlay.append(ids.closeCodex,ids.codexContent);
  const buttons=['up','left','down','right'].map(dir=>{const b=new Element('button');b.dataset.dir=dir;return b;});
  document={body:new Element('body'),hidden:false,activeElement:ids.sceneCanvas,getElementById:id=>{assert(ids[id],`unknown DOM ID ${id}`);return ids[id];},createElement:tag=>new Element(tag),querySelectorAll:selector=>{assert.equal(selector,'[data-dir]');return buttons;},addEventListener:(name,fn)=>(documentEvents[name]??=[]).push(fn)};
  const motion={matches:reducedMotion,listener:null,addEventListener(name,fn){this.listener=fn;}},phoneMedia={matches:phone,listener:null,addEventListener(name,fn){this.listener=fn;}};
  const window={addEventListener:(name,fn)=>(windowEvents[name]??=[]).push(fn)};
  const fakeView={labels:[],render(){calls.render++;return {labels:this.labels};},dispose(){calls.dispose++;}};
  const testMath=Object.create(Math);testMath.random=()=>seed/1e9;
  const context=vm.createContext({document,window,matchMedia:q=>q.includes('max-width')?phoneMedia:motion,location:{reload(){calls.reload++;}},localStorage:{getItem:key=>{if(storageReadError)throw Error('read blocked');return storage[key]??null;},setItem:(key,value)=>{if(storageWriteError)throw Error('write blocked');storage[key]=String(value);}},requestAnimationFrame:fn=>{raf.push(fn);return raf.length;},console:{...console,error:(...args)=>calls.errors.push(args.map(String))},Math:testMath,Set,Map,String,Number,Error,encodeURIComponent,...logic,parseCampaign:(raw,options)=>{const c=logic.parseCampaign(raw,options);if(chapterId==='preflight'&&!raw){if(!c.unlockedChapterIds.includes('preflight'))c.unlockedChapterIds.push('preflight');c.currentChapterId='preflight';}return c;},createState:opts=>logic.createState({...opts,handsOn,contextual,guidedBoarding}),createCabinAudio:()=>({unlock(){calls.unlock=(calls.unlock||0)+1;return Promise.resolve(true);},setPreferences(p){calls.audioPrefs={...p};},setMode(mode){calls.audioMode=mode;},play(e){(calls.audioEvents??=[]).push(e);},reset(){calls.audioResets=(calls.audioResets||0)+1;},dispose(){calls.audioDisposals=(calls.audioDisposals||0)+1;},getStatus(){return 'ready';}}),__fakeView:fakeView});
  let source=mainSource.replace(/import\s+\{[^\n]+\}\s+from\s+'\.\/preflight\.mjs(?:\?v=[^']+)?';\s*\n/,'');
  assert.notEqual(source,mainSource,'expected production preflight import');
  source=source.replace(/^import[^\n]+;\s*\n/gm,'');
  assert(/refresh\(true\);boot\(\);\s*$/.test(source),'expected final boot call');
  source=source.replace(/refresh\(true\);boot\(\);\s*$/,'refresh(true);');
  source+='\nready=true;view=__fakeView;hide("loading",true);$("startButton").disabled=false;refresh(true);window.__test={getState:()=>state,frame,keys,touch,held,fail,refresh,updateLabels,screenInputToWorld};';
  vm.runInContext(source,context,{filename:'public/main.js (unaltered production controller body)'});
  const api=window.__test;let time=0;
  function dispatch(name,event={}){const e={type:name,key:'',code:'',repeat:false,target:document.activeElement,metaKey:false,ctrlKey:false,altKey:false,prevented:0,preventDefault(){this.prevented++;},...event};for(const fn of windowEvents[name]||[])fn(e);return e;}
  function step(n=1){for(let i=0;i<n;i++){time+=1000/60;api.frame(time);}return api.getState();}
  const key=(code,key=code,extra={})=>dispatch('keydown',{code,key,...extra}),up=(code,key=code)=>dispatch('keyup',{code,key});
  function tap(code,keyValue=code,extra={}){const e=key(code,keyValue,extra);up(code,keyValue);return e;}
  function begin(practice=false){ids.startButton.click({detail:1});assert.equal(api.getState().status,'playing');if(api.getState().lesson?.id==='serviceIntro')ids.lessonContinue.click({detail:1});}
  function approach(practice=false){begin(practice);key('ArrowUp');for(let i=0;i<100&&api.getState().near!=='belt';i++)step();up('ArrowUp');assert.equal(api.getState().near,'belt');}
  function open(practice=false){approach(practice);tap('Space','Process',{isComposing:true});step();assert.equal(api.getState().dialog.id,'belt');}
  function choice(predicate,{release=true,codePrefix='Digit'}={}){const index=typeof predicate==='number'?predicate:api.getState().dialog.choices.findIndex(predicate);assert(index>=0);const code=`${codePrefix}${index+1}`;key(code,'Process',{isComposing:true});if(release)up(code,'Process');return code;}
  function finishWork(){let n=0;while(api.getState().action&&n++<12){const step=api.getState().action.interaction.steps[api.getState().action.interaction.index];key('Space');if(step.mode==='hold')stepFrames(42);up('Space');}assert(!api.getState().action);function stepFrames(n){step(n);}}
  function dismiss(){ids.lessonContinue.click({detail:1});assert.equal(api.getState().lesson,null);}
  return {ids,buttons,api,document,motion,phoneMedia,calls,raf,storage,fakeView,Element,dispatch,key,up,tap,step,begin,approach,open,choice,dismiss,finishWork,state:()=>api.getState(),button:dir=>({get captures(){return ids.joystick.captures;},dispatch(type,event){const offset={up:[0,-42],down:[0,42],left:[-42,0],right:[42,0]}[dir];return ids.joystick.dispatch(type,{...event,clientX:58+offset[0],clientY:58+offset[1]});}}),visibility(hidden){document.hidden=hidden;for(const fn of documentEvents.visibilitychange||[])fn();}};
}
(async()=>{
  const logic={...await import(pathToFileURL(path.join(root,'public/preflight.mjs'))),...await import(pathToFileURL(path.join(root,'public/presentation.mjs'))),...await import(pathToFileURL(path.join(root,'public/results.mjs'))),...await import(pathToFileURL(path.join(root,'public/assessment.mjs'))),...await import(pathToFileURL(path.join(root,'public/assessment-records.mjs'))),...await import(pathToFileURL(path.join(root,'public/chapters/index.mjs'))),...await import(pathToFileURL(path.join(root,'public/campaign.mjs'))),...await import(pathToFileURL(path.join(root,'public/interaction.mjs'))),...await import(pathToFileURL(path.join(root,'public/boarding.mjs'))),...await import(pathToFileURL(path.join(root,'public/boarding-ui.mjs'))),...await import(pathToFileURL(path.join(root,'public/retry.mjs'))),...await import(pathToFileURL(path.join(root,'public/learning.mjs'))),...await import(pathToFileURL(path.join(root,'public/knowledge/index.mjs')))};

  const test=(name,fn)=>{try{fn();results.push({name,passed:true});console.log('PASS',name);}catch(error){results.push({name,passed:false,error:error.message,stack:error.stack});console.error('FAIL',name,'\n ',error.message);}};
  function finishAssessment(h,{wrong={},elapsed=35}={}){
    h.ids.assessmentButton.click({detail:1});const s=h.state();
    assert(s.assessment&&!s.practice);assert(!s.lesson);assert(!s.boarding?.coach);
    for(const t of s.tasks){
      s.player.x=0;s.player.z=t.z-.8;assert(logic.interact(s));h.api.refresh(true);
      assert.equal(h.ids.decisionDescription.textContent,s.dialog.description);assert(!h.ids.decisionDescription.hidden);
      const match=wrong[t.id],index=match?s.dialog.choices.findIndex(c=>c.id===match):s.dialog.choices.findIndex(c=>c.good);
      assert(index>=0);h.tap(`Digit${index+1}`);assert(!s.dialog&&!s.action&&!s.recovery);
      assert.equal(h.ids.feedback.textContent,'已記錄作答，結束後統一講評。');
    }
    s.elapsed=elapsed;s.player.x=0;s.player.z=1.5;h.tap('Space');assert.equal(s.status,'finished');return s;
  }
  test('Exactly two mode entries follow the selected chapter, with released chapters selectable',()=>{
    const h=harness(logic,{chapterId:'boarding'});assert(!h.ids.practiceButton);assert.equal(h.ids.startButton.textContent,'開始情境演練');
    assert(h.ids.assessmentIntro.textContent.includes('登機 · 90 秒 · 5 題'));
    h.ids.chapterList.children.find(b=>b.dataset.chapter==='preflight').click({detail:1});
    assert(h.ids.assessmentIntro.textContent.includes('起飛前巡艙 · 100 秒 · 6 題'));
    assert(h.ids.chapterList.children.filter(b=>!b.disabled).length===2);h.begin();assert(h.state().practice);assert.equal(h.ids.clock.textContent,'演練');
  });
  test('Both chapter assessments defer all feedback, save stars once and replay the same chapter',()=>{
    for(const chapterId of ['boarding','preflight']){
      const h=harness(logic,{chapterId,contextual:true}),s=finishAssessment(h);
      const raw=h.storage[logic.ASSESSMENT_STORAGE_KEY],saved=JSON.parse(raw).records[`${chapterId}:2`];
      assert.equal(saved.stars,3);assert.equal(saved.elapsed,35);assert.equal(saved.total,chapterId==='boarding'?5:6);
      assert(h.ids.resultStars.textContent.includes('3 / 3'));assert(h.ids.bestRecord.textContent.includes('已更新'));
      assert.equal(h.ids.trainingFeedbackList.children.length,s.tasks.length);assert.equal(h.ids.priorityCount.textContent,'1 / 1');
      assert(h.ids.scoreRow.hidden&&h.ids.handoffCount.hidden);assert.equal(h.storage['cabin3d-best-final-check-v1'],undefined);
      h.api.refresh(true);assert.equal(h.storage[logic.ASSESSMENT_STORAGE_KEY],raw);
      h.ids.replayButton.click({detail:1});assert(h.state().assessment);assert.equal(h.state().chapterId,chapterId);assert.equal(h.state().judgments.length,0);
      h.tap('Escape');h.ids.modeButton.click({detail:1});assert(h.state().practice&&!h.state().assessment);assert.equal(h.state().chapterId,chapterId);
    }
  });
  test('Better assessment records replace only the matching chapter/version; worse and ties preserve the best',()=>{
    const storage={},h=harness(logic,{chapterId:'boarding',storage});finishAssessment(h,{wrong:{guide:'row'},elapsed:20});
    assert.equal(JSON.parse(storage[logic.ASSESSMENT_STORAGE_KEY]).records['boarding:2'].stars,2);
    function menu(){h.ids.resultMenuButton.click({detail:1});}
    menu();finishAssessment(h,{elapsed:40});assert.equal(JSON.parse(storage[logic.ASSESSMENT_STORAGE_KEY]).records['boarding:2'].stars,3);
    const best=storage[logic.ASSESSMENT_STORAGE_KEY];menu();finishAssessment(h,{elapsed:45});assert.equal(storage[logic.ASSESSMENT_STORAGE_KEY],best);
    menu();finishAssessment(h,{elapsed:40});assert.equal(storage[logic.ASSESSMENT_STORAGE_KEY],best);
    menu();finishAssessment(h,{elapsed:30});assert.equal(JSON.parse(storage[logic.ASSESSMENT_STORAGE_KEY]).records['boarding:2'].elapsed,30);
    menu();h.ids.chapterList.children.find(b=>b.dataset.chapter==='preflight').click({detail:1});finishAssessment(h);assert.equal(Object.keys(JSON.parse(storage[logic.ASSESSMENT_STORAGE_KEY]).records).length,2);
  });
  test('Unsafe priority choices cannot earn stars; prompted retry preserves the scored first decision',()=>{
    const h=harness(logic,{chapterId:'boarding',contextual:true}),s=finishAssessment(h,{wrong:{priority:'cross'}});
    assert(h.ids.resultStars.textContent.includes('0 / 3'));assert.equal(h.storage[logic.ASSESSMENT_STORAGE_KEY],undefined);
    const first=copy(s.judgments),trigger=h.ids.retryTaskList.children[0];trigger.click({detail:1});assert(h.ids.retryEvidence.hidden);
    const good=s.judgments.find(j=>j.taskId==='priority').retryDecision.choices.findIndex(c=>c.good);h.tap(`Digit${good+1}`);h.ids.retryReturn.click({detail:1});
    assert.deepEqual(copy(s.judgments),first);assert(h.ids.resultStars.textContent.includes('0 / 3'));assert.equal(h.storage[logic.ASSESSMENT_STORAGE_KEY],undefined);
  });
  test('Practice completion and corrections preserve old scores, exam scores and collections',()=>{
    const saved={version:1,records:{'boarding:2':{chapterId:'boarding',questionVersion:2,total:5,stars:3,incorrect:0,safetyErrors:0,elapsed:30}}};
    const storage={'cabingo-assessment-best-v1':JSON.stringify(saved),'cabin3d-best-final-check-v1':'legacy','cabin3d-codex-v1':'{"version":1,"unlockedIds":["seat-belt"]}'},before=copy(storage);
    const h=harness(logic,{chapterId:'preflight',storage,contextual:true});h.begin();const s=h.state();s.status='finished';s.endReason='complete';s.grade='clean';h.api.refresh(true);
    assert.equal(h.ids.resultStars.textContent,'不計星等');assert(h.ids.bestRecord.textContent.includes('不保存'));for(const key of Object.keys(before))assert.equal(storage[key],before[key]);
  });
  test('Assessment timeout, hidden-page pause and instructions reveal no correctness hints',()=>{
    for(const chapterId of ['boarding','preflight']){
      const h=harness(logic,{chapterId,contextual:true});h.ids.assessmentButton.click({detail:1});const s=h.state();
      h.ids.infoButton.click({detail:1});assert(s.status==='paused');assert(h.ids.preflightRules.hidden);assert(h.ids.chapterRules.textContent.includes('每題只能作答一次'));
      h.ids.infoButton.click({detail:1});h.visibility(true);const time=s.elapsed;h.step(60);assert.equal(s.elapsed,time);h.visibility(false);h.ids.awayResumeButton.click({detail:1});
      s.player.z=s.tasks[0].z-.8;logic.interact(s);h.api.refresh(true);s.elapsed=s.duration-.01;h.step();
      assert(s.status==='finished');assert(!s.dialog);assert(h.ids.resultStars.textContent.includes('0 / 3'));assert.equal(h.storage[logic.ASSESSMENT_STORAGE_KEY],undefined);
      assert(h.ids.trainingFeedbackList.children.every(row=>row.dataset.status==='unobserved'));
    }
  });
  test('Storage denial and future schemas preserve gameplay and existing data',()=>{
    for(const options of [{storageReadError:true},{storageWriteError:true},{storage:{'cabingo-assessment-best-v1':'{"version":99,"future":true}'}}]){
      const h=harness(logic,{chapterId:'boarding',contextual:true,...options}),before=h.storage[logic.ASSESSMENT_STORAGE_KEY];finishAssessment(h);
      assert(h.ids.resultStars.textContent.includes('3 / 3'));assert.equal(h.storage[logic.ASSESSMENT_STORAGE_KEY],before);assert(/無法儲存/.test(h.ids.bestRecord.textContent));
    }
  });
  function retryResult({practice=false,chapterId='preflight'}={}){
    const h=harness(logic,{contextual:true,chapterId});h.begin(practice);const s=h.state();
    if(s.lesson)h.dismiss();
    const task=s.tasks.find(t=>t.id===(chapterId==='boarding'?'guide':'belt'));
    if(chapterId==='preflight'){s.characterMemory={elder:{helped:true}};task.variant=0;}
    s.player.z=task.z-.8;logic.interact(s);h.api.refresh(true);h.choice(c=>!c.good);
    if(!s.recovery.ready)h.step(130);h.ids.recoveryContinue.click({detail:1});h.choice(c=>c.good);h.step(180);
    s.status='finished';s.endReason='timeout';s.grade='incomplete';h.api.refresh(true);return h;
  }
  test('Targeted retry preserves the finished chapter, scores and all storage while comparing two attempts',()=>{
    const h=retryResult(),before=copy(h.state()),storage=copy(h.storage);assert.equal(h.ids.retryTaskList.children.length,1);
    const trigger=h.ids.retryTaskList.children[0];assert.equal(trigger.dataset.complete,'false');assert(trigger.children[2].hidden);trigger.click({detail:1});assert(!h.ids.retryOverlay.hidden);assert(h.ids.resultOverlay.inert);assert.equal(h.document.activeElement,h.ids.retryTitle);
    assert.equal(h.ids.retryTitle.textContent,'旅客正在看手機，安全帶尚未扣好，你會如何提醒？');assert.equal(h.ids.retryQuote.textContent,'旅客：「嗯？你剛剛說什麼？」');assert(h.state().tasks.find(t=>t.id==='belt').quote.includes('又見面了'));
    assert.equal(h.ids.retryContext.textContent,h.state().judgments[0].retryDecision.description);
    const good=h.state().judgments[0].retryDecision.choices.findIndex(c=>c.good),wrong=h.state().judgments[0].retryDecision.choices.findIndex(c=>!c.good);
    h.tap(`Digit${wrong+1}`);assert(!h.ids.retryFeedback.hidden);assert(h.ids.retryComparison.hidden);assert.equal(h.document.activeElement,h.ids.retryFeedback);
    h.tap(`Digit${good+1}`);assert(!h.ids.retryComparison.hidden);assert(h.ids.retryQuestion.hidden);assert(h.ids.retryBefore.textContent.includes('1 次'));assert(h.ids.retryAfter.textContent.includes('1 次後答對'));
    h.ids.retryAgain.click({detail:1});assert(h.ids.retryComparison.hidden);h.tap(`Numpad${good+1}`);assert.equal(h.ids.retryAfter.textContent,'這次第一次就答對');
    h.ids.retryReturn.click({detail:1});assert(h.ids.retryOverlay.hidden);assert(!h.ids.resultOverlay.inert);assert.equal(h.document.activeElement,trigger);assert(trigger.children[1].textContent.includes('這次選錯 0 次'));assert.equal(trigger.dataset.complete,'true');assert(!trigger.children[2].hidden);assert.equal(trigger.children[2].children[0].textContent,'✓');assert.equal(trigger.children[2].children[1].textContent,'已完成');
    trigger.click({detail:1});h.tap('Escape');assert.equal(trigger.dataset.complete,'true','completed retry remains marked when a later retry is cancelled');
    assert.deepEqual(copy(h.state()),before);assert.deepEqual(copy(h.storage),storage);
  });

  test('Retry blocks inherited Enter and repeated digits, traps focus and closes with Escape',()=>{
    const h=retryResult({practice:true}),trigger=h.ids.retryTaskList.children[0];h.key('Enter');trigger.click({detail:0});
    h.ids.retryChoices.children[0].click({detail:0});assert(h.ids.retryFeedback.hidden);h.key('Enter','Enter',{repeat:true});assert(h.ids.retryFeedback.hidden);h.up('Enter');
    assert.equal(h.tap('PageDown').prevented,0,'reading keys keep native modal scrolling');h.tap('Tab');assert.equal(h.document.activeElement,h.ids.closeRetry);h.key('Tab','Tab',{shiftKey:true});h.up('Tab');assert.equal(h.document.activeElement,h.ids.retryChoices.children.at(-1));
    const wrong=h.state().judgments[0].retryDecision.choices.findIndex(c=>!c.good);h.key(`Digit${wrong+1}`);h.key(`Digit${wrong+1}`,'',{repeat:true});h.up(`Digit${wrong+1}`);
    const good=h.state().judgments[0].retryDecision.choices.findIndex(c=>c.good);h.tap(`Digit${good+1}`);assert(h.ids.retryAfter.textContent.includes('1 次後答對'));
    h.ids.retryReturn.click({detail:0});assert(!h.ids.retryOverlay.hidden,'answer key release cannot click through to return');
    h.key('Enter');h.ids.retryReturn.click({detail:0});h.key('Enter','Enter',{repeat:true});trigger.click({detail:0});assert(h.ids.retryOverlay.hidden);h.up('Enter');
    trigger.click({detail:1});h.tap('Escape');assert(h.ids.retryOverlay.hidden);assert.equal(h.document.activeElement,trigger);
  });

  test('Boarding retry displays the original graphic clues and can cancel without marking completion',()=>{
    const h=retryResult({chapterId:'boarding'}),trigger=h.ids.retryTaskList.children[0],before=copy(h.state());trigger.click({detail:1});
    assert(!h.ids.retryEvidence.hidden);assert.equal(h.ids.retryEvidence.children.length,2);assert(!h.ids.retryReference.hidden);
    h.visibility(true);h.step(100);h.visibility(false);assert.deepEqual(copy(h.state()),before);
    h.tap('Escape');assert(!trigger.children[1].textContent.includes('重練完成'));assert.equal(trigger.dataset.complete,'false');assert(trigger.children[2].hidden);assert.deepEqual(copy(h.state()),before);
    trigger.click({detail:1});h.api.fail(Error('test context loss'));assert(h.ids.retryOverlay.hidden);assert(!h.ids.resultOverlay.inert);
  });

  test('Clean results have no retry tasks and a fresh run clears old retry completions',()=>{
    const h=retryResult({practice:true});h.ids.retryTaskList.children[0].click({detail:1});const good=h.state().judgments[0].retryDecision.choices.findIndex(c=>c.good);h.tap(`Digit${good+1}`);h.ids.retryReturn.click({detail:1});assert.equal(h.ids.retryTaskList.children[0].dataset.complete,'true');h.ids.replayButton.click({detail:1});
    const s=h.state();s.status='finished';s.endReason='timeout';s.grade='incomplete';h.api.refresh(true);
    assert.equal(h.ids.retryTaskList.children.length,0);assert(h.ids.retryPracticeHint.textContent.includes('沒有選錯'));assert(h.ids.retryOverlay.hidden);
  });

  test('Result feedback describes corrections and missing service records, and resets per run',()=>{
    const h=harness(logic,{contextual:true});h.open(true);h.choice(c=>!c.good);h.ids.recoveryContinue.click({detail:1});h.choice(c=>c.good);h.step(180);
    const s=h.state();assert(s.tasks.find(t=>t.id==='belt').done);s.status='finished';s.endReason='timeout';s.grade='incomplete';h.api.refresh(true);
    const rows=h.ids.trainingFeedbackList.children;assert.equal(rows.length,3);assert.equal(rows[0].dataset.status,'improve');assert(rows[0].children[1].textContent.includes('第一次就選錯'));assert(rows[0].children[1].textContent.includes('修正並完成'));assert.equal(rows[1].dataset.status,'improve');assert(h.ids.trainingScope.textContent.includes('情境演練'));
    assert(!h.ids.trainingFeedback.hidden);assert.equal(s.safetyErrors,0);h.api.refresh(true);assert.equal(h.ids.trainingFeedbackList.children[0],rows[0]);
    h.ids.replayButton.click({detail:1});const next=h.state();next.status='finished';next.endReason='timeout';next.grade='incomplete';h.api.refresh(true);assert.equal(h.ids.trainingFeedbackList.children[0].dataset.status,'unobserved');assert(!h.ids.trainingFeedbackList.children[0].children[1].textContent.includes('修正並完成'));
  });

  test('Phone checklist follows the measured mission bottom when alerts wrap or resize',()=>{const h=harness(logic,{phone:true});h.begin(true);h.ids.missionHud.getBoundingClientRect=()=>({bottom:246,height:180});h.dispatch('resize');assert.equal(h.document.body.style['--mission-bottom'],'246px');h.ids.missionHud.getBoundingClientRect=()=>({bottom:315,height:249});h.dispatch('resize');assert.equal(h.document.body.style['--mission-bottom'],'315px');});

  test('Codex opens from briefing, traps keys, closes with Escape and restores focus without starting play',()=>{
    const h=harness(logic,{chapterId:'boarding'});h.ids.codexButton.click({detail:1});assert(!h.ids.codexOverlay.hidden);assert(h.ids.gameSurface.inert);assert.equal(h.document.activeElement,h.ids.closeCodex);h.step();const frozen=copy(h.state());h.key('ArrowUp');h.tap('Space');h.ids.startButton.click({detail:1});h.step(50);assert.deepEqual(copy(h.state()),frozen);h.tap('Tab');assert.equal(h.document.activeElement,h.ids.closeCodex);h.tap('Escape');assert(h.ids.codexOverlay.hidden);assert(!h.ids.gameSurface.inert);assert.equal(h.document.activeElement,h.ids.codexButton);
  });

  test('Codex keyboard skips source links inside collapsed cards and cycles visible summaries',()=>{const h=harness(logic,{storage:{'cabin3d-codex-v1':'{"version":1,"unlockedIds":["seat-belt"]}'}});h.open(true);h.ids.closeDecision.click({detail:1});h.tap('Escape');h.ids.modeButton.click({detail:1});h.ids.codexButton.click({detail:1});h.tap('Tab');assert.equal(h.document.activeElement.tagName,'SUMMARY');h.tap('Tab');assert.equal(h.document.activeElement,h.ids.closeCodex);h.key('Tab','Tab',{shiftKey:true});h.up('Tab');assert.equal(h.document.activeElement.tagName,'SUMMARY');h.document.body.focus();h.key('Tab','Tab',{shiftKey:true});h.up('Tab');assert.equal(h.document.activeElement.tagName,'SUMMARY');});

  test('Codex ignores held Enter after closing and WebGL failure closes its modal safely',()=>{const h=harness(logic);h.ids.codexButton.click({detail:1});h.key('Enter','Enter',{target:h.ids.closeCodex});h.ids.closeCodex.click({detail:0});const repeat=h.key('Enter','Enter',{repeat:true,target:h.ids.codexButton});assert.equal(repeat.prevented,1);h.ids.codexButton.click({detail:0});assert(h.ids.codexOverlay.hidden);h.up('Enter');h.ids.codexButton.click({detail:1});assert(!h.ids.codexOverlay.hidden);h.api.fail(Error('context lost'));assert(h.ids.codexOverlay.hidden);assert(!h.ids.gameSurface.inert);});

  test('Losing focus clears codex close-key suppression even when keyup is missed',()=>{const h=harness(logic);h.ids.codexButton.click({detail:1});h.key('Enter','Enter',{target:h.ids.closeCodex});h.ids.closeCodex.click({detail:0});h.dispatch('blur');h.ids.codexButton.click({detail:1});assert(!h.ids.codexOverlay.hidden);});

  test('Future codex content IDs survive successful reward saves without inflating count',()=>{const h=harness(logic,{storage:{'cabin3d-codex-v1':'{"version":1,"unlockedIds":["newer-card"]}'}});assert.equal(h.ids.codexCount.textContent,'0 / 8');h.open();assert.equal(h.storage['cabin3d-codex-v1'],'{"version":1,"unlockedIds":["newer-card"]}');h.choice(c=>c.good);h.finishWork();const s=h.state();s.status='finished';s.endReason='complete';s.grade='clean';s.comfort=100;h.api.refresh(true);const raw=JSON.parse(h.storage['cabin3d-codex-v1']);assert(raw.unlockedIds.includes('newer-card'));assert(!raw.unlockedIds.includes('seat-belt'),'unscored practice does not issue rewards');assert.equal(h.ids.rewardCards.children.length,0);h.api.refresh(true);assert.equal(h.ids.rewardCards.children.length,0);});

  test('Space opens dialogue once without inherited key-up selecting the first choice; E is retired',()=>{
    const h=harness(logic);h.approach();h.tap('KeyE');assert.equal(h.state().dialog,null);
    h.key('Space',' ');assert(h.state().dialog);const before=copy(h.state());
    h.up('Space',' ');h.ids.choices.children[0].click({detail:0});assert.deepEqual(copy(h.state()),before);
    h.key('Space',' ');h.up('Space',' ');h.ids.choices.children[0].click({detail:0});assert.notDeepEqual(copy(h.state()),before);
  });

  test('Joystick ignores a second finger, clears on blur, and supports partial analog speed',()=>{
    const h=harness(logic);h.begin(true);h.ids.joystick.dispatch('pointerdown',{pointerId:7,clientX:58,clientY:38});h.step(5);const slow=h.state().player.z-1.5;
    assert(slow>0);h.ids.joystick.dispatch('pointerdown',{pointerId:8,clientX:58,clientY:100});h.step(5);assert(h.state().player.z>1.5+slow);
    h.dispatch('blur');h.ids.resumeButton.click({detail:1});const z=h.state().player.z;h.step(10);near(h.state().player.z,z);
    const fast=harness(logic);fast.begin(true);fast.key('ArrowUp');fast.step(5);assert(fast.state().player.z-1.5>slow);
  });

  test('Ordinary lessons focus Continue even with hidden service-demo buttons before it',()=>{
    const h=harness(logic,{contextual:true});h.begin(true);
    h.ids.lessonCard.replaceChildren(h.ids.serviceDemo,h.ids.lessonContinue);h.ids.serviceDemo.append(h.ids.demoWait,h.ids.demoSafety,h.ids.demoHandoff);
    h.state().lesson={id:'aisle',title:'走道引導',copy:'先招呼旅客'};h.api.refresh(true);
    assert(h.ids.serviceDemo.hidden);assert.equal(h.document.activeElement,h.ids.lessonContinue);
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

  test('Guided boarding requires deliberate observation and keeps a single live objective',()=>{
    const h=harness(logic,{chapterId:'boarding',contextual:true,guidedBoarding:true});h.ids.startButton.click({detail:1});assert.equal(h.state().lesson.id,'boardingWelcome');assert.equal(h.document.activeElement,h.ids.lessonContinue);assert(h.ids.gameSurface.inert);h.dismiss();
    assert(!h.ids.boardingCoach.hidden);assert.equal(h.ids.boardingCoach.dataset.step,'move');h.key('ArrowUp');h.step(20);h.up('ArrowUp');h.tap('Space');assert.equal(h.state().dialog.id,'guide');
    assert(h.ids.choices.children.every(c=>c.disabled));h.tap('Digit1');assert(h.state().dialog);assert.equal(h.state().events.filter(e=>e.type==='correct').length,0);
    const pass=h.ids.evidenceCards.children[0],map=h.ids.evidenceCards.children[1];assert.equal(pass.className,'visual-clue clue-pass');assert.equal(map.className,'visual-clue clue-map');
    pass.click({detail:1});assert(h.ids.choices.children.every(c=>c.disabled));h.ids.evidenceCards.children[1].click({detail:1});assert(h.ids.choices.children.every(c=>!c.disabled));
    h.choice(c=>c.good);assert.equal(h.state().events.filter(e=>e.type==='correct').length,1);assert.equal(h.state().completed,0);h.step(110);assert(h.state().tasks.find(t=>t.id==='guide').done);
  });

  test('Held native Enter reveals one clue only and a fresh activation is needed for the answer',()=>{
    const h=harness(logic,{chapterId:'boarding',contextual:true,guidedBoarding:true});h.ids.startButton.click({detail:1});h.dismiss();h.key('ArrowUp');h.step(20);h.up('ArrowUp');h.tap('Space');
    h.ids.evidenceCards.children[0].focus();h.key('Enter');h.ids.evidenceCards.children[0].click({detail:0});assert.deepEqual(copy(h.state().boarding.coach.examined),['pass']);
    h.key('Enter','Enter',{repeat:true});h.ids.evidenceCards.children[1].click({detail:0});assert.deepEqual(copy(h.state().boarding.coach.examined),['pass']);h.up('Enter');h.key('Enter');h.ids.evidenceCards.children[1].click({detail:0});assert.equal(h.state().boarding.coach.examined.length,2);
    const good=h.state().dialog.choices.findIndex(c=>c.good);h.key('Enter','Enter',{repeat:true});h.ids.choices.children[good].click({detail:0});assert(h.state().dialog);h.up('Enter');h.choice(c=>c.good);assert(h.state().action);
  });

  test('Inspecting the map first keeps keyboard focus on the unopened pass, then on the response cue',()=>{
    const h=harness(logic,{chapterId:'boarding',contextual:true,guidedBoarding:true});h.ids.startButton.click({detail:1});h.dismiss();h.key('ArrowUp');h.step(20);h.up('ArrowUp');h.tap('Space');h.ids.evidenceCards.children[1].click({detail:1});assert.equal(h.document.activeElement,h.ids.evidenceCards.children[0]);h.ids.evidenceCards.children[0].click({detail:1});assert.equal(h.document.activeElement,h.ids.inspectionCue);
  });

  test('Finishing guided teaching restores formal feedback and practice keeps untimed wording',()=>{
    for(const practice of [false,true]){const h=harness(logic,{chapterId:'boarding',contextual:true,guidedBoarding:true});h.ids.startButton.click({detail:1});h.dismiss();h.state().boarding.tutorialStep=3;h.state().player.z=8.3;h.step();assert.equal(h.state().lesson.id,'boardingReady');if(practice)assert(!h.ids.lessonFoot.textContent.includes('才倒數'));h.dismiss();assert(!h.ids.guidance.hidden);assert(h.state().boarding.formal);}
  });

  test('Legacy boarding retry keeps its correction clue visible',()=>{
    const h=harness(logic,{chapterId:'boarding',contextual:false});h.begin(true);h.key('ArrowUp');h.step(20);h.up('ArrowUp');h.tap('Space');h.choice(c=>!c.good);assert(h.state().dialog.recoveryFeedback);assert(!h.ids.decisionDescription.hidden);assert.equal(h.ids.decisionDescription.textContent,h.state().dialog.recoveryFeedback);
  });

  test('Boarding keyboard and touch both advance untimed teaching and freeze traffic on blur',()=>{
    for(const phone of [false,true]){const h=harness(logic,{chapterId:'boarding',contextual:true,phone});assert.equal(h.state().chapterId,'boarding');assert.equal(h.ids.chapterTag.textContent,'BOARDING / 01');h.begin();
      if(phone)h.button('up').dispatch('pointerdown',{pointerId:42});else h.key('ArrowUp');h.step(20);if(phone)h.button('up').dispatch('pointerup',{pointerId:42});else h.up('ArrowUp');
      assert.equal(h.state().boarding.tutorialStep,1);assert.equal(h.state().elapsed,0);h.ids.interactButton.click({detail:1});assert.equal(h.state().dialog.id,'guide');assert.equal(h.ids.evidenceCards.children.length,2);const frozen=copy(h.state().boarding);h.step(60);assert.deepEqual(copy(h.state().boarding),frozen);h.choice(c=>c.good);h.step(110);assert(h.state().tasks.find(t=>t.id==='guide').done);assert.equal(h.state().elapsed,0);h.dispatch('blur');const paused=copy(h.state());h.step(120);assert.deepEqual(copy(h.state()),paused);assert(!h.ids.awayOverlay.hidden);h.ids.awayResumeButton.click({detail:1});assert.equal(h.state().status,'playing');
    }
  });

  test('Campaign storage warning appears only when progress cannot be saved',()=>{
    const normal=harness(logic);assert.equal(normal.ids.chapterMenuHint.hidden,true);
    const deniedRead=harness(logic,{storageReadError:true});assert.equal(deniedRead.ids.chapterMenuHint.hidden,false);deniedRead.begin(true);assert.equal(deniedRead.state().status,'playing');
    const deniedWrite=harness(logic,{storageWriteError:true});assert.equal(deniedWrite.ids.chapterMenuHint.hidden,true);deniedWrite.ids.chapterList.children.find(b=>b.dataset.chapter==='boarding').click({detail:1});assert.equal(deniedWrite.state().chapterId,'boarding');assert.equal(deniedWrite.ids.chapterMenuHint.hidden,false);deniedWrite.begin(true);assert.equal(deniedWrite.state().status,'playing');
  });

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

  test('A practice mistake emits exactly once per deliberate retry, never per held key',()=>{const h=harness(logic);h.open(true);const key=h.choice(c=>!c.good,{release:false});const n=h.calls.audioEvents.filter(e=>e.type==='mistake').length;assert.equal(n,1);h.key(key,'Process',{repeat:true});h.step(20);assert.equal(h.calls.audioEvents.filter(e=>e.type==='mistake').length,n);h.up(key);h.choice(c=>!c.good);assert.equal(h.calls.audioEvents.filter(e=>e.type==='mistake').length,n+1);});

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

  test('Practice decisions freeze timers and reject movement; Close returns focus to canvas',()=>{const h=harness(logic);h.open(true);h.step();const before=copy(h.state());h.key('ArrowUp');h.button('up').dispatch('pointerdown',{pointerId:4});h.step(100);assert.deepEqual(copy(h.state()),before);assert.equal(h.api.keys.size,0);assert.equal(h.api.touch.size,0);h.ids.closeDecision.click({detail:1});assert.equal(h.state().dialog,null);assert.equal(h.document.activeElement,h.ids.sceneCanvas);const z=h.state().player.z;h.step(5);near(h.state().player.z,z);});

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

  test('Practice retry feedback survives pause and blur; starting a fresh practice resets prior feedback',()=>{
    const storage={},h=harness(logic,{storage});h.open(true);h.choice(c=>!c.good);const dialog=copy(h.state().dialog);
    for(const stop of [()=>h.tap('Escape'),()=>h.dispatch('blur')]){
      stop();h.step();const before=copy(h.state());h.step(100);assert.deepEqual(copy(h.state()),before);
      h.ids.resumeButton.click({detail:1});assert.deepEqual(copy(h.state().dialog),dialog);assert.equal(h.ids.decisionDescription.textContent,dialog.recoveryFeedback);
      assert.equal(h.ids.decisionCard.hidden,false);assert.equal(h.state().action,null);
    }
    assert(!h.state().lessonSeen.includes('correction'));assert.equal(storage['cabin3d-lessons-v3'],undefined);
    h.tap('Escape');h.ids.modeButton.click({detail:1});h.open();assert.equal(h.state().practice,true);
    assert.equal(h.state().dialog.recoveryFeedback,undefined);assert.equal(h.ids.decisionDescription.dataset.kind,'normal');
    h.choice(c=>!c.good);assert.equal(h.state().action,null);assert.equal(h.state().lesson,null);assert.equal(h.state().safetyErrors,0);
  });

  test('Mobile task list starts collapsed; desktop expanded; live media changes update safely',()=>{for(const phone of [false,true]){const h=harness(logic,{phone});assert.equal(h.ids.taskDetails.open,!phone);h.phoneMedia.matches=!phone;h.phoneMedia.listener();assert.equal(h.ids.taskDetails.open,phone);h.motion.matches=true;h.motion.listener();assert.equal(h.state().reducedMotion,true);}});

  test('Scene target labels use returned view coordinates and hide stale labels without intercepting controls',()=>{const h=harness(logic);h.fakeView.labels=[{id:'belt',visible:true,kind:'safety',near:true,text:'安全帶',x:100,y:200}];h.step();const label=h.ids.targetLabels.children[0];assert.equal(label.children.length,2);assert.equal(label.children[0].tagName,'IMG');assert.equal(label.children[1].textContent,'安全帶');assert.equal(label.style.backgroundImage,undefined);assert.equal(label.className,'target-label safety near expanded');assert.equal(label.style.left,'100px');assert.equal(label.style.top,'200px');h.fakeView.labels=[];h.step();assert.equal(label.hidden,true);});

  test('Label writes are batched before measuring and compact/detail transitions keep one icon',()=>{const h=harness(logic);h.Element.prototype.getBoundingClientRect=function(){if(this.className.includes('target-label')){assert.equal(h.ids.targetLabels.children.length,2,'all label writes precede measurements');return {width:100,height:32};}return {width:0,height:0};};h.fakeView.labels=[{id:'belt',visible:true,kind:'safety',near:true,icon:'alert',text:'安全帶',x:150,y:200},{id:'detail',visible:true,kind:'detail',text:'空櫃',x:350,y:200}];h.step();assert.equal(h.calls.errors.length,0);const label=h.ids.targetLabels.children[0],detail=h.ids.targetLabels.children[1];assert.equal(detail.children.length,1);const icon=label.children[0];h.step();assert.equal(label.children[0],icon,'same content reuses its image');h.fakeView.labels[0].near=false;h.step();assert.equal(label.children.length,2);assert.equal(label.children[1].textContent,'');assert(label.className.includes('compact'));});

  test('View render exceptions enter fatal fallback and stop later renderer calls',()=>{const h=harness(logic);h.begin();h.fakeView.render=()=>{throw new Error('render failed');};h.step();assert.equal(h.ids.webglError.hidden,false);assert.equal(h.state().status,'paused');const before=copy(h.state());h.step(100);assert.deepEqual(copy(h.state()),before);});

  test('Pagehide disposes once, freezes frames, and BFCache pageshow requests reload',()=>{const h=harness(logic);h.begin();h.key('ArrowUp');h.step(3);h.dispatch('pagehide');h.dispatch('pagehide');assert.equal(h.calls.dispose,1);const before=copy(h.state()),renders=h.calls.render;h.step(100);assert.deepEqual(copy(h.state()),before);assert.equal(h.calls.render,renders);assert.equal(h.api.keys.size,0);h.dispatch('pageshow',{persisted:false});assert.equal(h.calls.reload,0);h.dispatch('pageshow',{persisted:true});assert.equal(h.calls.reload,1);});
  test('Fatal WebGL failure disables both mode entries and blocks later keyboard, pointer and restart actions',()=>{
    const h=harness(logic,{chapterId:'boarding',contextual:true});h.ids.assessmentButton.click({detail:1});h.api.fail(Error('context lost'));
    assert(h.ids.webglError.hidden===false);assert(h.ids.startButton.disabled&&h.ids.assessmentButton.disabled);
    const before=copy(h.state()),storage=copy(h.storage),renders=h.calls.render;
    for(const code of ['Space','ArrowUp','Digit1','Escape','KeyC'])h.tap(code);
    for(const id of ['startButton','assessmentButton','restartButton','replayButton','resultMenuButton','cameraButton'])h.ids[id].dispatch('click',{detail:1});
    h.step(20);assert.deepEqual(copy(h.state()),before);assert.deepEqual(copy(h.storage),storage);assert.equal(h.calls.render,renders);
    h.ids.reloadButton.click();assert.equal(h.calls.reload,1);
  });
  const result={generatedAt:new Date().toISOString(),suite:'Preflight 3D actual production controller in VM DOM stub',command:'node tests/preflight-3d-input.test.cjs',mainSha256:crypto.createHash('sha256').update(mainSource).digest('hex'),logicSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'public/preflight.mjs'))).digest('hex'),summary:{total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length},notes:['Production event handler bodies and frame loop run unchanged; only ESM import and final scene boot are replaced.','Real preflight logic is imported. Mode, keyboard and focus tests use production listeners; assessment result fixtures reposition the player to cover all decisions and record states.','DOM, localStorage, media queries and Three view are stubs. No browser was launched.','Native Enter/Space defaults are modeled as explicit event sequences; browser key event/default-action timing and visual layout still require native verification.'],results,traces};fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/preflight-3d-input-results.json'),JSON.stringify(result,null,2)+'\n');console.log(`\n${result.summary.passed}/${result.summary.total} preflight input tests passed; ${result.summary.failed} failed.`);if(result.summary.failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});

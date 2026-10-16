import assert from 'node:assert/strict';
import {createCabinAudio as createAudio} from '../public/audio.mjs';
const response=()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});
const createCabinAudio=options=>createAudio({fetcher:async()=>response(),...options});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fake(resume=()=>Promise.resolve()) {
 const sources=[];const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}});
 const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;},onended:null});
 const context={currentTime:0,sampleRate:1000,destination:{},state:'running',resume,close:()=>Promise.resolve(),decodeAudioData:async()=>({duration:205,track:'Carefree'}),createGain:node,createBiquadFilter:node,createOscillator(){const n=node();sources.push(n);return n;},createBufferSource(){const n=node();sources.push(n);return n;},createBuffer(c,l){const data=new Float32Array(l);return {getChannelData:()=>data};}};
 return {context,sources};
}
let factories=0;const f=fake();const a=createCabinAudio({contextFactory:()=>{factories++;return f.context;}});
a.play({id:'x',type:'choice'});assert.equal(factories,0);await a.unlock();assert.equal(a.getStatus(),'ready');a.setMode('playing');a.play({id:'x',type:'choice'});const n=f.sources.length;a.play({id:'x',type:'choice'});assert.equal(f.sources.length,n);
a.setMode('paused');assert(f.sources.every(x=>x.stopped));a.play({id:'muted',type:'choice'});assert.equal(f.sources.length,n);a.setMode('playing');a.reset('two');a.play({id:'x',type:'choice'});assert(f.sources.length>n);
a.setPreferences({muted:true,volume:.5});const after=f.sources.length;a.play({id:'z',type:'complete'});assert.equal(f.sources.length,after);a.dispose();a.dispose();assert.equal(a.getStatus(),'disposed');
let finish;const g=fake(()=>new Promise(r=>{finish=r;}));const b=createCabinAudio({contextFactory:()=>g.context});const p=b.unlock();b.dispose();finish();await p;assert.equal(b.getStatus(),'disposed');assert.equal(g.sources.length,0);
const c=createCabinAudio({contextFactory:()=>{throw Error('no context');}});assert.equal(await c.unlock(),false);assert.equal(c.getStatus(),'unavailable');
const d=createCabinAudio({contextFactory:()=>fake(()=>Promise.reject(Error('denied'))).context});assert.equal(await d.unlock(),false);
console.log('PASS audio activation, event deduplication, pause, mute, reset, async disposal and failure fallback');

const mf=fake();let requests=0,requestedUrl;
const ma=createCabinAudio({contextFactory:()=>mf.context,fetcher:async url=>{requests++;requestedUrl=url;return response();}});
await ma.unlock();assert.equal(requests,0,'no music request before play mode');
ma.setMode('playing');ma.setMode('reading');ma.setMode('playing');await settle();
assert.equal(requests,1,'concurrent updates share a single load');
assert(requestedUrl.pathname.endsWith('/assets/audio/carefree.mp3'),'local Carefree asset');
assert.equal(mf.sources.length,1,'only recorded music, no hum or generated music');
const melody=mf.sources[0];assert(melody.loop);assert.equal(melody.buffer.track,'Carefree');
ma.setPreferences({muted:false,volume:.4,musicVolume:0});assert(melody.stopped);
ma.play({id:'effects-only',type:'choice'});assert.equal(mf.sources.length,2,'effects work with music off');
ma.setPreferences({muted:false,volume:.4,musicVolume:.4});assert.equal(requests,1,'decoded music reused');
assert.equal(mf.sources.length,3);ma.setMode('paused');assert(mf.sources.every(s=>s.stopped));ma.dispose();
console.log('PASS local recorded music, one cached load, looping, music volume and pause');

for(const state of ['paused','muted','zero-music','silent','disposed']){
 const f=fake();let resolveLoad,signal;
 const a=createCabinAudio({contextFactory:()=>f.context,fetcher:(_url,options)=>{signal=options.signal;return new Promise(r=>{resolveLoad=r;});}});
 await a.unlock();a.setMode('playing');
 if(state==='disposed')a.dispose();
 else if(state==='muted')a.setPreferences({muted:true,volume:.4});
 else if(state==='zero-music')a.setPreferences({muted:false,volume:.4,musicVolume:0});
 else a.setMode(state);
 resolveLoad(response());await settle();assert.equal(f.sources.length,0,`late load stays silent when ${state}`);
 if(state==='disposed')assert(signal.aborted,'dispose aborts asset request');
 else {a.setPreferences({muted:false,volume:.4,musicVolume:.35});a.setMode('playing');assert.equal(f.sources.length,1,'cached load starts only when allowed');}
 a.dispose();
}
console.log('PASS late music loads respect pause, mute, zero volume, silent mode and disposal');

{
 const f=fake();let finishDecode;
 f.context.decodeAudioData=()=>new Promise(resolve=>{finishDecode=resolve;});
 const a=createCabinAudio({contextFactory:()=>f.context});
 await a.unlock();a.setMode('playing');await settle();a.dispose();
 finishDecode({duration:205});await settle();
 assert.equal(f.sources.length,0,'decode finishing after disposal cannot start music');
}

for(const failure of ['http','network','decode']){
 let errors=0;const f=fake();
 if(failure==='decode')f.context.decodeAudioData=async()=>{throw Error('bad audio');};
 const a=createCabinAudio({contextFactory:()=>f.context,onMusicUnavailable:()=>errors++,fetcher:async()=>{
  if(failure==='network')throw Error('offline');return failure==='http'?{ok:false}:response();
 }});
 await a.unlock();a.setMode('playing');await settle();assert.equal(errors,1);assert.equal(a.getStatus(),'ready');
 a.play({id:'fallback',type:'choice'});assert.equal(f.sources.length,1,'music failure retains effects');
 a.setMode('reading');await settle();assert.equal(errors,1,'failed music does not retry each frame');a.dispose();
}
console.log('PASS request and decode failures preserve interaction audio');

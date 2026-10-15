import assert from 'node:assert/strict';
import {createCabinAudio} from '../public/audio.mjs';
function fake(resume=()=>Promise.resolve()) {
 const sources=[];const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}});
 const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;},onended:null});
 const context={currentTime:0,sampleRate:1000,destination:{},state:'running',resume,close:()=>Promise.resolve(),createGain:node,createBiquadFilter:node,createOscillator(){const n=node();sources.push(n);return n;},createBufferSource(){const n=node();sources.push(n);return n;},createBuffer(c,l){const data=new Float32Array(l);return {getChannelData:()=>data};}};
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

const mf=fake(),ma=createCabinAudio({contextFactory:()=>mf.context});await ma.unlock();ma.setMode('playing');const loops=mf.sources.filter(s=>s.loop);assert.equal(loops.length,2,'ambient noise and music have independent buffers');const melody=loops.find(s=>s.buffer.getChannelData(0).length===384000);assert(melody,'original 24-second loop');ma.setPreferences({muted:false,volume:.4,musicVolume:0});assert(melody.stopped,'music mute stops just music');assert(!loops.find(s=>s!==melody).stopped,'ambient sound remains');ma.setPreferences({muted:false,volume:.4,musicVolume:.4});assert(mf.sources.length>3);ma.setMode('paused');assert(mf.sources.every(s=>s.stopped));ma.dispose();

const notes=melody.buffer.getChannelData(0);assert(notes.some(n=>Math.abs(n)>.001),'music loop contains sound');assert(notes.every(n=>Number.isFinite(n)&&Math.abs(n)<1),'music samples finite and unclipped');

let musicError=0;const broken=fake(),makeBuffer=broken.context.createBuffer;broken.context.createBuffer=(c,l,rate)=>{if(rate===16000)throw Error('music buffer unavailable');return makeBuffer(c,l,rate);};const fallback=createCabinAudio({contextFactory:()=>broken.context,onMusicUnavailable:()=>musicError++});await fallback.unlock();fallback.setMode('playing');assert.equal(musicError,1);assert.equal(fallback.getStatus(),'ready');const voiceCount=broken.sources.length;fallback.play({id:'fallback',type:'choice'});assert(broken.sources.length>voiceCount,'music failure retains effects');fallback.dispose();

// Synthesized interaction effects and locally hosted Carefree by Kevin MacLeod.
// Music attribution and CC BY 4.0 license: THIRD_PARTY_NOTICES.txt.
export function createCabinAudio({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),onUnavailable=()=>{},onMusicUnavailable=()=>{},fetcher=(...args)=>globalThis.fetch(...args)}={}) {
  let context=null,master=null,status='locked',mode='silent',muted=false,volume=.4,epoch=0,pending=null,runId='',musicVolume=.35,musicBuffer=null,musicFailed=false,musicPending=null;
  const musicAbort=new AbortController();
  const voices=new Set(),music=new Set(),seen=new Set();
  const stop=record=>{
    for(const source of record.sources){try{source.stop();}catch{}try{source.disconnect();}catch{}}
    for(const node of record.nodes){try{node.disconnect();}catch{}}
    voices.delete(record);music.delete(record);
  };
  const stopAll=()=>{for(const r of [...voices,...music])stop(r);};
  function unavailable(){stopAll();status='unavailable';try{onUnavailable();}catch{}}
  function gainTo(node,value,seconds=.08){const t=context.currentTime;node.gain.cancelScheduledValues(t);node.gain.setTargetAtTime(value,t,seconds/3);}
  function musicUnavailable(){
    if(status==='disposed')return;
    musicFailed=true;musicBuffer=null;
    for(const r of [...music])stop(r);
    try{onMusicUnavailable();}catch{}
  }
  // Fetch and decode once, only after deliberate audio activation. Completion
  // rechecks the current mode/preferences so a late load cannot bypass pause.
  function buildMusic(){
    const allowed=!musicFailed&&status==='ready'&&!muted&&volume>0&&musicVolume>0&&['playing','reading'].includes(mode);
    if(!allowed){for(const r of [...music])stop(r);return;}
    if(music.size){for(const r of music)gainTo(r.nodes[0],musicVolume*(mode==='reading'?.12:.30));return;}
    if(!musicBuffer){
      if(!musicPending)musicPending=(async()=>{
        try{
          const response=await fetcher(new URL('./assets/audio/carefree.mp3',import.meta.url),{signal:musicAbort.signal});
          if(!response.ok)throw Error('Music request failed');
          const bytes=await response.arrayBuffer();
          if(status==='disposed')return;
          const decoded=await context.decodeAudioData(bytes);
          if(status==='disposed')return;
          musicBuffer=decoded;updateMusic();
        }catch{musicUnavailable();}
        finally{musicPending=null;}
      })();
      return;
    }
    const source=context.createBufferSource(),mix=context.createGain();source.buffer=musicBuffer;source.loop=true;
    mix.gain.value=musicVolume*(mode==='reading'?.12:.30);source.connect(mix);mix.connect(master);
    music.add({sources:[source],nodes:[mix]});source.start();
  }
  function updateMusic(){try{buildMusic();}catch{musicUnavailable();}}
  async function unlock(){
    if(status==='disposed'||status==='unavailable')return false;
    if(pending)return pending;
    const generation=epoch;
    pending=(async()=>{
      try{
        if(!context){context=contextFactory();master=context.createGain();master.gain.value=muted?0:volume;master.connect(context.destination);}
        await context.resume();
        if(status==='disposed'||generation!==epoch)return false;
        status='ready';updateMusic();return true;
      }catch{if(status!=='disposed')unavailable();return false;}
      finally{pending=null;}
    })();return pending;
  }
  function tone(type){
    const patterns={choice:[[660,0,.08]],mistake:[[210,0,.16],[175,.12,.18]],demand:[[660,0,.18],[880,.18,.3]],complete:[[523,0,.12],[659,.1,.12],[784,.2,.22]],finish:[[523,0,.2],[659,.15,.2],[784,.3,.4]],retry:[[330,0,.25],[262,.18,.4]],buckle:[[1500,0,.035],[800,.03,.04]],close:[[110,0,.13],[75,.08,.18]],cup:[[1200,0,.04],[1600,.04,.09]]};
    const pattern=type==='time-warning'?[[440,0,.22],[660,.25,.32]]:patterns[type]||patterns.choice;
    while(voices.size>=8)stop(voices.values().next().value);
    const record={sources:[],nodes:[]};voices.add(record);let remaining=pattern.length;
    for(const [frequency,delay,duration] of pattern){
      const oscillator=context.createOscillator(),gain=context.createGain(),t=context.currentTime+delay;
      oscillator.type=type==='mistake'?'triangle':'sine';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.11,t+.008);gain.gain.linearRampToValueAtTime(0,t+duration);
      oscillator.connect(gain);gain.connect(master);record.sources.push(oscillator);record.nodes.push(gain);
      oscillator.onended=()=>{if(--remaining===0)stop(record);};oscillator.start(t);oscillator.stop(t+duration+.01);
    }
  }
  function play(event){
    if(seen.has(event.id))return;seen.add(event.id);if(seen.size>128)seen.delete(seen.values().next().value);
    if(status!=='ready'||muted||volume<=0||mode==='paused'||mode==='silent')return;
    // Reading only permits deliberate selection and correction sounds.
    if(mode==='reading'&&!['choice','mistake'].includes(event.type))return;
    try{tone(event.type==='finish'&&['retry','incomplete'].includes(event.detail?.grade)?'retry':event.type);}catch{unavailable();}
  }
  return {unlock,play,
    setPreferences(p){muted=!!p.muted;if(Number.isFinite(p.musicVolume))musicVolume=Math.max(0,Math.min(1,p.musicVolume));volume=Number.isFinite(p.volume)?Math.max(0,Math.min(1,p.volume)):.4;
      if(master&&status!=='disposed'){try{gainTo(master,muted?0:volume);updateMusic();}catch{unavailable();}}},
    setMode(value){if(mode===value)return;mode=value;if(value==='paused')stopAll();
      if(context&&status==='ready'){try{updateMusic();}catch{unavailable();}}},
    reset(id){runId=id;seen.clear();stopAll();if(status==='ready')try{updateMusic();}catch{unavailable();}},
    dispose(){if(status==='disposed')return;epoch++;status='disposed';musicAbort.abort();musicBuffer=null;stopAll();try{master?.disconnect();Promise.resolve(context?.close()).catch(()=>{});}catch{}},
    getStatus:()=>status};
}

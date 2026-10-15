// Original synthesized cabin sound. No audio file or network dependency.
export function createCabinAudio({contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),onUnavailable=()=>{}}={}) {
  let context=null,master=null,status='locked',mode='silent',muted=false,volume=.4,epoch=0,pending=null,runId='';
  const voices=new Set(),ambient=new Set(),seen=new Set();
  const stop=record=>{
    for(const source of record.sources){try{source.stop();}catch{}try{source.disconnect();}catch{}}
    for(const node of record.nodes){try{node.disconnect();}catch{}}
    voices.delete(record);ambient.delete(record);
  };
  const stopAll=()=>{for(const r of [...voices,...ambient])stop(r);};
  function unavailable(){stopAll();status='unavailable';try{onUnavailable();}catch{}}
  function gainTo(node,value,seconds=.08){const t=context.currentTime;node.gain.cancelScheduledValues(t);node.gain.setTargetAtTime(value,t,seconds/3);}
  function updateAmbience(){
    const allowed=status==='ready'&&!muted&&volume>0&&['playing','reading'].includes(mode);
    if(!allowed){for(const r of [...ambient])stop(r);return;}
    if(ambient.size)return;
    const mix=context.createGain();mix.gain.value=mode==='reading'?.022:.055;mix.connect(master);
    const hum=context.createOscillator();hum.type='sine';hum.frequency.value=83;hum.connect(mix);
    const noise=context.createBufferSource(),buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.28;
    noise.buffer=buffer;noise.loop=true;const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;noise.connect(filter);filter.connect(mix);
    ambient.add({sources:[hum,noise],nodes:[mix,filter]});hum.start();noise.start();
  }
  async function unlock(){
    if(status==='disposed'||status==='unavailable')return false;
    if(pending)return pending;
    const generation=epoch;
    pending=(async()=>{
      try{
        if(!context){context=contextFactory();master=context.createGain();master.gain.value=muted?0:volume;master.connect(context.destination);}
        await context.resume();
        if(status==='disposed'||generation!==epoch)return false;
        status='ready';updateAmbience();return true;
      }catch{if(status!=='disposed')unavailable();return false;}
      finally{pending=null;}
    })();return pending;
  }
  function tone(type){
    const patterns={choice:[[660,0,.08]],mistake:[[210,0,.16],[175,.12,.18]],demand:[[660,0,.18],[880,.18,.3]],complete:[[523,0,.12],[659,.1,.12],[784,.2,.22]],finish:[[523,0,.2],[659,.15,.2],[784,.3,.4]],retry:[[330,0,.25],[262,.18,.4]],buckle:[[1500,0,.035],[800,.03,.04]],close:[[110,0,.13],[75,.08,.18]],cup:[[1200,0,.04],[1600,.04,.09]]};
    const pattern=patterns[type]||patterns.choice;
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
    setPreferences(p){muted=!!p.muted;volume=Number.isFinite(p.volume)?Math.max(0,Math.min(1,p.volume)):.4;
      if(master&&status!=='disposed'){try{gainTo(master,muted?0:volume);updateAmbience();}catch{unavailable();}}},
    setMode(value){if(mode===value)return;mode=value;if(value==='paused')stopAll();
      if(context&&status==='ready'){for(const r of ambient)gainTo(r.nodes[0],value==='reading'?.022:.055);try{updateAmbience();}catch{unavailable();}}},
    reset(id){runId=id;seen.clear();stopAll();if(status==='ready')try{updateAmbience();}catch{unavailable();}},
    dispose(){if(status==='disposed')return;epoch++;status='disposed';stopAll();try{master?.disconnect();Promise.resolve(context?.close()).catch(()=>{});}catch{}},
    getStatus:()=>status};
}

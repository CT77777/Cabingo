// Input and HUD math, independent of the game state and DOM.
export function joystickVector(dx=0,dy=0,radius=48){
 dx=Number.isFinite(dx)?dx:0;dy=Number.isFinite(dy)?dy:0;
 const distance=Math.hypot(dx,dy),r=Math.max(1,radius),scale=distance>r?r/distance:1;
 const knobX=dx*scale,knobY=dy*scale;
 if(distance<r*.18)return {x:0,y:0,knobX,knobY};
 return {x:knobX/r,y:knobY/r,knobX,knobY};
}
export function countdownPresentation(state={}){
 const seconds=Math.max(0,Math.ceil(state.duration-state.elapsed)),visible=!state.practice&&['playing','paused'].includes(state.status)&&seconds<=30&&seconds>0&&(state.elapsed-(state.timeWarnedAt?.[seconds<=10?10:30]??(state.duration-(seconds<=10?10:30))))<=4;
 return {visible,seconds,level:seconds<=10?'critical':'warning',title:seconds<=10?'最後 10 秒':'最後 30 秒',copy:'完成檢查與服務，清空走道後回前方回報。'};
}

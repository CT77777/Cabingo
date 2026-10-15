import {boardingTaskActor} from './boarding.mjs?v=0.7.2';
import * as THREE from './vendor/three.module.min.js';
import {passengerPose,actionPose,serviceItemPose,trolleyPresentation,GALLEY_SUPPLY,decisionPose,coworkerPresentation,COWORKER_PHASE_LABELS} from './presentation.mjs?v=0.7.2';


// Gameplay and scene share x/z coordinates. Both cameras face +z along the
// centreline, so screen-right input is world -x, and screen-up is world +z.
export const INTERACTION_RADIUS = 1.1;
export const CABIN_ROWS = Object.freeze([3, 5, 7, 9, 11, 13]);
export function screenInputToWorld(horizontal, vertical) {
  return { x: -horizontal, z: vertical };
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const smooth = n => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
export function getCabinCameraPose(mode = 'follow', player = { z: 1.5 }, aspect = 1.6) {
  const compensation = Math.max(1, .95 / Math.max(.35, aspect));
  if (mode === 'overview') return {
    position: [0, 22 * compensation, 8 - 19 * compensation],
    target: [0, .65, 8], fov: 43, near: .1, far: 110
  };
  const z = clamp(Number(player.z) || 1.5, .4, 15.5);
  return {
    position: [0, 8.2 * compensation, z - 6.7 * compensation],
    target: [0, .65, Math.min(15.3, z + 1.6)], fov: 43, near: .1, far: 110
  };
}
// Pure projection helpers can be tested without a WebGL context. Coordinates
// are canvas CSS pixels, not device pixels and not the containing page's pixels.
export function createProjectionCamera(mode, player, aspect = 1.6) {
  const pose = getCabinCameraPose(mode, player, aspect);
  const camera = new THREE.PerspectiveCamera(pose.fov, aspect, pose.near, pose.far);
  camera.position.set(...pose.position); camera.up.set(0, 1, 0);
  camera.lookAt(...pose.target); camera.updateMatrixWorld(true);
  return camera;
}
export function projectGamePoint(camera, point, width, height) {
  const p = new THREE.Vector3(point.x || 0, point.y ?? .3, point.z || 0).project(camera);
  return {
    x: (p.x + 1) * width / 2,
    y: (1 - p.y) * height / 2,
    visible: p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= .98 && Math.abs(p.y) <= .96
  };
}

// Asset-free, open-roof six-row cabin. No text is baked into textures: readable
// target and evidence labels are returned to the DOM overlay after each render.
export function createCabinView(canvas, { onContextLost } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.14;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#dce9e6');
  scene.fog = new THREE.Fog('#dce9e6', 36, 85);
  const camera = createProjectionCamera('follow', { z: 1.5 });
  const colors = {
    navy: '#203b4b', deep: '#142b39', mint: '#7eb9ac', paleMint: '#bbd8cd', cream: '#f3eddb',
    white: '#fff8e8', gold: '#e3b75f', orange: '#ca784e', darkGold: '#9e7543',
    floor: '#c2c3b6', carpet: '#71978d', trim: '#406b68', glass: '#93bec1',
    skinA: '#dca278', skinB: '#b77b58', skinC: '#f0c5a4', hair: '#3d352e',
    rose: '#c68478', blue: '#698fa8', plum: '#826d91', sage: '#90a77a', ground: '#cbd4cb'
  };
  const materialCache = new Map(), materials = new Set(), geometries = new Set(), staticBatches = new Map();
  const ownGeometry = g => { geometries.add(g); return g; };
  function ownMaterial(m) { materials.add(m); return m; }
  function mat(name, extra = {}) {
    const key = `${name}:${JSON.stringify(extra)}`;
    if (!materialCache.has(key)) materialCache.set(key, ownMaterial(new THREE.MeshStandardMaterial({
      color: colors[name] || name, roughness: .86, metalness: 0, flatShading: true, ...extra
    })));
    return materialCache.get(key);
  }
  const boxGeo = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeo = ownGeometry(new THREE.SphereGeometry(1, 10, 7));
  const cylinderGeo = ownGeometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  const coneGeo = ownGeometry(new THREE.CylinderGeometry(.79, 1, 1, 7));
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), rotation = new THREE.Euler();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  const vertex = new THREE.Vector3(), normal = new THREE.Vector3();
  function primitive(geometry, materialName, p, s, r = [0, 0, 0], parent = null) {
    const material = typeof materialName === 'string' ? mat(materialName) : materialName;
    if (parent) {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...p); mesh.scale.set(...s); mesh.rotation.set(...r);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    }
    // Static shapes share material batches; moving props retain their own nodes.
    const batch = staticBatches.get(material) || { positions: [], normals: [] }; staticBatches.set(material, batch);
    matrix.compose(position.set(...p), quaternion.setFromEuler(rotation.set(...r)), scale.set(...s)); normalMatrix.getNormalMatrix(matrix);
    const pa = geometry.attributes.position, na = geometry.attributes.normal;
    const count = geometry.index ? geometry.index.count : pa.count;
    for (let i = 0; i < count; i++) {
      const index = geometry.index ? geometry.index.getX(i) : i;
      vertex.fromBufferAttribute(pa, index).applyMatrix4(matrix); normal.fromBufferAttribute(na, index).applyMatrix3(normalMatrix).normalize();
      batch.positions.push(vertex.x, vertex.y, vertex.z); batch.normals.push(normal.x, normal.y, normal.z);
    }
    return null;
  }
  const box = (m, p, s, r, parent) => primitive(boxGeo, m, p, s, r, parent);
  const ball = (m, p, s, r, parent) => primitive(sphereGeo, m, p, s, r, parent);
  const cylinder = (m, p, s, r, parent) => primitive(cylinderGeo, m, p, s, r, parent);
  const group = (parent = scene) => { const g = new THREE.Group(); parent.add(g); return g; };
  scene.add(new THREE.HemisphereLight('#fff9df', '#6f9290', 2.3));
  const sun = new THREE.DirectionalLight('#fff2d2', 3); sun.position.set(-7, 15, -3); sun.target.position.set(0, 0, 8);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 13, bottom: -9, near: .5, far: 38 });
  sun.shadow.normalBias = .035; sun.shadow.bias = -.00025; sun.shadow.radius = 3; scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#d8f0ff', .65); fill.position.set(8, 5, 12); scene.add(fill);

  // A quiet apron surrounds the cutaway; neither walls nor a roof cross the aisle.
  box('ground', [0, -.48, 8], [52, .18, 65]);
  box('#b6c5bd', [-10, -.365, 8], [7, .03, 35]);
  box('gold', [-6.6, -.34, 8], [.11, .02, 27]);
  for (let z = -4; z < 25; z += 3.4) box('cream', [-9, -.34, z], [.1, .02, 1.8]);
  box('#a5b8af', [-17, 1.4, 10], [5, 3.8, 29]);
  box('cream', [-14.35, 3.3, 10], [.35, .35, 29.2]);
  for (let z = -2; z < 24; z += 2.4) { box('glass', [-14.35, 1.8, z], [.12, 2.6, 2.05]); box('navy', [-14.2, 1.8, z + 1.15], [.15, 2.7, .12]); }
  box('cream', [-9.7, 1.1, .2], [8, 1.25, 1.8]); box('glass', [-9.7, 1.3, 1.12], [6.8, .58, .05]);
  for (const x of [-12, -8]) cylinder('navy', [x, .01, .2], [.12, 1.05, .12]);
  box('gold', [-6.9, .05, 12], [1.15, .55, 1.8]); box('cream', [-6.9, .55, 11.6], [1.05, .5, .85]);
  box('glass', [-6.9, .61, 11.12], [.85, .3, .05]);
  for (const x of [-7.48, -6.32]) for (const z of [11.5, 12.55]) cylinder('navy', [x, -.13, z], [.18, .14, .18], [0, 0, Math.PI / 2]);
  const wing = ownGeometry(new THREE.BufferGeometry());
  wing.setAttribute('position', new THREE.Float32BufferAttribute([3,-.18,8, 11,-.3,12, 3,-.18,11.5, 11,-.3,12, 12,-.3,13.4, 3,-.18,11.5], 3));
  wing.computeVertexNormals(); primitive(wing, mat('cream', { side: THREE.DoubleSide }), [0,0,0], [1,1,1]);
  box('navy', [0, -.2, 8], [6.4, .42, 16.4]); box('cream', [0, .025, 8], [6.18, .10, 16.15]);
  box('floor', [0, .085, 8], [6, .04, 16]); box('carpet', [0, .112, 8], [1.64, .022, 15.9]);
  for (const side of [-1, 1]) {
    box('gold', [side * .82, .13, 8], [.035, .025, 15.9]);
    box('cream', [side * 3.03, .35, 8], [.18, .57, 16.2]);
    box('mint', [side * 2.93, .6, 8], [.075, .1, 16.05]);
    for (const z of CABIN_ROWS) {
      // Low window islands leave the centreline and rows clearly visible.
      box('cream', [side * 3.03, 1.04, z], [.15, .9, .82]);
      box('navy', [side * 2.94, 1.04, z], [.04, .66, .6]);
      box('glass', [side * 2.91, 1.05, z], [.025, .55, .47]);
      box('cream', [side * 3.03, 1.53, z], [.2, .08, .88]);
    }
  }
  for (let z = .7; z < 15.7; z += .7) box('paleMint', [0, .13, z], [.045, .02, .16]);
  // Front and rear galleys stay low, including the near bulkhead.
  for (const x of [-2.03, 2.03]) {
    box('mint', [x, .58, .5], [1.6, .96, .66]); box('cream', [x, 1.1, .5], [1.72, .12, .78]);
    box('gold', [x, .85, .85], [.56, .045, .03]);
  }
  cylinder('navy', [-2.38, 1.28, .47], [.115, .26, .115]); cylinder('cream', [-2.05, 1.22, .47], [.07, .12, .07]);
  box('cream', [0, .38, 16], [6.12, .55, .18]); box('mint', [-2.15, .67, 15.25], [1.5, 1.06, .75]);

  function seat(x, z) {
    box('navy', [x, .35, z], [.54, .42, .53]); box('mint', [x, .58, z], [.76, .2, .82]);
    box('mint', [x, .98, z + .32], [.76, .95, .18], [-.1, 0, 0]);
    box('paleMint', [x, 1.39, z + .28], [.53, .18, .12], [-.1, 0, 0]);
    for (const side of [-1, 1]) {
      box('navy', [x + side * .35, .66, z], [.045, .35, .4]); box('cream', [x + side * .36, .86, z - .05], [.10, .075, .57]);
    }
  }
  const passengers = new Map();
  function passenger(parent, x, z, shirt, skin, hair, style = 0, standing = false) {
    const root=group(parent||scene);root.position.set(x,standing?.5:0,z);
    const body=group(root), head=group(body);head.name='head';head.position.set(0,1.42,-.065);
    primitive(coneGeo,shirt,[0,1,-.03],[.25,.48,.19],[0,0,0],body);
    ball(skin,[0,0,0],[.205,.23,.19],[0,0,0],head);
    ball(hair,[0,.13,.04],[.208,.13,.18],[0,0,0],head);
    if(style===1)ball(hair,[0,.04,.18],[.19,.22,.12],[0,0,0],head);
    const eyes=[],brows=[];
    for(const side of [-1,1]) {
      const eye=ball('deep',[side*.064,.03,-.182],[.019,.024,.012],[0,0,0],head);eyes.push(eye);
      brows.push(box(hair,[side*.064,.078,-.181],[.06,.013,.014],[0,0,0],head));
      box('navy',[side*.105,standing?.25:.42,standing?-.12:-.39],[.13,standing?.92:.42,.14],[0,0,0],root);
      box(hair,[side*.105,standing?-.28:.23,standing?-.21:-.47],[.16,.14,.27],[0,0,0],root);
    }
    if(style===2)box('gold',[0,.03,-.192],[.34,.025,.025],[0,0,0],head);
    const mouth=box('rose',[0,-.09,-.185],[.065,.015,.012],[0,0,0],head);mouth.name='mouth';
    const mouthCorners=[-1,1].map(side=>{const m=box('rose',[side*.04,-.085,-.186],[.03,.015,.012],[0,0,0],head);m.name=`mouth-corner-${side}`;return m;});
    const arms=[];
    for(const side of [-1,1]){
      const arm=group(body);arm.position.set(side*.24,1.12,-.08);
      box(shirt,[0,-.13,0],[.13,.28,.15],[0,0,0],arm);
      ball(skin,[0,-.30,-.03],[.07,.075,.07],[0,0,0],arm);arms.push(arm);
    }
    root.traverse(o=>{if(o.isMesh)o.castShadow=false;});
    return {root,body,head,eyes,brows,mouth,mouthCorners,arms,style,phase:x*1.7+z*.43};
  }
  const shirts = ['orange', 'blue', 'rose', 'sage', 'plum', 'gold'];
  for (const [row, z] of CABIN_ROWS.entries()) for (const [i, x] of [-2.15, -1.25, 1.25, 2.15].entries()) {
    seat(x,z);const actor=passenger(scene,x,z,shirts[(row+i)%6],['skinA','skinB','skinC'][(row+i)%3],i%2?'deep':'hair',(row+i)%4);
    actor.root.name=`passenger-${row}-${i}`;passengers.set(`${row}-${i}`,actor);
  }
  const boardingActors=new Map();
  function traveler(id,elder=false){
    if(!boardingActors.has(id)){
      const options=elder?['gold','skinC','#8d8d83',2]:[shirts[boardingActors.size%6],'skinA','hair',boardingActors.size%4];
      const standing=passenger(scene,0,0,...options,true),seated=passenger(scene,0,0,...options,false);
      standing.root.name=`boarding-walking-${id}`;seated.root.name=`boarding-seated-${id}`;
      const card=group(standing.body);box('cream',[0,1.02,-.34],[.34,.22,.025],[0,0,0],card);box('mint',[-.12,1.02,-.36],[.04,.18,.012],[0,0,0],card);box('navy',[.02,1.05,-.36],[.16,.025,.014],[0,0,0],card);
      let familyBag=null;if(id==='parent'){box('blue',[.12,1.07,-.29],[.24,.25,.17],[0,0,.2],standing.body);ball('skinC',[.12,1.24,-.30],[.10,.11,.10],[0,0,0],standing.body);familyBag=luggage(standing.root,'orange',.45);familyBag.position.set(-.34,-.08,-.12);}
      boardingActors.set(id,{standing,seated,card,familyBag});
    }
    return boardingActors.get(id);
  }
  for(const id of ['elder','bag-owner','seat-owner','seat-misread','parent','extra-a','extra-b'])traveler(id,id==='elder');
  const returningElder=passenger(scene,0,0,'gold','skinC','#8d8d83',2);returningElder.root.name='returning-elder';
  for (const [material, batch] of staticBatches) {
    const geometry = ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
    geometry.computeBoundingSphere(); const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  }
  staticBatches.clear();

  // Visible sources exist before an action: a service trolley and front galley drawer.
  const trolley=group();trolley.name='service-trolley';
  box('mint',[0,.66,0],[.42,.8,.5],[0,0,0],trolley);box('cream',[0,1.08,0],[.46,.08,.55],[0,0,0],trolley);
  for(const x of [-.15,.15])cylinder('deep',[x,.22,0],[.07,.08,.07],[Math.PI/2,0,0],trolley);
  const trolleyLid=group(trolley);trolleyLid.position.set(0,1.13,.24);box('navy',[0,0,-.24],[.43,.04,.5],[0,0,0],trolleyLid);
  const galleyDrawer=group();galleyDrawer.name='galley-supply';galleyDrawer.position.set(GALLEY_SUPPLY.x-.08,.85,GALLEY_SUPPLY.z);
  box('mint',[.15,-.2,0],[.55,.5,.48],[0,0,0],galleyDrawer);box('cream',[.15,.11,0],[.57,.06,.5],[0,0,0],galleyDrawer);
  const galleyLid=group(galleyDrawer);galleyLid.position.set(.15,.16,.22);box('navy',[0,0,-.22],[.52,.04,.44],[0,0,0],galleyLid);
  for(const source of [trolley,galleyDrawer]){cylinder('cream',[-.08,source===trolley?1.16:.25,-.02],[.06,.13,.06],[0,0,0],source);box('plum',[.13,source===trolley?1.14:.23,-.04],[.15,.07,.24],[0,0,0],source);}
  // The player has articulated limbs, a cap and a scarf, with a compact footprint.
  const crew = group(), crewBody = group(crew); crew.name = 'player';
  primitive(coneGeo, 'navy', [0, .88, 0], [.245, .5, .18], [0,0,0], crewBody);
  box('cream', [0, 1.1, .13], [.12, .14, .035], [0,0,0], crewBody);
  box('gold', [.09, 1.08, .18], [.24, .085, .06], [0,0,-.35], crewBody);
  box('gold', [.13, .97, .186], [.09, .22, .045], [0,0,-.2], crewBody);
  cylinder('skinA', [0, 1.15, 0], [.075, .16, .075], [0,0,0], crewBody);
  ball('skinA', [0, 1.34, .01], [.19, .215, .18], [0,0,0], crewBody);
  ball('hair', [0, 1.45, -.022], [.196, .13, .17], [0,0,0], crewBody); ball('hair', [0, 1.37, -.18], [.11, .12, .10], [0,0,0], crewBody);
  box('navy', [0, 1.51, .03], [.32, .11, .29], [0,0,-.08], crewBody); box('gold', [0, 1.516, .181], [.075, .045, .018], [0,0,0], crewBody);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    ball('deep', [side * .062, 1.37, .181], [.018, .023, .012], [0,0,0], crewBody);
    const arm = group(crewBody); arm.position.set(side * .27, 1.05, 0);
    box('navy', [0, -.17, 0], [.13, .34, .15], [0,0,0], arm); box('gold', [0, -.31, 0], [.136, .028, .155], [0,0,0], arm);
    ball('skinA', [0, -.39, 0], [.071, .08, .07], [0,0,0], arm); arms.push(arm);
    const leg = group(crewBody); leg.position.set(side * .115, .64, 0);
    box('navy', [0, -.28, 0], [.16, .55, .16], [0,0,0], leg); box('deep', [0, -.58, .055], [.19, .13, .30], [0,0,0], leg); legs.push(leg);
  }
  const colleague=crew.clone(true);colleague.name='coworker';scene.add(colleague);
  colleague.traverse(node=>{if(node.isMesh&&node.material===mat('navy'))node.material=mat('mint');});
  const colleagueBody=colleague.children[0],colleagueArms=arms.map(arm=>colleagueBody.children[crewBody.children.indexOf(arm)]),colleagueLegs=legs.map(leg=>colleagueBody.children[crewBody.children.indexOf(leg)]);
  const colleagueCup=group(colleagueBody);colleagueCup.name='coworker-water';cylinder('cream',[0,.98,.38],[.07,.15,.07],[0,0,0],colleagueCup);
  const colleagueBlanket=group(colleagueBody);colleagueBlanket.name='coworker-blanket';box('plum',[0,.98,.38],[.34,.10,.24],[0,0,0],colleagueBlanket);
  const shadow = new THREE.Mesh(ownGeometry(new THREE.CircleGeometry(.33, 24)), ownMaterial(new THREE.MeshBasicMaterial({ color: '#29483f', opacity: .14, transparent: true, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .143; scene.add(shadow);
  const ringMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: '#f6ce78', transparent: true, opacity: .96, side: THREE.DoubleSide, depthWrite: false }));
  // Its outer edge is the actual 1.1 m gameplay boundary. Never scale/pulse it.
  const ring = new THREE.Mesh(ownGeometry(new THREE.RingGeometry(INTERACTION_RADIUS - .045, INTERACTION_RADIUS, 80)), ringMaterial);
  ring.name = 'interaction-radius-1.1'; ring.rotation.x = -Math.PI / 2; ring.position.y = .146; scene.add(ring);
  const records = new Map(), hazardRecords = new Map();
  function objectiveMaterial(name, record) {
    const material = ownMaterial(new THREE.MeshStandardMaterial({ color: colors[name] || name, roughness: .7, flatShading: true, emissive: '#f6ce78', emissiveIntensity: 0 }));
    record.ownedMaterials.push(material); record.glows.push(material); return material;
  }
  function luggage(parent, material, size = 1) {
    const g = group(parent); g.scale.setScalar(size);
    box(material, [0,0,0], [.64,.51,.48], [0,0,0], g);
    box('gold', [0,.015,-.25], [.44,.33,.035], [0,0,0], g);
    for (const x of [-.22,.22]) box('darkGold', [x,0,0], [.045,.52,.50], [0,0,0], g);
    for (const x of [-.24,.24]) for (const z of [-.17,.17]) ball('deep', [x,-.27,z], [.055,.055,.055], [0,0,0], g);
    box('deep', [0,.29,0], [.26,.045,.08], [0,0,0], g); return g;
  }
  function bin(parent, side, z, full = false) {
    const b = group(parent); b.name = full ? 'full-bin' : 'available-bin';
    const x = side * 2.30;
    box('cream', [x,2.07,z], [1.24,.12,1.48], [0,0,0], b);
    box('deep', [x,2.14,z], [1.10,.018,1.32], [0,0,0], b);
    box('cream', [side*2.91,2.4,z], [.09,.64,1.48], [0,0,0], b);
    for (const dz of [-.70,.70]) box('cream', [x,2.4,z+dz], [1.24,.64,.08], [0,0,0], b);
    const door = group(b); door.name = 'bin-door'; door.position.set(side*1.67,2.75,z);
    box('mint', [0,-.30,0], [.07,.62,1.43], [0,0,0], door); box('gold', [-side*.05,-.51,0], [.04,.045,.34], [0,0,0], door);
    door.rotation.z = side * .78;
    if (full) for (const [i, dz] of [-.34,.32].entries()) {
      const bag = luggage(b, i ? 'plum' : 'navy', .98); bag.rotation.y = Math.PI/2; bag.position.set(x,2.42,z+dz);
    }
    // Compact storage hangs above the seats, with its centre at the stow point.
    b.scale.set(.82,.78,.86);b.position.set(x*(1-.82),2.43*(1-.78),z*(1-.86));
    const fadeMaterials=new Map();b.traverse(o=>{if(o.isMesh){if(!fadeMaterials.has(o.material))fadeMaterials.set(o.material,ownMaterial(o.material.clone()));o.material=fadeMaterials.get(o.material);}});
    return { group: b, door, side, z, x, closed: false, fadeMaterials:[...fadeMaterials.values()] };
  }
  function makeTask(task) {
    const r = { id: task.id, group: group(), ownedMaterials: [], glows: [], bins: [] };
    r.group.name = `objective-${task.id}`;
    const z = task.z ?? CABIN_ROWS[task.row] ?? 3, side = task.side === 'right' ? 1 : -1, x = side * 1.25;
    r.z = z; r.side = side; r.x = x; r.variant = task.variant || 0;
    if (task.id === 'bag') {
      r.nearBin = bin(r.group, side, z, r.variant === 1); r.bins.push(r.nearBin);
      r.destination = r.variant === 1 ? bin(r.group, -side, z) : r.nearBin;
      if (r.destination !== r.nearBin) r.bins.push(r.destination);
      r.bag = luggage(r.group, objectiveMaterial('orange', r),.78); r.bag.name = 'task-luggage';
    } else if (task.id === 'belt') {
      const glow = objectiveMaterial('gold', r);
      r.looseBelt = group(r.group); r.looseBelt.name = 'unfastened-belt';
      for (const s of [-1,1]) {
        box('deep', [x+s*.24,.89,z-.29], [.22,.055,.10], [0,s*.2,s*.2], r.looseBelt);
        box(glow, [x+s*.14,.90,z-.30], [.095,.06,.12], [0,0,s*.22], r.looseBelt);
      }
      r.fastBelt = group(r.group); r.fastBelt.name = 'fastened-belt';
      box('deep', [x,.89,z-.29], [.58,.06,.11], [0,0,0], r.fastBelt); box(glow, [x,.90,z-.30], [.13,.075,.13], [0,0,0], r.fastBelt);
      r.phone = group(r.group); r.phone.name = 'passenger-phone';
      box('deep', [x+side*.29,1.18,z-.39], [.20,.31,.055], [-.1,0,side*-.15], r.phone);
      box(mat('#8ecbd0', { emissive: '#8ecbd0', emissiveIntensity: .3 }), [x+side*.29,1.19,z-.422], [.16,.24,.012], [-.1,0,side*-.15], r.phone);
      r.diagram = group(r.group); r.diagram.name = 'belt-picture-card';
      box('cream', [x+side*.40,1.22,z-.40], [.48,.39,.04], [0,0,0], r.diagram);
      box('navy', [x+side*.40,1.22,z-.426], [.36,.065,.02], [0,0,0], r.diagram);
      box('gold', [x+side*.40,1.22,z-.441], [.10,.11,.02], [0,0,0], r.diagram);
      for (const s of [-1,1]) box('mint', [x+side*.40+s*.13,1.10,z-.43], [.12,.035,.02], [0,0,s*.35], r.diagram);
    } else if (task.id === 'tray') {
      r.tray = group(r.group); r.tray.name = 'folding-tray'; r.tray.position.set(x,.96,z-.87);
      box(objectiveMaterial('cream',r), [0,0,.24], [.65,.065,.52], [0,0,0], r.tray);
      box('gold', [0,-.044,.46], [.18,.03,.04], [0,0,0], r.tray);
      r.trayItems = group(r.tray); r.trayItems.name = 'tray-objects';
      box('blue', [-.13,.08,.22], [.27,.12,.27], [0,.16,0], r.trayItems);
      box('white', [.17,.055,.27], [.16,.045,.25], [0,-.12,0], r.trayItems);
      r.heldCup = group(r.group); r.heldCup.name = 'cup-in-hand';
      cylinder('cream', [x+side*.25,1.10,z-.39], [.085,.20,.085], [0,0,0], r.heldCup);
      cylinder('darkGold', [x+side*.25,1.205,z-.39], [.065,.012,.065], [0,0,0], r.heldCup);
      ball('skinA', [x+side*.29,1.07,z-.39], [.075,.07,.07], [0,0,0], r.heldCup);
    } else {
      // Props distinguish the three requests even before their DOM labels appear.
      r.service = group(r.group); r.service.name = `service-${task.id}`;
      const glow = objectiveMaterial(task.id === 'water' ? 'blue' : task.id === 'blanket' ? 'plum' : 'gold',r);
      if (task.id === 'water') {
        cylinder(glow, [x,.99,z-.38], [.09,.28,.09], [0,0,0], r.service);
        cylinder('cream', [x,1.145,z-.38], [.06,.03,.06], [0,0,0], r.service);
      } else if (task.id === 'blanket') {
        box(glow, [x,.84,z-.28], [.48,.11,.45], [0,0,0], r.service);
        for (const dz of [-.15,0,.15]) box('cream', [x,.90,z-.28+dz], [.48,.012,.025], [0,0,0], r.service);
      } else {
        box(glow, [x+side*.30,1.12,z-.43], [.29,.34,.045], [0,0,side*.15], r.service);
        for (const y of [1.03,1.12,1.21]) box('cream', [x+side*.30,y,z-.457], [.18,.025,.012], [0,0,0], r.service);
      }
      if(task.id==='water'||task.id==='blanket') {
        r.delivery=group(r.group);r.delivery.name=`delivery-${task.id}`;
        if(task.id==='water'){cylinder('cream',[0,0,0],[.085,.20,.085],[0,0,0],r.delivery);cylinder('blue',[0,.105,0],[.065,.012,.065],[0,0,0],r.delivery);}
        else {box('plum',[0,0,0],[.48,.14,.40],[0,0,0],r.delivery);box('cream',[0,.075,0],[.48,.012,.03],[0,0,0],r.delivery);}
      }
    }
    return r;
  }
  function dropRecord(record) {
    scene.remove(record.group);
    for (const material of [...(record.ownedMaterials || []),...(record.bins||[]).flatMap(b=>b.fadeMaterials)]) { material.dispose(); materials.delete(material); }
  }
  function syncTasks(tasks) {
    const ids = new Set(tasks.map(t => t.id));
    for (const [id, record] of records) if (!ids.has(id)) { dropRecord(record); records.delete(id); }
    for (const task of tasks) {
      // A new seed/variant at the same row still updates the visible evidence.
      const signature = [task.id,task.row,task.z,task.side,task.seat,task.variant].join('|');
      let r = records.get(task.id);
      if (!r || r.signature !== signature) {
        if (r) dropRecord(r); r = makeTask(task); r.signature = signature; records.set(task.id,r);
      }
    }
  }
  let lastTasks=[];
  function syncHazards(hazards) {
    const ids = new Set(hazards.map(h => h.id));
    for (const [id,r] of hazardRecords) if (!ids.has(id)) { scene.remove(r.group); hazardRecords.delete(id); }
    for (const hazard of hazards) {
      let r = hazardRecords.get(hazard.id);
      if (!r) {
        const g = group(); g.name = `standing-${hazard.id}`;
        const sourceTask=lastTasks.find(t=>t.id===hazard.taskId);
        const row=sourceTask?.row||0,i=sourceTask?.side==='right'?2:1;
        const actor=passenger(g,0,0,shirts[(row+i)%6],['skinA','skinB','skinC'][(row+i)%3],i%2?'deep':'hair',(row+i)%4,true);
        // An actual standing body, not just a warning marker, obstructs the aisle.
        r = {group:g,actor}; hazardRecords.set(hazard.id,r);
      }
      r.group.position.set(hazard.x || 0,.02,hazard.z || 3); r.group.visible = !hazard.done;
    }
  }
  const escortBeacon=new THREE.Mesh(ownGeometry(new THREE.RingGeometry(.18,.24,48)),ownMaterial(new THREE.MeshBasicMaterial({color:'#9be4cf',side:THREE.DoubleSide,transparent:true,opacity:.95,depthWrite:false})));
  escortBeacon.name='escort-beacon';escortBeacon.rotation.x=-Math.PI/2;escortBeacon.visible=false;scene.add(escortBeacon);
  const floorBag = new THREE.Vector3(), liftedBag = new THREE.Vector3(), entryBag = new THREE.Vector3(), stowedBag = new THREE.Vector3();
  function updateTask(record, task, state, selectedId) {
    const activeAction = state.action?.taskId === task.id && ['task','stow'].includes(state.action.kind);
    const p = task.done ? 1 : activeAction ? clamp(state.action.time / Math.max(.001,state.action.duration),0,1) : 0;
    const glowing = selectedId === task.id && !task.done;
    for (const material of record.glows) material.emissiveIntensity = glowing ? .38 : 0;
    if (task.id === 'bag') {
      const b = record.destination;
      floorBag.set(0,.46,record.z);
      liftedBag.set(record.side*.10,2.44,record.z);
      entryBag.set(b.side*1.36,2.44,record.z);
      stowedBag.set(b.x,2.43,record.z);
      const alreadyStowed = record.variant === 2;
      if (alreadyStowed) record.bag.position.copy(stowedBag);
      else if (p <= .30) record.bag.position.lerpVectors(floorBag,liftedBag,smooth(p/.30));
      else if (p <= .64) record.bag.position.lerpVectors(liftedBag,entryBag,smooth((p-.30)/.34));
      else record.bag.position.lerpVectors(entryBag,stowedBag,smooth((p-.64)/.20));
      record.bag.rotation.set(0,0,!alreadyStowed && p > 0 && p < .84 ? Math.sin(p/.84*Math.PI)*-.10 : 0);
      const closed = alreadyStowed ? 1 : smooth((p-.84)/.16);
      b.door.rotation.z = b.side*.78*(1-closed); b.closed = closed >= .999;
      if (record.nearBin !== b) record.nearBin.door.rotation.z = record.nearBin.side*.78;
    } else if (task.id === 'belt') {
      const fastened = task.done || record.variant === 2 || p > .78;
      record.looseBelt.visible = !fastened; record.fastBelt.visible = fastened;
      record.phone.visible = record.variant === 0 && !task.done;
      record.diagram.visible = record.variant === 1 && !task.done;
    } else if (task.id === 'tray') {
      const closed = record.variant === 2 ? 1 : record.variant === 1 ? clamp((p-.65)/.35,0,1) : p;
      record.tray.rotation.x = -Math.PI/2*smooth(closed);
      record.trayItems.visible = record.variant === 1 && !task.done && p < .30;
      record.heldCup.visible = record.variant === 1 && !task.done && p < .65;
    }
    if(record.delivery){
      const self=activeAction&&state.action.choice?.id==='serve';
      const colleagueState=coworkerPresentation(state),delegated=colleagueState.taskId===task.id&&colleagueState.phase==='serving';
      const hand={x:state.player.x+.22,y:1.13,z:state.player.z+.18},dest={x:record.x,y:1.04,z:record.z-.35};
      const selfPose=serviceItemPose({source:{...trolleyPresentation(state.player),y:1.16},hand,dest,progress:p});
      const activeJob=colleagueState.taskId===task.id&&!!state.handoffJob;
      record.delivery.visible=task.done||self||activeJob;
      if(task.done)record.delivery.position.set(dest.x,dest.y,dest.z);
      else if(activeJob){const q=colleagueState.transfer, pickup=smooth(colleagueState.pickup||0),carry={x:colleagueState.carryX,y:1.11,z:colleagueState.carryZ};
        if(colleagueState.phase==='preparing')record.delivery.position.set(GALLEY_SUPPLY.x+(carry.x-GALLEY_SUPPLY.x)*pickup,GALLEY_SUPPLY.y+(carry.y-GALLEY_SUPPLY.y)*pickup,GALLEY_SUPPLY.z+(carry.z-GALLEY_SUPPLY.z)*pickup);
        else record.delivery.position.set(carry.x*(1-q)+dest.x*q,carry.y*(1-q)+dest.y*q,carry.z*(1-q)+dest.z*q);
      }else if(self)record.delivery.position.set(selfPose.item.x,selfPose.item.y,selfPose.item.z);
      if(record.service)record.service.visible=!task.done&&!self&&!(delegated&&colleagueState.transfer>.5);
    }
  }
  let resized = false, sizeWidth = 0, sizeHeight = 0, disposed = false, firstFrame = true, previousMode = null, walkPose = 0;
  let visualTime=0, eventRun=null,eventSeq=0; const reactions=new Map();
  const haloMaterial=ownMaterial(new THREE.MeshBasicMaterial({color:'#a8dfcb',transparent:true,opacity:.65,depthWrite:false}));
  const haloGeometry=ownGeometry(new THREE.TorusGeometry(.36,.025,5,24));
  const halos=new Map();
  function haloFor(id){if(!halos.has(id)){const mesh=new THREE.Mesh(haloGeometry,haloMaterial);mesh.name=`halo-${id}`;scene.add(mesh);halos.set(id,mesh);}return halos.get(id);}
  const cameraTarget = new THREE.Vector3(0,.65,3.1), wantedPosition = new THREE.Vector3(), wantedTarget = new THREE.Vector3();
  function resize() {
    if (disposed) return;
    const width = Math.max(1,Math.round(canvas.clientWidth || 800)), height = Math.max(1,Math.round(canvas.clientHeight || 500));
    if (width !== sizeWidth || height !== sizeHeight) {
      resized=true;renderer.setSize(width,height,false); camera.aspect = width/height; camera.updateProjectionMatrix(); sizeWidth = width; sizeHeight = height;
    }
  }
  const contextLost = event => { event.preventDefault(); onContextLost?.(); };
  canvas.addEventListener('webglcontextlost',contextLost,false);
  function render(state, dt = 0) {
    if (disposed) return {labels:[]}; resize();
    // Boarding keeps the aisle clear of the movable service cart and supply cart.
    const showServiceProps=!state.boarding&&state.chapterId!=='boarding';
    trolley.visible=showServiceProps;galleyDrawer.visible=showServiceProps;
    const player = state.player || {x:0,z:1.5,angle:0,walking:false,step:0};
    const playing = state.status === 'playing' && !state.dialog && !state.lesson, reducedMotion = Boolean(state.reducedMotion);
    for(const halo of halos.values())halo.visible=false;
    const tasks = state.tasks || [], hazards = state.hazards || [];
    lastTasks=tasks;syncTasks(tasks); syncHazards(hazards);
    if(state.runId!==eventRun){eventRun=state.runId;eventSeq=0;reactions.clear();visualTime=0;}
    if(state.status!=='paused'&&!state.lesson&&state.status!=='briefing')visualTime+=Math.min(Math.max(dt,0),.1);
    for(const e of state.events||[])if(e.seq>eventSeq){
      eventSeq=e.seq;if(['mistake','correct','complete'].includes(e.type))reactions.set(e.taskId,{type:e.type,at:visualTime});
    }
    const targets = (state.renderTargets || []).filter(t => t.active !== false && !t.done);
    const selectedId = state.action?.hazardId || state.action?.taskId || state.dialog?.id || state.dialog?.taskId || (typeof state.near === 'string' ? state.near : state.near?.id);
    const closest = [...targets].sort((a,b) => Math.hypot((a.x||0)-(player.x||0),a.z-player.z)-Math.hypot((b.x||0)-(player.x||0),b.z-player.z))[0];
    const selected = targets.find(t => t.id === selectedId) || closest;
    for (const task of tasks) updateTask(records.get(task.id),task,state,selected?.id);
    for(const [key,baseActor] of passengers){
      const [row,i]=key.split('-').map(Number),task=tasks.find(t=>t.row===row&&(t.side==='right'?2:1)===i);
      const actor=!state.boarding&&task?.characterId==='elder'?returningElder:baseActor;
      if(actor!==baseActor){baseActor.root.visible=false;actor.root.position.copy(baseActor.root.position);}
      const hazard=task&&hazards.find(h=>h.taskId===task.id&&!h.done);
      const returning=task&&hazards.find(h=>h.taskId===task.id&&h.done&&Number.isFinite(h.returnedAt)&&state.elapsed-h.returnedAt<.6);actor.root.visible=!hazard&&!returning&&(!state.boarding||i===0||i===3);
      const selected=task&&selectedId===task.id;
      const r=task&&reactions.get(task.id), reaction=r?{type:r.type,age:visualTime-r.at}:null;
      const mood=task?.done?'happy':task?.late?'waiting':selected?'curious':Math.sin(visualTime*.35+actor.phase)>.55?'happy':actor.style===1?'curious':'neutral';
      const pose=passengerPose({mood,style:actor.style,phase:actor.phase,time:visualTime,selected,reaction,reducedMotion});
      if(state.status!=='paused'&&!state.lesson){
        actor.body.position.y=pose.bodyY;actor.head.rotation.x=pose.headX;
        actor.head.rotation.y=(selected?Math.atan2(actor.root.position.x-player.x,-(player.z-actor.root.position.z)):0)+pose.headY;
        actor.eyes.forEach(e=>e.scale.y=.024*pose.eyeScaleY);
        actor.brows.forEach((b,i)=>b.rotation.z=(i?1:-1)*pose.browAngle);actor.mouthCorners.forEach((m,i)=>{const curve=pose.smile>0?pose.smile:task?.late?-.6:0;m.rotation.z=(i?1:-1)*curve*.6;m.position.y=-.09+curve*.018;});actor.mouth.rotation.z=0;actor.mouth.position.y=pose.mouthY;actor.mouth.scale.y=.015*pose.mouthScale;actor.eyes.forEach(e=>e.scale.x=.019*pose.eyeScaleX);
        actor.arms[0].rotation.x=pose.leftArmX;actor.arms[1].rotation.x=pose.rightArmX;
        if(task&&state.action?.taskId===task.id&&state.action.kind==='task'){
          const q=actionPose({taskId:task.id,choiceId:state.action.choice?.id,progress:state.action.time/state.action.duration,reducedMotion});
          actor.arms[0].rotation.x=q.leftArmX*.6;actor.arms[1].rotation.x=q.rightArmX*.6;
        }
      }
      if(task){const h=haloFor(task.id),completed=reaction?.type==='complete'&&reaction.age<1.4;
        h.visible=!!selected||completed;h.position.set(actor.root.position.x,1.7,actor.root.position.z);h.rotation.x=Math.PI/2;
        h.scale.setScalar(completed&&!reducedMotion?1+reaction.age*.2:1);}
    }
    const escort=state.action?.escort,activeHazard=hazards.find(h=>h.id===state.action?.hazardId);
    escortBeacon.visible=!!escort&&state.status!=='finished';if(escort)escortBeacon.position.set(escort.goal.x,.16,escort.goal.z);
    for(const h of hazards){const r=hazardRecords.get(h.id);if(!r)continue;
      const task=tasks.find(t=>t.id===h.taskId),age=Number.isFinite(h.returnedAt)?Math.max(0,state.elapsed-h.returnedAt):Infinity;
      if(h.done&&age<.6){const q=smooth(age/.6);r.group.visible=true;r.group.position.set((h.x||0)+((task?.side==='right'?1.25:-1.25)-(h.x||0))*q,.02-.5*q,h.z);r.actor.root.rotation.y=0;}
      else if(!h.done){const dx=player.x-(h.x||0),dz=player.z-h.z,d=Math.hypot(dx,dz),shift=escort&&activeHazard===h?Math.min(.18,Math.max(0,d-.5)):0;
        r.group.position.set((h.x||0)+(d?dx/d*shift:0),.02,h.z+(d?dz/d*shift:0));r.actor.root.rotation.y=Math.atan2(dx,-dz);r.actor.arms[1].rotation.x=escort&&activeHazard===h?-.6:0;r.actor.brows.forEach((b,i)=>b.rotation.z=(i?1:-1)*.22);
      }else r.group.visible=false;
    }
    for(const pair of boardingActors.values()){pair.standing.root.visible=false;pair.seated.root.visible=false;}
    for(const a of state.boarding?.actors||[]){
      if(['pending','exited'].includes(a.status))continue;
      const pair=traveler(a.id,a.elder),actor=a.status==='seated'?pair.seated:pair.standing;
      actor.root.visible=true;actor.root.position.set(a.x,a.status==='seated'?0:.5,a.z);
      actor.root.rotation.y=a.status==='seated'?0:a.status==='waiting'?Math.atan2(a.x-player.x,-(player.z-a.z)):(a.angle??Math.PI);
      const stride=!reducedMotion&&a.status==='walking'?Math.sin(a.distance*7)*.10:0;
      const task=tasks.find(t=>t.id===a.taskId),r=task&&reactions.get(task.id),reaction=r?{type:r.type,age:visualTime-r.at}:null;
      const pose=passengerPose({time:visualTime,phase:actor.phase,style:actor.style,selected:selectedId===a.taskId,reaction,mood:task?.done?'happy':'neutral',reducedMotion});
      if(state.status!=='paused'&&!state.lesson){
        actor.body.position.y=Math.abs(stride)*.12+pose.bodyY;actor.head.rotation.x=pose.headX;actor.head.rotation.y=pose.headY;
        actor.eyes.forEach(e=>{e.scale.y=.024*pose.eyeScaleY;e.scale.x=.019*pose.eyeScaleX;});actor.brows.forEach((b,i)=>b.rotation.z=(i?1:-1)*pose.browAngle);
        actor.mouthCorners.forEach((m,i)=>{m.rotation.z=(i?1:-1)*pose.smile*.6;m.position.y=-.09+pose.smile*.028;});actor.mouth.position.y=pose.mouthY;actor.mouth.scale.y=.015*pose.mouthScale;
        actor.arms[0].rotation.x=stride+pose.leftArmX;actor.arms[1].rotation.x=-stride+pose.rightArmX;
      }

      pair.card.visible=a.id!=='parent'&&(a.status==='waiting'||state.dialog?.id===a.taskId);if(pair.familyBag)pair.familyBag.visible=!tasks.find(t=>t.id==='family')?.done;
      if(a.taskId&&(a.taskId!=='seat'||a.id==='seat-owner')){const h=haloFor(a.taskId);h.visible=selected?.id===a.taskId||reaction?.type==='correct'&&reaction.age<1.4;h.position.set(a.x,2.18,a.z);h.rotation.x=Math.PI/2;}
    }
    const elderTask=!state.boarding&&tasks.find(t=>t.characterId==='elder');
    if(!elderTask)returningElder.root.visible=false;
    crew.position.set(player.x || 0,.13,player.z ?? 1.5); crew.rotation.y = player.angle || 0;
    if (state.status !== 'paused' && !state.dialog && !state.lesson) walkPose = playing && player.walking && !reducedMotion ? Math.sin(player.step || 0) : 0;
    const pose = reducedMotion ? 0 : walkPose; crewBody.position.y = Math.abs(pose)*.035;
    legs[0].rotation.x = pose*.43; legs[1].rotation.x = -pose*.43;
    const handlingBag = !reducedMotion && state.action?.taskId === 'bag' && state.action.kind === 'task' && state.action.choice?.id!=='check';
    const progress = state.action ? clamp(state.action.time/Math.max(.001,state.action.duration),0,1) : 0;
    arms[0].rotation.x = handlingBag ? -1.35-Math.sin(progress*Math.PI)*.6 : -pose*.32;
    arms[1].rotation.x = handlingBag ? -1.35-Math.sin(progress*Math.PI)*.6 : pose*.32;
    if(state.action?.kind==='task'||state.action?.kind==='handoff'||state.action?.kind==='wait'){
      const t=tasks.find(t=>t.id===state.action.taskId);
      if(t){crew.rotation.y=Math.atan2((t.side==='right'?1:-1)*1.25-player.x,t.z-player.z);
        const q=actionPose({taskId:t.id,choiceId:state.action.choice?.id,progress,reducedMotion});
        if(t.id!=='bag'||state.action.choice?.id==='check'||reducedMotion){arms[0].rotation.x=q.leftArmX;arms[1].rotation.x=q.rightArmX;}
        crewBody.rotation.x=q.bodyPitch;
      }
    }else crewBody.rotation.x=0;
    const colleagueState=coworkerPresentation(state),colleagueTask=tasks.find(t=>t.id===colleagueState.taskId);
    colleague.position.set(colleagueState.x,.13,colleagueState.z);
    colleague.rotation.y=colleagueState.angle||0;colleagueBody.rotation.x=colleagueState.phase==='preparing'&&!reducedMotion?Math.sin(colleagueState.progress*24)*.08:0;
    const stride=colleagueState.walking&&!reducedMotion?Math.sin((state.elapsed||0)*10)*.4:0;
    colleagueLegs[0].rotation.x=stride;colleagueLegs[1].rotation.x=-stride;
    colleagueArms[0].rotation.x=colleagueState.carrying?-.8:-stride*.5;colleagueArms[1].rotation.x=colleagueState.carrying?-.8:stride*.5;
    colleagueCup.visible=false;
    colleagueBlanket.visible=false;
    const cartPose=trolleyPresentation(player);trolley.position.set(cartPose.x,0,cartPose.z);trolley.rotation.y=cartPose.angle;const selfServing=state.action?.kind==='task'&&state.action.choice?.id==='serve';
    trolleyLid.rotation.x=selfServing?-1.4*serviceItemPose({source:{x:0,y:0,z:0},hand:{x:0,y:0,z:0},dest:{x:0,y:0,z:0},progress}).open:0;
    galleyLid.rotation.x=colleagueState.phase==='preparing'?-1.4*Math.sin(Math.min(1,colleagueState.progress*6)*Math.PI):0;
    if(state.action?.kind==='handoff'){crew.rotation.y=Math.atan2(GALLEY_SUPPLY.x-player.x,GALLEY_SUPPLY.z-player.z);arms[1].rotation.x=-1.9;}
    shadow.position.set(crew.position.x,.143,crew.position.z);
    ring.visible = Boolean(selected) && state.status !== 'finished'&&!escort;
    if (selected) {
      ring.position.set(selected.x || 0,.146,selected.z);
      const near = Math.hypot((selected.x||0)-(player.x||0),selected.z-player.z) <= INTERACTION_RADIUS + 1e-8;
      ringMaterial.color.set(near ? '#ffe4a1' : selected.kind === 'service' ? '#9dd8dd' : '#e9b956');
    }
    const mode = state.cameraMode === 'overview' ? 'overview' : 'follow';
    const decisionTask=tasks.find(t=>t.id===state.dialog?.id);
    const decisionActor=decisionTask&&boardingTaskActor(state,decisionTask.id);
    const cameraPose = decisionTask ? decisionPose({player,task:state.boarding&&decisionActor&&decisionTask.id!=='bag'?{...decisionTask,z:decisionActor.z,side:decisionActor.x>=0?'right':'left'}:decisionTask,aspect:camera.aspect}) : getCabinCameraPose(mode,player,camera.aspect);
    wantedPosition.set(...cameraPose.position); wantedTarget.set(...cameraPose.target);
    const ease = firstFrame || resized || reducedMotion || previousMode !== mode ? 1 : state.status === 'paused' || state.lesson || (state.dialog&&!decisionTask) ? 0 : 1-Math.exp(-Math.min(Math.max(dt,0),.1)*7);
    camera.position.lerp(wantedPosition,ease); cameraTarget.lerp(wantedTarget,ease);
    camera.fov=cameraPose.fov;camera.updateProjectionMatrix(); camera.up.set(0,1,0); camera.lookAt(cameraTarget); camera.updateMatrixWorld(true);
    if(!decisionTask&&sizeWidth<=700&&sizeHeight>sizeWidth)camera.setViewOffset(sizeWidth,sizeHeight,0,-sizeHeight*.08,sizeWidth,sizeHeight);else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    for(const actor of passengers.values()){
      const fade=decisionTask&&actor.root.position.z<decisionTask.z-.5&&actor.root.position.z>decisionTask.z-4.5;
      if(fade&&!actor.fadeMaterials){const copies=new Map();actor.root.traverse(o=>{if(o.isMesh){if(!copies.has(o.material))copies.set(o.material,ownMaterial(o.material.clone()));o.material=copies.get(o.material);}});actor.fadeMaterials=[...copies.values()];}
      for(const m of actor.fadeMaterials||[]){if(m.transparent!==!!fade){m.transparent=!!fade;m.needsUpdate=true;}m.opacity=fade?.18:1;m.depthWrite=!fade;}
    }
    for(const record of records.values())for(const bin of record.bins){
      // Keep the storage clue visible while revealing the speaker behind it.
      const opacity=decisionTask?.id==='bag'?.24:1;
      for(const m of bin.fadeMaterials){if(m.transparent!==(opacity<1)){m.transparent=opacity<1;m.needsUpdate=true;}m.opacity=opacity;m.depthWrite=opacity===1;}
    }
    scene.updateMatrixWorld(true);
    firstFrame = false; resized=false; previousMode = mode; renderer.render(scene,camera);
    const labels = targets.filter(target=>(target.id!=='report'||Math.hypot(player.x||0,target.z-player.z)<2)&&(!decisionTask||target.id===decisionTask.id)).map(target => {
      const task=tasks.find(t=>t.id===target.id), hazard=hazards.find(h=>h.id===target.id);
      const boarder=task&&boardingTaskActor(state,task.id),pair=boarder&&boardingActors.get(boarder.id);
      const actor=task&&(pair?.standing||(task.characterId==='elder'&&!state.boarding?returningElder:passengers.get(`${task.row}-${task.side==='right'?2:1}`)));
      const head=actor?.head.getWorldPosition(new THREE.Vector3());
      const anchor=head?{x:head.x,y:head.y+.31,z:head.z}:{x:target.id==='report'?.65:target.x||0,y:hazard?2.45:.5,z:target.z};
      const success=!!state.boarding&&!!actor&&reactions.get(target.id)?.type==='correct'&&visualTime-reactions.get(target.id).at<1.4;
      return {id:target.id,text:success?'謝謝你！':task?.title||target.label||target.id,anchor,
        ...projectGamePoint(camera,anchor,sizeWidth,sizeHeight),
        icon:success?'report':target.kind==='hazard'?'alert':task?.id==='water'?'water':task?.id==='blanket'?'blanket':['question','guide','family'].includes(task?.id)?'question':target.kind==='report'?'report':'alert',
        kind:target.kind||'safety',distance:Math.hypot((target.x||0)-player.x,target.z-player.z),
        near:target.id===(typeof state.near==='string'?state.near:state.near?.id),selected:target.id===selected?.id};
    });
    if(state.action?.kind==='handoff')labels.push({id:'handoff-call',text:'同事，麻煩協助這位旅客！',...projectGamePoint(camera,{x:player.x,y:2.15,z:player.z},sizeWidth,sizeHeight),kind:'detail',near:false,selected:true});
    if(colleagueState.phase==='preparing')labels.push({id:'handoff-reply',text:'收到！我去取物。',...projectGamePoint(camera,{x:colleagueState.x,y:2.3,z:colleagueState.z},sizeWidth,sizeHeight),kind:'detail',near:false,selected:true});
    if(colleagueState.taskId&&!colleagueState.settled&&(!decisionTask))labels.push({id:'coworker',text:`同事 · ${COWORKER_PHASE_LABELS[colleagueState.phase]}`,...projectGamePoint(camera,{x:colleagueState.x,y:2.05,z:colleagueState.z},sizeWidth,sizeHeight),kind:'detail',near:false,selected:false});
    const bagTask = tasks.find(t => t.id === 'bag'), bagRecord = records.get('bag');
    if (bagTask && bagRecord && !bagTask.done && selected?.id === 'bag') {
      for (const [index,b] of bagRecord.bins.entries()) {
        const full = bagRecord.variant === 1 && index === 0;
        labels.push({id:index === 0 ? 'bag-bin-near' : 'bag-bin-available',text:bagRecord.variant === 2 ? '已收妥' : full ? '已滿' : bagRecord.variant === 1 ? '可用空櫃' : '空櫃',
          ...projectGamePoint(camera,{x:b.x,y:3.02,z:b.z},sizeWidth,sizeHeight),kind:'detail',near:false,selected:false});
      }
    }
    const questionTask = tasks.find(t => t.id === 'question'), questionRecord = records.get('question');
    if (questionTask && questionRecord && !questionTask.done && selected?.id === 'question') {
      labels.push({id:'question-board',text:questionRecord.variant === 0 ? '尚無確認預估' : '預估稍後 · 可能調整',
        ...projectGamePoint(camera,{x:questionRecord.x+questionRecord.side*.30,y:1.55,z:questionRecord.z-.43},sizeWidth,sizeHeight),kind:'detail',near:false,selected:false});
    }
    if(state.boarding){
      for(const [row,z] of CABIN_ROWS.entries())if(Math.abs(z-player.z)<3.1||state.dialog?.id==='guide'&&row===2)labels.push({id:`boarding-seat-row-${row}`,text:`${row+1} · D C │ B A`,...projectGamePoint(camera,{x:1.9,y:1.7,z},sizeWidth,sizeHeight),kind:'detail',near:false,selected:false});

    }
    const speakerTask=tasks.find(t=>t.id===state.dialog?.id),speakerActor=speakerTask&&(state.boarding?boardingActors.get(boardingTaskActor(state,speakerTask.id)?.id)?.standing:speakerTask.characterId==='elder'?returningElder:passengers.get(`${speakerTask.row}-${speakerTask.side==='right'?2:1}`));
    const speaker=speakerActor?projectGamePoint(camera,{x:speakerActor.root.position.x,y:1.95,z:speakerActor.root.position.z},sizeWidth,sizeHeight):null;
    if(escort)labels.push({id:'escort-goal',text:'走到這裡',...projectGamePoint(camera,{x:escort.goal.x,y:.35,z:escort.goal.z},sizeWidth,sizeHeight),kind:'detail',near:true,selected:true});
    return {labels,speaker,selectedId:selected?.id || null};
  }
  function dispose() {
    if (disposed) return; disposed = true; canvas.removeEventListener('webglcontextlost',contextLost,false);
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); renderer.dispose();
    records.clear(); hazardRecords.clear(); staticBatches.clear(); materialCache.clear(); geometries.clear(); materials.clear();
  }
  resize(); return {render,resize,dispose,getScreenPosition:point=>projectGamePoint(camera,point,sizeWidth,sizeHeight)};
}

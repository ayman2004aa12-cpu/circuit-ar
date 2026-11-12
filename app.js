// CircuitAR — 8th Wall world-tracking prototype.
// Three.js objects are generated in code; no remote 3D models are needed.
// The experience deliberately has NO non-AR fallback pretending to be AR.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js';
import {assessCircuit} from './circuit-logic.js';
window.THREE = THREE; // Required by the 8th Wall Threejs pipeline.

const $ = (id) => document.getElementById(id);
const canvas = $('camerafeed');
const state = {
  xrReady: false, started: false, placed: false, height: 0, tracking: 'INITIALIZING',
  scene: null, camera: null, renderer: null, board: null, selected: null,
  pointer: null, switchClosed: false, lamp: null, switchLever: null, arrowMeshes: [],
  ports: new Map(), raycaster: new THREE.Raycaster(), interactive: [],
  wires: [], lastTick: 0,
};
const WHITE = 0xe8f3fc, NAVY = 0x173449, CYAN = 0x35c9d0, GOLD = 0xffc66c;
const material = (color, extra={}) => new THREE.MeshStandardMaterial({color, roughness:.38, metalness:.16, ...extra});
const metal = material(0xc6d7e2,{roughness:.22,metalness:.74});
const white = material(WHITE);
const navy = material(NAVY);
const gold = material(GOLD,{metalness:.32});
const wireMaterials = [material(0xf85f65), material(0x49d1ed), material(0xffd257)];
const terminalInfo = [
  {id:'batteryPlus', x:-.345, z:-.125, name:'+'},
  {id:'batteryMinus', x:-.215, z:-.125, name:'−'},
  {id:'switchIn', x:-.056, z:-.12, name:'1'},
  {id:'switchOut',x:.062,z:-.12,name:'2'},
  {id:'lampPlus',x:.216,z:-.12,name:'+'},
  {id:'lampMinus',x:.346,z:-.12,name:'−'},
];
const requiredPairs = [
  ['batteryPlus','switchIn'], ['switchOut','lampPlus'], ['lampMinus','batteryMinus'],
];
const wireInitial = [
  [{x:-.32,z:.115},{x:-.17,z:.115}],
  [{x:-.055,z:.205},{x:.10,z:.205}],
  [{x:.175,z:.305},{x:.335,z:.305}],
];

function status(message) { $('message').textContent = message; }
function sphere(radius, mat, segments=18) { return new THREE.Mesh(new THREE.SphereGeometry(radius, segments, 12), mat); }
function box(w,h,d,mat) { return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); }
function cylinder(r1,r2,h,mat,segments=24) { return new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat); }
function add(parent,obj,x=0,y=0,z=0) { obj.position.set(x,y,z);parent.add(obj);return obj; }
function interactive(mesh, info) { mesh.userData = {...mesh.userData,...info}; state.interactive.push(mesh);return mesh; }
function writeLabel(text, width=.14, height=.065, bg='#173449',fg='#ffffff') {
  const c=document.createElement('canvas');c.width=512;c.height=160;
  const g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);
  g.fillStyle=fg;g.font='bold 64px Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,83);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const obj=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));
  obj.rotation.x=-Math.PI/2;return obj;
}
function addPort(parent, cfg) {
  const root=new THREE.Group();root.position.set(cfg.x,.048,cfg.z);parent.add(root);
  const base=add(root,cylinder(.037,.037,.018,metal),0,0,0);
  const connector=add(root,cylinder(.019,.019,.023,gold),0,.017,0);
  const hit=add(root,cylinder(.055,.055,.014,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false})),0,.025,0);
  interactive(hit,{port:cfg.id});
  const port = {id:cfg.id,x:cfg.x,z:cfg.z,root,connector,base};
  state.ports.set(cfg.id,port);
  const label=writeLabel(cfg.name,.045,.03,'#173449','#ffffff');add(parent,label,cfg.x,.041,cfg.z+.055);
}
function createBattery(board) {
  const x=-.279,z=-.235;
  const foundation=add(board,box(.21,.028,.16,metal),x,.045,z);
  const body=add(board,box(.18,.093,.125,navy),x,.102,z);
  const stripe=add(board,box(.039,.094,.127,gold),x-.062,.103,z);
  add(board,writeLabel('بطارية',.15,.05),x,.153,z);
  return {foundation,body,stripe};
}
function createSwitch(board) {
  const x=0,z=-.235;
  add(board,box(.19,.035,.14,metal),x,.055,z);
  const bed=add(board,box(.11,.029,.067,navy),x,.086,z);
  const lever=add(board,box(.09,.023,.029,material(0xefab73)),x-.014,.117,z);
  interactive(lever,{switch:true});interactive(bed,{switch:true});
  state.switchLever=lever;
  add(board,writeLabel('مفتاح',.16,.05),x,.116,z-.081);
}
function createLamp(board) {
  const x=.282,z=-.235;
  add(board,cylinder(.066,.078,.025,metal),x,.06,z);
  add(board,cylinder(.040,.044,.039,navy),x,.089,z);
  const bulbMat=material(0xe0ebf2,{transparent:true,opacity:.92,emissive:0x1a2430,emissiveIntensity:.25,roughness:.13,metalness:0});
  const bulb=add(board,sphere(.061,bulbMat,24),x,.153,z);
  add(board,cylinder(.016,.016,.065,material(0xeaae62,{emissive:0x5c2a00})),x,.135,z);
  const light=new THREE.PointLight(0xffcc66,0,0.65);light.position.set(x,.16,z);board.add(light);
  const halo = add(board,new THREE.Mesh(new THREE.TorusGeometry(.076,.008,9,32), new THREE.MeshBasicMaterial({color:0xffd66b,transparent:true,opacity:0})), x,.155,z);
  halo.rotation.x=Math.PI/2;
  state.lamp={bulb,light,halo,bulbMat};
  add(board,writeLabel('مصباح',.16,.05),x,.047,z-.097);
}
function createWire(index,board) {
  const wire={index,color:wireMaterials[index],ends:wireInitial[index].map((p)=>({...p,port:null})),tube:null,handles:[],arrow:null,curve:null};
  for (let i=0;i<2;i++) {
    const handle=sphere(.028,material([0xff868b,0x8ceeff,0xffe7a1][index],{emissive:[0x491012,0x073e45,0x554015][index],emissiveIntensity:.5}));
    interactive(handle,{wire:index,end:i});board.add(handle);wire.handles.push(handle);
  }
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.015,.043,8),new THREE.MeshBasicMaterial({color:0x82fff3}));
  arrow.visible=false;board.add(arrow);wire.arrow=arrow;
  state.wires.push(wire);refreshWire(wire);
}
function refreshWire(wire) {
  if (!state.board) return;
  const a=wire.ends[0],b=wire.ends[1];
  const pa=new THREE.Vector3(a.x,.085,a.z), pb=new THREE.Vector3(b.x,.085,b.z);
  const between=pa.clone().lerp(pb,.5);between.y=.135;
  wire.curve=new THREE.CatmullRomCurve3([pa,between,pb]);
  if (wire.tube) {state.board.remove(wire.tube);wire.tube.geometry.dispose();}
  wire.tube=new THREE.Mesh(new THREE.TubeGeometry(wire.curve,18,.008,7,false),wire.color);
  state.board.add(wire.tube);
  wire.handles[0].position.copy(pa);wire.handles[1].position.copy(pb);
}
function createBoard(scene) {
  state.board=new THREE.Group();state.board.visible=false;scene.add(state.board);
  const board=state.board;
  add(board,box(.87,.025,.69,material(0xe8edf0,{roughness:.65})),0,.012,0);
  add(board,box(.88,.012,.7,material(0x247e91,{metalness:.55})),0,-.008,0);
  add(board,writeLabel('مختبر الدوائر الكهربائية',.51,.058,'#173449','#bafaff'),0,.027,-.305);
  add(board,writeLabel('اسحب أطراف الأسلاك إلى دوائر التوصيل',.49,.052,'#2a5364','#ffffff'),0,.028,.385);
  add(board,box(.79,.012,.245,material(0xd2e3ea)),0,.031,-.192);
  for(const cfg of terminalInfo)addPort(board,cfg);
  createBattery(board);createSwitch(board);createLamp(board);
  for(let i=0;i<3;i++)createWire(i,board);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.92,.75),new THREE.ShadowMaterial({opacity:.28}));
  shadow.rotation.x=-Math.PI/2;shadow.receiveShadow=true;board.add(shadow);
  // Keep the AR board level with the single horizontal plane tracked by 8th Wall.
  refreshElectricalState();
}
function wireMatch(wire,pair) {
  const endpoints=wire.ends.map(e=>e.port);return endpoints.includes(pair[0])&&endpoints.includes(pair[1]);
}
function refreshElectricalState() {
  const result=assessCircuit(state.wires,state.switchClosed);
  $('connections').textContent=`التوصيلات الصحيحة: ${result.correctCount} / 3`;
  $('lampState').textContent=result.lit?'💡 المصباح مضيء':'المصباح مطفأ';
  if(state.lamp){
    state.lamp.bulbMat.color.setHex(result.lit?0xffefad:0xe0ebf2);
    state.lamp.bulbMat.emissive.setHex(result.lit?0xffa600:0x1a2430);
    state.lamp.bulbMat.emissiveIntensity=result.lit?2.8:.25;
    state.lamp.light.intensity=result.lit?1.7:0;
    state.lamp.halo.material.opacity=result.lit?.8:0;
  }
  if(state.switchLever) {
    state.switchLever.rotation.z=state.switchClosed?0:-.55;
    state.switchLever.material.color.setHex(state.switchClosed?0x55d6ad:0xefab73);
  }
  state.wires.forEach(w=>w.arrow.visible=result.lit&&requiredPairs.some(p=>wireMatch(w,p)));
  if(result.lit) status('أحسنت! اكتملت الدائرة وأُغلق المفتاح، فأضاء المصباح.');
  else if(result.connected)status('اكتملت الدائرة! اضغط المفتاح لإغلاقه وتشغيل المصباح.');
  else if(result.correctCount===3)status('تحقق من جميع أطراف التوصيل.');
  else if(state.placed)status('المس أحد أطراف السلك واسحبه إلى منفذ دائري. يجب تركيب ثلاثة أسلاك صحيحة.');
}
function resetWires() {
  state.wires.forEach((wire,i)=>{wire.ends=wireInitial[i].map(p=>({...p,port:null}));refreshWire(wire);});
  state.selected=null;state.switchClosed=false;refreshElectricalState();
}
function projectScreen(event) {
  const bounds=canvas.getBoundingClientRect();
  return new THREE.Vector2(((event.clientX-bounds.left)/bounds.width)*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);
}
function pickObject(event){
  if(!state.camera)return null;
  state.raycaster.setFromCamera(projectScreen(event),state.camera);
  return state.raycaster.intersectObjects(state.interactive,false)[0]?.object??null;
}
function worldPointOnLevel(event,level) {
  if(!state.camera)return null;
  state.raycaster.setFromCamera(projectScreen(event),state.camera);
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-level);
  return state.raycaster.ray.intersectPlane(plane,new THREE.Vector3());
}
function nearestPort(local) {
  let chosen=null,dist=Infinity;
  for(const port of state.ports.values()) {
    const d=Math.hypot(local.x-port.x,local.z-port.z);
    if(d<dist){dist=d;chosen=port;}
  }
  return dist<.082?chosen:null;
}
function attachEnd(wireId,endId,portId) {
  const wire=state.wires[wireId],end=wire.ends[endId],port=state.ports.get(portId);
  if(!port)return;
  end.port=portId;end.x=port.x;end.z=port.z;refreshWire(wire);
  refreshElectricalState();
}
function beginWireSelection(id,end) {
  state.selected={wire:id,end};
  status('حرّك طرف السلك إلى منفذ التوصيل، أو المس المنفذ مباشرة.');
}
function onPointerDown(e) {
  if(!state.placed)return;
  const target=pickObject(e);
  if(target?.userData?.wire!==undefined){
    state.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
    beginWireSelection(target.userData.wire,target.userData.end);
    canvas.setPointerCapture?.(e.pointerId);e.preventDefault();return;
  }
  if(target?.userData?.port && state.selected){
    attachEnd(state.selected.wire,state.selected.end,target.userData.port);
    state.selected=null;return;
  }
  if(target?.userData?.switch){state.switchClosed=!state.switchClosed;refreshElectricalState();return;}
  state.selected=null;
}
function onPointerMove(e){
  if(!state.pointer || state.pointer.id!==e.pointerId || !state.selected)return;
  if(Math.hypot(e.clientX-state.pointer.x,e.clientY-state.pointer.y)<6 && !state.pointer.moved)return;
  state.pointer.moved=true;
  const world=worldPointOnLevel(e,state.board.position.y+.085);
  if(!world)return;
  const local=state.board.worldToLocal(world.clone());
  const wire=state.wires[state.selected.wire];const end=wire.ends[state.selected.end];
  end.port=null;end.x=THREE.MathUtils.clamp(local.x,-.41,.41);end.z=THREE.MathUtils.clamp(local.z,-.31,.34);
  refreshWire(wire);refreshElectricalState();e.preventDefault();
}
function onPointerUp(e){
  if(!state.pointer || state.pointer.id!==e.pointerId)return;
  if(state.pointer.moved&&state.selected){
    const wire=state.wires[state.selected.wire],end=wire.ends[state.selected.end];
    const nearest=nearestPort(end);
    if(nearest){attachEnd(state.selected.wire,state.selected.end,nearest.id);status('تم تثبيت الطرف. وصّل بقية أطراف الأسلاك.');}
    else status('اقترب من المنفذ الدائري حتى يثبت طرف السلك، أو المس المنفذ بعد اختيار الطرف.');
    state.selected=null;
  }
  // A simple tap keeps selected so the user can tap a terminal next.
  state.pointer=null;
  try{canvas.releasePointerCapture?.(e.pointerId);}catch{}
}
function placementPoint(){
  if(!state.camera)return null;
  // 8th Wall World Effects estimates a single horizontal y=0 plane.
  const ray = new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,-.04),state.camera);
  const surface=new THREE.Plane(new THREE.Vector3(0,1,0),-state.height);
  const hit=ray.ray.intersectPlane(surface,new THREE.Vector3());
  if(!hit || hit.distanceTo(state.camera.position)>4.5)return null;
  return hit;
}
function placeBoard(){
  if(!state.board){status('لم يبدأ محرك AR بعد.');return;}
  const point=placementPoint();
  if(!point){status('وجّه الكاميرا نحو السطح بزاوية مائلة، ثم أعد المحاولة.');return;}
  state.board.position.copy(point);
  // Face the board toward the camera; maintain level with horizontal surface.
  const dir = state.camera.position.clone().sub(point);
  state.board.rotation.y=Math.atan2(dir.x,dir.z);
  state.board.visible=true;state.placed=true;
  $('crosshair').classList.add('hidden');$('placeBtn').classList.add('hidden');
  status('ثُبّتت الدائرة في العالم الحقيقي. ابدأ بتوصيل الأسلاك.');
}
function animateAr(time){
  if(!state.board||!state.placed)return;
  const result=assessCircuit(state.wires,state.switchClosed);
  if(!result.lit)return;
  state.wires.forEach(wire=>{
    const pair=requiredPairs.find(pair=>wireMatch(wire,pair));if(!pair || !wire.curve)return;
    const indexOfStart=wire.ends.findIndex(e=>e.port===pair[0]);
    const t=((time*.00035)+(wire.index*.17))%1;const u=indexOfStart===0?t:1-t;
    const p=wire.curve.getPoint(u);const tangent=wire.curve.getTangent(u);
    if(indexOfStart!==0)tangent.negate();
    wire.arrow.position.copy(p);wire.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent.normalize());
  });
  if(state.lamp)state.lamp.halo.material.opacity=.55+.24*Math.sin(time*.004);
}
function initializeScenePipeline(){
  return {
    name:'circuitar-scene',
    onStart: ({canvas:arCanvas})=>{
      const {scene,camera,renderer}=XR8.Threejs.xrScene();
      state.scene=scene;state.camera=camera;state.renderer=renderer;
      renderer.shadowMap.enabled=true;
      scene.add(new THREE.HemisphereLight(0xffffff,0x667788,2.4));
      const light = new THREE.DirectionalLight(0xffffff,2.0);light.position.set(2,5,3);scene.add(light);
      // Official 8th Wall sample uses an elevated starting camera position.
      camera.position.set(0,1.6,0);
      XR8.XrController.updateCameraProjectionMatrix({origin:camera.position,facing:camera.quaternion});
      createBoard(scene);
      state.tracking='INITIALIZING';
      $('tracking').textContent='حرّك الجهاز ببطء ليتعرف على السطح';
      status('وجّه الكاميرا نحو سطح واحد واضح، ثم اضغط «وضع الدائرة».');
      arCanvas.addEventListener('touchmove',event=>event.preventDefault(),{passive:false});
      arCanvas.addEventListener('pointerdown',onPointerDown);
      arCanvas.addEventListener('pointermove',onPointerMove);
      arCanvas.addEventListener('pointerup',onPointerUp);
      arCanvas.addEventListener('pointercancel',onPointerUp);
      arCanvas.addEventListener('reality.trackingstatus',(e)=>{
        const v=e.detail||{};state.tracking=v.status||'UNKNOWN';
        $('tracking').textContent=v.status==='NORMAL'?'✓ التتبع مستقر':'حرّك الجهاز ببطء لتحسين تتبع السطح';
      });
    },
    onUpdate: ({processCpuResult})=>{
      const reality=processCpuResult?.reality;
      if(reality?.trackingStatus==='NORMAL'){
        state.tracking='NORMAL';$('tracking').textContent='✓ التتبع مستقر';
      }
    },
    onRender:()=>animateAr(performance.now()),
  };
}
function onXRReady(){
  state.xrReady=true;
  $('startBtn').disabled=false;$('startBtn').textContent='فتح تجربة الواقع المعزز';
  $('loadStatus').textContent='المحرك جاهز — شغّل الكاميرا.';
}
// 8th Wall dispatches xrloaded once the engine script is ready.
if(window.XR8)onXRReady();else window.addEventListener('xrloaded',onXRReady,{once:true});
$('startBtn').addEventListener('click',()=>{
  if(!state.xrReady||state.started)return;
  if(!window.isSecureContext){$('loadStatus').textContent='يلزم فتح رابط HTTPS للسماح بالكاميرا.';return;}
  try {
    state.started=true;
    XR8.XrController.configure({disableWorldTracking:false,scale:'absolute'});
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      window.LandingPage?.pipelineModule(),
      window.XRExtras?.FullWindowCanvas.pipelineModule(),
      window.XRExtras?.Loading.pipelineModule(),
      window.XRExtras?.RuntimeError.pipelineModule(),
      initializeScenePipeline(),
    ].filter(Boolean));
    $('startPanel').classList.add('hidden');
    $('controls').classList.remove('hidden');
    XR8.run({canvas,allowedDevices:XR8.XrConfig.device().MOBILE_AND_HEADSETS});
  } catch(e) {
    state.started=false;$('startPanel').classList.remove('hidden');$('controls').classList.add('hidden');
    $('loadStatus').textContent=`تعذر تشغيل AR: ${e.message||e}`;console.error(e);
  }
});
$('placeBtn').addEventListener('click',()=>placeBoard());
$('resetBtn').addEventListener('click',()=>resetWires());
$('moveBtn').addEventListener('click',()=>{
  if(!state.board)return;state.placed=false;state.board.visible=false;
  $('placeBtn').classList.remove('hidden');$('crosshair').classList.remove('hidden');
  status('وجّه الجهاز نحو السطح الجديد ثم اضغط «وضع الدائرة».');
});
$('raiseBtn').addEventListener('click',()=>adjustHeight(.08));
$('lowerBtn').addEventListener('click',()=>adjustHeight(-.08));
function adjustHeight(delta){
  state.height=THREE.MathUtils.clamp(state.height+delta,-.16,1.28);
  if(state.placed&&state.board) state.board.position.y=state.height;
  status(`ارتفاع اللوحة: ${Math.round(state.height*100)} سم نسبةً إلى المستوى المرجعي. اضبطه حتى تطابق اللوحة سطح الطاولة.`);
}
$('helpBtn').addEventListener('click',()=> $('helpPanel').classList.remove('hidden'));
$('closeHelpBtn').addEventListener('click',()=> $('helpPanel').classList.add('hidden'));
window.addEventListener('error',e=>{console.error('CircuitAR error',e.error||e.message)});

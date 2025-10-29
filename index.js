// Use one consistent Three.js version everywhere (here: 0.165.0)
import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";
// OrbitControls for camera interaction
import { OrbitControls } from "https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js";
// XRButton to enter VR mode
import { XRButton } from "https://unpkg.com/three@0.165.0/examples/jsm/webxr/XRButton.js";


// --- RENDERER ---

// create renderer with antialiasing and a dark background
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); 
// set pixel ratio for hi-dpi devices but limit it to 2x
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// set size to full window
renderer.setSize(window.innerWidth, window.innerHeight);
// enable XR on the renderer
renderer.xr.enabled = true;
// enable shadows
renderer.shadowMap.enabled = true;
// add the canvas to the document
document.body.appendChild(renderer.domElement);

// XR button
document.body.appendChild(XRButton.createButton(renderer, {
  requiredFeatures: ['local-floor'],
  optionalFeatures: ['hand-tracking', 'dom-overlay'],
  domOverlay: { root: document.body }
}));

// --- SCENE AND CAMERA ---
// create scene
const scene = new THREE.Scene();
// set a background color for scene
scene.background = new THREE.Color(0xbbbbcc);
    // 0x111122 navy blue
    // 0x444466 medium blue
    // 0x8888aa light blue
    // 0xbbbbcc very light blue

// create camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
// position the camera
camera.position.set(0, 1.6, 3);

// --- Orbit Controls ---
const orbit = new OrbitControls(camera, renderer.domElement);
// set orbit target to be at human eye level
orbit.target.set(0, 1.4, 0);
// update the orbit to use the new target
orbit.enableDamping = true;

// --- LIGHTS ---
// hemisphere light for ambient lighting
scene.add(new THREE.HemisphereLight(0xbbbbcc, 0x222233, 0.6));
// directional light to act as the sun
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
// enable shadows for the light
dir.position.set(1, 3, 2);
// allow shadow casting
dir.castShadow = true;
// add setup shadow properties for the light
scene.add(dir);

// --- FLOOR ---
// large plane as floor
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0xbbbbcc, roughness: 1 })
);
// rotate to be horizontal
floor.rotation.x = -Math.PI / 2;
// position slightly below 0 to avoid z-fighting
floor.receiveShadow = true;
// allow floor to receive shadows
scene.add(floor);

// --- BOX ---
const box = new THREE.Mesh(
// box geometry and standard material
  new THREE.BoxGeometry(0.4, 0.4, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x68c3ff, roughness: 0.4, metalness: 0.1 })
);
// position box above the floor
box.position.set(0, 1.5, -1.2);
// allow box to cast shadows
box.castShadow = true;
// add box to the scene
scene.add(box);

// --- RESIZE ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- CONTROLLER SETUP ---
// temporary matrix for raycasting
const tempMatrix = new THREE.Matrix4();
// raycaster for controller interaction
const raycaster = new THREE.Raycaster();
// array of selectable objects
const selectable = [box];

// Controller 1 (primary)
const controller1 = renderer.xr.getController(0);
// add event listeners for select start and end
controller1.addEventListener('selectstart', onSelectStart);
controller1.addEventListener('selectend', onSelectEnd);
scene.add(controller1);

// Controller 2 (optional second hand)
const controller2 = renderer.xr.getController(1);
// add event listeners for select start and end
controller2.addEventListener('selectstart', onSelectStart);
controller2.addEventListener('selectend', onSelectEnd);
scene.add(controller2);

// Add visible rays to each controller
function makeRay() {
// create a simple line geometry for the ray
  const geom = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1) ]);
  // create a basic line material
  const mat  = new THREE.LineBasicMaterial({ linewidth: 2 });
  // create the line object
  const line = new THREE.Line(geom, mat);
  line.name = 'ray';
  line.scale.z = 5;
  return line;
}
// add rays to controllers
controller1.add(makeRay());
controller2.add(makeRay());

// Simple “select changes color” behavior
// Start selecting
function onSelectStart(e) { e.target.userData.isSelecting = true; }
// End selecting
function onSelectEnd(e)   { e.target.userData.isSelecting = false; }

// Handle controller interaction
function handleController(controller) {
  // Update raycast
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const hits = raycaster.intersectObjects(selectable, false);
  if (hits.length) {
    const hit = hits[0];
    // Visual feedback: nudge color while selecting
    if (controller.userData.isSelecting) {
      const mat = hit.object.material;
      mat.color.offsetHSL(0.005, 0, 0);
    }
  }
}

// ---------- HUD ----------
const hud = document.createElement('div');
hud.style.position = 'fixed';
hud.style.right = '12px';
hud.style.top = '12px';
hud.style.padding = '10px 12px';
hud.style.background = 'rgba(0,0,0,0.55)';
hud.style.color = '#fff';
hud.style.font = '12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
hud.style.maxWidth = '360px';
hud.style.whiteSpace = 'pre';
hud.style.pointerEvents = 'none';
hud.style.borderRadius = '10px';
hud.style.backdropFilter = 'blur(6px)';
hud.textContent = 'XR Input: (waiting for session)';
document.body.appendChild(hud);

// ---------- Input helpers ----------
const PINCH_THRESHOLD_METERS = 0.018; // ~1.8 cm feels right on AVP; tune to taste

function formatFloat(x, d=2) { return (x!==undefined && x!==null) ? x.toFixed(d) : '—'; }

function snapshotInputs(session, frame, referenceSpace) {
  const lines = [];
  for (const src of session.inputSources) {
    const kind = src.hand ? 'hand' : (src.gamepad ? 'gamepad' : src.targetRayMode);
    const hand  = src.handedness || 'none';
    const profs = (src.profiles && src.profiles.length) ? src.profiles.join(',') : '—';

    // Buttons/axes if a controller exposes Gamepad
    let btnInfo = '';
    if (src.gamepad) {
      const pressed = src.gamepad.buttons.map((b,i)=> (b.pressed?`B${i}`:null)).filter(Boolean).join(' ');
      const axes    = src.gamepad.axes.map(a=>formatFloat(a,2)).join(', ');
      btnInfo = ` | buttons: ${pressed || 'none'} | axes: [${axes}]`;
    }

    // Hand tracking pinch detector (thumb tip ↔︎ index tip distance)
    let pinchInfo = '';
    if (src.hand && frame && referenceSpace) {
      const ht = src.hand;
      const tipIndex = ht.get('index-finger-tip') || ht[XRHand.INDEX_PHALANX_TIP];
      const tipThumb = ht.get('thumb-tip')        || ht[XRHand.THUMB_PHALANX_TIP];

      const pIndex = tipIndex ? frame.getJointPose(tipIndex, referenceSpace) : null;
      const pThumb = tipThumb ? frame.getJointPose(tipThumb, referenceSpace) : null;

      if (pIndex && pThumb) {
        const dx = pIndex.transform.position.x - pThumb.transform.position.x;
        const dy = pIndex.transform.position.y - pThumb.transform.position.y;
        const dz = pIndex.transform.position.z - pThumb.transform.position.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const isPinching = dist < PINCH_THRESHOLD_METERS;
        pinchInfo = ` | pinchDist: ${formatFloat(dist,3)}m ${isPinching ? '→ PINCH' : ''}`;
      } else {
        pinchInfo = ' | pinch: n/a';
      }
    }

    lines.push(
      `[${hand}] ${kind} | targetRay: ${src.targetRayMode || '—'} | profiles: ${profs}${btnInfo}${pinchInfo}`
    );
  }
  return lines.length ? lines.join('\n') : 'No inputSources (hands/controllers not detected).';
}

// ---------- Events for high-level actions ----------
const activeFlags = { selectL:false, selectR:false, squeezeL:false, squeezeR:false };

function labelFrom(src) {
  const h = src.handedness || 'none';
  return h[0].toUpperCase(); // L / R / N
}

function bindInputEvents(session) {
  session.addEventListener('selectstart',  (e)=> activeFlags['select'+labelFrom(e.inputSource)] = true);
  session.addEventListener('selectend',    (e)=> activeFlags['select'+labelFrom(e.inputSource)] = false);
  session.addEventListener('squeezestart', (e)=> activeFlags['squeeze'+labelFrom(e.inputSource)] = true);
  session.addEventListener('squeezeend',   (e)=> activeFlags['squeeze'+labelFrom(e.inputSource)] = false);

  session.addEventListener('inputsourceschange', (e) => {
    // Just to surface connect/disconnect in the HUD
    const added   = e.added?.map(s=>`${s.handedness||'none'}:${s.hand?'hand':(s.gamepad?'gamepad':s.targetRayMode)}`).join(', ');
    const removed = e.removed?.map(s=>`${s.handedness||'none'}:${s.hand?'hand':(s.gamepad?'gamepad':s.targetRayMode)}`).join(', ');
    if (added)   console.log('[inputsourceschange] added:', added);
    if (removed) console.log('[inputsourceschange] removed:', removed);
  });
}

// Hook on session start/end so we can read joint poses
let xrRefSpace = null;
renderer.xr.addEventListener('sessionstart', async () => {
  const session = renderer.xr.getSession();
  xrRefSpace = await session.requestReferenceSpace('local-floor');
  bindInputEvents(session);
  hud.textContent = 'XR Input: session started… show hands/controllers to see data.';
});

renderer.xr.addEventListener('sessionend', () => {
  xrRefSpace = null;
  hud.textContent = 'XR Input: session ended';
});

// ---------- Update HUD every frame ----------
const _render = renderer.render.bind(renderer);

// --- ANIMATE ---
renderer.setAnimationLoop((t) => {
  const dt = t * 0.001;
  box.rotation.y = dt * 0.7;

  // Build a one-line summary header
  const header = `select[L:${!!activeFlags.selectL} R:${!!activeFlags.selectR}]  ` +
                 `squeeze[L:${!!activeFlags.squeezeL} R:${!!activeFlags.squeezeR}]`;

  // Snapshot all inputs
  const session = renderer.xr.getSession?.();
  const details = (session && xrRefSpace)
    ? snapshotInputs(session, frame, xrRefSpace)
    : 'XR session not active.';

  hud.textContent = `${header}\n${details}`;

  // finally render
  orbit.update();
  _render(scene, camera);
});

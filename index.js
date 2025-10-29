// Use one consistent Three.js version everywhere (here: 0.165.0)
import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js";
import { XRButton } from "https://unpkg.com/three@0.165.0/examples/jsm/webxr/XRButton.js";

// --- Renderer ---

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
  optionalFeatures: ['hand-tracking']
}));

// --- Scene & Camera ---
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

// --- Lights ---
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

// --- Floor ---
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

// --- Box ---
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

// --- Resize ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Controller setup ---
const tempMatrix = new THREE.Matrix4();
const raycaster = new THREE.Raycaster();
const selectable = [box];

// Controller 1 (primary)
const controller1 = renderer.xr.getController(0);
controller1.addEventListener('selectstart', onSelectStart);
controller1.addEventListener('selectend', onSelectEnd);
scene.add(controller1);

// Controller 2 (optional second hand)
const controller2 = renderer.xr.getController(1);
controller2.addEventListener('selectstart', onSelectStart);
controller2.addEventListener('selectend', onSelectEnd);
scene.add(controller2);

// Add visible rays to each controller
function makeRay() {
  const geom = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1) ]);
  const mat  = new THREE.LineBasicMaterial({ linewidth: 2 });
  const line = new THREE.Line(geom, mat);
  line.name = 'ray';
  line.scale.z = 5;
  return line;
}
controller1.add(makeRay());
controller2.add(makeRay());

// Simple “select changes color” behavior
function onSelectStart(e) { e.target.userData.isSelecting = true; }
function onSelectEnd(e)   { e.target.userData.isSelecting = false; }

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

// ===== World-space HUD (head-locked) + Input Map =====

// High-level flags for WebXR actions
const activeFlags = { selectL:false, selectR:false, squeezeL:false, squeezeR:false };
function labelFrom(src) { return (src.handedness || 'none')[0].toUpperCase(); } // L/R/N

// XR reference space for joint poses
let xrRefSpace = null;

// Build a head-locked HUD (plane) that we draw text onto
let hudCanvas, hudCtx, hudTexture, hudMesh;
function ensureWorldHud() {
  if (hudMesh) return;

  // hi-res canvas for crisp text
  hudCanvas = document.createElement('canvas');
  hudCanvas.width = 1024;   // increase for sharper text (costs a bit of perf)
  hudCanvas.height = 512;
  hudCtx = hudCanvas.getContext('2d');

  hudTexture = new THREE.CanvasTexture(hudCanvas);
  hudTexture.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map: hudTexture,
    transparent: true,
    depthTest: false,   // always on top
    depthWrite: false
  });

  // ~90cm wide, 45cm tall panel in front of the eyes
  const geo = new THREE.PlaneGeometry(0.9, 0.45);
  hudMesh = new THREE.Mesh(geo, mat);
  hudMesh.renderOrder = 9999;
  hudMesh.position.set(0, -0.06, -0.85); // centered, a little below gaze
  camera.add(hudMesh);
  scene.add(camera);
}

function drawHud(text) {
  if (!hudCanvas) return;
  const W = hudCanvas.width, H = hudCanvas.height;

  hudCtx.clearRect(0, 0, W, H);
  // background panel
  hudCtx.fillStyle = 'rgba(0,0,0,0.55)';
  hudCtx.fillRect(0, 0, W, H);

  // text
  hudCtx.fillStyle = '#ffffff';
  hudCtx.font = '28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  hudCtx.textBaseline = 'top';

  const lines = String(text).split('\n');
  const lineH = 34;
  let y = 16;
  for (const line of lines) { hudCtx.fillText(line, 16, y); y += lineH; }

  hudTexture.needsUpdate = true;
}

function setHudText(text) { drawHud(text); }

// ——— Input inspection helpers ———
const PINCH_THRESHOLD_METERS = 0.018; // ~1.8cm: good default for AVP
function ff(x, d=2) { return (x!==undefined && x!==null) ? x.toFixed(d) : '—'; }

function snapshotInputs(session, frame, referenceSpace) {
  const lines = [];
  for (const src of session.inputSources) {
    const kind = src.hand ? 'hand' : (src.gamepad ? 'gamepad' : (src.targetRayMode || 'unknown'));
    const hand = src.handedness || 'none';
    const prof = (src.profiles && src.profiles.length) ? src.profiles.join(',') : '—';

    // Controllers (Gamepad API)
    let ctrlInfo = '';
    if (src.gamepad) {
      const pressed = src.gamepad.buttons.map((b,i)=> b.pressed ? `B${i}` : null).filter(Boolean).join(' ');
      const axes = src.gamepad.axes.map(a=>ff(a,2)).join(', ');
      ctrlInfo = ` | buttons: ${pressed || 'none'} | axes: [${axes}]`;
    }

    // Hands (joint-based pinch detector)
    let pinchInfo = '';
    if (src.hand && frame && referenceSpace) {
      // Cross-impl: try WebXR Hand Input names first, then XRHand indices if exposed
      const ht = src.hand;
      const tipIndex = ht.get?.('index-finger-tip') || (typeof XRHand !== 'undefined' && ht[XRHand.INDEX_PHALANX_TIP]);
      const tipThumb = ht.get?.('thumb-tip')        || (typeof XRHand !== 'undefined' && ht[XRHand.THUMB_PHALANX_TIP]);

      const pIndex = tipIndex ? frame.getJointPose(tipIndex, referenceSpace) : null;
      const pThumb = tipThumb ? frame.getJointPose(tipThumb, referenceSpace) : null;

      if (pIndex && pThumb) {
        const dx = pIndex.transform.position.x - pThumb.transform.position.x;
        const dy = pIndex.transform.position.y - pThumb.transform.position.y;
        const dz = pIndex.transform.position.z - pThumb.transform.position.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const isPinching = dist < PINCH_THRESHOLD_METERS;
        pinchInfo = ` | pinchDist: ${ff(dist,3)}m ${isPinching ? '→ PINCH' : ''}`;
      } else {
        pinchInfo = ' | pinch: n/a';
      }
    }

    lines.push(`[${hand}] ${kind} | targetRay: ${src.targetRayMode || '—'} | profiles: ${prof}${ctrlInfo}${pinchInfo}`);
  }
  return lines.length ? lines.join('\n') : 'No inputSources (hands/controllers not detected).';
}

// Bind XR events
renderer.xr.addEventListener('sessionstart', async () => {
  const session = renderer.xr.getSession();
  xrRefSpace = await session.requestReferenceSpace('local-floor');
  ensureWorldHud();

  // High-level action flags from WebXR events (controllers & hand-select)
  session.addEventListener('selectstart',  (e)=> activeFlags['select'+labelFrom(e.inputSource)] = true);
  session.addEventListener('selectend',    (e)=> activeFlags['select'+labelFrom(e.inputSource)] = false);
  session.addEventListener('squeezestart', (e)=> activeFlags['squeeze'+labelFrom(e.inputSource)] = true);
  session.addEventListener('squeezeend',   (e)=> activeFlags['squeeze'+labelFrom(e.inputSource)] = false);

  setHudText('XR Input: session started…');
});

renderer.xr.addEventListener('sessionend', () => {
  xrRefSpace = null;
  setHudText('XR Input: session ended');
});


// --- Animate ---
renderer.setAnimationLoop((t, frame) => {
  const dt = t * 0.001;
  box.rotation.y = dt * 0.7;

  handleController(controller1);
  handleController(controller2);

  // Build the HUD text
  const header =
    `select[L:${!!activeFlags.selectL} R:${!!activeFlags.selectR}]  ` +
    `squeeze[L:${!!activeFlags.squeezeL} R:${!!activeFlags.squeezeR}]`;

  const session = renderer.xr.getSession?.();
  const details = (session && xrRefSpace)
    ? snapshotInputs(session, frame, xrRefSpace)
    : 'XR session not active.';

  setHudText(`${header}\n${details}`);

  orbit.update();
  renderer.render(scene, camera);
});

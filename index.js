// NEW JS WITH PANEL TITL X

// Use one consistent Three.js version everywhere (here: 0.165.0)
import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js";
import { XRButton } from "https://unpkg.com/three@0.165.0/examples/jsm/webxr/XRButton.js";

// --- Renderer ---

// create renderer with antialiasing and a dark background
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); 
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// XR button
document.body.appendChild(XRButton.createButton(renderer, {
  requiredFeatures: ['local-floor'],
  optionalFeatures: ['hand-tracking']
}));

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbbbbcc);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);
camera.position.set(0, 1.6, 3);

// --- Orbit Controls ---
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.4, 0);
orbit.enableDamping = true;

// --- Hand Debug Setup (joint cubes + palm cube) ---

const JOINT_COUNT = 25;
const jointRadii = new Float32Array(JOINT_COUNT);
const jointMatrices = new Float32Array(16 * JOINT_COUNT);

// 🔹 Patch 2: stable list of joint *names* (used only for mesh maps / labels)
const HAND_JOINT_NAMES = [
  'wrist',

  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',

  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',

  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',

  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',

  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip'
];

// Keep meshes for each hand & joint
const handJointMeshes = {
  left:  new Map(), // jointName -> THREE.Mesh
  right: new Map()
};

// 🔹 NEW: per-hand, per-joint *positions* computed from batched matrices
const jointPositions = {
  left: {},
  right: {}
};

// One palm-base cube per hand
const handPalmMeshes = {
  left: null,
  right: null
};

// Simple per-finger definition for curl
const FINGERS = {
  thumb:  { base: 'thumb-metacarpal',           tip: 'thumb-tip' },
  index:  { base: 'index-finger-metacarpal',    tip: 'index-finger-tip' },
  middle: { base: 'middle-finger-metacarpal',   tip: 'middle-finger-tip' },
  ring:   { base: 'ring-finger-metacarpal',     tip: 'ring-finger-tip' },
  pinky:  { base: 'pinky-finger-metacarpal',    tip: 'pinky-finger-tip' }
};

// "How short is the finger to count as curled?" (~4.5cm)
const FINGER_CURL_THRESHOLD = 0.055;

// Per-finger overrides (thumb is shorter!)
const FINGER_THRESHOLDS = {
  thumb:  0.085, // ~2.8 cm → treat as extended more often
  index:  0.055,
  middle: 0.055,
  ring:   0.055,
  pinky:  0.050
};


// global debug  hand object
const handState = {
  left:  { curls:{}, palm:'' },
  right: { curls:{}, palm:'' }
};

/**
 * A little cube at every joint of each hand 
 *          magenta for left,
 *          cyan for right
 * Each finger tip cube:
 *          normal color when extended,
 *          red when curled (finger bent enough).
 * A larger cube at the wrist:
 *          green when palm facing up,
 *          red when palm facing down,
 *          blue/cyan when sideways.
 */

function initHandDebugMeshes() {
  const jointGeom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const leftColor  = new THREE.Color(0xff00ff);
  const rightColor = new THREE.Color(0x00ffff);

  ['left', 'right'].forEach((handedness) => {
    const isLeft = handedness === 'left';
    const baseColor = isLeft ? leftColor : rightColor;

    HAND_JOINT_NAMES.forEach((jointName) => {
      const mat = new THREE.MeshBasicMaterial({
        color: baseColor.clone(),
        transparent: true,
        opacity: 0.9
      });
      const mesh = new THREE.Mesh(jointGeom, mat);
      mesh.visible = false;
      scene.add(mesh);
      handJointMeshes[handedness].set(jointName, mesh);
    });

    // Palm base cube (a bit bigger)
    const palmGeom = new THREE.BoxGeometry(0.04, 0.025, 0.006);
    const palmMat  = new THREE.MeshBasicMaterial({
      color: baseColor.clone(),
      transparent: true,
      opacity: 0.95
    });
    const palmMesh = new THREE.Mesh(palmGeom, palmMat);
    palmMesh.visible = false;
    scene.add(palmMesh);
    handPalmMeshes[handedness] = palmMesh;
  });
}

initHandDebugMeshes();

// --- Lights ---
scene.add(new THREE.HemisphereLight(0xbbbbcc, 0x222233, 0.6));

const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(1, 3, 2);
dir.castShadow = true;
scene.add(dir);

// --- Floor ---
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0xbbbbcc, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- Box ---
const box = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.4, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x68c3ff, roughness: 0.4, metalness: 0.1 })
);
box.position.set(0, 1.5, -1.2);
box.castShadow = true;
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

const controller1 = renderer.xr.getController(0);
controller1.addEventListener('selectstart', onSelectStart);
controller1.addEventListener('selectend', onSelectEnd);
scene.add(controller1);

const controller2 = renderer.xr.getController(1);
controller2.addEventListener('selectstart', onSelectStart);
controller2.addEventListener('selectend', onSelectEnd);
scene.add(controller2);

function makeRay() {
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0,0,0),
    new THREE.Vector3(0,0,-1)
  ]);
  const mat  = new THREE.LineBasicMaterial({ linewidth: 2 });
  const line = new THREE.Line(geom, mat);
  line.name = 'ray';
  line.scale.z = 5;
  return line;
}
controller1.add(makeRay());
controller2.add(makeRay());

function onSelectStart(e) { e.target.userData.isSelecting = true; }
function onSelectEnd(e)   { e.target.userData.isSelecting = false; }

function handleController(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const hits = raycaster.intersectObjects(selectable, false);
  if (hits.length) {
    const hit = hits[0];
    if (controller.userData.isSelecting) {
      const mat = hit.object.material;
      mat.color.offsetHSL(0.005, 0, 0);
    }
  }
}

// ================== LEFT-WRIST SLIDER (WORLD-SPACE) ==================
const SLIDER_MIN = -1.4;
const SLIDER_MAX =  0.4;
const TRACK_LEN_M = 0.18;        // 18 cm
const PINCH_THRESHOLD = 0.018;   // ~1.8 cm

let sliderValue = 0.0;
let leftHandSource = null;
let rightHandSource = null;

const sliderRoot  = new THREE.Object3D();
const sliderTilt  = new THREE.Object3D();
const sliderPanel = new THREE.Object3D();

scene.add(sliderRoot);
sliderRoot.add(sliderTilt);
sliderTilt.add(sliderPanel);

const sliderBg = new THREE.Mesh(
  new THREE.PlaneGeometry(0.22, 0.10),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 })
);
sliderBg.position.set(0, 0, -0.001);
sliderPanel.add(sliderBg);

const sliderTrack = new THREE.Mesh(
  new THREE.PlaneGeometry(TRACK_LEN_M, 0.02),
  new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.85 })
);
const sliderKnob = new THREE.Mesh(
  new THREE.CircleGeometry(0.015, 32),
  new THREE.MeshBasicMaterial({ color: 0xffcc66 })
);
sliderKnob.position.z = 0.001;
sliderPanel.add(sliderTrack);
sliderPanel.add(sliderKnob);

sliderPanel.position.set(0.07, 0.02, -0.05);

sliderPanel.rotation.set(
  THREE.MathUtils.degToRad(0),
  THREE.MathUtils.degToRad(25),
  THREE.MathUtils.degToRad(25)
);

const PANEL_TILT_X = THREE.MathUtils.degToRad(20);
sliderTilt.rotation.set(PANEL_TILT_X, 0, 0);

const valueToX = (v) => THREE.MathUtils.mapLinear(
  v, SLIDER_MIN, SLIDER_MAX, -TRACK_LEN_M/2, TRACK_LEN_M/2
);
const xToValue = (x) => THREE.MathUtils.clamp(
  THREE.MathUtils.mapLinear(x, -TRACK_LEN_M/2, TRACK_LEN_M/2, SLIDER_MIN, SLIDER_MAX),
  SLIDER_MIN, SLIDER_MAX
);

sliderKnob.position.x = valueToX(sliderValue);

// --- DEBUG AXES on slider ---
const axes = new THREE.AxesHelper(0.25);
axes.position.set(0, 0, 0.03);
axes.renderOrder = 9999;
if (axes.material) {
  axes.material.depthTest = false;
  axes.material.depthWrite = false;
  axes.material.transparent = true;
  axes.material.opacity = 1.0;
}
sliderPanel.add(axes);

// VOLTAGE LABEL (canvas-based text)
const voltageCanvas = document.createElement('canvas');
voltageCanvas.width = 1024;
voltageCanvas.height = 256;
const voltageCtx = voltageCanvas.getContext('2d');

const voltageTexture = new THREE.CanvasTexture(voltageCanvas);
voltageTexture.colorSpace = THREE.SRGBColorSpace;
voltageTexture.minFilter = THREE.LinearFilter;
voltageTexture.magFilter = THREE.LinearFilter;

const voltageMat = new THREE.MeshBasicMaterial({
  map: voltageTexture,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide
});

const voltageLabel = new THREE.Mesh(
  new THREE.PlaneGeometry(0.30, 0.09),
  voltageMat
);
voltageLabel.position.set(0, 0.09, 0.006);
sliderPanel.add(voltageLabel);

function updateVoltageLabel(v) {
  const W = voltageCanvas.width, H = voltageCanvas.height;
  voltageCtx.clearRect(0, 0, W, H);

  voltageCtx.fillStyle = 'rgba(0,0,0,0.55)';
  voltageCtx.fillRect(0, 0, W, H);

  voltageCtx.fillStyle = '#ffffff';
  voltageCtx.font = 'bold 120px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  voltageCtx.textAlign = 'center';
  voltageCtx.textBaseline = 'middle';
  voltageCtx.fillText(`Voltage: ${v.toFixed(2)} V`, W/2, H/2);

  voltageTexture.needsUpdate = true;
}
updateVoltageLabel(sliderValue);

// XR ref space for hand + slider
let xrRefSpace_local = null;

function updateLeftHandSource(session) {
  leftHandSource = null;
  for (const src of session.inputSources) {
    if (src.handedness === 'left' && src.hand) { leftHandSource = src; break; }
  }
}

function updateRightHandSource(session) {
  rightHandSource = null;
  for (const src of session.inputSources) {
    if (src.handedness === 'right' && src.hand) { rightHandSource = src; break; }
  }
}

function findHand(session, handedness) {
  if (!session) return null;
  for (const src of session.inputSources) {
    if (src.hand && src.handedness === handedness) return src;
  }
  return null;
}

// ====== UNIFIED INPUT ADAPTER  =======================================
let currentPinchSource = null;

function bindSessionInputEvents(session) {
  currentPinchSource = null;

  session.addEventListener('selectstart', (e) => {
    currentPinchSource = e.inputSource || null;
  });

  session.addEventListener('selectend', (e) => {
    if (currentPinchSource === e.inputSource) {
      currentPinchSource = null;
    }
  });
}

function getLogicalInputs(session) {
  const logical = {
    left: null,
    right: null,
    pinch: null,
    hands: { left: null, right: null },
    controllers: []
  };

  if (!session) return logical;

  for (const src of session.inputSources) {
    const handed = src.handedness || 'none';

    if (src.hand) {
      if (handed === 'left')  logical.hands.left  = src;
      if (handed === 'right') logical.hands.right = src;
    } else {
      logical.controllers.push(src);
      if (handed === 'left' && !logical.left)  logical.left  = src;
      if (handed === 'right' && !logical.right) logical.right = src;
    }
  }

  if (logical.hands.left)  logical.left  = logical.hands.left;
  if (logical.hands.right) logical.right = logical.hands.right;

  if (currentPinchSource) {
    logical.pinch = currentPinchSource;
  }

  return logical;
}

function getTargetRayPose(inputSource, frame, refSpace) {
  if (!inputSource || !frame || !refSpace) return null;
  const space = inputSource.targetRaySpace || inputSource.gripSpace;
  if (!space) return null;
  return frame.getPose(space, refSpace);
}

function getHandJointSpace(xrHand, jointName) {
  if (!xrHand) return null;
  if (xrHand.get) {
    return xrHand.get(jointName) || null;
  }
  if (typeof XRHand !== 'undefined' && XRHand[jointName.toUpperCase()]) {
    return xrHand[XRHand[jointName.toUpperCase()]] || null;
  }
  return null;
}

const _vTemp1 = new THREE.Vector3();
const _vTemp2 = new THREE.Vector3();
const _vTemp3 = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// 🔹 Patch 3: use batched jointMatrices + jointPositions map
function updateHandDebug(frame, refSpace) {
  const session = renderer.xr.getSession ? renderer.xr.getSession() : null;
  if (!session || !frame || !refSpace) return;

  ['left', 'right'].forEach((handedness) => {
    const src = findHand(session, handedness);
    const jointMap = handJointMeshes[handedness];
    const palmMesh = handPalmMeshes[handedness];

    // Reset joint positions map for this hand each frame
    jointPositions[handedness] = {};

    if (!src || !src.hand) {
      jointMap.forEach(m => m.visible = false);
      if (palmMesh) palmMesh.visible = false;
      return;
    }

    const hand = src.hand;

    // Batch joint radii + transforms (VisionOS/Quest friendly)
    if (!frame.fillJointRadii(hand.values(), jointRadii)) {
      jointMap.forEach(m => m.visible = false);
      if (palmMesh) palmMesh.visible = false;
      return;
    }
    if (!frame.fillPoses(hand.values(), refSpace, jointMatrices)) {
      jointMap.forEach(m => m.visible = false);
      if (palmMesh) palmMesh.visible = false;
      return;
    }

    // We still use wrist pose separately for palm orientation
    const wristSpace = getHandJointSpace(hand, 'wrist');
    const wristPose  = wristSpace ? frame.getJointPose(wristSpace, refSpace) : null;
    if (!wristPose) {
      jointMap.forEach(m => m.visible = false);
      if (palmMesh) palmMesh.visible = false;
      return;
    }

    const wristPos = _vTemp1.set(
      wristPose.transform.position.x,
      wristPose.transform.position.y,
      wristPose.transform.position.z
    );

    // 1) Update each joint cube from batched matrices
    let jIndex = 0;
    for (const [jointName, mesh] of jointMap.entries()) {
      const m = new THREE.Matrix4().fromArray(
        jointMatrices.slice(jIndex * 16, (jIndex + 1) * 16)
      );

      const pos  = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl  = new THREE.Vector3();
      m.decompose(pos, quat, scl);

      mesh.visible = true;
      mesh.position.copy(pos);
      mesh.quaternion.copy(quat);

      const radius = jointRadii[jIndex] || 0.008;
      mesh.scale.setScalar(radius * 2.0);

      // 🔹 store world-space position for curl detection
      jointPositions[handedness][jointName] = pos.clone();

      jIndex++;
    }

    // 2) Finger curl detection using jointPositions
    const baseHex   = handedness === 'left' ? 0xff00ff : 0x00ffff;
    const curledHex = 0xff5555;

    for (const fingerName in FINGERS) {
      const def = FINGERS[fingerName];
      const basePos = jointPositions[handedness][def.base];
      const tipPos  = jointPositions[handedness][def.tip];

      if (!basePos || !tipPos) continue;

      const extension = basePos.distanceTo(tipPos);

// Use a per-finger threshold if available, otherwise the default
const threshold = FINGER_THRESHOLDS[fingerName] ?? FINGER_CURL_THRESHOLD;
const isCurled = extension < threshold;

      handState[handedness].curls[fingerName] = isCurled;
      // After computing `extension` inside the curl loop:
if (fingerName === 'thumb' && handedness === 'right') {
  // Just as a quick peek, for example:
  handState[handedness].thumbExtension = extension;
}

      const tipMesh = jointMap.get(def.tip);
      if (tipMesh) {
        tipMesh.material.color.setHex(isCurled ? curledHex : baseHex);
      }
    }

    // 3) Palm orientation + color
    if (palmMesh) {
      const indexMetaSpace  = getHandJointSpace(hand, 'index-finger-metacarpal');
      const pinkyMetaSpace  = getHandJointSpace(hand, 'pinky-finger-metacarpal');
      const middleMetaSpace = getHandJointSpace(hand, 'middle-finger-metacarpal');

      const indexPose  = indexMetaSpace  ? frame.getJointPose(indexMetaSpace,  refSpace) : null;
      const pinkyPose  = pinkyMetaSpace  ? frame.getJointPose(pinkyMetaSpace,  refSpace) : null;
      const middlePose = middleMetaSpace ? frame.getJointPose(middleMetaSpace, refSpace) : null;

      if (indexPose && pinkyPose && middlePose) {
        const idxPos = new THREE.Vector3(
          indexPose.transform.position.x,
          indexPose.transform.position.y,
          indexPose.transform.position.z
        );
        const pnkPos = new THREE.Vector3(
          pinkyPose.transform.position.x,
          pinkyPose.transform.position.y,
          pinkyPose.transform.position.z
        );
        const midPos = new THREE.Vector3(
          middlePose.transform.position.x,
          middlePose.transform.position.y,
          middlePose.transform.position.z
        );

        const vSide    = pnkPos.clone().sub(idxPos);
        const vForward = midPos.clone().sub(wristPos);

        const palmNormal = vSide.clone().cross(vForward).normalize();

        if (handedness === 'right') {
          palmNormal.multiplyScalar(-1);
        }

        palmMesh.visible = true;
        palmMesh.position.copy(wristPos);

        const localZ = new THREE.Vector3(0, 0, 1);
        const q = new THREE.Quaternion().setFromUnitVectors(localZ, palmNormal);
        palmMesh.quaternion.copy(q);

        const dotUp = palmNormal.dot(WORLD_UP);
        let palmColor;

        if (dotUp > 0.5) {
          palmColor = 0x55ff55;
          handState[handedness].palm = "UP";
        } else if (dotUp < -0.5) {
          palmColor = 0xff5555;
          handState[handedness].palm = "DOWN";
        } else {
          palmColor = handedness === 'left' ? 0x5555ff : 0x55ffff;
          handState[handedness].palm = "SIDE";
        }
        palmMesh.material.color.setHex(palmColor);
      } else {
        palmMesh.visible = false;
      }
    }
  });
}

renderer.xr.addEventListener('sessionstart', async () => {
  const session = renderer.xr.getSession();
  try { xrRefSpace_local = await session.requestReferenceSpace('local-floor'); } catch {}
  updateLeftHandSource(session);
  updateRightHandSource(session);
  session.addEventListener('inputsourceschange', () => {
    updateLeftHandSource(session);
    updateRightHandSource(session);
  });
});

// Pose sliderRoot at left wrist (or left controller grip if no hands)
const _tmpObj = new THREE.Object3D();
function updateSliderPose(frame) {
  const session = renderer.xr.getSession?.();
  if (!session) return;

  if (leftHandSource && leftHandSource.hand && xrRefSpace_local) {
    const ht = leftHandSource.hand;
    const wristJoint = ht.get?.('wrist') || (typeof XRHand!=='undefined' && ht[XRHand.WRIST]);
    if (wristJoint) {
      const pose = frame.getJointPose(wristJoint, xrRefSpace_local);
      if (pose) {
        const { position, orientation } = pose.transform;
        sliderRoot.position.set(position.x, position.y, position.z);
        sliderRoot.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
        sliderRoot.visible = true;
        return;
      }
    }
  }

  const grip = renderer.xr.getControllerGrip?.(0);
  if (grip) {
    _tmpObj.matrix.copy(grip.matrixWorld);
    _tmpObj.matrix.decompose(sliderRoot.position, sliderRoot.quaternion, sliderRoot.scale);
    sliderRoot.visible = true;
    return;
  }

  sliderRoot.visible = false;
}

function updateSliderInteraction(frame) {
  if (!xrRefSpace_local) return;

  const session = renderer.xr.getSession?.();
  if (!session) return;

  const rhs = findHand(session, 'right') || rightHandSource;
  if (!rhs || !rhs.hand) return;

  const ht = rhs.hand;
  const tipIndex = ht.get?.('index-finger-tip') || (typeof XRHand!=='undefined' && XRHand.INDEX_PHALANX_TIP);
  const tipThumb = ht.get?.('thumb-tip')        || (typeof XRHand!=='undefined' && XRHand.THUMB_PHALANX_TIP);
  if (!tipIndex || !tipThumb) return;

  const pI = frame.getJointPose(tipIndex, xrRefSpace_local);
  const pT = frame.getJointPose(tipThumb, xrRefSpace_local);
  if (!pI || !pT) return;

  const dx = pI.transform.position.x - pT.transform.position.x;
  const dy = pI.transform.position.y - pT.transform.position.y;
  const dz = pI.transform.position.z - pT.transform.position.z;
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const pinching = dist < PINCH_THRESHOLD;
  if (!pinching) return;

  const idxWorld = new THREE.Vector3(
    pI.transform.position.x,
    pI.transform.position.y,
    pI.transform.position.z
  );
  const local = sliderPanel.worldToLocal(idxWorld.clone());

  const clampedX = THREE.MathUtils.clamp(local.x, -TRACK_LEN_M/2, TRACK_LEN_M/2);
  sliderValue = xToValue(clampedX);

  sliderKnob.position.x = THREE.MathUtils.lerp(sliderKnob.position.x, clampedX, 0.35);

  updateVoltageLabel(sliderValue);
}

function getSliderValue() { return sliderValue; }

// ====== CONFIG ======
const HUD_CFG = {
  WIDTH_PX: 1024,
  HEIGHT_PX: 512,
  PADDING: 18,
  FONT_BODY: '26px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  FONT_HDR: 'bold 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  LINE_H: 32,
  PLANE_W_M: 0.8,
  MIN_PLANE_H_M: 0.30,
  BG: 'rgba(0,0,0,0.55)',
  FG: '#ffffff'
};

const activeFlags = { selectL:false, selectR:false, squeezeL:false, squeezeR:false };
function labelFrom(src) { return (src.handedness || 'none')[0].toUpperCase(); }

let refSpace = null;

const PINCH_THRESHOLD_METERS = 0.018;
const ff = (x, d=2) => (x!==undefined && x!==null) ? x.toFixed(d) : '—';

function formatInputs(session, frame, refSpace) {
  const lines = [];
  for (const src of session.inputSources) {
    const hand = (src.handedness || 'none')[0].toUpperCase();
    const type = src.hand ? 'hand' : (src.gamepad ? 'ctrl' : (src.targetRayMode || 'dev'));

    let label = `[${hand}] ${type}`;

    if (src.gamepad) {
      const pressed = src.gamepad.buttons
        .map((b,i)=> b.pressed ? `B${i}` : null)
        .filter(Boolean);
      const btnLbl = pressed.length
        ? (pressed.length > 4
            ? pressed.slice(0,4).join(',') + ` +${pressed.length-4}`
            : pressed.join(','))
        : '—';
      const axes   = src.gamepad.axes.map(a=>ff(a,2));
      const axesLbl = axes.length
        ? (axes.length > 2 ? `${axes[0]},${axes[1]}…` : axes.join(','))
        : '—';
      label += ` | btn:${btnLbl} | ax:${axesLbl}`;
    }

    if (src.hand && frame && refSpace) {
      const ht = src.hand;
      const tipIndex = ht.get?.('index-finger-tip') || (typeof XRHand!=='undefined' && XRHand.INDEX_PHALANX_TIP);
      const tipThumb = ht.get?.('thumb-tip')        || (typeof XRHand!=='undefined' && XRHand.THUMB_PHALANX_TIP);
      const pI = tipIndex ? frame.getJointPose(tipIndex, refSpace) : null;
      const pT = tipThumb ? frame.getJointPose(tipThumb, refSpace) : null;
      if (pI && pT) {
        const dx = pI.transform.position.x - pT.transform.position.x;
        const dy = pI.transform.position.y - pT.transform.position.y;
        const dz = pI.transform.position.z - pT.transform.position.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const pinching = dist < PINCH_THRESHOLD_METERS;
        label += ` | pinch:${ff(dist,3)}m${pinching ? ' ✓' : ''}`;
      } else {
        label += ` | pinch: n/a`;
      }
    }

    if (src.hand) {
      const hs = handState[src.handedness];
      if (hs) {
        const curlStrings = Object.entries(hs.curls)
          .map(([name, curled]) => `${name[0]}:${curled?'1':'0'}`)
          .join(' ');
        label += ` | curls: ${curlStrings}`;
        if (hs && hs.thumbExtension !== undefined) {
  label += ` | tLen:${ff(hs.thumbExtension, 3)}m`;
}
        label += ` | palm:${hs.palm}`;
      }
    }

    if (src.targetRayMode) label += ` | ray:${src.targetRayMode}`;

    lines.push(label);
  }
  return lines;
}

// ====== World-space HUD (canvas -> plane) ======
let hudCanvas, hudCtx, hudTexture, hudMesh;

function ensureWorldHud() {
  if (hudMesh) return;

  hudCanvas = document.createElement('canvas');
  hudCanvas.width  = HUD_CFG.WIDTH_PX;
  hudCanvas.height = HUD_CFG.HEIGHT_PX;
  hudCtx = hudCanvas.getContext('2d');

  hudTexture = new THREE.CanvasTexture(hudCanvas);
  hudTexture.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({
    map: hudTexture, transparent: true, depthTest: false, depthWrite: false
  });

  const aspect = HUD_CFG.HEIGHT_PX / HUD_CFG.WIDTH_PX;
  const planeH = Math.max(HUD_CFG.PLANE_W_M * aspect, HUD_CFG.MIN_PLANE_H_M);
  const geo = new THREE.PlaneGeometry(HUD_CFG.PLANE_W_M, planeH);

  hudMesh = new THREE.Mesh(geo, mat);
  hudMesh.renderOrder = 9999;
  hudMesh.position.set(0, -0.06, -0.85);
  camera.add(hudMesh);
  scene.add(camera);
}

function wrapLines(str, maxWidth) {
  const words = String(str).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    const wPx = hudCtx.measureText(test).width;
    if (wPx > maxWidth && line) { lines.push(line); line = w; }
    else { line = test; }
  }
  if (line) lines.push(line);
  return lines;
}

function drawHud(header, bodyLines) {
  if (!hudCanvas || !hudCtx || !hudMesh) {
    ensureWorldHud();
    if (!hudCanvas || !hudCtx || !hudMesh) return;
  }

  const P = HUD_CFG.PADDING;
  const W = hudCanvas.width, H = hudCanvas.height;
  const usableW = W - P * 2;

  hudCtx.clearRect(0, 0, W, H);
  hudCtx.fillStyle = HUD_CFG.BG;
  hudCtx.fillRect(0, 0, W, H);

  hudCtx.fillStyle = HUD_CFG.FG;
  hudCtx.font = HUD_CFG.FONT_HDR;
  hudCtx.textBaseline = 'top';
  let y = P;
  hudCtx.fillText(header, P, y);
  y += 36;

  hudCtx.fillRect(P, y, usableW, 2);
  y += 10;

  hudCtx.font = HUD_CFG.FONT_BODY;

  const maxLines = Math.floor((H - y - P) / HUD_CFG.LINE_H);
  let used = 0, hiddenCount = 0;

  for (const raw of bodyLines) {
    const wrapped = wrapLines(raw, usableW);
    for (const l of wrapped) {
      if (used < maxLines) {
        hudCtx.fillText(l, P, y);
        y += HUD_CFG.LINE_H;
        used++;
      } else {
        hiddenCount++;
      }
    }
  }

  if (hiddenCount > 0) {
    const ellip = `… +${hiddenCount} more`;
    hudCtx.fillText(ellip, P, H - P - HUD_CFG.LINE_H);
  }

  const usedHeightPx = Math.max(
    y + P,
    HUD_CFG.HEIGHT_PX * (HUD_CFG.MIN_PLANE_H_M / (HUD_CFG.PLANE_W_M * (HUD_CFG.HEIGHT_PX / HUD_CFG.WIDTH_PX)))
  );
  const scaleY = usedHeightPx / HUD_CFG.HEIGHT_PX;
  hudMesh.scale.y = scaleY;

  hudTexture.needsUpdate = true;
}

// Bind XR events (request ref space + action flags)
renderer.xr.addEventListener('sessionstart', async () => {
  const session = renderer.xr.getSession();
  refSpace = await session.requestReferenceSpace('local-floor');
  ensureWorldHud();
  bindSessionInputEvents(session);

  session.addEventListener('selectstart',
    (e)=> activeFlags['select'+labelFrom(e.inputSource)] = true);
  session.addEventListener('selectend',
    (e)=> activeFlags['select'+labelFrom(e.inputSource)] = false);
  session.addEventListener('squeezestart',
    (e)=> activeFlags['squeeze'+labelFrom(e.inputSource)] = true);
  session.addEventListener('squeezeend',
    (e)=> activeFlags['squeeze'+labelFrom(e.inputSource)] = false);

  drawHud('XR Input: session started…', []);
});

renderer.xr.addEventListener('sessionend', () => {
  refSpace = null;
  ensureWorldHud();
  drawHud('XR Input: session ended', []);
});

// --- Animate ---
renderer.setAnimationLoop((t, frame) => {
  const dt = t * 0.001;
  box.rotation.y = dt * 0.7;

  handleController(controller1);
  handleController(controller2);

  updateSliderPose(frame);
  sliderTilt.rotation.x = PANEL_TILT_X;
  updateSliderInteraction(frame);
  updateVoltageLabel(sliderValue);

  const xrSession = renderer.xr.getSession ? renderer.xr.getSession() : null;
  const logical = xrSession ? getLogicalInputs(xrSession) : null;

  if (frame && xrRefSpace_local) {
    updateHandDebug(frame, xrRefSpace_local);
  }

  if (logical && logical.pinch && frame && refSpace) {
    const pose = getTargetRayPose(logical.pinch, frame, refSpace);
    if (pose) {
      // use pose if needed
    }
  }

  if (logical && logical.right && frame && refSpace) {
    const rightRayPose = getTargetRayPose(logical.right, frame, refSpace);
    if (rightRayPose) {
      // use right-hand ray if needed
    }
  }

  const header =
    `XR Inputs  ` +
    `SEL[L:${+!!activeFlags.selectL} R:${+!!activeFlags.selectR}]  ` +
    `SQZ[L:${+!!activeFlags.squeezeL} R:${+!!activeFlags.squeezeR}]`;

  const bodyLines = (xrSession && refSpace)
    ? formatInputs(xrSession, frame, refSpace)
    : ['XR session not active.'];

  drawHud(header, bodyLines);

  orbit.update();
  renderer.render(scene, camera);
});
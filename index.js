// NEW JS WITH PANEL TITL X

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


// --- Hand Debug Setup (joint cubes + palm cube) ---

// WebXR hand joint names (25 joints)
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
const FINGER_CURL_THRESHOLD = 0.045;

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

// Create joint debug meshes + palm base meshes
function initHandDebugMeshes() {
  const jointGeom = new THREE.BoxGeometry(0.008, 0.008, 0.008);
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
      mesh.visible = false; // will show when we get tracking
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

// Call this once after scene is created:
initHandDebugMeshes();


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

// ================== LEFT-WRIST SLIDER (WORLD-SPACE) ==================
const SLIDER_MIN = -1.4;
const SLIDER_MAX =  0.4;
const TRACK_LEN_M = 0.18;        // 18 cm
const PINCH_THRESHOLD = 0.018;   // ~1.8 cm

let sliderValue = 0.0;
let leftHandSource = null;
let rightHandSource = null;

// Scene objects
// Scene objects
const sliderRoot  = new THREE.Object3D(); // follows wrist or controller (pose applied here)
const sliderTilt  = new THREE.Object3D(); // holds ONLY the tilt angle
const sliderPanel = new THREE.Object3D(); // actual UI (track, knob, label)

scene.add(sliderRoot);
sliderRoot.add(sliderTilt);
sliderTilt.add(sliderPanel);

// Backing panel (simple plane so we don't rely on non-core geometries)
const sliderBg = new THREE.Mesh(
  new THREE.PlaneGeometry(0.22, 0.10),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 })
);
sliderBg.position.set(0, 0, -0.001);
sliderPanel.add(sliderBg);

// Track + knob
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

// Local placement relative to wrist (tweak to taste)
sliderPanel.position.set(0.07, 0.02, -0.05); // a bit higher/closer than before

// Stronger tilt upward (X-axis) and rotate toward user's right (Y-axis)
sliderPanel.rotation.set(
  THREE.MathUtils.degToRad(0),  // X rotation → tilt UP more (negative = face user)
  THREE.MathUtils.degToRad(25),  // Y rotation → rotate toward user's right
  THREE.MathUtils.degToRad(25)                               // Z rotation → leave flat
);

// Tilt UP by ~20 degrees around local X on the middle node (in radians)
const PANEL_TILT_X = THREE.MathUtils.degToRad(20);
sliderTilt.rotation.set(PANEL_TILT_X, 0, 0);

// Helpers to map value <-> X along the track
const valueToX = (v) => THREE.MathUtils.mapLinear(v, SLIDER_MIN, SLIDER_MAX, -TRACK_LEN_M/2, TRACK_LEN_M/2);
const xToValue = (x) => THREE.MathUtils.clamp(
  THREE.MathUtils.mapLinear(x, -TRACK_LEN_M/2, TRACK_LEN_M/2, SLIDER_MIN, SLIDER_MAX),
  SLIDER_MIN, SLIDER_MAX
);

// Initial knob position
sliderKnob.position.x = valueToX(sliderValue);


// --- DEBUG AXES: make it big, in-front, and ignore depth so it's visible in XR ---
const axes = new THREE.AxesHelper(0.25);   // 25 cm — actually visible in-headset
axes.position.set(0, 0, 0.03);             // nudge forward so it’s not coplanar
axes.renderOrder = 9999;

// AxesHelper is a LineSegments; tweak its material so it draws on top
if (axes.material) {
  axes.material.depthTest = false;
  axes.material.depthWrite = false;
  axes.material.transparent = true;
  axes.material.opacity = 1.0;
}

// Attach near the UI so you can see it with the slider
sliderPanel.add(axes);
// (You can also try sliderTilt.add(axes) — but sliderPanel keeps it right by the UI.)



// VOLTAGE LABEL (canvas-based text)
// Voltage label (canvas-based text)
const voltageCanvas = document.createElement('canvas');
voltageCanvas.width = 1024;              // higher res for crisp text
voltageCanvas.height = 256;
const voltageCtx = voltageCanvas.getContext('2d');

const voltageTexture = new THREE.CanvasTexture(voltageCanvas);
voltageTexture.colorSpace = THREE.SRGBColorSpace;
voltageTexture.minFilter = THREE.LinearFilter;
voltageTexture.magFilter = THREE.LinearFilter;

const voltageMat = new THREE.MeshBasicMaterial({
  map: voltageTexture,
  transparent: true,
  depthTest: false,          // <-- ensure it draws on top of the panel
  depthWrite: false,
  side: THREE.DoubleSide     // <-- in case the panel is flipped
});

// a bit wider/taller and slightly closer to the camera
const voltageLabel = new THREE.Mesh(
  new THREE.PlaneGeometry(0.30, 0.09),
  voltageMat
);
voltageLabel.position.set(0, 0.09, 0.006);  // above and out from the panel
sliderPanel.add(voltageLabel);

// helper to draw text into the label
function updateVoltageLabel(v) {
  const W = voltageCanvas.width, H = voltageCanvas.height;
  voltageCtx.clearRect(0, 0, W, H);

  // background pill
  voltageCtx.fillStyle = 'rgba(0,0,0,0.55)';
  voltageCtx.fillRect(0, 0, W, H);

  // text
  voltageCtx.fillStyle = '#ffffff';
  voltageCtx.font = 'bold 120px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  voltageCtx.textAlign = 'center';
  voltageCtx.textBaseline = 'middle';
  voltageCtx.fillText(`Voltage: ${v.toFixed(2)} V`, W/2, H/2);

  voltageTexture.needsUpdate = true;
}

// initial draw
updateVoltageLabel(sliderValue);




// XR ref space from your HUD block or create our own handle
let xrRefSpace_local = null;

// Discover left hand source when session starts / inputs change
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

// Find a specific hand every frame (robust on AVP/Quest)
function findHand(session, handedness) {
  if (!session) return null;
  for (const src of session.inputSources) {
    if (src.hand && src.handedness === handedness) return src;
  }
  return null;
}

// ====== UNIFIED INPUT ADAPTER  =======================================

// Track which inputSource is currently "pinching / selecting"
let currentPinchSource = null;

// Called on sessionstart to attach listeners
function bindSessionInputEvents(session) {
  // Reset on new session
  currentPinchSource = null;

  session.addEventListener('selectstart', (e) => {
    currentPinchSource = e.inputSource || null;
  });

  session.addEventListener('selectend', (e) => {
    if (currentPinchSource === e.inputSource) {
      currentPinchSource = null;
    }
  });

  // You already have these in your HUD wiring, you can keep them there as well.
}

// Small helper to classify all inputSources each frame / on demand
function getLogicalInputs(session) {
  const logical = {
    left: null,     // XRInputSource (hand or ctrl)
    right: null,    // XRInputSource (hand or ctrl)
    pinch: null,    // XRInputSource currently doing select (ctrl or transient-pointer)
    hands: {
      left: null,
      right: null
    },
    controllers: [] // any non-hand XRInputSource
  };

  if (!session) return logical;

  for (const src of session.inputSources) {
    const handed = src.handedness || 'none';

    // Hands (with joints)
    if (src.hand) {
      if (handed === 'left')  logical.hands.left  = src;
      if (handed === 'right') logical.hands.right = src;
    } else {
      // Controllers / transient pointers
      logical.controllers.push(src);

      if (handed === 'left' && !logical.left)  logical.left  = src;
      if (handed === 'right' && !logical.right) logical.right = src;
    }
  }

  // Prefer hands as logical left/right if available
  if (logical.hands.left)  logical.left  = logical.hands.left;
  if (logical.hands.right) logical.right = logical.hands.right;

  // Pinch source:
  //  - On Quest: select comes from left/right (hand or ctrl)
  //  - On AVP: select comes from transient-pointer (targetRayMode: "transient-pointer")
  if (currentPinchSource) {
    logical.pinch = currentPinchSource;
  }

  return logical;
}

// Helper to get a ray pose from an XRInputSource (controller or transient)
function getTargetRayPose(inputSource, frame, refSpace) {
  if (!inputSource || !frame || !refSpace) return null;
  const space = inputSource.targetRaySpace || inputSource.targetRaySpace === 0
    ? inputSource.targetRaySpace
    : (inputSource.targetRaySpace ?? inputSource.gripSpace);
  if (!space) return null;
  return frame.getPose(space, refSpace);
}

// Helper to get a "hand space" pose (e.g. right wrist) for body-relative UI
function getHandJointPose(handSource, jointName, frame, refSpace) {
  if (!handSource || !handSource.hand || !frame || !refSpace) return null;
  const ht = handSource.hand;

  const joint =
    ht.get?.(jointName) ||
    (typeof XRHand !== 'undefined' && ht[XRHand[jointName.toUpperCase()]]);
  if (!joint) return null;

  return frame.getJointPose(joint, refSpace);
}

function getHandJointSpace(xrHand, jointName) {
  if (!xrHand) return null;

  // Newer browsers: Map-like .get()
  if (xrHand.get) {
    return xrHand.get(jointName) || null;
  }

  // Fallback to XRHand constants (older style)
  if (typeof XRHand !== 'undefined' && XRHand[jointName.toUpperCase()]) {
    return xrHand[XRHand[jointName.toUpperCase()]] || null;
  }

  return null;
}

const _vTemp1 = new THREE.Vector3();
const _vTemp2 = new THREE.Vector3();
const _vTemp3 = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function updateHandDebug(frame) {
  const session = renderer.xr.getSession ? renderer.xr.getSession() : null;
  if (!session || !frame || !xrRefSpace) return;

  ['left', 'right'].forEach((handedness) => {
    const src = findHand(session, handedness);
    const jointMap = handJointMeshes[handedness];
    const palmMesh = handPalmMeshes[handedness];

    if (!src || !src.hand) {
      // No hand: hide all meshes
      jointMap.forEach(m => m.visible = false);
      if (palmMesh) palmMesh.visible = false;
      return;
    }

    const hand = src.hand;

    // --- first: get wrist pose (for palm & curl ref) ---
    const wristSpace = getHandJointSpace(hand, 'wrist');
    const wristPose  = wristSpace ? frame.getJointPose(wristSpace, xrRefSpace) : null;
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

    // --- 1) Update each joint cube position, rotation, approximate scale ---
    HAND_JOINT_NAMES.forEach((jointName) => {
      const mesh = jointMap.get(jointName);
      if (!mesh) return;

      const jointSpace = getHandJointSpace(hand, jointName);
      if (!jointSpace) {
        mesh.visible = false;
        return;
      }

      const jp = frame.getJointPose(jointSpace, xrRefSpace);
      if (!jp) {
        mesh.visible = false;
        return;
      }

      mesh.visible = true;
      const t = jp.transform;
      mesh.position.set(t.position.x, t.position.y, t.position.z);
      mesh.quaternion.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);

      // Optionally use radius if provided
      const r = jp.radius !== undefined ? jp.radius : 0.008;
      mesh.scale.setScalar(r * 2.0);
    });

    // --- 2) Finger curl detection: recolor tip cubes when curled ---
    // Base color per hand
    const baseHex   = handedness === 'left' ? 0xff00ff : 0x00ffff;
    const curledHex = 0xff5555; // red-ish when curled

    for (const fingerName in FINGERS) {
      const def = FINGERS[fingerName];
      const baseSpace = getHandJointSpace(hand, def.base);
      const tipSpace  = getHandJointSpace(hand, def.tip);
      if (!baseSpace || !tipSpace) continue;

      const basePose = frame.getJointPose(baseSpace, xrRefSpace);
      const tipPose  = frame.getJointPose(tipSpace, xrRefSpace);
      if (!basePose || !tipPose) continue;

      const basePos = _vTemp2.set(
        basePose.transform.position.x,
        basePose.transform.position.y,
        basePose.transform.position.z
      );
      const tipPos = _vTemp3.set(
        tipPose.transform.position.x,
        tipPose.transform.position.y,
        tipPose.transform.position.z
      );

      const extension = basePos.distanceTo(tipPos);
      const isCurled = extension < FINGER_CURL_THRESHOLD;

      // Color the *tip* cube
      const tipMesh = jointMap.get(def.tip);
      if (tipMesh) {
        tipMesh.material.color.setHex(isCurled ? curledHex : baseHex);
      }
    }

    // --- 3) Palm orientation: move & recolor palm base cube ---
    if (palmMesh) {
      // Use index & pinky metacarpals + middle metacarpal to approximate palm plane
      const indexMetaSpace  = getHandJointSpace(hand, 'index-finger-metacarpal');
      const pinkyMetaSpace  = getHandJointSpace(hand, 'pinky-finger-metacarpal');
      const middleMetaSpace = getHandJointSpace(hand, 'middle-finger-metacarpal');

      const indexPose  = indexMetaSpace  ? frame.getJointPose(indexMetaSpace,  xrRefSpace) : null;
      const pinkyPose  = pinkyMetaSpace  ? frame.getJointPose(pinkyMetaSpace,  xrRefSpace) : null;
      const middlePose = middleMetaSpace ? frame.getJointPose(middleMetaSpace, xrRefSpace) : null;

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

        // Side vector across palm (index→pinky) and forward (wrist→middle)
        const vSide    = pnkPos.clone().sub(idxPos);
        const vForward = midPos.clone().sub(wristPos);

        // Normal = side × forward  (you can flip if it feels inverted)
        const palmNormal = vSide.clone().cross(vForward).normalize();

        // Place palm cube at wrist
        palmMesh.visible = true;
        palmMesh.position.copy(wristPos);

        // Align cube's local +Z axis with palm normal
        const localZ = new THREE.Vector3(0, 0, 1);
        const q = new THREE.Quaternion().setFromUnitVectors(localZ, palmNormal);
        palmMesh.quaternion.copy(q);

        // Simple facing classification (up/down/side) for color
        const dotUp = palmNormal.dot(WORLD_UP);
        let palmColor;

        if (dotUp > 0.5) {
          // Palm facing up
          palmColor = 0x55ff55; // green
        } else if (dotUp < -0.5) {
          // Palm facing down
          palmColor = 0xff5555; // red
        } else {
          // Sideways-ish
          palmColor = handedness === 'left' ? 0x5555ff : 0x55ffff;
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
  updateLeftHandSource(session);   // left = mount pose
  updateRightHandSource(session);  // right = interaction hand
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

  // 1) Prefer hand wrist
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

  // 2) Fallback: left controller grip (Quest)
  const grip = renderer.xr.getControllerGrip?.(0); // index 0 is usually left
  if (grip) {
    _tmpObj.matrix.copy(grip.matrixWorld);
    _tmpObj.matrix.decompose(sliderRoot.position, sliderRoot.quaternion, sliderRoot.scale);
    sliderRoot.visible = true;
    return;
  }

  // If nothing detected, hide
  sliderRoot.visible = false;
}

// Pinch-drag interaction (hands only)
function updateSliderInteraction(frame) {
  if (!xrRefSpace_local) return;

  const session = renderer.xr.getSession?.();
  if (!session) return;

  // Always try to use the current RIGHT hand from session each frame.
  // Fallback to cached rightHandSource if needed.
  const rhs = findHand(session, 'right') || rightHandSource;
  if (!rhs || !rhs.hand) return;

  const ht = rhs.hand;
  const tipIndex = ht.get?.('index-finger-tip') || (typeof XRHand!=='undefined' && ht[XRHand.INDEX_PHALANX_TIP]);
  const tipThumb = ht.get?.('thumb-tip')        || (typeof XRHand!=='undefined' && ht[XRHand.THUMB_PHALANX_TIP]);
  if (!tipIndex || !tipThumb) return;

  const pI = frame.getJointPose(tipIndex, xrRefSpace_local);
  const pT = frame.getJointPose(tipThumb, xrRefSpace_local);
  if (!pI || !pT) return;

  // detect pinch on RIGHT hand only
  const dx = pI.transform.position.x - pT.transform.position.x;
  const dy = pI.transform.position.y - pT.transform.position.y;
  const dz = pI.transform.position.z - pT.transform.position.z;
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const pinching = dist < PINCH_THRESHOLD;
  if (!pinching) return;

  // project RIGHT index tip into the LEFT wrist slider's local space
  const idxWorld = new THREE.Vector3(
    pI.transform.position.x,
    pI.transform.position.y,
    pI.transform.position.z
  );
  const local = sliderPanel.worldToLocal(idxWorld.clone());

  // clamp to track and set new value
  const clampedX = THREE.MathUtils.clamp(local.x, -TRACK_LEN_M/2, TRACK_LEN_M/2);
  sliderValue = xToValue(clampedX);

  // move knob (smoothed)
  sliderKnob.position.x = THREE.MathUtils.lerp(sliderKnob.position.x, clampedX, 0.35);

  updateVoltageLabel(sliderValue);


}



// Accessor you can use elsewhere
function getSliderValue() { return sliderValue; }





// ====== CONFIG ======
const HUD_CFG = {
  WIDTH_PX: 1024,
  HEIGHT_PX: 512,
  PADDING: 18,
  FONT_BODY: '26px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  FONT_HDR: 'bold 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  LINE_H: 32,
  PLANE_W_M: 0.8,       // ~80 cm wide
  MIN_PLANE_H_M: 0.30,  // min height so it never collapses
  BG: 'rgba(0,0,0,0.55)',
  FG: '#ffffff'
};

// ====== Input state & helpers ======
const activeFlags = { selectL:false, selectR:false, squeezeL:false, squeezeR:false };
function labelFrom(src) { return (src.handedness || 'none')[0].toUpperCase(); } // L/R/N

let xrRefSpace = null;

const PINCH_THRESHOLD_METERS = 0.018;
const ff = (x, d=2) => (x!==undefined && x!==null) ? x.toFixed(d) : '—';

// Produce **clean** lines for the HUD
function formatInputs(session, frame, refSpace) {
  const lines = [];
  for (const src of session.inputSources) {
    const hand = (src.handedness || 'none')[0].toUpperCase(); // L/R/N
    const type = src.hand ? 'hand' : (src.gamepad ? 'ctrl' : (src.targetRayMode || 'dev'));

    // Base label
    let label = `[${hand}] ${type}`;

    // Buttons / axes (controllers)
    if (src.gamepad) {
      const pressed = src.gamepad.buttons.map((b,i)=> b.pressed ? `B${i}` : null).filter(Boolean);
      // Keep it short: show up to 4 buttons; then +
      const btnLbl = pressed.length ? (pressed.length > 4 ? pressed.slice(0,4).join(',') + ` +${pressed.length-4}` : pressed.join(',')) : '—';
      const axes   = src.gamepad.axes.map(a=>ff(a,2));
      const axesLbl = axes.length ? (axes.length > 2 ? `${axes[0]},${axes[1]}…` : axes.join(',')) : '—';
      label += ` | btn:${btnLbl} | ax:${axesLbl}`;
    }

    // Hand pinch (AVP)
    if (src.hand && frame && refSpace) {
      const ht = src.hand;
      const tipIndex = ht.get?.('index-finger-tip') || (typeof XRHand!=='undefined' && ht[XRHand.INDEX_PHALANX_TIP]);
      const tipThumb = ht.get?.('thumb-tip')        || (typeof XRHand!=='undefined' && ht[XRHand.THUMB_PHALANX_TIP]);
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

    // Target ray (kept concise)
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

  const aspect = HUD_CFG.HEIGHT_PX / HUD_CFG.WIDTH_PX;       // 0.5 by default
  const planeH = Math.max(HUD_CFG.PLANE_W_M * aspect, HUD_CFG.MIN_PLANE_H_M);
  const geo = new THREE.PlaneGeometry(HUD_CFG.PLANE_W_M, planeH);

  hudMesh = new THREE.Mesh(geo, mat);
  hudMesh.renderOrder = 9999;
  hudMesh.position.set(0, -0.06, -0.85); // center, slightly below gaze
  camera.add(hudMesh);
  scene.add(camera);
}

// Text wrapping + drawing
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
  // 🔹 Make sure HUD is initialized
  if (!hudCanvas || !hudCtx || !hudMesh) {
    ensureWorldHud();
    // If still not ready, don’t draw this frame
    if (!hudCanvas || !hudCtx || !hudMesh) return;
  }

  const P = HUD_CFG.PADDING;
  const W = hudCanvas.width, H = hudCanvas.height;
  const usableW = W - P * 2;

  hudCtx.clearRect(0, 0, W, H);
  hudCtx.fillStyle = HUD_CFG.BG;
  hudCtx.fillRect(0, 0, W, H);

  // Header
  hudCtx.fillStyle = HUD_CFG.FG;
  hudCtx.font = HUD_CFG.FONT_HDR;
  hudCtx.textBaseline = 'top';
  let y = P;
  hudCtx.fillText(header, P, y);
  y += 36;

  // Divider
  hudCtx.fillRect(P, y, usableW, 2);
  y += 10;

  // Body
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

  // Auto-scale plane height to used content (minimum preserved)
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
  xrRefSpace = await session.requestReferenceSpace('local-floor');
  ensureWorldHud();
  //hook unified pinch tracking
  bindSessionInputEvents(session);

  session.addEventListener('selectstart',  (e)=> activeFlags['select'+labelFrom(e.inputSource)] = true);
  session.addEventListener('selectend',    (e)=> activeFlags['select'+labelFrom(e.inputSource)] = false);
  session.addEventListener('squeezestart', (e)=> activeFlags['squeeze'+labelFrom(e.inputSource)] = true);
  session.addEventListener('squeezeend',   (e)=> activeFlags['squeeze'+labelFrom(e.inputSource)] = false);

  drawHud('XR Input: session started…', []);
});

renderer.xr.addEventListener('sessionend', () => {
  xrRefSpace = null;
  ensureWorldHud();
  drawHud('XR Input: session ended', []);
});



// --- Animate ---
// --- Animate ---
renderer.setAnimationLoop((t, frame) => {
  const dt = t * 0.001;
  box.rotation.y = dt * 0.7;

  handleController(controller1);
  handleController(controller2);

  // Slider updates
  updateSliderPose(frame);

  // Ensure the tilt stays applied no matter what
  sliderTilt.rotation.x = PANEL_TILT_X;

  updateSliderInteraction(frame);

  // keep the text refreshed (shows even before first pinch)
  updateVoltageLabel(sliderValue);

  // 🔹 Get XR session once, at the top of the loop
  const xrSession = renderer.xr.getSession ? renderer.xr.getSession() : null;

  // 🔹 NEW: get logical inputs for this frame
  const logical = xrSession ? getLogicalInputs(xrSession) : null;

  // update joint debug cubes + palm orientation
  if (frame && xrRefSpace) {
    updateHandDebug(frame);
  }

  // Example 1: use logical.pinch as your main selection ray
  if (logical && logical.pinch && frame && xrRefSpace) {
    const pose = getTargetRayPose(logical.pinch, frame, xrRefSpace);
    if (pose) {
      // pose.transform.position / orientation
      // You could e.g. drive your raycast / selection from this
      // (On Quest: this will be controller or hand. On AVP: transient-pointer.)
    }
  }

  // Example 2: use logical.right / logical.left as your main side-based inputs
  // (Works cross-platform, regardless of hand/ctrl/transient)
  if (logical && logical.right && frame && xrRefSpace) {
    const rightRayPose = getTargetRayPose(logical.right, frame, xrRefSpace);
    // you can use this for a "right side" ray source if you want
  }

  // Header: compact booleans for actions
  const header =
    `XR Inputs  ` +
    `SEL[L:${+!!activeFlags.selectL} R:${+!!activeFlags.selectR}]  ` +
    `SQZ[L:${+!!activeFlags.squeezeL} R:${+!!activeFlags.squeezeR}]`;

  // Lines per input source, wrapped later
  const bodyLines = (xrSession && xrRefSpace)
    ? formatInputs(xrSession, frame, xrRefSpace)
    : ['XR session not active.'];

  drawHud(header, bodyLines);

  orbit.update();
  renderer.render(scene, camera);
});







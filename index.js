// indexx.js
// Three.js hand joint debug using fillJointRadii/fillPoses
// (pattern taken from Immersive Web "Immersive Session with hands" sample)

import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js";
import { XRButton } from "https://unpkg.com/three@0.165.0/examples/jsm/webxr/XRButton.js";

// ==================== BASIC THREE SETUP ====================

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// XR button (immersive-vr with hand-tracking)
document.body.appendChild(
  XRButton.createButton(renderer, {
    requiredFeatures: ["local-floor"],
    optionalFeatures: ["hand-tracking"],
  })
);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbbbbcc);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);
camera.position.set(0, 1.6, 3);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.4, 0);
orbit.enableDamping = true;

// Lights
scene.add(new THREE.HemisphereLight(0xbbbbcc, 0x222233, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(1, 3, 2);
dir.castShadow = true;
scene.add(dir);

// Floor
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0xbbbbcc, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Simple box in front (just so you see scale)
const box = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.4, 0.4),
  new THREE.MeshStandardMaterial({
    color: 0x68c3ff,
    roughness: 0.4,
    metalness: 0.1,
  })
);
box.position.set(0, 1.5, -1.2);
box.castShadow = true;
scene.add(box);

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ==================== HAND JOINT DEBUG (SAMPLE STYLE) ====================

// match the sample: 25 joints
const JOINT_COUNT = 25;
const jointRadii = new Float32Array(JOINT_COUNT);
const jointMatrices = new Float32Array(16 * JOINT_COUNT);

// Per-hand arrays of joint cubes (like boxes_left/right in sample)
const handBoxes = {
  left: [],
  right: [],
};

// Special index-finger-tip cubes
const indexTipBoxes = {
  left: null,
  right: null,
};

const baseColors = {
  left: 0xff00ff, // magenta
  right: 0x00ffff, // cyan
};

// Create cubes like the sample's addBox/createBoxPrimitive
function initHands() {
  const jointGeom = new THREE.BoxGeometry(0.02, 0.02, 0.02);

  ["left", "right"].forEach((handed) => {
    // 25 joint cubes
    const color = new THREE.Color(baseColors[handed]);
    for (let i = 0; i < JOINT_COUNT; i++) {
      // random-ish variation like sample
      const mat = new THREE.MeshBasicMaterial({
        color: color
          .clone()
          .offsetHSL((Math.random() - 0.5) * 0.05, 0.2 * (Math.random() - 0.5), 0),
        transparent: true,
        opacity: 0.9,
      });
      const cube = new THREE.Mesh(jointGeom, mat);
      cube.visible = false;
      scene.add(cube);
      handBoxes[handed].push(cube);
    }

    // special index tip cube
    const tipMat = new THREE.MeshBasicMaterial({
      color: baseColors[handed],
      transparent: true,
      opacity: 1.0,
    });
    const tipCube = new THREE.Mesh(jointGeom, tipMat);
    tipCube.visible = false;
    scene.add(tipCube);
    indexTipBoxes[handed] = tipCube;
  });
}

initHands();

// XR reference space for hand poses
let xrRefSpace = null;

// Find a hand inputSource by handedness (like sample using inputSource.hand)
function findHandInputSource(session, handedness) {
  for (const src of session.inputSources) {
    if (src.hand && src.handedness === handedness) {
      return src;
    }
  }
  return null;
}

// Update all hand joint cubes using fillJointRadii/fillPoses
function updateHands(frame) {
  const session = renderer.xr.getSession?.();
  if (!session || !frame || !xrRefSpace) return;

  const tempMatrix = new THREE.Matrix4();
  const tempPos = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();

  ["left", "right"].forEach((handed) => {
    const src = findHandInputSource(session, handed);
    const cubes = handBoxes[handed];
    const tipCube = indexTipBoxes[handed];

    if (!src || !src.hand) {
      // hide everything for that hand
      cubes.forEach((m) => (m.visible = false));
      if (tipCube) tipCube.visible = false;
      return;
    }

    const hand = src.hand;

    // This is the key: batch fill radii + joint matrices LIKE THE SAMPLE
    if (!frame.fillJointRadii(hand.values(), jointRadii)) {
      console.log("no fillJointRadii");
      cubes.forEach((m) => (m.visible = false));
      if (tipCube) tipCube.visible = false;
      return;
    }
    if (!frame.fillPoses(hand.values(), xrRefSpace, jointMatrices)) {
      console.log("no fillPoses");
      cubes.forEach((m) => (m.visible = false));
      if (tipCube) tipCube.visible = false;
      return;
    }

    // Update joint cubes
    let offset = 0;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const cube = cubes[i];
      if (!cube) continue;

      // slice out 16 floats → matrix
      tempMatrix.fromArray(jointMatrices, offset * 16);
      offset++;

      // decompose into transforms
      tempMatrix.decompose(tempPos, tempQuat, tempScale);

      cube.visible = true;
      cube.position.copy(tempPos);
      cube.quaternion.copy(tempQuat);

      const r = jointRadii[i] || 0.008;
      cube.scale.setScalar(r * 2.0);
    }

    // Special index finger tip box (like their indexFingerBoxes)
    const joint = hand.get?.("index-finger-tip");
    const jointPose = joint ? frame.getJointPose(joint, xrRefSpace) : null;
    if (jointPose && tipCube) {
      const t = jointPose.transform;
      tipCube.visible = true;
      tipCube.position.set(t.position.x, t.position.y, t.position.z);
      tipCube.quaternion.set(
        t.orientation.x,
        t.orientation.y,
        t.orientation.z,
        t.orientation.w
      );
      tipCube.scale.setScalar(0.02);
    } else if (tipCube) {
      tipCube.visible = false;
    }
  });
}

// ==================== XR SESSION EVENTS ====================

renderer.xr.addEventListener("sessionstart", async () => {
  const session = renderer.xr.getSession();
  if (!session) return;

  try {
    // match sample: use 'local' / 'local-floor' ref space
    const ref = await session.requestReferenceSpace("local-floor");
    xrRefSpace = ref;
  } catch (e) {
    console.warn("Failed to get reference space", e);
  }
});

renderer.xr.addEventListener("sessionend", () => {
  xrRefSpace = null;
});

// ==================== ANIMATION LOOP ====================

renderer.setAnimationLoop((t, frame) => {
  const dt = t * 0.001;
  box.rotation.y = dt * 0.7;

  if (frame && xrRefSpace) {
    updateHands(frame);
  }

  orbit.update();
  renderer.render(scene, camera);
});

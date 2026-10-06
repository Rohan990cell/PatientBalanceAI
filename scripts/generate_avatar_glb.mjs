import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(buf => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
      });
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, '../public/models');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Build articulated human mannequin scene
const scene = new THREE.Scene();

const tealMat = new THREE.MeshStandardMaterial({ color: 0x0D9488, roughness: 0.4, metalness: 0.1 });
const slateMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.5, metalness: 0.1 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x0F766E, roughness: 0.6, metalness: 0.05 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.5, metalness: 0.2 });

const root = new THREE.Group();
root.name = 'PatientRoot';

// Pelvis
const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.12, 18), tealMat);
pelvis.name = 'Pelvis';
pelvis.position.set(0, 0.94, 0);
root.add(pelvis);

// Spine
const spine = new THREE.Group();
spine.name = 'Spine';
spine.position.set(0, 0.08, 0);
pelvis.add(spine);

const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.15, 18), slateMat);
abdomen.name = 'Abdomen';
abdomen.position.set(0, 0.14, 0);
spine.add(abdomen);

const thorax = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.16), slateMat);
thorax.name = 'Thorax';
thorax.position.set(0, 0.28, 0);
spine.add(thorax);

// Head & Neck
const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 16), slateMat);
neck.name = 'Neck';
neck.position.set(0, 0.42, 0);
spine.add(neck);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.10, 24, 24), slateMat);
head.name = 'Head';
head.position.set(0, 0.54, 0);
spine.add(head);

// Left Arm
const leftArm = new THREE.Group();
leftArm.name = 'LeftArm';
leftArm.position.set(-0.18, 0.37, 0);
const lUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 14), slateMat);
lUpper.position.set(-0.02, -0.12, 0);
leftArm.add(lUpper);
const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 14), tealMat);
lHand.position.set(-0.02, -0.45, 0);
leftArm.add(lHand);
spine.add(leftArm);

// Right Arm
const rightArm = new THREE.Group();
rightArm.name = 'RightArm';
rightArm.position.set(0.18, 0.37, 0);
const rUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 14), slateMat);
rUpper.position.set(0.02, -0.12, 0);
rightArm.add(rUpper);
const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 14), tealMat);
rHand.position.set(0.02, -0.45, 0);
rightArm.add(rHand);
spine.add(rightArm);

// Left Leg
const leftLeg = new THREE.Group();
leftLeg.name = 'LeftLeg';
leftLeg.position.set(-0.10, -0.06, 0);
const lThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.36, 16), slateMat);
lThigh.position.set(0, -0.20, 0);
leftLeg.add(lThigh);
const lShin = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.36, 16), slateMat);
lShin.position.set(0, -0.60, 0);
leftLeg.add(lShin);
const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.17), darkMat);
lFoot.position.set(0, -0.84, 0.05);
leftLeg.add(lFoot);
pelvis.add(leftLeg);

// Right Leg
const rightLeg = new THREE.Group();
rightLeg.name = 'RightLeg';
rightLeg.position.set(0.10, -0.06, 0);
const rThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.36, 16), slateMat);
rThigh.position.set(0, -0.20, 0);
rightLeg.add(rThigh);
const rShin = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.36, 16), slateMat);
rShin.position.set(0, -0.60, 0);
rightLeg.add(rShin);
const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.17), darkMat);
rFoot.position.set(0, -0.84, 0.05);
rightLeg.add(rFoot);
pelvis.add(rightLeg);

scene.add(root);

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  (gltf) => {
    const buffer = Buffer.from(gltf);
    const outputPath = path.join(outputDir, 'patient_avatar.glb');
    fs.writeFileSync(outputPath, buffer);
    console.log(`Successfully generated GLB avatar model at: ${outputPath} (${buffer.length} bytes)`);
  },
  (err) => {
    console.error('Failed to export GLB:', err);
    process.exit(1);
  },
  { binary: true }
);

# SMPL Human Body Model Asset Specification

## Overview
PatientBalanceAI uses the **SMPL (Skinned Multi-Person Linear Model)** standard for 3D biomechanical posture visualization, balance rehabilitation, and future camera pose integration.

This document specifies the required 3D model asset format, licensing, joint hierarchy, and installation instructions.

---

## Required Model Asset

| Property | Value |
|---|---|
| **File Path** | `public/models/smpl_neutral.glb` |
| **Optional Variants** | `public/models/smpl_male.glb`, `public/models/smpl_female.glb` |
| **Format** | Binary GLTF (`.glb`) |
| **Skeleton Topology** | Standard 24-Joint SMPL Kinematic Chain |
| **Rest Pose** | Neutral Anatomical Standing Pose (facing FRONT / +Y) |
| **Coordinate System** | Standardized PatientBalanceAI Convention: `+X` = Right, `-X` = Left, `+Y` = Front (Anterior), `-Y` = Back (Posterior) |
| **Scale / Units** | Meters ($1.0\text{ unit} = 1.0\text{ meter}$, anatomical standing height $\approx 1.72\text{m}$) |

---

## Official Source & Licensing
The official SMPL model is developed by the Max Planck Institute for Intelligent Systems.
- **Official Website:** [https://smpl.is.tue.mpg.de](https://smpl.is.tue.mpg.de)
- **License:** Non-commercial scientific and clinical research license.
- **Registration:** Users/institutions register on the SMPL portal to download the official neutral, female, or male model packages.

> **Important Note:** In accordance with academic licensing and copyright rules, PatientBalanceAI does **not** distribute or bundle unlicensed third-party copies of the SMPL model mesh.
> Instead, PatientBalanceAI provides:
> 1. A clean, modular SMPL integration architecture (`SMPLBody`, `SMPLModel`, `SMPLModelViewer`).
> 2. Automated probe and detection of `public/models/smpl_neutral.glb`.
> 3. An accurate 24-joint kinematic fallback architecture that runs seamlessly while the official mesh asset is pending.

---

## 24 Standard SMPL Joints Supported

| Index | Canonical Name | Clinical Anatomical Name | Region |
|---|---|---|---|
| 0 | `pelvis` | Pelvis (Root / Center of Mass) | Pelvis |
| 1 | `left_hip` | Left Acetabulofemoral (Hip) Joint | Lower Limb |
| 2 | `right_hip` | Right Acetabulofemoral (Hip) Joint | Lower Limb |
| 3 | `spine1` | Lumbar Spine (L1-L5) | Spine |
| 4 | `left_knee` | Left Tibiofemoral (Knee) Joint | Lower Limb |
| 5 | `right_knee` | Right Tibiofemoral (Knee) Joint | Lower Limb |
| 6 | `spine2` | Mid-Thoracic Spine (T7-T12) | Spine |
| 7 | `left_ankle` | Left Talocrural (Ankle) Joint | Lower Limb |
| 8 | `right_ankle` | Right Talocrural (Ankle) Joint | Lower Limb |
| 9 | `spine3` | Upper Thoracic Spine (T1-T6) | Spine |
| 10 | `left_foot` | Left Metatarsal / Plantar Contact | Lower Limb |
| 11 | `right_foot` | Right Metatarsal / Plantar Contact | Lower Limb |
| 12 | `neck` | Cervical Spine (C1-C7) | Head/Neck |
| 13 | `left_collar` | Left Sternoclavicular (Clavicle) | Upper Limb |
| 14 | `right_collar` | Right Sternoclavicular (Clavicle) | Upper Limb |
| 15 | `head` | Cranium / Vestibular Center | Head/Neck |
| 16 | `left_shoulder` | Left Glenohumeral (Shoulder) Joint | Upper Limb |
| 17 | `right_shoulder` | Right Glenohumeral (Shoulder) Joint | Upper Limb |
| 18 | `left_elbow` | Left Humeroulnar (Elbow) Joint | Upper Limb |
| 19 | `right_elbow` | Right Humeroulnar (Elbow) Joint | Upper Limb |
| 20 | `left_wrist` | Left Radiocarpal (Wrist) Joint | Upper Limb |
| 21 | `right_wrist` | Right Radiocarpal (Wrist) Joint | Upper Limb |
| 22 | `left_hand` | Left Metacarpus (Hand) | Upper Limb |
| 23 | `right_hand` | Right Metacarpus (Hand) | Upper Limb |

---

## How to Export & Install the Model Asset

1. Download the SMPL model package (`SMPL_python_v.1.1.0` or FBX package) from [smpl.is.tue.mpg.de](https://smpl.is.tue.mpg.de).
2. In Blender (with the SMPL Blender add-on or FBX importer):
   - Import the neutral model (`basicModel_neutral_lbs_10_207_0_v1.1.0`).
   - Ensure the 24 joint bones match the standard SMPL naming convention.
   - Position the model facing FRONT (+Y) in neutral standing anatomical pose.
   - Plantar base of both feet should rest at $y = 0.041\text{m}$ (matching the Wii Balance Board surface plane).
3. Export as Binary GLTF (`.glb`):
   - Format: `GLB` (Include Skins, Armatures, Normal Maps).
   - Filename: `smpl_neutral.glb`.
4. Copy the exported file to:
   ```bash
   public/models/smpl_neutral.glb
   ```
5. Reload PatientBalanceAI. The application automatically detects the file and transitions from the Kinematic Fallback state to the official Skinned Mesh Active state.

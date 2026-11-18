import fs from "fs";
import path from "path";

console.log("=================================================================");
console.log("=== VERIFYING HOW CENTER OF PRESSURE (COP) WORKS MODAL & BUTTON ===");
console.log("=================================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    failed++;
  }
}

// 1. Verify CopInfoModal.tsx existence and content
const modalPath = path.resolve("src/components/balance/CopInfoModal.tsx");
assert(fs.existsSync(modalPath), "CopInfoModal.tsx file exists");

const modalContent = fs.readFileSync(modalPath, "utf-8");

// Section 1 checks
assert(modalContent.includes("How Center of Pressure (COP) Works"), "Modal title is 'How Center of Pressure (COP) Works'");
assert(modalContent.includes("1. What is COP?"), "Modal has Section 1: What is COP?");
assert(modalContent.includes("estimated point on the balance board where the combined vertical force"), "Section 1 defines COP as estimated point of combined vertical force");
assert(modalContent.includes("COP ball"), "Section 1 mentions COP ball in real time");

// Section 2 checks
assert(modalContent.includes("2. How is COP calculated?"), "Modal has Section 2: How is COP calculated?");
assert(modalContent.includes("FL:") && modalContent.includes("Front Left"), "Section 2 lists FL: Front Left");
assert(modalContent.includes("FR:") && modalContent.includes("Front Right"), "Section 2 lists FR: Front Right");
assert(modalContent.includes("BL:") && modalContent.includes("Back Left"), "Section 2 lists BL: Back Left");
assert(modalContent.includes("BR:") && modalContent.includes("Back Right"), "Section 2 lists BR: Back Right");
assert(modalContent.includes("combines the four sensor readings"), "Section 2 explains combining 4 sensor readings");
assert(modalContent.includes("Left (-X)") && modalContent.includes("Right (+X)"), "Section 2 explains COP X coordinates: negative = Left, positive = Right");
assert(modalContent.includes("Back (-Y)") || modalContent.includes("Back / Heel (-Y)"), "Section 2 explains COP Y coordinates: negative = Back");
assert(modalContent.includes("Front (+Y)") || modalContent.includes("Front / Toes (+Y)"), "Section 2 explains COP Y coordinates: positive = Front");
assert(modalContent.includes("calibration") && modalContent.includes("millimetre-level accuracy"), "Section 2 states calculation depends on valid sensors/calibration without claiming millimetre-level accuracy");

// Section 3 checks
assert(modalContent.includes("3. How to read the COP ball"), "Modal has Section 3: How to read the COP ball");
assert(modalContent.includes("Near the centre"), "Section 3 explains centered weight distribution");
assert(modalContent.includes("Moving left or right"), "Section 3 explains lateral shift");
assert(modalContent.includes("Moving forward or backward"), "Section 3 explains anteroposterior shift");
assert(modalContent.includes("dotted circle") && modalContent.includes("safety boundary"), "Section 3 explains dotted circle is reference zone, not universal clinical safety boundary");

// Section 4 checks
assert(modalContent.includes("4. Real data versus simulation"), "Modal has Section 4: Real data versus simulation");
assert(modalContent.includes("LIVE") && modalContent.includes("connected"), "Section 4 explains LIVE data");
assert(modalContent.includes("SIMULATION") && modalContent.includes("test data"), "Section 4 explains SIMULATION data");
assert(modalContent.includes("DISCONNECTED"), "Section 4 explains DISCONNECTED / WAITING status");

// Section 5 checks
assert(modalContent.includes("5. Important note"), "Modal has Section 5: Important note");
assert(modalContent.includes("location of the combined force") && modalContent.includes("not the exact anatomical position"), "Section 5 explains force location vs anatomical body/foot position");
assert(modalContent.includes("not a standalone medical diagnosis"), "Section 5 explains monitoring/research use, not standalone medical diagnosis");

// Accessibility & UI requirements
assert(modalContent.includes('role="dialog"'), "Modal container has role='dialog'");
assert(modalContent.includes('aria-modal="true"'), "Modal container has aria-modal='true'");
assert(modalContent.includes('aria-labelledby="cop-modal-title"'), "Modal container has aria-labelledby");
assert(modalContent.includes('key === "Escape"') || modalContent.includes("Escape"), "Modal handles Escape key to close");
assert(modalContent.includes('aria-label="Close dialog"'), "Close button has accessible aria-label");
assert(modalContent.includes("<X "), "Close button has visible X icon");

// 2. Verify BodyBalancePage.tsx integration
const bodyBalancePagePath = path.resolve("src/pages/BodyBalancePage.tsx");
const bodyBalanceContent = fs.readFileSync(bodyBalancePagePath, "utf-8");

assert(bodyBalanceContent.includes("CopInfoModal"), "BodyBalancePage imports and renders CopInfoModal");
assert(bodyBalanceContent.includes("isCopInfoOpen") && bodyBalanceContent.includes("setIsCopInfoOpen"), "BodyBalancePage has isCopInfoOpen state");
assert(bodyBalanceContent.includes("cop-info-btn"), "BodyBalancePage includes cop-info-btn class");
assert(bodyBalanceContent.includes('aria-label="How Center of Pressure (COP) Works"'), "Info button has accessible aria-label");
assert(bodyBalanceContent.includes("Force Plate Visualization"), "Force Plate Visualization heading is present");

// 3. Verify CSS in index.css
const indexCssPath = path.resolve("src/index.css");
const indexCssContent = fs.readFileSync(indexCssPath, "utf-8");
assert(indexCssContent.includes(".cop-info-btn"), "index.css has .cop-info-btn styling");
assert(indexCssContent.includes("var(--teal-primary)"), ".cop-info-btn uses teal outline");

console.log(`\n=================================================================`);
console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
console.log(`=================================================================`);

if (failed > 0) {
  process.exit(1);
}

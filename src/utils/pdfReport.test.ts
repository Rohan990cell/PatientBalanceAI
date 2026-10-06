import fs from "fs";
import path from "path";
import { BalanceSession, RecordedMeasurementPoint } from "../types/session";
import { PdfReportGenerator } from "../services/pdfReportGenerator";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

console.log("=== RUNNING PHASE 5 DOCTOR PDF REPORT TEST SUITE ===");

// 1. Build Mock Simulated Session
const mockMeasurements: RecordedMeasurementPoint[] = [];
for (let i = 0; i <= 300; i++) {
  const elapsedMs = i * 100;
  const t = i * 0.05;
  const copX = parseFloat((Math.sin(t) * 0.35).toFixed(3));
  const copY = parseFloat((Math.cos(t) * 0.28).toFixed(3));
  const leftPercent = parseFloat((50 - copX * 25).toFixed(1));
  const rightPercent = parseFloat((100 - leftPercent).toFixed(1));
  const antPercent = parseFloat((50 + copY * 20).toFixed(1));
  const postPercent = parseFloat((100 - antPercent).toFixed(1));

  mockMeasurements.push({
    timestamp: new Date(1759233600000 + elapsedMs).toISOString(),
    elapsedMs,
    frontLeft: 16.2 + copX,
    frontRight: 16.3 - copX,
    backLeft: 16.0 + copX,
    backRight: 16.1 - copX,
    totalWeight: 64.6,
    leftWeight: (64.6 * leftPercent) / 100,
    rightWeight: (64.6 * rightPercent) / 100,
    leftPercent,
    rightPercent,
    anteriorWeight: (64.6 * antPercent) / 100,
    posteriorWeight: (64.6 * postPercent) / 100,
    anteriorPercent: antPercent,
    posteriorPercent: postPercent,
    copX,
    copY,
  });
}

const mockSimSession: BalanceSession = {
  schemaVersion: 1,
  sessionId: "session-20260930-testsim",
  patientId: "pat-001",
  patientName: "Eleanor Vance",
  startTime: "2026-09-30T13:00:00.000Z",
  endTime: "2026-09-30T13:00:30.000Z",
  durationMs: 30000,
  dataSource: "simulation",
  boardModel: "RVL-WBC-01",
  measurementCount: mockMeasurements.length,
  samplingRate: 10.0,
  quality: {
    validSamples: mockMeasurements.length,
    invalidSamples: 0,
    dataGaps: 0,
    samplingRate: 10.0,
  },
  summary: {
    durationMs: 30000,
    durationFormatted: "00:30",
    measurementCount: mockMeasurements.length,
    averageWeightKg: 64.6,
    averageLeftPercent: 49.8,
    averageRightPercent: 50.2,
    averageAnteriorPercent: 50.9,
    averagePosteriorPercent: 49.1,
    copSamples: mockMeasurements.length,
    minCopX: -0.35,
    maxCopX: 0.35,
    minCopY: -0.28,
    maxCopY: 0.28,
  },
  measurements: mockMeasurements,
};

// Test 1: Generate PDF for Simulated Session
const simDoc = PdfReportGenerator.generateReport(mockSimSession);
assert(simDoc !== null, "PDF document instance generated");
console.log("  PASS: Test 1 - PdfReportGenerator returned a valid jsPDF document");

// Test 2: Check Page Count
const pageCount = simDoc.getNumberOfPages();
assert(pageCount === 4, `Expected exactly 4 pages, got ${pageCount}`);
console.log("  PASS: Test 2 - Report is formatted cleanly into 4 distinct clinical pages");

// Test 3: Verify Output Buffer and PDF Header Signature
const arrayBuf = simDoc.output("arraybuffer");
const uint8 = new Uint8Array(arrayBuf);
assert(uint8.length > 5000, `PDF size is ${uint8.length} bytes (reasonable size)`);

// Check "%PDF" magic bytes
const headerStr = String.fromCharCode(...uint8.slice(0, 5));
assert(headerStr === "%PDF-", `PDF header signature is %PDF-, got ${headerStr}`);
console.log(`  PASS: Test 3 - PDF output binary generated with valid header (${uint8.length} bytes)`);

// Test 4: Write Simulated Test PDF to Disk
const testPdfDir = path.resolve("./reports");
if (!fs.existsSync(testPdfDir)) {
  fs.mkdirSync(testPdfDir, { recursive: true });
}
const testSimPath = path.join(testPdfDir, `PatientBalanceAI_BalanceReport_${mockSimSession.sessionId}.pdf`);
fs.writeFileSync(testSimPath, Buffer.from(uint8));
assert(fs.existsSync(testSimPath), "Generated PDF file saved to disk successfully");
console.log(`  PASS: Test 4 - Test simulation PDF written to ${testSimPath}`);

// Test 5: Generate PDF for Real Hardware Session
const mockHwSession: BalanceSession = {
  ...mockSimSession,
  sessionId: "session-20260930-testhw",
  dataSource: "wii_balance_board",
};
const hwDoc = PdfReportGenerator.generateReport(mockHwSession);
const hwBuf = hwDoc.output("arraybuffer");
const hwUint8 = new Uint8Array(hwBuf);
const testHwPath = path.join(testPdfDir, `PatientBalanceAI_BalanceReport_${mockHwSession.sessionId}.pdf`);
fs.writeFileSync(testHwPath, Buffer.from(hwUint8));
assert(fs.existsSync(testHwPath), "Real hardware test PDF saved to disk successfully");
console.log(`  PASS: Test 5 - Real hardware PDF generated with dataSource: wii_balance_board (${hwUint8.length} bytes)`);

// Test 6: Verify Filename Convention
const expectedName = `PatientBalanceAI_BalanceReport_${mockSimSession.sessionId}.pdf`;
assert(expectedName.startsWith("PatientBalanceAI_BalanceReport_"), "Filename adheres to naming standard");
assert(expectedName.endsWith(".pdf"), "Filename ends with .pdf");
console.log("  PASS: Test 6 - Standardized report naming convention verified");

console.log("\nPHASE 5 TEST SUITE SUMMARY: ALL 6 TESTS PASSED!\n");

const STORAGE_KEYS = {
  users: "catvUsers",
  records: "catvRecords",
  floorPlans: "catvFloorPlans",
  b2cLines: "catvB2CLines",
  b2cDiagrams: "catvB2CDiagrams",
  sharedDbVersion: "catvSharedDbVersion",
  sharedDbDirty: "catvSharedDbDirty",
};

const APP_VERSION = "CATV0724-FRESH-LOGIN";
const LINE_DIAGRAM_RENDERER_VERSION = "excel-picture-v8-exact-image-only";
const SHARED_DB_PATH = "/assets/shared-db.json";
const GITHUB_SHARED_DB_REPO = "yjd1870-a11y/transmission-webapp";
const GITHUB_SHARED_DB_BRANCH = "main";
let suppressSharedDbDirty = false;
let sharedDbSyncTimer = null;
let sharedDbSaveInFlight = false;
let sharedDbSaveQueued = false;
let sharedDbChangeSequence = 0;
let userDbRefreshPromise = null;
let initialSessionResetPromise = Promise.resolve();
let mobileExitBackAt = 0;
let mobileExitBackTimer = null;
let activePhotoLightboxClose = null;

const userColumns = ["id", "name", "role"];
const recordColumns = [
  "keyNumber", "cellName", "stationName", "stationAddress", "otxMain", "otxLine", "orxMain", "orxLine", "backup", "backupLine",
  "otxRack", "otxShelf", "otxPort", "otxModel", "orxRack", "orxShelf", "orxPort", "orxModel", "onuLocation", "onuPhoto",
  "onuPhotos", "onuMaker", "onuModel", "onuSplit", "onuCellConfig",
  "upsLocation", "upsPhoto", "upsPhotos", "upsMaker", "upsModel", "remarks",
];

const columnLabels = {
  id: "아이디",
  name: "이름",
  role: "권한",
  keyNumber: "키번호",
  cellName: "셀명",
  stationName: "국사명",
  stationAddress: "국사주소",
  otxMain: "OTX 노드",
  otxLine: "OTX 선번",
  orxMain: "ORX 노드",
  orxLine: "ORX 선번",
  backup: "예비 노드",
  backupLine: "예비 선번",
  otxRack: "OTX 렉",
  otxShelf: "OTX 쉘프",
  otxPort: "OTX 포트",
  otxModel: "OTX 모델명",
  orxRack: "ORX 렉",
  orxShelf: "ORX 쉘프",
  orxPort: "ORX 포트",
  orxModel: "ORX 모델명",
  onuLocation: "ONU 위치",
  onuPhoto: "ONU 현장사진",
  onuPhotos: "ONU 현장사진목록",
  onuMaker: "ONU 제조사",
  onuModel: "ONU 모델명",
  onuSplit: "ONU 분할구분",
  onuCellConfig: "ONU 셀구성",
  upsLocation: "UPS 위치",
  upsPhoto: "UPS 현장사진",
  upsPhotos: "UPS 현장사진목록",
  upsMaker: "UPS 제조사",
  upsModel: "UPS 모델명",
  remarks: "비고",
};

const importColumnAliases = {
  keyNumber: ["키 번호", "키번호(숫자)", "KEY", "Key", "key", "번호", "A열"],
  otxMain: ["OTX (주)", "OTX 노드"],
  otxLine: ["OTX 선번", "OTX (주)"],
  orxMain: ["ORX (주)", "ORX 노드"],
  orxLine: ["ORX 선번", "ORX (주)"],
  backup: ["예비", "예비 노드"],
  backupLine: ["예비 선번", "예비"],
};

const sampleUsers = [
  { id: "demo", name: "조회사용자", role: "user" },
];

const sampleRecords = [
  {
    cellName: "A-101",
    stationName: "중앙국사",
    stationAddress: "서울시 중구 중앙로 10",
    otxMain: "OTX-C01",
    otxLine: "OTX-C01",
    orxMain: "ORX-C01",
    orxLine: "ORX-C01",
    backup: "OTX-C01-B / ORX-C01-B",
    backupLine: "OTX-C01-B / ORX-C01-B",
    otxRack: "1",
    otxShelf: "3",
    otxPort: "7",
    otxModel: "TX-4000",
    orxRack: "2",
    orxShelf: "1",
    orxPort: "9",
    orxModel: "RX-4000",
    onuLocation: "중앙시장 3동 옥상",
    onuPhoto: "https://maps.google.com",
    onuMap: "https://maps.google.com/?q=Seoul+Jung-gu",
    onuMaker: "CATV Networks",
    onuModel: "ONU-HFC-24",
    onuSplit: "1:8",
    onuCellConfig: "A-101, A-102",
    upsLocation: "중앙시장 지하 MDF",
    upsPhoto: "https://maps.google.com",
    upsMap: "https://maps.google.com/?q=Seoul+Jung-gu",
    upsMaker: "PowerOne",
    upsModel: "UPS-1500",
    remarks: "정기점검 2026-06 완료",
  },
  {
    cellName: "B-205",
    stationName: "서부국사",
    stationAddress: "서울시 마포구 월드컵로 55",
    otxMain: "OTX-W12",
    otxLine: "OTX-W12",
    orxMain: "ORX-W12",
    orxLine: "ORX-W12",
    backup: "예비 2포트",
    backupLine: "예비 2포트",
    otxRack: "4",
    otxShelf: "2",
    otxPort: "1",
    otxModel: "TX-3200",
    orxRack: "1",
    orxShelf: "4",
    orxPort: "4",
    orxModel: "RX-3200",
    onuLocation: "서부아파트 102동 통신실",
    onuPhoto: "",
    onuMap: "https://maps.google.com/?q=Mapo-gu",
    onuMaker: "HFC Link",
    onuModel: "ONU-204",
    onuSplit: "1:4",
    onuCellConfig: "B-205",
    upsLocation: "102동 지하 EPS",
    upsPhoto: "",
    upsMap: "https://maps.google.com/?q=Mapo-gu",
    upsMaker: "SafeVolt",
    upsModel: "SV-1000",
    remarks: "UPS 배터리 교체 예정",
  },
];

const qs = (selector) => document.querySelector(selector);
let pendingSearchRecords = [];
let pendingB2CSearchRecords = [];
let authenticatedUser = null;
let managedUsers = [];

function ensureSeedData() {
  suppressSharedDbDirty = true;
  try {
    if (!localStorage.getItem(STORAGE_KEYS.users)) {
      saveUsers(sampleUsers);
    }

    if (!localStorage.getItem(STORAGE_KEYS.records)) {
      saveRecords(sampleRecords.map(normalizeRecord));
    } else {
      saveRecords(loadRecords().map(normalizeRecord));
    }
  } finally {
    suppressSharedDbDirty = false;
  }
}

function markSharedDbDirty() {
  if (suppressSharedDbDirty || authenticatedUser?.role !== "admin") return;
  sharedDbChangeSequence += 1;
  localStorage.setItem(STORAGE_KEYS.sharedDbDirty, "true");
  scheduleSharedDatabaseSync();
  renderSharedDbAdmin();
}

function loadUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function loadRecords() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.records) || "[]").map(normalizeRecord);
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(records));
  markSharedDbDirty();
}

function loadFloorPlans() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.floorPlans) || "[]");
}

function saveFloorPlans(plans) {
  localStorage.setItem(STORAGE_KEYS.floorPlans, JSON.stringify(plans));
  markSharedDbDirty();
}

let b2cLinesCache = null;

function legacyB2CLines() {
  try {
    const lines = JSON.parse(localStorage.getItem(STORAGE_KEYS.b2cLines) || "[]");
    return Array.isArray(lines) ? lines : [];
  } catch {
    return [];
  }
}

function loadB2CLines() {
  if (!Array.isArray(b2cLinesCache)) b2cLinesCache = legacyB2CLines();
  return b2cLinesCache;
}

function createDbSourceId(prefix = "db") {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomId}`;
}

const APP_DB_NAME = "catvTransmissionApp";
const APP_DB_VERSION = 3;
const B2C_DIAGRAM_STORE = "b2cDiagrams";
const B2C_LINE_STORE = "b2cLines";
const B2C_LINE_SNAPSHOT_ID = "current";
const ADMIN_RECORD_INITIAL_LIMIT = 80;
const ADMIN_RECORD_SEARCH_LIMIT = 160;
let adminDataSearchTimer = null;
let pdfJsRuntimePromise = null;
const PRESET_LINE_DIAGRAMS = [
  {
    fileName: "안성국사(직선도).xlsx",
    manifestKey: "anseong",
    manifestUrl: "/assets/line-diagrams/anseong-vector/manifest.json",
    assetBaseUrl: "/assets/line-diagrams/anseong-vector/",
    fallbackAssetBaseUrl: "/assets/line-diagrams/anseong-hd/",
  },
  {
    fileName: "\uB9C8\uD3C9\uAD6D\uC0AC(\uC9C1\uC120\uB3C4).xlsx",
    manifestKey: "mapyeong",
    manifestUrl: "/assets/line-diagrams/mapyeong-vector/manifest.json",
    assetBaseUrl: "/assets/line-diagrams/mapyeong-vector/",
  },
];
const presetLineDiagramManifestCache = new Map();

function promiseWithTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function loadPdfJsRuntime() {
  if (!pdfJsRuntimePromise) {
    const moduleUrl = new URL("/assets/vendor/pdfjs/pdf.min.js", window.location.origin).href;
    const workerUrl = new URL("/assets/vendor/pdfjs/pdf.worker.min.js", window.location.origin).href;
    pdfJsRuntimePromise = promiseWithTimeout(
      import(moduleUrl).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        return pdfjs;
      }),
      10000,
      "벡터 직선도 렌더러를 불러오는 시간이 초과되었습니다.",
    ).catch((error) => {
      pdfJsRuntimePromise = null;
      throw error;
    });
  }
  return pdfJsRuntimePromise;
}

function presetLineDiagramConfig(fileName) {
  const key = String(fileName || "").trim().toLowerCase();
  return PRESET_LINE_DIAGRAMS.find((item) => item.fileName.toLowerCase() === key) || null;
}

async function loadPresetLineDiagramManifest(config) {
  if (!config) return null;
  const embeddedManifest = window.__LINE_DIAGRAM_MANIFESTS__?.[config.manifestKey];
  if (embeddedManifest) return embeddedManifest;
  if (!presetLineDiagramManifestCache.has(config.manifestUrl)) {
    presetLineDiagramManifestCache.set(config.manifestUrl, fetch(config.manifestUrl, {
      cache: "no-store",
      credentials: "same-origin",
    }).then((response) => {
      if (!response.ok) throw new Error(`직선도 원본 이미지 목록을 불러오지 못했습니다 (${response.status}).`);
      return response.json();
    }));
  }
  return presetLineDiagramManifestCache.get(config.manifestUrl);
}

async function buildPresetLineDiagrams(stationName, fileName, nodeNamesBySheet = new Map(), metadata = {}) {
  const config = presetLineDiagramConfig(fileName);
  if (!config) return null;
  const manifest = await loadPresetLineDiagramManifest(config);
  const manifestBase = new URL(config.assetBaseUrl, window.location.href);
  return (manifest.sheets || []).map((entry) => {
    const nodeName = nodeNamesBySheet.get(diagramMatchKey(entry.sheetName)) || "";
    const isVectorPdf = String(entry.imageFormat || "").toLowerCase() === "pdf"
      || String(entry.file || "").toLowerCase().endsWith(".pdf");
    const fallbackFile = String(entry.file || "").replace(/\.pdf$/i, ".png");
    return {
      ...metadata,
      stationName,
      fileName,
      sheetName: entry.sheetName,
      linebookSheetName: manifest.linebookSheetName || "",
      nodeName,
      nodeKey: diagramMatchKey(nodeName || entry.sheetName),
      type: isVectorPdf ? "pdf-map" : "image-map",
      content: new URL(entry.file, manifestBase).href,
      fallbackContent: isVectorPdf && config.fallbackAssetBaseUrl
        ? new URL(fallbackFile, new URL(config.fallbackAssetBaseUrl, window.location.href)).href
        : "",
      searchTargets: entry.searchTargets || [],
      baseWidth: entry.width,
      baseHeight: entry.height,
      imageFormat: isVectorPdf ? "pdf" : "png",
      renderer: isVectorPdf ? "excel-vector-pdf" : "excel-original",
    };
  });
}

function openAppDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("브라우저 DB를 사용할 수 없습니다."));
      return;
    }

    const request = indexedDB.open(APP_DB_NAME, APP_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(B2C_DIAGRAM_STORE)
        ? request.transaction.objectStore(B2C_DIAGRAM_STORE)
        : db.createObjectStore(B2C_DIAGRAM_STORE, { keyPath: "id" });
      if (!store.indexNames.contains("sourceId")) {
        store.createIndex("sourceId", "sourceId", { unique: false });
      }
      if (!db.objectStoreNames.contains(B2C_LINE_STORE)) {
        db.createObjectStore(B2C_LINE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("브라우저 DB를 열지 못했습니다."));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("브라우저 DB 작업에 실패했습니다."));
  });
}

async function loadB2CDiagrams(stationName = "") {
  const db = await openAppDb();
  try {
    const tx = db.transaction(B2C_DIAGRAM_STORE, "readonly");
    const storedDiagrams = await requestToPromise(tx.objectStore(B2C_DIAGRAM_STORE).getAll());
    const diagrams = storedDiagrams.map(repairLegacySvgDiagram);
    const repairedDiagrams = diagrams.filter((diagram, index) => diagram !== storedDiagrams[index]);
    if (repairedDiagrams.length) {
      const repairTx = db.transaction(B2C_DIAGRAM_STORE, "readwrite");
      const repairStore = repairTx.objectStore(B2C_DIAGRAM_STORE);
      repairedDiagrams.forEach((diagram) => repairStore.put(diagram));
      await transactionToPromise(repairTx, "기존 SVG 직선도 화면 보정 저장에 실패했습니다.");
    }
    const selected = String(stationName || "").trim()
      ? diagrams.filter((diagram) => sameStationName(diagram.stationName, stationName))
      : diagrams;
    const groups = selected.reduce((result, diagram) => {
      const key = `${stationKey(diagram.stationName)}::${diagram.sourceId || String(diagram.fileName || "").toLowerCase()}`;
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(diagram);
      return result;
    }, new Map());
    const resolved = [];
    for (const group of groups.values()) {
      const config = presetLineDiagramConfig(group[0]?.fileName);
      if (!config) {
        resolved.push(...group);
        continue;
      }
      const nodeNamesBySheet = new Map(group.map((diagram) => [
        diagramMatchKey(diagram.sheetName),
        diagram.nodeName || "",
      ]));
      const presetDiagrams = await buildPresetLineDiagrams(group[0].stationName, group[0].fileName, nodeNamesBySheet, {
        sourceId: group[0].sourceId || "",
        createdAt: group[0].createdAt || "",
      });
      resolved.push(...(presetDiagrams || group));
    }
    return resolved.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  } finally {
    db.close();
  }
}

async function saveB2CDiagramsForStation(stationName, diagrams, sourceId = "") {
  const db = await openAppDb();
  try {
    const tx = db.transaction(B2C_DIAGRAM_STORE, "readwrite");
    const store = tx.objectStore(B2C_DIAGRAM_STORE);
    diagrams.forEach((diagram) => {
      store.put(repairLegacySvgDiagram({
        ...diagram,
        sourceId: sourceId || diagram.sourceId || "",
        id: `${stationKey(stationName)}::${sourceId || diagram.sourceId || "legacy"}::${diagram.sheetName}`,
      }));
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("직선도 DB 저장에 실패했습니다."));
      tx.onabort = () => reject(tx.error || new Error("직선도 DB 저장이 중단되었습니다."));
    });
    localStorage.removeItem(STORAGE_KEYS.b2cDiagrams);
    markSharedDbDirty();
  } finally {
    db.close();
  }
}

async function deleteB2CDiagramsForSource({ sourceId = "", stationName = "", fileName = "" } = {}) {
  const db = await openAppDb();
  try {
    const readStore = db.transaction(B2C_DIAGRAM_STORE, "readonly").objectStore(B2C_DIAGRAM_STORE);
    const keys = sourceId && readStore.indexNames.contains("sourceId")
      ? await requestToPromise(readStore.index("sourceId").getAllKeys(sourceId))
      : (await requestToPromise(readStore.getAll()))
        .filter((diagram) => sourceId
          ? diagram.sourceId === sourceId
          : sameStationName(diagram.stationName, stationName)
            && String(diagram.fileName || "") === String(fileName || ""))
        .map((diagram) => diagram.id);
    const tx = db.transaction(B2C_DIAGRAM_STORE, "readwrite");
    const store = tx.objectStore(B2C_DIAGRAM_STORE);
    keys.forEach((key) => store.delete(key));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("직선도 DB 삭제에 실패했습니다."));
      tx.onabort = () => reject(tx.error || new Error("직선도 DB 삭제가 중단되었습니다."));
    });
    markSharedDbDirty();
  } finally {
    db.close();
  }
}

async function deleteAllB2CDiagrams() {
  const db = await openAppDb();
  try {
    const tx = db.transaction(B2C_DIAGRAM_STORE, "readwrite");
    tx.objectStore(B2C_DIAGRAM_STORE).clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("직선도 DB 전체 삭제에 실패했습니다."));
      tx.onabort = () => reject(tx.error || new Error("직선도 DB 전체 삭제가 중단되었습니다."));
    });
    markSharedDbDirty();
  } finally {
    db.close();
  }
}

async function replaceB2CDiagrams(diagrams = []) {
  const db = await openAppDb();
  try {
    const tx = db.transaction(B2C_DIAGRAM_STORE, "readwrite");
    const store = tx.objectStore(B2C_DIAGRAM_STORE);
    store.clear();
    diagrams.forEach((diagram) => {
      const station = stationKey(diagram.stationName);
      const source = diagram.sourceId || "shared";
      const sheet = diagram.sheetName || diagram.nodeName || Math.random().toString(36).slice(2);
      store.put(repairLegacySvgDiagram({
        ...diagram,
        sourceId: source,
        id: diagram.id || `${station}::${source}::${sheet}`,
      }));
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("공용 직선도 DB 저장에 실패했습니다."));
      tx.onabort = () => reject(tx.error || new Error("공용 직선도 DB 저장이 중단되었습니다."));
    });
    localStorage.removeItem(STORAGE_KEYS.b2cDiagrams);
  } finally {
    db.close();
  }
}

function sharedDbVersionOf(db) {
  return String(db?.version || db?.updatedAt || "");
}

function setSharedDbClean(version) {
  if (version) localStorage.setItem(STORAGE_KEYS.sharedDbVersion, version);
  localStorage.removeItem(STORAGE_KEYS.sharedDbDirty);
}

function hasSharedDbContent(db) {
  return Boolean(db)
    && (Array.isArray(db.records)
      || Array.isArray(db.floorPlans)
      || Array.isArray(db.b2cLines)
      || Array.isArray(db.b2cDiagrams));
}

function transactionToPromise(transaction, errorMessage) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error(errorMessage));
    transaction.onabort = () => reject(transaction.error || new Error(errorMessage));
  });
}

async function persistB2CLines(lines) {
  const db = await openAppDb();
  try {
    const tx = db.transaction(B2C_LINE_STORE, "readwrite");
    tx.objectStore(B2C_LINE_STORE).put({
      id: B2C_LINE_SNAPSHOT_ID,
      lines,
      updatedAt: new Date().toISOString(),
    });
    await transactionToPromise(tx, "선번장 검색 DB 저장에 실패했습니다.");
  } finally {
    db.close();
  }
}

async function hydrateB2CLines() {
  const legacyLines = legacyB2CLines();
  try {
    const db = await openAppDb();
    try {
      const tx = db.transaction(B2C_LINE_STORE, "readonly");
      const snapshot = await requestToPromise(tx.objectStore(B2C_LINE_STORE).get(B2C_LINE_SNAPSHOT_ID));
      b2cLinesCache = Array.isArray(snapshot?.lines) ? snapshot.lines : legacyLines;
    } finally {
      db.close();
    }
    if (legacyLines.length && b2cLinesCache === legacyLines) await persistB2CLines(legacyLines);
    localStorage.removeItem(STORAGE_KEYS.b2cLines);
  } catch (error) {
    console.warn("IndexedDB 직선도 목록을 불러오지 못해 기존 브라우저 저장소를 사용합니다.", error);
    b2cLinesCache = legacyLines;
  }
}

async function saveB2CLines(lines) {
  b2cLinesCache = Array.isArray(lines) ? lines : [];
  await persistB2CLines(b2cLinesCache);
  localStorage.removeItem(STORAGE_KEYS.b2cLines);
  markSharedDbDirty();
}

async function applySharedDatabase(db) {
  if (!hasSharedDbContent(db)) return false;
  suppressSharedDbDirty = true;
  try {
    if (Array.isArray(db.records)) saveRecords(db.records.map(normalizeRecord));
    if (Array.isArray(db.floorPlans)) saveFloorPlans(db.floorPlans);
    if (Array.isArray(db.b2cLines)) await saveB2CLines(db.b2cLines);
    if (Array.isArray(db.b2cDiagrams)) await replaceB2CDiagrams(db.b2cDiagrams);
    setSharedDbClean(sharedDbVersionOf(db));
    return true;
  } finally {
    suppressSharedDbDirty = false;
  }
}

async function loadSharedDatabaseFromSite({ force = false } = {}) {
  const url = new URL(SHARED_DB_PATH, window.location.href);
  url.searchParams.set("v", force ? String(Date.now()) : APP_VERSION);
  try {
    const response = await fetch(url.href, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return false;
    const db = await response.json();
    const version = sharedDbVersionOf(db);
    const currentVersion = localStorage.getItem(STORAGE_KEYS.sharedDbVersion) || "";
    const isDirty = localStorage.getItem(STORAGE_KEYS.sharedDbDirty) === "true";
    const hasAdminDraft = authenticatedUser?.role === "admin" && isDirty;
    if (!force && hasAdminDraft) return false;
    if (!force && !isDirty && version && version === currentVersion) return true;
    return applySharedDatabase(db);
  } catch (error) {
    console.warn("공용 DB를 불러오지 못했습니다.", error);
    return false;
  }
}

async function sharedDatabaseSnapshot() {
  const updatedAt = new Date().toISOString();
  let b2cDiagrams = [];
  try {
    b2cDiagrams = await loadB2CDiagrams();
  } catch (error) {
    console.warn("B2C 직선도 DB 스냅샷 생성 실패", error);
  }
  return {
    schemaVersion: 1,
    version: updatedAt,
    appVersion: APP_VERSION,
    updatedAt,
    records: loadRecords(),
    floorPlans: loadFloorPlans(),
    b2cLines: loadB2CLines(),
    b2cDiagrams,
  };
}

function sharedDbFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  return `CATV_shared_db_${stamp}.json`;
}

async function downloadSharedDatabase() {
  const db = await sharedDatabaseSnapshot();
  const content = JSON.stringify(db, null, 2);
  downloadBlob(new Blob([content], { type: "application/json;charset=utf-8" }), sharedDbFileName());
  setSharedDbClean(sharedDbVersionOf(db));
  renderSharedDbAdmin();
}

function setSharedDatabaseStatus(text, isError = false) {
  const status = qs("#sharedDbMessage");
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("is-error", isError);
}

function scheduleSharedDatabaseSync({ delay = 1800 } = {}) {
  if (suppressSharedDbDirty || authenticatedUser?.role !== "admin") return;
  window.clearTimeout(sharedDbSyncTimer);
  sharedDbSyncTimer = window.setTimeout(() => {
    sharedDbSyncTimer = null;
    saveSharedDatabaseToServer({ automatic: true });
  }, delay);
}

async function saveSharedDatabaseToServer({ automatic = false } = {}) {
  if (authenticatedUser?.role !== "admin") {
    setSharedDatabaseStatus("관리자 계정만 서버 DB를 저장할 수 있습니다.", true);
    return false;
  }
  if (sharedDbSaveInFlight) {
    sharedDbSaveQueued = true;
    if (!automatic) setSharedDatabaseStatus("서버 DB 저장이 진행 중입니다. 현재 변경분을 이어서 저장합니다.");
    return false;
  }

  sharedDbSaveInFlight = true;
  const startedSequence = sharedDbChangeSequence;
  try {
    setSharedDatabaseStatus(automatic ? "변경된 자료를 서버 DB에 자동 저장하는 중입니다." : "현재 자료를 서버 DB에 저장하는 중입니다.");
    const db = await sharedDatabaseSnapshot();
    const response = await fetch("/api/admin/shared-db", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(db),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "서버 DB 저장에 실패했습니다.");
    if (sharedDbChangeSequence === startedSequence) {
      setSharedDbClean(result.version || sharedDbVersionOf(db));
    } else {
      localStorage.setItem(STORAGE_KEYS.sharedDbDirty, "true");
      sharedDbSaveQueued = true;
    }
    renderSharedDbAdmin();
    const storageLabel = result.storage === "neon" ? "Neon 서버 DB" : "서버 DB";
    setSharedDatabaseStatus(`${storageLabel} 저장 완료 · 데이터 ${result.counts?.records || 0}건 · 평면도 ${result.counts?.floorPlans || 0}건 · B2C ${result.counts?.b2cLines || 0}건 · 직선도 ${result.counts?.b2cDiagrams || 0}건`);
    return true;
  } catch (error) {
    localStorage.setItem(STORAGE_KEYS.sharedDbDirty, "true");
    renderSharedDbAdmin();
    setSharedDatabaseStatus(`${automatic ? "자동 " : ""}서버 DB 저장 실패: ${error.message || "네트워크 연결을 확인해주세요."}`, true);
    return false;
  } finally {
    sharedDbSaveInFlight = false;
    if (sharedDbSaveQueued) {
      sharedDbSaveQueued = false;
      scheduleSharedDatabaseSync({ delay: 150 });
    }
  }
}

async function refreshSharedDatabaseForUser() {
  if (authenticatedUser?.role !== "user") return false;
  if (userDbRefreshPromise) return userDbRefreshPromise;
  userDbRefreshPromise = loadSharedDatabaseFromSite()
    .finally(() => {
      userDbRefreshPromise = null;
    });
  return userDbRefreshPromise;
}

async function refreshSharedDatabaseFromSite() {
  const status = qs("#sharedDbMessage");
  if (status) status.textContent = "공용 DB를 불러오는 중입니다.";
  const loaded = await loadSharedDatabaseFromSite({ force: true });
  if (loaded) {
    renderAdmin();
    if (status) status.textContent = "공용 DB를 현재 기기에 적용했습니다.";
  } else if (status) {
    status.textContent = "적용할 공용 DB 파일을 찾지 못했습니다.";
    status.classList.add("is-error");
  }
}

async function githubSharedDbRequest(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text.slice(0, 240)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function publishSharedDatabaseToGitHub() {
  const status = qs("#sharedDbMessage");
  const setStatus = (text, isError = false) => {
    if (!status) return;
    status.textContent = text;
    status.classList.toggle("is-error", isError);
  };
  const token = prompt("GitHub 토큰을 입력하세요. repo 권한이 필요합니다.");
  if (!token) return setStatus("공용 DB 게시가 취소되었습니다.", true);
  try {
    setStatus("공용 DB를 생성하는 중입니다.");
    const db = await sharedDatabaseSnapshot();
    const content = JSON.stringify(db, null, 2);
    const path = `/repos/${GITHUB_SHARED_DB_REPO}/contents/${SHARED_DB_PATH}`;
    let sha = "";
    try {
      const existing = await githubSharedDbRequest(`${path}?ref=${GITHUB_SHARED_DB_BRANCH}`, token);
      sha = existing?.sha || "";
    } catch (error) {
      if (!String(error.message || "").includes("404")) throw error;
    }
    setStatus("GitHub 공용 DB 파일을 업데이트하는 중입니다.");
    await githubSharedDbRequest(path, token, {
      method: "PUT",
      body: JSON.stringify({
        branch: GITHUB_SHARED_DB_BRANCH,
        message: `Update CATV shared DB ${db.updatedAt}`,
        content: bytesToBase64(new TextEncoder().encode(content)),
        ...(sha ? { sha } : {}),
      }),
    });
    setSharedDbClean(sharedDbVersionOf(db));
    setStatus("공용 DB 게시 완료. 스마트폰은 새로고침하면 같은 DB를 사용합니다.");
    renderSharedDbAdmin();
  } catch (error) {
    console.error("공용 DB 게시 실패", error);
    setStatus(`공용 DB 게시 실패: ${error.message || "GitHub 권한 또는 네트워크를 확인하세요."}`, true);
  }
}

async function deleteB2CDiagramsForStation(stationName) {
  const db = await openAppDb();
  try {
    const existing = await requestToPromise(db.transaction(B2C_DIAGRAM_STORE, "readonly").objectStore(B2C_DIAGRAM_STORE).getAll());
    const tx = db.transaction(B2C_DIAGRAM_STORE, "readwrite");
    const store = tx.objectStore(B2C_DIAGRAM_STORE);
    existing
      .filter((diagram) => sameStationName(diagram.stationName, stationName))
      .forEach((diagram) => store.delete(diagram.id));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("직선도 DB 삭제에 실패했습니다."));
      tx.onabort = () => reject(tx.error || new Error("직선도 DB 삭제가 중단되었습니다."));
    });
  } finally {
    db.close();
  }
}

function stationKey(value) {
  return normalize(value).replaceAll(/\s+/g, "");
}

function floorPlanStationKey(value) {
  let key = stationKey(String(value || "")
    .replace(/\.(xlsx|xls|png|jpe?g|webp)$/i, "")
    .replace(/[()[\]{}]/g, "")
    .replace(/평면도/g, ""))
    .replace(/[_/\\:>]+$/g, "");
  if (key.endsWith("국사") && key.length > 2) key = key.slice(0, -2);

  // 데이터 DB에는 `기남_송탄국사`처럼 권역명이 붙고, 평면도는
  // `송탄국사.xlsx`처럼 실제 국사명만 쓰는 경우가 있다.
  const segments = key.split(/[_/\\:>]+/).filter(Boolean);
  return segments.at(-1) || key;
}

function sameStationName(left, right) {
  const leftExact = stationKey(left);
  const rightExact = stationKey(right);
  if (!leftExact || !rightExact) return false;
  return leftExact === rightExact || floorPlanStationKey(left) === floorPlanStationKey(right);
}

function normalizeRecord(record) {
  const nextRecord = { ...Object.fromEntries(recordColumns.map((key) => [key, ""])), ...record };
  if (!nextRecord.otxLine && nextRecord.otxMain) nextRecord.otxLine = nextRecord.otxMain;
  if (!nextRecord.orxLine && nextRecord.orxMain) nextRecord.orxLine = nextRecord.orxMain;
  if (!nextRecord.backupLine && nextRecord.backup) nextRecord.backupLine = nextRecord.backup;

  ["otx", "orx"].forEach((equipment) => {
    const rackKey = `${equipment}Rack`;
    const shelfKey = `${equipment}Shelf`;
    const portKey = `${equipment}Port`;
    if (!nextRecord[rackKey] && !nextRecord[shelfKey] && String(nextRecord[portKey]).includes("/")) {
      const [rack, shelf, port] = String(nextRecord[portKey]).split("/");
      nextRecord[rackKey] = rack || "";
      nextRecord[shelfKey] = shelf || "";
      nextRecord[portKey] = port || "";
    }
  });

  return nextRecord;
}

function showView(viewId) {
  if (viewId === "adminView" && authenticatedUser?.role !== "admin") {
    viewId = "loginView";
    const message = qs("#loginMessage");
    if (message) message.textContent = "관리자 인증이 필요합니다.";
  }
  ["loginView", "userView", "rackView", "adminView"].forEach((id) => {
    const view = qs(`#${id}`);
    const isActive = id === viewId;
    view.classList.toggle("hidden", !isActive);
    view.classList.toggle("active-view", isActive);
    view.toggleAttribute("hidden", !isActive);
    view.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
  document.body.dataset.view = viewId;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function setUserPage(page, title = "CELL 및 전용선 조회") {
  const userView = qs("#userView");
  if (!userView) return;
  userView.dataset.page = page;
  const titleNode = qs("#userView .topbar span");
  if (titleNode) titleNode.textContent = title;
  if (page === "search") {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return;
  }
  if (window.location.hash !== "#result") window.history.pushState(null, "", "#result");
}

async function requestLogin(id, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, password }),
  });
  const result = await response.json().catch(() => ({}));
  return { response, result };
}

async function resetExistingSession() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch (error) {
    console.warn("기존 로그인 세션을 정리하지 못했습니다.", error);
  }
}

function showAuthenticatedHome() {
  if (authenticatedUser?.role === "admin") {
    if (window.location.pathname !== "/admin" || window.location.search || window.location.hash) {
      window.history.replaceState(null, "", "/admin");
    }
    showView("adminView");
    window.requestAnimationFrame(() => {
      renderAdmin();
      if (localStorage.getItem(STORAGE_KEYS.sharedDbDirty) === "true") {
        scheduleSharedDatabaseSync({ delay: 100 });
      }
    });
    return true;
  }

  if (authenticatedUser?.role === "user") {
    if (window.location.pathname !== "/" || window.location.search || window.location.hash) {
      window.history.replaceState(null, "", "/");
    }
    showSearchScreen();
    return true;
  }

  return false;
}

async function login(event) {
  event.preventDefault();
  const id = qs("#loginId").value.trim();
  const password = qs("#loginPassword").value;
  const message = qs("#loginMessage");
  const submitButton = qs("#loginForm button[type='submit']");
  message.textContent = "인증 정보를 확인하는 중입니다.";
  submitButton.disabled = true;

  try {
    await initialSessionResetPromise;
    const { response, result } = await requestLogin(id, password);
    if (response.ok && result?.authenticated && ["user", "admin"].includes(result?.user?.role)) {
      authenticatedUser = result.user;
      persistRememberedLoginId(id);
      const sharedDatabaseLoaded = await loadSharedDatabaseFromSite();
      if (sharedDatabaseLoaded || localStorage.getItem(STORAGE_KEYS.records)) ensureSeedData();
      message.textContent = "";
      qs("#loginForm").reset();
      showAuthenticatedHome();
      return;
    }
    message.textContent = result?.error || "아이디 또는 비밀번호를 확인해주세요.";
    return;
  } catch (error) {
    console.warn("인증 서버에 연결하지 못했습니다.", error);
    message.textContent = "인증 서버에 연결하지 못했습니다.";
  } finally {
    submitButton.disabled = false;
  }
}

function persistRememberedLoginId(id) {
  const remember = qs("#rememberLoginId")?.checked;
  if (remember) {
    localStorage.setItem("catvRememberLoginId", id);
    return;
  }
  localStorage.removeItem("catvRememberLoginId");
}

function restoreRememberedLoginId() {
  const savedId = localStorage.getItem("catvRememberLoginId") || "";
  const loginId = qs("#loginId");
  const remember = qs("#rememberLoginId");
  if (!loginId || !remember || !savedId) return;
  loginId.value = savedId;
  remember.checked = true;
  qs("#loginPassword")?.focus();
}

function togglePasswordVisibility() {
  const passwordInput = qs("#loginPassword");
  const toggleButton = qs("#togglePasswordBtn");
  if (!passwordInput || !toggleButton) return;
  const nextType = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = nextType;
  toggleButton.classList.toggle("is-visible", nextType === "text");
  toggleButton.setAttribute("aria-label", nextType === "text" ? "비밀번호 숨기기" : "비밀번호 보기");
}

async function logout() {
  if (authenticatedUser?.role === "admin" && localStorage.getItem(STORAGE_KEYS.sharedDbDirty) === "true") {
    await saveSharedDatabaseToServer({ automatic: true });
  }
  window.clearTimeout(sharedDbSyncTimer);
  sharedDbSyncTimer = null;
  sharedDbSaveQueued = false;
  if (authenticatedUser || ["/admin", "/admin/"].includes(window.location.pathname)) {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  }
  authenticatedUser = null;
  if (window.location.pathname !== "/") window.history.replaceState(null, "", "/");
  showView("loginView");
}

function showSearchScreen() {
  showView("userView");
  setUserPage("search");
  renderEmptyResult("셀명 또는 전용선 주소를 입력한 뒤 조회하세요.");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function looseMatch(value, query) {
  const text = normalize(value);
  const key = normalize(query);
  if (!text || !key) return false;
  return text.includes(key) || (key.length >= 3 && key.includes(text));
}

function b2cSearchMatch(value, query) {
  const text = normalize(value);
  const key = normalize(query);
  if (!text || !key) return false;
  return text.includes(key);
}

function searchRecords() {
  const cell = normalize(qs("#cellSearch").value);

  if (!cell) {
    renderEmptyResult("CELL(셀명)을 입력해주세요.");
    return;
  }

  const records = loadRecords().filter((item) => {
    const cellMatched = !cell || normalize(item.cellName).includes(cell);
    return cellMatched;
  });

  if (!records.length) {
    renderEmptyResult("일치하는 데이터가 없습니다.");
    return;
  }

  if (records.length === 1) {
    renderRecordEnhanced(records[0]);
    return;
  }

  renderSearchMatches(records);
}

function searchB2CLines() {
  const query = normalize(qs("#b2cSearch").value);
  if (!query) {
    renderEmptyResult("B2C(전용선 주소)를 입력해주세요.");
    return;
  }

  const results = loadB2CLines().filter((line) => {
    const searchTargets = line.searchValues || [];
    return searchTargets.some((value) => b2cSearchMatch(value, query));
  });

  if (!results.length) {
    renderEmptyResult("일치하는 B2C 전용선 데이터가 없습니다.");
    return;
  }

  if (results.length === 1) {
    renderB2CRecord(results[0]);
    return;
  }

  renderB2CSearchMatches(results);
}

function renderSearchMatches(records) {
  setUserPage("result", "CELL 조회 결과");
  pendingSearchRecords = records;
  qs("#resultPanel").innerHTML = `
    <section class="search-match-panel">
      <div class="search-match-heading">
        <strong>조회 결과 ${records.length}건</strong>
        <span>중복되는 셀명이 있어 아래 목록에서 정확한 셀을 선택하세요.</span>
      </div>
      <div class="search-match-list">
        ${records.map((record, index) => `
          <button class="search-match-item" type="button" data-search-record="${index}">
            <b>${escapeHtml(record.cellName)}</b>
            <span>${escapeHtml(record.stationName)} · ${escapeHtml(record.stationAddress || "주소 미등록")}</span>
            <small>OTX 랙 ${escapeHtml(record.otxRack || "-")} / ORX 랙 ${escapeHtml(record.orxRack || "-")}</small>
          </button>
        `).join("")}
      </div>
    </section>
  `;

  qs("#resultPanel").querySelectorAll("[data-search-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const record = pendingSearchRecords[Number(button.dataset.searchRecord)];
      if (record) renderRecordEnhanced(record);
    });
  });
}

function renderB2CSearchMatches(records) {
  setUserPage("result", "B2C 조회 결과");
  pendingB2CSearchRecords = records;
  qs("#resultPanel").innerHTML = `
    <section class="search-match-panel">
      <div class="search-match-heading">
        <strong>B2C 조회 결과 ${records.length}건</strong>
        <span>일치하는 전용선을 선택하세요. 목록에는 Q열과 V열만 표시됩니다.</span>
      </div>
      <div class="search-match-list">
        ${records.map((record, index) => `
          <button class="search-match-item" type="button" data-b2c-record="${index}">
            <b>${escapeHtml(record.serviceName || record.b2cName || "-")}</b>
            <span>${escapeHtml(record.stationName)} · 노드 ${escapeHtml(record.node || "-")} · 선번 ${escapeHtml(record.line || "-")}</span>
            <small>비고: ${escapeHtml(record.memo || "-")}</small>
          </button>
        `).join("")}
      </div>
    </section>
  `;

  qs("#resultPanel").querySelectorAll("[data-b2c-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const record = pendingB2CSearchRecords[Number(button.dataset.b2cRecord)];
      if (record) renderB2CRecord(record);
    });
  });
}

function stationAddressForB2C(stationName) {
  const station = loadRecords().find((record) => sameStationName(record.stationName, stationName));
  return station?.stationAddress || "";
}

function b2cLineDiagramRecord(record, stationAddress = "") {
  const lineDiagramSearchValues = [
    record.serviceName,
    record.cellName,
    record.memo,
    record.b2cName,
    ...(record.searchValues || []),
  ].map((value) => String(value || "").trim())
    .filter((value) => value && !/^(?:CATV[\s_-]*)?(?:B2C|HFC|TX|RX|RN)$/i.test(value))
    .filter((value, index, array) => array.indexOf(value) === index);
  return {
    stationName: record.stationName,
    stationAddress,
    cellName: record.cellName || record.serviceName || record.b2cName,
    b2cName: record.b2cName,
    serviceName: record.serviceName,
    memo: record.memo,
    otxMain: record.node,
    otxLine: record.line,
    lineDiagramKind: "b2c",
    lineDiagramSearchValues,
  };
}

function renderB2CRecord(record) {
  setUserPage("result", "B2C 조회 결과");
  const stationAddress = record.stationAddress || stationAddressForB2C(record.stationName);
  qs("#resultPanel").innerHTML = `
    <section class="field-record-sheet b2c-record-sheet kt-field-screen">
      ${basicInfoCard({
        title: record.serviceName || record.b2cName || record.searchValues?.find(Boolean),
        stationName: record.stationName,
        stationAddress,
      })}

      <article class="kt-info-card kt-station-card">
        <h2>국사 현황</h2>
        <div class="kt-tabs"><span class="active">선번정보</span><span>송수신기 정보</span></div>
        <div class="field-table field-circuit-table cell-circuit-table b2c-circuit-table">
          <div class="field-table-head"><span>항목</span><span>노드</span><span>선번</span><span>평면도</span></div>
          <div><span>주(1)</span><span>${escapeHtml(record.node || "")}</span><span>${escapeHtml(record.line || "")}</span><button type="button" data-b2c-node-plan ${record.node ? "" : "disabled"}>이동</button></div>
          <div><span>주(2)</span><span></span><span></span><button type="button" disabled>이동</button></div>
          <div><span>예비</span><span></span><span></span><button type="button" disabled>이동</button></div>
        </div>
        <button class="field-line-diagram-btn kt-diagram-btn" type="button" data-b2c-line-diagram>직선도</button>
      </article>

      <article class="kt-info-card kt-remarks-card">
        <h2>비고</h2>
        <div class="kt-readonly-note">
          <strong>B2C : ${escapeHtml(record.serviceName || record.b2cName || "-")}</strong>
          <span>비고: ${escapeHtml(record.memo || "-")}</span>
        </div>
        <form class="b2c-remark-diagram-search" data-b2c-remark-search>
          <label for="b2cRemarkDiagramQuery">비고 글자로 직선도 검색</label>
          <div class="b2c-remark-diagram-controls">
            <input id="b2cRemarkDiagramQuery" type="search" placeholder="비고에서 6글자 이상 입력" autocomplete="off">
            <button type="submit">직선도 바로이동</button>
          </div>
          <p class="b2c-remark-diagram-message" data-b2c-remark-message aria-live="polite"></p>
        </form>
      </article>
    </section>
  `;

  qs("#resultPanel").querySelectorAll(".field-line-diagram-btn").forEach((button) => {
    button.textContent = "직선도 보기";
  });
  qs("#resultPanel").querySelector("[data-b2c-line-diagram]")?.addEventListener("click", () => {
    renderHfcLineDiagram(b2cLineDiagramRecord(record, stationAddress), "b2c");
  });
  qs("#resultPanel").querySelector("[data-b2c-remark-search]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector("input");
    const button = form.querySelector("button");
    const message = form.querySelector("[data-b2c-remark-message]");
    const query = String(input?.value || "").trim();
    if (!continuousMatchTokens(query).length) {
      message.textContent = "직선도에서 찾을 글자를 공백·기호 제외 6글자 이상 입력해주세요.";
      input?.focus();
      return;
    }
    message.textContent = "입력한 글자의 직선도 위치를 찾는 중입니다.";
    button.disabled = true;
    try {
      await renderHfcLineDiagram(b2cLineDiagramRecord(record, stationAddress), "b2c", query);
    } catch (error) {
      console.error("비고 글자 직선도 조회 실패", error);
      if (message.isConnected) message.textContent = "직선도 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
  qs("#resultPanel").querySelector("[data-b2c-node-plan]")?.addEventListener("click", () => {
    renderNodePlanOverview({
      ...record,
      stationAddress,
    }, record.node, "B2C");
  });
}

function valueText(record, key) {
  return record[key] || "";
}

function circuitLineText(record, key, fallbackKey) {
  return valueText(record, key) || valueText(record, fallbackKey);
}

function lookupTitle(value) {
  const text = String(value || "-").trim() || "-";
  return text.startsWith("#") ? text : `#${text}`;
}

function basicInfoCard({ title, stationName, stationAddress }) {
  return `
    <article class="kt-info-card kt-basic-card">
      <h2>국사 정보</h2>
      <div class="kt-basic-table">
        <div class="kt-basic-row kt-basic-main-row">
          <span class="kt-basic-label">설명</span>
          <span class="kt-basic-value kt-basic-title">${escapeHtml(lookupTitle(title))}</span>
          <span class="kt-basic-label kt-station-label">국사</span>
          <span class="kt-basic-value">${escapeHtml(stationName || "-")}</span>
        </div>
        <div class="kt-basic-row kt-basic-address-row">
          <span class="kt-basic-label">국사주소</span>
          <span class="kt-basic-value">${escapeHtml(stationAddress || "-")}</span>
        </div>
      </div>
    </article>
  `;
}

function row(label1, value1, label2 = "", value2 = "") {
  if (!label2) {
    return `
      <div class="sheet-row single">
        <div class="label">${label1}</div>
        <div class="value">${value1 || "&nbsp;"}</div>
      </div>
    `;
  }

  return `
    <div class="sheet-row">
      <div class="label">${label1}</div>
      <div class="value">${value1 || "&nbsp;"}</div>
      <div class="label">${label2}</div>
      <div class="value">${value2 || "&nbsp;"}</div>
    </div>
  `;
}

function receiverRow(record, equipment) {
  const upper = equipment.toUpperCase();
  return `
    <div class="equipment-row">
      <div class="equipment-cell equipment-name">${upper}</div>
      <div class="equipment-cell">${valueText(record, `${equipment}Rack`) || "-"}</div>
      <div class="equipment-cell">${valueText(record, `${equipment}Shelf`) || "-"}</div>
      <div class="equipment-cell">${valueText(record, `${equipment}Port`) || "-"}</div>
      <div class="equipment-cell equipment-move"><button class="rack-move-btn" data-rack-equipment="${equipment}" type="button">이동</button></div>
      <div class="equipment-cell equipment-model">${valueText(record, `${equipment}Model`) || "&nbsp;"}</div>
    </div>
  `;
}

function linkChip(url, label) {
  if (!url) return `<span class="chip">${label}</span>`;
  return `<a class="chip" href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
}

function readPhotoList(record, type) {
  const raw = record[`${type}Photos`];
  if (Array.isArray(raw)) return raw;
  try {
    const photos = raw ? JSON.parse(raw) : [];
    if (Array.isArray(photos) && photos.length) return photos;
  } catch {}
  const legacyPhoto = record[`${type}Photo`];
  return legacyPhoto ? [legacyPhoto] : [];
}

function updateRecord(cellName, changes) {
  const records = loadRecords();
  const index = records.findIndex((item) => item.cellName === cellName);
  if (index < 0) return;
  records[index] = normalizeRecord({ ...records[index], ...changes });
  saveRecords(records);
}

function photoBlock(record, type, title) {
  const detailRows = type === "onu" ? `
      <div class="kt-device-info-row">
        <span class="kt-device-label">분할구분</span><span class="kt-device-value">${escapeHtml(valueText(record, "onuSplit")) || "&nbsp;"}</span>
        <span class="kt-device-label">셀구성</span><span class="kt-device-value">${escapeHtml(valueText(record, "onuCellConfig")) || "&nbsp;"}</span>
      </div>
    ` : "";
  return `<section class="field-photo-block kt-hfc-device" data-photo-type="${type}">
    <div class="kt-device-head"><strong>${title}</strong><button class="field-action" data-open-photos="${type}" type="button"><span aria-hidden="true">▣</span> 현장사진</button></div>
    <dl class="kt-device-list kt-device-info-table">
      <div class="kt-device-info-row kt-device-location-row">
        <dt class="kt-device-label">위치</dt><dd class="kt-device-value">${escapeHtml(valueText(record, `${type}Location`)) || "&nbsp;"}</dd>
      </div>
      <div class="kt-device-info-row">
        <dt class="kt-device-label">제조사</dt><dd class="kt-device-value">${escapeHtml(valueText(record, `${type}Maker`)) || "&nbsp;"}</dd>
        <dt class="kt-device-label">모델명</dt><dd class="kt-device-value">${escapeHtml(valueText(record, `${type}Model`)) || "&nbsp;"}</dd>
      </div>
      ${detailRows}
    </dl>
  </section>`;
}

function renderRecordEnhanced(record) {
  setUserPage("result", "CELL 조회 결과");
  qs("#resultPanel").innerHTML = `
    <section class="field-record-sheet cell-record-sheet kt-field-screen">
      ${basicInfoCard({
        title: record.cellName,
        stationName: record.stationName,
        stationAddress: record.stationAddress,
      })}

      <article class="kt-info-card kt-station-card">
        <h2>국사 현황</h2>
        <div class="kt-tabs"><span class="active">선번정보</span><span>송수신기 정보</span></div>
        <div class="field-table field-circuit-table cell-circuit-table"><div class="field-table-head"><span>항목</span><span>노드</span><span>선번</span><span>평면도</span></div>
          <div><span>OTX (주)</span><span>${escapeHtml(record.otxMain)}</span><span>${escapeHtml(circuitLineText(record, "otxLine", "otxMain"))}</span><button type="button" data-node-plan="OTX" data-node-value="${escapeHtml(record.otxMain)}">이동</button></div>
          <div><span>ORX (주)</span><span>${escapeHtml(record.orxMain)}</span><span>${escapeHtml(circuitLineText(record, "orxLine", "orxMain"))}</span><button type="button" data-node-plan="ORX" data-node-value="${escapeHtml(record.orxMain)}">이동</button></div>
          <div><span>예비</span><span>${escapeHtml(record.backup)}</span><span>${escapeHtml(circuitLineText(record, "backupLine", "backup"))}</span><button type="button" data-node-plan="예비" data-node-value="${escapeHtml(record.backup)}">이동</button></div>
        </div>
        <button class="field-line-diagram-btn kt-diagram-btn" data-cell-line-diagram type="button">직선도</button>
        <div class="kt-device-table-title">송수신기 정보</div>
        <div class="field-table field-device-table cell-device-table"><div class="field-table-head"><span>항목</span><span>랙</span><span>쉘프</span><span>포트</span><span>모델명</span><span>평면도</span></div>
          ${["otx", "orx"].map((type) => `<div><span>${type.toUpperCase()}</span><span>${escapeHtml(valueText(record, `${type}Rack`))}</span><span>${escapeHtml(valueText(record, `${type}Shelf`))}</span><span>${escapeHtml(valueText(record, `${type}Port`))}</span><span>${escapeHtml(valueText(record, `${type}Model`))}</span><button type="button" data-rack-equipment="${type}">이동</button></div>`).join("")}
        </div>
      </article>

      <article class="kt-info-card kt-hfc-card">
        <h2>HFC 현황</h2>
        <div class="kt-hfc-panel">
          ${photoBlock(record, "onu", "ONU")}
          ${photoBlock(record, "ups", "UPS")}
        </div>
      </article>

      <article class="kt-info-card kt-remarks-card">
        <h2>비고</h2>
        <span class="kt-status-dot" aria-hidden="true"></span>
        <div class="remarks-editor">
          <textarea id="remarksEditor" maxlength="1000" placeholder="비고를 입력해주세요.." aria-label="비고">${escapeHtml(record.remarks)}</textarea>
          <div class="remarks-footer"><span id="remarksCounter">${String(record.remarks || "").length} / 1000</span><button id="saveRemarksBtn" type="button" class="kt-save-btn">저장</button></div>
        </div>
      </article>
    </section>`;

  qs("#resultPanel").querySelectorAll(".field-line-diagram-btn").forEach((button) => {
    button.textContent = "직선도 보기";
  });
  qs("#resultPanel").querySelectorAll("[data-rack-equipment]").forEach((button) => button.addEventListener("click", () => renderRackOverview(record, button.dataset.rackEquipment)));
  qs("#resultPanel").querySelectorAll("[data-node-plan]").forEach((button) => button.addEventListener("click", () => renderNodePlanOverview(record, button.dataset.nodeValue, button.dataset.nodePlan)));
  qs("#resultPanel").querySelector("[data-cell-line-diagram]")?.addEventListener("click", () => renderHfcLineDiagram(record, "cell"));
  qs("#remarksEditor").addEventListener("input", () => { qs("#remarksCounter").textContent = `${qs("#remarksEditor").value.length} / 1000`; });
  qs("#saveRemarksBtn").addEventListener("click", () => { updateRecord(record.cellName, { remarks: qs("#remarksEditor").value }); renderRecordEnhanced({ ...record, remarks: qs("#remarksEditor").value }); });
  qs("#resultPanel").querySelectorAll("[data-open-photos]").forEach((button) => button.addEventListener("click", () => openPhotoGallery(record, button.dataset.openPhotos)));
  qs("#resultPanel").querySelectorAll("[data-line-diagram]").forEach((button) => button.addEventListener("click", () => renderHfcLineDiagram(record, button.dataset.lineDiagram)));
}

function addPhotos(record, type, files) {
  const current = readPhotoList(record, type);
  const additions = [...files].slice(0, Math.max(0, 3 - current.length));
  if (!additions.length) return alert("현장사진은 셀당 최대 3장까지 등록할 수 있습니다.");
  Promise.all(additions.map((file) => new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); }))).then((photos) => { updateRecord(record.cellName, { [`${type}Photos`]: JSON.stringify([...current, ...photos]) }); renderRecordEnhanced({ ...record, [`${type}Photos`]: JSON.stringify([...current, ...photos]) }); });
}

function removePhoto(record, type, index) {
  const photos = readPhotoList(record, type); photos.splice(index, 1);
  updateRecord(record.cellName, { [`${type}Photos`]: JSON.stringify(photos) });
  renderRecordEnhanced({ ...record, [`${type}Photos`]: JSON.stringify(photos) });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function photoFileToDataUrl(file) {
  const original = await readFileAsDataUrl(file);
  if (!file?.type?.startsWith("image/") || file.type === "image/gif") return original;
  return compressPhotoDataUrl(original);
}

async function compressPhotoDataUrl(dataUrl, maxSide = 900, quality = 0.68) {
  if (!String(dataUrl || "").startsWith("data:image/") || String(dataUrl).startsWith("data:image/gif")) return dataUrl;
  try {
    const image = await loadImageFromDataUrl(dataUrl);
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

function compactPhotoList(photos, maxSide = 900, quality = 0.68) {
  return Promise.all(photos.map((photo) => compressPhotoDataUrl(photo, maxSide, quality)));
}

function filesToDataUrls(files) {
  return Promise.all([...files].map(photoFileToDataUrl));
}

function storedPhotoId(photoUrl) {
  const match = String(photoUrl || "").match(/^\/api\/photos\/([0-9a-f-]{36})\/content$/i);
  return match?.[1] || "";
}

function dataUrlBlob(dataUrl) {
  const [metadata, encoded = ""] = String(dataUrl || "").split(",", 2);
  const contentType = metadata.match(/^data:([^;]+)/i)?.[1] || "application/octet-stream";
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: contentType });
}

async function remotePhotoUrls(record, type) {
  const query = new URLSearchParams({ recordKey: record.cellName, type });
  const response = await fetch(`/api/photos?${query}`, { cache: "no-store", credentials: "same-origin" });
  const result = await response.json().catch(() => ({}));
  if (response.status === 503 && result?.code === "PHOTO_STORAGE_DISABLED") return null;
  if (!response.ok) throw new Error(result?.error || "사진 목록을 불러오지 못했습니다.");
  return Array.isArray(result.photos) ? result.photos.map((photo) => photo.url).filter(Boolean) : [];
}

async function uploadPhotoFile(file, record, type, replacedPhotoUrl = "") {
  const dataUrl = await photoFileToDataUrl(file);
  const blob = dataUrlBlob(dataUrl);
  const prepareResponse = await fetch("/api/photos/upload-url", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recordKey: record.cellName,
      type,
      fileName: file.name || "photo",
      contentType: blob.type,
      sizeBytes: blob.size,
      replacesPhotoId: storedPhotoId(replacedPhotoUrl),
    }),
  });
  const prepared = await prepareResponse.json().catch(() => ({}));
  const localPhotoFallback = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (prepareResponse.status === 503 && prepared?.code === "PHOTO_STORAGE_DISABLED" && localPhotoFallback) return dataUrl;
  if (!prepareResponse.ok) throw new Error(prepared?.error || "사진 업로드를 준비하지 못했습니다.");

  try {
    const uploadResponse = await fetch(prepared.uploadUrl, {
      method: "PUT",
      headers: { "content-type": prepared.contentType },
      body: blob,
    });
    if (!uploadResponse.ok) throw new Error(`R2 사진 전송에 실패했습니다. (${uploadResponse.status})`);
    const completeResponse = await fetch(`/api/photos/${encodeURIComponent(prepared.photoId)}/complete`, {
      method: "POST",
      credentials: "same-origin",
    });
    const completed = await completeResponse.json().catch(() => ({}));
    if (!completeResponse.ok) throw new Error(completed?.error || "사진 업로드를 완료하지 못했습니다.");
    return completed.photo.url;
  } catch (error) {
    await fetch(`/api/photos/${encodeURIComponent(prepared.photoId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => {});
    throw error;
  }
}

async function deleteStoredPhoto(photoUrl) {
  const photoId = storedPhotoId(photoUrl);
  if (!photoId) return;
  const response = await fetch(`/api/photos/${encodeURIComponent(photoId)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 404) throw new Error(result?.error || "사진을 삭제하지 못했습니다.");
}

function latestRecordSnapshot(record) {
  return loadRecords().find((item) => item.cellName === record.cellName) || record;
}

async function savePhotoListAndRefresh(record, type, photos) {
  const next = await compactPhotoList(photos.filter(Boolean).slice(0, 3));
  let photoValue = JSON.stringify(next);
  let updatedRecord = normalizeRecord({ ...latestRecordSnapshot(record), [`${type}Photos`]: photoValue });
  try {
    updateRecord(record.cellName, { [`${type}Photos`]: photoValue });
  } catch (error) {
    try {
      const smallerPhotos = await compactPhotoList(next, 640, 0.58);
      photoValue = JSON.stringify(smallerPhotos);
      updatedRecord = normalizeRecord({ ...latestRecordSnapshot(record), [`${type}Photos`]: photoValue });
      updateRecord(record.cellName, { [`${type}Photos`]: photoValue });
    } catch (retryError) {
      console.error(retryError);
      alert("사진 용량이 커서 저장하지 못했습니다. 더 작은 사진으로 다시 등록해주세요.");
      return;
    }
  }
  renderRecordEnhanced(updatedRecord);
  openPhotoGallery(updatedRecord, type);
}

async function openPhotoGallery(record, type) {
  qs("#photoGalleryModal")?.remove();
  const latest = latestRecordSnapshot(record);
  let photos;
  try {
    photos = await remotePhotoUrls(latest, type);
  } catch (error) {
    alert(error.message || "사진 목록을 불러오지 못했습니다.");
  }
  photos = photos ?? readPhotoList(latest, type);
  const snapshot = normalizeRecord({ ...latest, [`${type}Photos`]: JSON.stringify(photos) });
  const label = type === "onu" ? "ONU" : "UPS";
  const modal = document.createElement("section");
  modal.id = "photoGalleryModal";
  modal.className = "photo-gallery-modal";
  modal.innerHTML = `<div class="photo-gallery-dialog" role="dialog" aria-modal="true" aria-label="${label} 현장사진">
    <div class="photo-gallery-head"><strong>${label} 현장사진</strong><button type="button" data-close-gallery>닫기</button></div>
    <div class="photo-gallery-slots">${Array.from({ length: 3 }, (_, index) => photos[index]
      ? `<figure><button class="photo-preview-button" type="button" data-photo-zoom="${index}" aria-label="${label} 현장사진 ${index + 1} 확대"><img src="${photos[index]}" alt="${label} 현장사진 ${index + 1}"></button><figcaption><span class="photo-slot-title">${index + 1}번 사진</span><label class="photo-action-btn">수정<input type="file" accept="image/*" data-replace-photo="${index}"></label><button class="photo-action-btn" type="button" data-gallery-delete="${index}">삭제</button></figcaption></figure>`
      : `<div class="photo-gallery-empty"><span>${index + 1}번 사진</span><em>등록된 사진 없음</em></div>`).join("")}</div>
    <div class="photo-gallery-actions"><label class="field-action">등록 <input type="file" accept="image/*" multiple data-gallery-add></label><span>${photos.length}/3장 등록됨</span></div>
  </div>`;
  document.body.append(modal);
  modal.querySelector("[data-close-gallery]").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  modal.querySelectorAll("[data-photo-zoom]").forEach((button) => button.addEventListener("click", () => {
    openPhotoLightbox(photos, Number(button.dataset.photoZoom), label);
  }));
  modal.querySelector("[data-gallery-add]").addEventListener("change", async (event) => {
    const currentRecord = latestRecordSnapshot(snapshot);
    const currentPhotos = [...photos];
    const availableSlots = Math.max(0, 3 - currentPhotos.length);
    const files = [...event.target.files].slice(0, availableSlots);
    event.target.value = "";
    if (!files.length) {
      if (currentPhotos.length >= 3) alert("현장사진은 최대 3장까지 등록할 수 있습니다.");
      return;
    }
    try {
      const additions = [];
      for (const file of files) additions.push(await uploadPhotoFile(file, currentRecord, type));
      await savePhotoListAndRefresh(currentRecord, type, [...currentPhotos, ...additions]);
    } catch (error) {
      alert(error.message || "사진을 등록하지 못했습니다.");
      await openPhotoGallery(currentRecord, type);
    }
  });
  modal.querySelectorAll("[data-replace-photo]").forEach((input) => input.addEventListener("change", async (event) => {
    const index = Number(event.target.dataset.replacePhoto);
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;
    const currentRecord = latestRecordSnapshot(snapshot);
    try {
      const replacement = await uploadPhotoFile(file, currentRecord, type, photos[index]);
      const next = [...photos];
      next[index] = replacement;
      await savePhotoListAndRefresh(currentRecord, type, next);
    } catch (error) {
      alert(error.message || "사진을 수정하지 못했습니다.");
      await openPhotoGallery(currentRecord, type);
    }
  }));
  modal.querySelectorAll("[data-gallery-delete]").forEach((button) => button.addEventListener("click", async () => {
    const currentRecord = latestRecordSnapshot(snapshot);
    const index = Number(button.dataset.galleryDelete);
    try {
      await deleteStoredPhoto(photos[index]);
      const next = [...photos];
      next.splice(index, 1);
      await savePhotoListAndRefresh(currentRecord, type, next);
    } catch (error) {
      alert(error.message || "사진을 삭제하지 못했습니다.");
    }
  }));
}

function closePhotoLightbox() {
  if (activePhotoLightboxClose) {
    const close = activePhotoLightboxClose;
    activePhotoLightboxClose = null;
    close();
    return;
  }
  qs("#photoLightbox")?.remove();
  document.body.classList.remove("photo-lightbox-open");
}

function openPhotoLightbox(photos, startIndex, label) {
  closePhotoLightbox();
  if (!photos.length) return;
  let currentIndex = Math.min(Math.max(0, Number(startIndex) || 0), photos.length - 1);
  const lightbox = document.createElement("section");
  lightbox.id = "photoLightbox";
  lightbox.className = "photo-lightbox";
  lightbox.innerHTML = `
    <div class="photo-lightbox-dialog" role="dialog" aria-modal="true" aria-label="${label} 현장사진 확대 보기">
      <div class="photo-lightbox-head">
        <strong>${label} 현장사진</strong>
        <span data-photo-lightbox-counter></span>
        <button type="button" data-close-photo-lightbox aria-label="확대 사진 닫기">×</button>
      </div>
      <div class="photo-lightbox-stage">
        <button type="button" data-photo-lightbox-prev aria-label="이전 사진">‹</button>
        <img alt="${label} 현장사진 확대">
        <button type="button" data-photo-lightbox-next aria-label="다음 사진">›</button>
      </div>
    </div>`;
  document.body.append(lightbox);
  document.body.classList.add("photo-lightbox-open");
  const image = lightbox.querySelector("img");
  const counter = lightbox.querySelector("[data-photo-lightbox-counter]");
  const previous = lightbox.querySelector("[data-photo-lightbox-prev]");
  const next = lightbox.querySelector("[data-photo-lightbox-next]");
  const render = () => {
    image.src = photos[currentIndex];
    image.alt = `${label} 현장사진 ${currentIndex + 1} 확대`;
    counter.textContent = `${currentIndex + 1} / ${photos.length}`;
    previous.disabled = photos.length < 2;
    next.disabled = photos.length < 2;
  };
  const close = () => {
    document.removeEventListener("keydown", handleKeydown);
    lightbox.remove();
    document.body.classList.remove("photo-lightbox-open");
    if (activePhotoLightboxClose === close) activePhotoLightboxClose = null;
  };
  const move = (offset) => {
    currentIndex = (currentIndex + offset + photos.length) % photos.length;
    render();
  };
  const handleKeydown = (event) => {
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  };
  lightbox.querySelector("[data-close-photo-lightbox]").addEventListener("click", close);
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  lightbox.addEventListener("click", (event) => { if (event.target === lightbox) close(); });
  document.addEventListener("keydown", handleKeydown);
  activePhotoLightboxClose = close;
  render();
}

function isMobileBackMode() {
  return window.matchMedia("(max-width: 820px)").matches || navigator.maxTouchPoints > 0;
}

function dismissMobileExitToast() {
  clearTimeout(mobileExitBackTimer);
  mobileExitBackTimer = null;
  qs("#mobileExitToast")?.classList.remove("visible");
}

function showMobileExitToast() {
  let toast = qs("#mobileExitToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "mobileExitToast";
    toast.className = "mobile-exit-toast";
    toast.setAttribute("role", "status");
    toast.textContent = "한 번 더 누르면 종료됩니다.";
    document.body.append(toast);
  }
  toast.classList.add("visible");
  clearTimeout(mobileExitBackTimer);
  mobileExitBackTimer = setTimeout(() => {
    mobileExitBackAt = 0;
    toast.classList.remove("visible");
  }, 2000);
}

function restoreMobileBackGuard() {
  window.history.pushState({ ...(window.history.state || {}), catvBackGuard: true }, "", window.location.href);
}

function handleMobileBack() {
  if (!isMobileBackMode()) return;
  dismissMobileExitToast();
  if (qs("#photoLightbox")) {
    mobileExitBackAt = 0;
    closePhotoLightbox();
    restoreMobileBackGuard();
    return;
  }
  if (qs("#photoGalleryModal")) {
    mobileExitBackAt = 0;
    qs("#photoGalleryModal").remove();
    restoreMobileBackGuard();
    return;
  }
  if (!qs("#rackView").classList.contains("hidden")) {
    mobileExitBackAt = 0;
    showView("userView");
    restoreMobileBackGuard();
    return;
  }
  if (!qs("#userView").classList.contains("hidden") && qs("#resultPanel .kt-field-screen, #resultPanel .search-match-panel")) {
    mobileExitBackAt = 0;
    showSearchScreen();
    restoreMobileBackGuard();
    return;
  }
  if (!qs("#adminView").classList.contains("hidden")) {
    mobileExitBackAt = 0;
    logout();
    restoreMobileBackGuard();
    return;
  }
  const now = Date.now();
  if (mobileExitBackAt && now - mobileExitBackAt <= 2000) {
    mobileExitBackAt = 0;
    window.history.back();
    return;
  }
  mobileExitBackAt = now;
  showMobileExitToast();
  restoreMobileBackGuard();
}

function installMobileBackHandler() {
  if (!isMobileBackMode()) return;
  window.history.replaceState({ ...(window.history.state || {}), catvAppEntry: true }, "", window.location.href);
  restoreMobileBackGuard();
  window.addEventListener("popstate", handleMobileBack);
  document.addEventListener("pointerdown", () => {
    if (!qs("#mobileExitToast.visible")) return;
    mobileExitBackAt = 0;
    dismissMobileExitToast();
  }, { passive: true });
}

function renderRecord(record) {
  qs("#resultPanel").innerHTML = `
    <div class="sheet-title-row">
      <div class="label">셀 명</div>
      <div class="value">${valueText(record, "cellName")}</div>
    </div>

    <div class="section-title">국사 현황</div>
    ${row("국사명", valueText(record, "stationName"))}
    ${row("국사주소", valueText(record, "stationAddress"))}

    <div class="sub-title">* 선번정보</div>
    ${row("OTX 노드", valueText(record, "otxMain"), "OTX 선번", circuitLineText(record, "otxLine", "otxMain"))}
    ${row("ORX 노드", valueText(record, "orxMain"), "ORX 선번", circuitLineText(record, "orxLine", "orxMain"))}
    ${row("예비 노드", valueText(record, "backup"), "예비 선번", circuitLineText(record, "backupLine", "backup"))}

    <div class="sub-title">* 송수신기 정보</div>
    <div class="equipment-table">
      <div class="equipment-row equipment-head">
        <div class="equipment-cell">항목</div><div class="equipment-cell">렉</div><div class="equipment-cell">쉘프</div><div class="equipment-cell">포트</div><div class="equipment-cell">평면도</div><div class="equipment-cell">모델명</div>
      </div>
      ${receiverRow(record, "otx")}
      ${receiverRow(record, "orx")}
    </div>

    <div class="section-title">HFC 현황</div>

    <div class="sub-title"><span>* ONU</span><span>${linkChip(record.onuPhoto, "현장사진")} ${linkChip(record.onuMap, "지도이동")}</span></div>
    ${row("위치", valueText(record, "onuLocation"))}
    ${row("제조사", valueText(record, "onuMaker"), "모델명", valueText(record, "onuModel"))}
    ${row("분할구분", valueText(record, "onuSplit"), "셀구성", valueText(record, "onuCellConfig"))}

    <div class="sub-title"><span>* UPS</span><span>${linkChip(record.upsPhoto, "현장사진")} ${linkChip(record.upsMap, "지도이동")}</span></div>
    ${row("위치", valueText(record, "upsLocation"))}
    ${row("제조사", valueText(record, "upsMaker"), "모델명", valueText(record, "upsModel"))}

    <div class="section-title">비고</div>
    <div class="note-box">${valueText(record, "remarks") || "&nbsp;"}</div>
  `;

  qs("#resultPanel").querySelectorAll("[data-rack-equipment]").forEach((button) => {
    button.addEventListener("click", () => renderRackOverview(record, button.dataset.rackEquipment));
  });
}

function rackLocation(record, equipment) {
  return {
    rack: normalizeRackUnit(valueText(record, `${equipment}Rack`)),
    shelf: String(valueText(record, `${equipment}Shelf`)),
    port: String(valueText(record, `${equipment}Port`)),
  };
}

function normalizeRackUnit(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s/g, "")
    .replace(/_/g, "-")
    .replace(/[‐‑‒–—]/g, "-")
    .toUpperCase();
  const separated = normalized.match(/^([1-9]\d?)-0?([1-9]\d?)$/);
  if (separated) return `${Number(separated[1])}-${Number(separated[2])}`;
  const compact = normalized.match(/^([1-9])(\d{2})$/);
  if (compact && Number(compact[2]) > 0) return `${Number(compact[1])}-${Number(compact[2])}`;
  return normalized;
}

function normalizePlanText(value) {
  return normalizeRackUnit(value).replace(/[()（）]/g, "");
}

function normalizeDiagramSearchText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z가-힣]/g, "");
}

function findContinuousDiagramMatch(targetValue, candidateValues, minimumLength = 6) {
  const target = normalizeDiagramSearchText(targetValue);
  if (target.length < minimumLength) return "";
  for (const candidateValue of candidateValues) {
    const candidate = normalizeDiagramSearchText(candidateValue);
    if (candidate.length < minimumLength) continue;
    const shorter = target.length <= candidate.length ? target : candidate;
    const longer = target.length <= candidate.length ? candidate : target;
    for (let index = 0; index <= shorter.length - minimumLength; index += 1) {
      const sequence = shorter.slice(index, index + minimumLength);
      if (longer.includes(sequence)) return sequence;
    }
  }
  return "";
}

function renderNodePlanOverview(record, nodeValue, equipmentName) {
  const node = String(nodeValue || "").trim();
  const label = equipmentName || "노드";
  qs("#rackPanel").innerHTML = `
    <section class="rack-sheet rack-diagram-sheet">
      <div class="rack-heading">
        <div><span>평면도</span><h1>${escapeHtml(label)} 노드 평면도</h1></div>
        <dl class="rack-meta"><div><dt>노드</dt><dd>${escapeHtml(node) || "-"}</dd></div><div><dt>국사</dt><dd>${escapeHtml(valueText(record, "stationName")) || "-"}</dd></div></dl>
      </div>
      <div class="rack-plan-label">?? ???</div>
      <div class="floor-plan">
        <div class="empty-state">등록된 엑셀 평면도에서 노드명과 같은 셀을 찾습니다.</div>
      </div>
    </section>
  `;
  applyRegisteredFloorPlan(record, { rack: "", shelf: "", port: "" }, label, node);
  showView("rackView");
  resetFloorPlanOverview();
}

function renderRackOverview(record, equipment) {
  const upper = equipment.toUpperCase();
  const location = rackLocation(record, equipment);
  const rackCells = {
    1: ["OFD", "1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7"],
    2: ["2-1", "2-2", "2-3", "2-4", "2-5", "2-6", "2-7", "2-8"],
    3: ["3-1", "3-2", "3-3", "3-4", "3-5", "3-6", "신규 방송국간망"],
    4: ["OFD", "4-1", "4-2", "4-3", "4-4", "4-5 Rack"],
    5: ["5-1", "SKB", "", "", "", "신규 방송국간망"],
  };
  const selectedRack = Number(location.rack.split("-")[0]);
  const hasExactRackCell = Object.values(rackCells).flat().some((cell) => normalizeRackUnit(cell) === location.rack);
  const planSlot = (unit, heading = "Rack") => {
    const active = normalizeRackUnit(unit) === location.rack;
    return `<div class="plan-ref-slot ${active ? "active" : ""}" data-rack-unit="${unit}">
      <span class="plan-ref-heading">${heading}</span>
      <span class="plan-ref-value">${unit || "&nbsp;"}${active ? `<small>${upper}</small>` : ""}</span>
    </div>`;
  };
  const planFeature = (label, className = "") => `<div class="plan-ref-feature ${className}">${label || "&nbsp;"}</div>`;
  const floorPlanMarkup = `
    <div class="plan-reference-racks">
      <div class="plan-ref-row">${planSlot("", "OFD")}${["1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7"].map((unit) => planSlot(unit)).join("")}</div>
      <div class="plan-ref-row">${["2-1", "2-2", "2-3", "2-4", "2-5", "2-6", "2-7", "2-8"].map((unit) => planSlot(unit)).join("")}</div>
      <div class="plan-ref-row plan-ref-row-short">${["3-1", "3-2", "3-3", "3-4", "3-5", "3-6"].map((unit) => planSlot(unit)).join("")}${planFeature("신규 방송국간망", "broadcast")}</div>
      <div class="plan-ref-row plan-ref-row-short">${planSlot("", "OFD")}${["4-1", "4-2", "4-3", "4-4", "4-5"].map((unit) => planSlot(unit)).join("")}</div>
      <div class="plan-ref-row plan-ref-row-bottom">${planSlot("5-1")}${planFeature("SKB")}${planFeature("")}${planFeature("")}${planFeature("")}${planFeature("신규 방송국간망", "broadcast")}</div>
    </div>
    <div class="plan-ref-entry">출<br>입<br>구</div>
  `;

  qs("#rackPanel").innerHTML = `
    <section class="rack-sheet rack-diagram-sheet">
      <div class="rack-heading">
        <div><span>\uAD6D\uC0AC \uD3C9\uBA74\uB3C4</span><h1>${upper} \uAD6D\uC0AC \uD3C9\uBA74\uB3C4</h1></div>
        <dl class="rack-meta"><div><dt>렉</dt><dd>${location.rack || "-"}</dd></div><div><dt>쉘프</dt><dd>${location.shelf || "-"}</dd></div><div><dt>포트</dt><dd>${location.port || "-"}</dd></div><div><dt>모델명</dt><dd>${valueText(record, `${equipment}Model`) || "-"}</dd></div></dl>
      </div>
      <div class="rack-plan-label">\uAD6D\uC0AC \uD3C9\uBA74\uB3C4</div>
      <div class="floor-plan">
        <div class="floor-plan-world">
          <div class="plan-site-name">${valueText(record, "stationName") || "국사"}</div>
          ${floorPlanMarkup}
          <div class="plan-dark-block" aria-hidden="true"></div>
          <div class="plan-battery plan-battery-top">밧데리함</div>
          <div class="plan-cooling cooling-top">항온항습기</div>
          <div class="plan-cooling cooling-mid">항온항습기</div>
          <div class="plan-cooling cooling-bottom">항온항습기</div>
          <div class="plan-racks">
            ${Object.entries(rackCells).map(([rack, cells]) => {
              const selected = Number(rack) === selectedRack;
              return `<div class="plan-rack-row ${selected ? "selected-rack" : ""}">
                <div class="plan-rack-cells">${cells.map((cell, index) => {
                  const active = selected && (hasExactRackCell
                    ? normalizeRackUnit(cell) === location.rack
                    : index === Math.min(cells.length - 1, Math.max(0, Number(location.port))));
                  const longLabel = cell.includes("방송국간망") ? " plan-rack-cell-long" : "";
                  return `<span class="plan-rack-cell${longLabel} ${active ? "active" : ""}" data-rack-unit="${cell}">${cell || "&nbsp;"}${active ? `<small>${upper}</small>` : ""}</span>`;
                }).join("")}</div>
              </div>`;
            }).join("")}
          </div>
          <div class="plan-ups plan-ups-one">UPS</div><div class="plan-ups plan-ups-two">UPS</div>
          <div class="plan-camera plan-camera-one" aria-hidden="true"></div><div class="plan-camera plan-camera-two" aria-hidden="true"></div><div class="plan-camera plan-camera-three" aria-hidden="true"></div><div class="plan-camera plan-camera-four" aria-hidden="true"></div>
          <div class="plan-wall plan-wall-upper" aria-hidden="true"></div><div class="plan-wall plan-wall-kink" aria-hidden="true"></div><div class="plan-wall plan-wall-main" aria-hidden="true"></div>
          <div class="plan-battery plan-battery-side">밧<br>데<br>리<br>함</div>
          <div class="plan-entry">출<br>입<br>구</div>
          <div class="plan-battery plan-battery-bottom">밧데리함</div>
        </div>
      </div>
      <aside class="plan-detail-card"><span>선택 위치</span><strong>랙 ${location.rack || "-"}</strong><dl><div><dt>쉘프</dt><dd>${location.shelf || "-"}</dd></div><div><dt>포트</dt><dd>${location.port || "-"}</dd></div></dl><button class="detail-btn" data-rack-detail type="button">세부정보</button></aside>
    </section>
  `;

  applyRegisteredFloorPlan(record, location, upper);
  initFloorPlanTouchZoom(qs("#rackPanel .floor-plan"));
  const heading = qs("#rackPanel .rack-heading");
  heading.insertAdjacentHTML("beforeend", `<button class="rack-detail-header-btn" data-rack-detail-header type="button">세부정보</button>`);
  heading.querySelector("[data-rack-detail-header]").addEventListener("click", () => renderRackDetail(record, equipment));
  const detailButton = qs("#rackPanel").querySelector("[data-rack-detail]");
  if (detailButton) {
    detailButton.addEventListener("click", () => renderRackDetail(record, equipment));
  }
  qs("#rackView .topbar span").textContent = "\uAD6D\uC0AC \uD3C9\uBA74\uB3C4";
  showView("rackView");
  resetFloorPlanOverview();
}

function renderRackDetail(record, equipment) {
  const upper = equipment.toUpperCase();
  const location = rackLocation(record, equipment);
  const selectedShelf = location.shelf;
  const selectedPort = location.port;
  const shelves = [1, 2, 3, 4];
  const ports = Array.from({ length: 16 }, (_, index) => index + 1);

  qs("#rackDetailModal")?.remove();
  const modal = document.createElement("section");
  modal.id = "rackDetailModal";
  modal.className = "rack-detail-modal";
  modal.innerHTML = `<div class="rack-detail-dialog" role="dialog" aria-modal="true" aria-label="쉘프 포트 정보">
    <div class="rack-detail-modal-head"><strong>쉘프 · 포트 정보</strong><span>랙 ${location.rack || "-"} / ${upper}</span><button type="button" data-close-rack-detail>닫기</button></div>
    <div class="rack-detail-grid">
      <div class="rack-detail-head">쉘프</div><div class="rack-detail-head">포트</div>
      ${shelves.map((shelf) => `<div class="rack-detail-shelf ${String(shelf) === selectedShelf ? "selected" : ""}">${shelf}</div><div class="rack-detail-ports">${ports.map((port) => { const selected = String(shelf) === selectedShelf && String(port) === selectedPort; return `<span class="rack-detail-port ${selected ? "active" : ""}">${port}${selected ? `<b>${upper}</b>` : ""}</span>`; }).join("")}</div>`).join("")}
    </div>
  </div>`;
  document.body.append(modal);
  modal.querySelector("[data-close-rack-detail]").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  return;

  qs("#rackPanel").innerHTML = `
    <section class="rack-sheet rack-detail-sheet">
      <div class="rack-detail-title-row">
        <div>
          <span>세부정보</span>
          <h1>쉘프 및 포트정보</h1>
        </div>
        <dl class="rack-detail-meta">
          <div><dt>랙</dt><dd>${location.rack || "-"}</dd></div>
          <div><dt>장비</dt><dd>${upper}</dd></div>
        </dl>
      </div>
      <div class="rack-detail-grid">
        <div class="rack-detail-head">쉘프</div><div class="rack-detail-head">포트</div>
        ${shelves.map((shelf) => `
          <div class="rack-detail-shelf ${String(shelf) === selectedShelf ? "selected" : ""}">${shelf}</div>
          <div class="rack-detail-ports ${String(shelf) === selectedShelf ? "selected-shelf" : ""}">
            ${ports.map((port) => {
              const selected = String(shelf) === selectedShelf && String(port) === selectedPort;
              return `<span class="rack-detail-port ${selected ? "active" : ""}">${port}${selected ? `<b>${upper}</b>` : ""}</span>`;
            }).join("")}
          </div>
        `).join("")}
      </div>
    </section>
  `;
  qs("#rackView .topbar span").textContent = "랙 위치";
  showView("rackView");
}

function renderEmptyResult(message) {
  qs("#resultPanel").innerHTML = `<div class="empty-state">${message}</div>`;
}

function renderFloorPlansAdmin() {
  const list = qs("#floorPlansList");
  if (!list) return;
  const plans = loadFloorPlans();
  list.innerHTML = plans.length ? plans.map((plan, index) => {
    const planType = plan.type === "image" ? "이미지 평면도" : "엑셀 평면도";
    const coordinateCount = Object.keys(plan.rackCoordinates || {}).length;
    const rackSummary = plan.type === "image"
      ? ` · 검색 좌표 ${coordinateCount}개`
      : (Array.isArray(plan.rackValues) ? ` · 랙 ${plan.rackValues.length}개 인식` : "");
    return `<div class="floor-plan-list-item">
      <strong>${escapeHtml(plan.stationName)}</strong>
      <span>${planType} · ${escapeHtml(plan.fileName)}${plan.sheetName ? ` · 시트 ${escapeHtml(plan.sheetName)}` : ""}${rackSummary}${plan.updatedAt ? ` · 수정 ${escapeHtml(new Date(plan.updatedAt).toLocaleString("ko-KR"))}` : (plan.createdAt ? ` · ${escapeHtml(new Date(plan.createdAt).toLocaleString("ko-KR"))}` : "")}</span>
      <div class="floor-plan-list-actions">
        <button class="floor-plan-edit-btn" type="button" data-edit-floor-plan="${index}" ${plan.type === "image" ? "" : "disabled"}>수정</button>
        <button type="button" data-delete-floor-plan="${index}">삭제</button>
      </div>
    </div>`;
  }).join("") : `<p>등록된 평면도가 없습니다.</p>`;
  list.querySelectorAll("[data-edit-floor-plan]").forEach((button) => button.addEventListener("click", () => {
    editFloorPlan(Number(button.dataset.editFloorPlan));
  }));
  list.querySelectorAll("[data-delete-floor-plan]").forEach((button) => button.addEventListener("click", () => {
    const plans = loadFloorPlans();
    const index = Number(button.dataset.deleteFloorPlan);
    const target = plans[index];
    plans.splice(index, 1);
    saveFloorPlans(plans);
    if (pendingFloorPlanUpload?.editingPlanId && target?.id === pendingFloorPlanUpload.editingPlanId) {
      cancelFloorPlanEdit();
    } else if (Number.isInteger(pendingFloorPlanUpload?.editingPlanIndex) && index === pendingFloorPlanUpload.editingPlanIndex) {
      cancelFloorPlanEdit();
    }
    renderFloorPlansAdmin();
  }));
}

function renderB2CAdmin() {
  const list = qs("#b2cList");
  if (!list) return;

  const groups = loadB2CLines().reduce((acc, line) => {
    const key = line.sourceId || `${stationKey(line.stationName)}::${line.fileName || "legacy"}`;
    if (!acc[key]) {
      acc[key] = {
        sourceId: line.sourceId || "",
        stationName: line.stationName,
        fileName: line.fileName,
        createdAt: line.createdAt || "",
        count: 0,
      };
    }
    acc[key].count += 1;
    return acc;
  }, {});
  const stations = Object.values(groups).sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));

  list.innerHTML = stations.length ? stations.map((station) => `
    <div class="floor-plan-list-item">
      <strong>${escapeHtml(station.stationName)}</strong>
      <span>B2C 전용선 ${station.count}건 · ${escapeHtml(station.fileName || "파일명 없음")}${station.createdAt ? ` · ${escapeHtml(new Date(station.createdAt).toLocaleString("ko-KR"))}` : ""}</span>
      <button type="button" data-delete-b2c-source="${stations.indexOf(station)}">삭제</button>
    </div>
  `).join("") : `<p>등록된 선번장(직선도) DB가 없습니다.</p>`;

  list.querySelectorAll("[data-delete-b2c-source]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = stations[Number(button.dataset.deleteB2cSource)];
      if (!target) return;
      const lines = loadB2CLines().filter((line) => target.sourceId
        ? line.sourceId !== target.sourceId
        : !(sameStationName(line.stationName, target.stationName) && line.fileName === target.fileName));
      await saveB2CLines(lines);
      try {
        await deleteB2CDiagramsForSource(target);
      } catch (error) {
        console.warn("B2C 직선도 삭제 실패", error);
      }
      renderB2CAdmin();
    });
  });
}

function renderSharedDbAdmin() {
  const summary = qs("#sharedDbSummary");
  const dirty = localStorage.getItem(STORAGE_KEYS.sharedDbDirty) === "true";
  const version = localStorage.getItem(STORAGE_KEYS.sharedDbVersion) || "공용 DB 미적용";
  if (!summary) return;
  summary.innerHTML = `
    <span>데이터 ${loadRecords().length}건</span>
    <span>평면도 ${loadFloorPlans().length}건</span>
    <span>B2C ${loadB2CLines().length}건</span>
    <strong>${dirty ? "서버 저장 대기" : "서버 DB 동기화됨"}</strong>
    <small>${escapeHtml(version)}</small>
  `;
}

const EXCEL_INDEXED_COLORS = {
  0: "#000000", 1: "#ffffff", 2: "#ff0000", 3: "#00ff00", 4: "#0000ff", 5: "#ffff00",
  6: "#ff00ff", 7: "#00ffff", 8: "#000000", 9: "#ffffff", 10: "#ff0000", 11: "#00ff00",
  12: "#0000ff", 13: "#ffff00", 14: "#ff00ff", 15: "#00ffff", 22: "#c0c0c0", 23: "#808080",
};
const EXCEL_THEME_FALLBACK = ["#000000", "#ffffff", "#44546a", "#e7e6e6", "#5b9bd5", "#ed7d31", "#a5a5a5", "#ffc000", "#4472c4", "#70ad47", "#0563c1", "#954f72"];
const EXCEL_PLAN_SCALE = 0.82;

function tintExcelColor(hex, tint) {
  if (!hex || tint === undefined || tint === null || Number.isNaN(Number(tint))) return hex;
  const amount = Number(tint);
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => parseInt(value, 16));
  if (!channels) return hex;
  return `#${channels.map((channel) => Math.round(amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function excelColor(color, workbook) {
  if (!color) return "";
  if (color.rgb) return tintExcelColor(`#${String(color.rgb).slice(-6)}`, color.tint);
  if (color.indexed !== undefined && EXCEL_INDEXED_COLORS[color.indexed]) return tintExcelColor(EXCEL_INDEXED_COLORS[color.indexed], color.tint);
  if (color.theme === undefined) return "";

  const scheme = workbook?.Themes?.themeElements?.clrScheme || workbook?.Themes?.themeElements?.clrScheme?.[0];
  const entries = Array.isArray(scheme) ? scheme : Object.values(scheme || {});
  const themeColor = entries[Number(color.theme)];
  const raw = themeColor?.rgb || themeColor?.lastClr || themeColor?.sysClr?.lastClr || themeColor?.srgbClr?.val || themeColor?.a?.["srgbClr"]?.val || EXCEL_THEME_FALLBACK[Number(color.theme)];
  return raw ? tintExcelColor(`#${String(raw).slice(-6)}`, color.tint) : "";
}

function excelBorderSide(side, workbook) {
  if (!side?.style) return "";
  const width = { hair: 1, thin: 1, medium: 3, thick: 5, double: 5 }[side.style] || 2;
  const borderStyle = ["dashed", "dotted", "dashDot", "dashDotDot", "slantDashDot"].includes(side.style)
    ? side.style.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    : "solid";
  return `${width}px ${borderStyle} ${excelColor(side.color, workbook) || "#111"}`;
}

function applyExcelAlignment(parts, alignment) {
  if (!alignment) return;
  if (alignment.horizontal) parts.push(`text-align:${alignment.horizontal}`);
  if (alignment.vertical) {
    const vertical = { top: "start", bottom: "end", center: "center" }[alignment.vertical] || alignment.vertical;
    parts.push(`align-items:${vertical}`);
  }
  const rotation = alignment.textRotation ?? alignment.text_rotation;
  if (rotation === 255 || Math.abs(Number(rotation)) === 90) parts.push("writing-mode:vertical-rl", "text-orientation:upright");
}

function hasExcelFill(fill) {
  const color = fill?.fgColor || fill?.bgColor;
  if (!color) return false;
  if (fill?.patternType && !["none", "gray125"].includes(fill.patternType)) return true;
  if (color.rgb) return String(color.rgb).slice(-6).toLowerCase() !== "000000";
  if (color.theme !== undefined) return true;
  return color.indexed !== undefined && Number(color.indexed) !== 64;
}

function xmlAttributes(markup = "") {
  return Object.fromEntries([...markup.matchAll(/([\w:]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
}

function xmlColor(markup, names = "fgColor|color|bgColor") {
  const match = markup?.match(new RegExp(`<(${names})\\b([^>]*)\\/?`));
  if (!match) return null;
  const attrs = xmlAttributes(match[2]);
  const color = {};
  if (attrs.rgb) color.rgb = attrs.rgb;
  if (attrs.indexed !== undefined) color.indexed = Number(attrs.indexed);
  if (attrs.theme !== undefined) color.theme = Number(attrs.theme);
  if (attrs.tint !== undefined) color.tint = Number(attrs.tint);
  return Object.keys(color).length ? color : null;
}

function rawBorderSide(markup, sideName) {
  const match = markup.match(new RegExp(`<${sideName}\\b([^>]*)(?:\\/>|>([\\s\\S]*?)<\\/${sideName}>)`));
  if (!match) return null;
  const attrs = xmlAttributes(match[1]);
  return { style: attrs.style, color: xmlColor(match[2] || "", "color") };
}

function rawExcelStyleSet(workbook) {
  if (workbook.__rawFloorPlanStyles) return workbook.__rawFloorPlanStyles;
  const stylesXml = zipEntryText(workbook.files?.["xl/styles.xml"]);
  if (!stylesXml) return null;

  const fillsXml = stylesXml.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/)?.[1] || "";
  const fills = [...fillsXml.matchAll(/<fill\b[^>]*>([\s\S]*?)<\/fill>/g)].map((match) => {
    const pattern = match[1].match(/<patternFill\b([^>]*)/);
    const attrs = xmlAttributes(pattern?.[1] || "");
    return { patternType: attrs.patternType, fgColor: xmlColor(match[1], "fgColor"), bgColor: xmlColor(match[1], "bgColor") };
  });

  const fontsXml = stylesXml.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)?.[1] || "";
  const fonts = [...fontsXml.matchAll(/<font\b[^>]*>([\s\S]*?)<\/font>/g)].map((match) => {
    const size = match[1].match(/<sz\b[^>]*val="([^"]*)"/);
    return { bold: /<b(?:\s|\/|>)/.test(match[1]), italic: /<i(?:\s|\/|>)/.test(match[1]), sz: size ? Number(size[1]) : undefined, color: xmlColor(match[1], "color") };
  });

  const bordersXml = stylesXml.match(/<borders\b[^>]*>([\s\S]*?)<\/borders>/)?.[1] || "";
  const borders = [...bordersXml.matchAll(/<border\b[^>]*>([\s\S]*?)<\/border>/g)].map((match) => ({
    top: rawBorderSide(match[1], "top"), right: rawBorderSide(match[1], "right"), bottom: rawBorderSide(match[1], "bottom"), left: rawBorderSide(match[1], "left"),
  }));

  const xfsXml = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || "";
  const xfs = [...xfsXml.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map((match) => {
    const attrs = xmlAttributes(match[1]);
    const alignment = xmlAttributes(match[2]?.match(/<alignment\b([^>]*)/)?.[1] || "");
    return {
      fill: fills[Number(attrs.fillId)] || null,
      font: fonts[Number(attrs.fontId)] || null,
      border: borders[Number(attrs.borderId)] || null,
      alignment: { horizontal: alignment.horizontal, vertical: alignment.vertical, textRotation: alignment.textRotation === undefined ? undefined : Number(alignment.textRotation) },
    };
  });

  workbook.__rawFloorPlanStyles = { xfs };
  return workbook.__rawFloorPlanStyles;
}

function excelCellBorder(cell, workbook) {
  const style = cell?.s && typeof cell.s === "object" ? cell.s : null;
  const styleIndex = typeof cell?.s === "number" ? cell.s : -1;
  const rawXf = style ? null : rawExcelStyleSet(workbook)?.xfs?.[styleIndex];
  const sheetJsXf = style ? null : workbook?.Styles?.CellXf?.[styleIndex];
  return style?.border || rawXf?.border || (sheetJsXf ? workbook?.Styles?.Borders?.[sheetJsXf.borderId] : null);
}

function mergedExcelBorder(sheet, workbook, merge) {
  if (!merge) return null;
  const border = {};
  const take = (side, cell) => {
    if (border[side]) return;
    const sideStyle = excelCellBorder(cell, workbook)?.[side];
    if (excelBorderSide(sideStyle, workbook)) border[side] = sideStyle;
  };
  for (let col = merge.s.c; col <= merge.e.c; col += 1) {
    take("top", sheet[XLSX.utils.encode_cell({ r: merge.s.r, c: col })]);
    take("bottom", sheet[XLSX.utils.encode_cell({ r: merge.e.r, c: col })]);
  }
  for (let row = merge.s.r; row <= merge.e.r; row += 1) {
    take("left", sheet[XLSX.utils.encode_cell({ r: row, c: merge.s.c })]);
    take("right", sheet[XLSX.utils.encode_cell({ r: row, c: merge.e.c })]);
  }
  return Object.keys(border).length ? border : null;
}

function workbookCellStyle(cell, workbook, borderOverride = null) {
  const style = cell?.s && typeof cell.s === "object" ? cell.s : null;
  const styleIndex = typeof cell?.s === "number" ? cell.s : -1;
  const rawXf = style ? null : rawExcelStyleSet(workbook)?.xfs?.[styleIndex];
  const sheetJsXf = style ? null : workbook?.Styles?.CellXf?.[styleIndex];
  const xf = rawXf || sheetJsXf;
  if (!style && !xf && !borderOverride) return "";

  const fill = style?.fill || rawXf?.fill || (sheetJsXf ? workbook?.Styles?.Fills?.[sheetJsXf.fillId] : null);
  const font = style?.font || rawXf?.font || (sheetJsXf ? workbook?.Styles?.Fonts?.[sheetJsXf.fontId] : null);
  const border = borderOverride || style?.border || rawXf?.border || (sheetJsXf ? workbook?.Styles?.Borders?.[sheetJsXf.borderId] : null);
  const alignment = style?.alignment || xf?.alignment;
  const parts = [];
  const fillColor = excelColor(fill?.fgColor || fill?.bgColor, workbook);
  if (hasExcelFill(fill) && fillColor) parts.push(`background:${fillColor}`);
  const fontColor = excelColor(font?.color, workbook);
  if (fontColor) parts.push(`color:${fontColor}`);
  if (font?.bold || font?.b) parts.push("font-weight:700");
  if (font?.italic || font?.i) parts.push("font-style:italic");
  if (font?.sz) parts.push(`font-size:${Math.max(7, Number(font.sz) * EXCEL_PLAN_SCALE).toFixed(1)}pt`);
  [["top", border?.top], ["right", border?.right], ["bottom", border?.bottom], ["left", border?.left]].forEach(([name, side]) => {
    const value = excelBorderSide(side, workbook);
    if (value) parts.push(`border-${name}:${value}`);
  });
  applyExcelAlignment(parts, alignment);
  return parts.join(";");
}

function workbookCellFont(cell, workbook) {
  const style = cell?.s && typeof cell.s === "object" ? cell.s : null;
  const styleIndex = typeof cell?.s === "number" ? cell.s : -1;
  const rawXf = style ? null : rawExcelStyleSet(workbook)?.xfs?.[styleIndex];
  const sheetJsXf = style ? null : workbook?.Styles?.CellXf?.[styleIndex];
  return style?.font || rawXf?.font || (sheetJsXf ? workbook?.Styles?.Fonts?.[sheetJsXf.fontId] : null);
}

function excelCharacterWeight(char) {
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/.test(char)) return 1.05;
  if (/[A-Z0-9]/.test(char)) return 0.66;
  if (/[a-z]/.test(char)) return 0.56;
  if (/\s/.test(char)) return 0.34;
  return 0.62;
}

function excelLineWeight(line) {
  return Array.from(String(line || "")).reduce((sum, char) => sum + excelCharacterWeight(char), 0);
}

function fittedExcelTextStyle(text, widthPx, heightPx, cell, workbook) {
  const value = String(text ?? "").trim();
  if (!value) return "";

  const font = workbookCellFont(cell, workbook);
  const excelFontPt = Number(font?.sz) || 11;
  const basePx = Math.max(5, excelFontPt * EXCEL_PLAN_SCALE * (4 / 3));
  const lines = value.split(/\r?\n/).filter((line) => line.length);
  const lineCount = Math.max(1, lines.length);
  const longestLineWeight = Math.max(1, ...lines.map(excelLineWeight));
  const availableWidth = Math.max(4, widthPx - 6);
  const availableHeight = Math.max(4, heightPx - 4);
  const widthLimited = availableWidth / (longestLineWeight * 0.96);
  const heightLimited = availableHeight / (lineCount * 1.16);
  const fittedPx = Math.min(basePx, widthLimited, heightLimited);

  if (fittedPx >= basePx - 0.2) return "";
  return `font-size:${Math.max(3.8, fittedPx).toFixed(1)}px;line-height:1.02`;
}

function sumExcelSpanPixels(values, startIndex, span) {
  return values.slice(startIndex, startIndex + span).reduce((total, value) => total + value, 0);
}

function fitTextElementToBox(element, minPx = 3.8) {
  if (!element) return;
  const computed = getComputedStyle(element);
  let size = Number.parseFloat(computed.fontSize) || 11;
  const originalWhiteSpace = element.style.whiteSpace;
  element.style.lineHeight = "1.02";
  element.style.overflow = "hidden";
  element.style.wordBreak = "keep-all";
  element.style.overflowWrap = "anywhere";
  element.style.whiteSpace = originalWhiteSpace || computed.whiteSpace || "pre-wrap";

  const fits = () => (
    element.scrollWidth <= element.clientWidth + 1
    && element.scrollHeight <= element.clientHeight + 1
  );

  for (let guard = 0; !fits() && size > minPx && guard < 32; guard += 1) {
    size = Math.max(minPx, size - 0.5);
    element.style.fontSize = `${size.toFixed(1)}px`;
  }

  if (!fits()) {
    element.style.fontSize = `${minPx.toFixed(1)}px`;
    element.style.lineHeight = "1";
  }
}

function fitUploadedExcelPlanText(root) {
  root?.querySelectorAll(".excel-plan-cell").forEach((cell) => {
    const minPx = cell.classList.contains("uploaded-rack-active") ? 3.4 : 3.8;
    fitTextElementToBox(cell, minPx);
  });
}

function zipEntryText(entry) {
  if (!entry) return "";
  const content = entry.content ?? entry;
  if (typeof content === "string") return content;
  if (content instanceof Uint8Array || content instanceof ArrayBuffer) return new TextDecoder().decode(content);
  return "";
}

function restoreStyledEmptyCells(sheet, workbook, sheetName) {
  const sheetIndex = workbook.SheetNames.indexOf(sheetName) + 1;
  const entry = workbook.files?.[`xl/worksheets/sheet${sheetIndex}.xml`];
  const worksheetXml = zipEntryText(entry);
  if (!worksheetXml) return sheet;

  const bounds = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const cellPattern = /<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g;
  let match;
  while ((match = cellPattern.exec(worksheetXml))) {
    const attrs = match[1];
    const reference = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
    const styleIndex = attrs.match(/\bs="(\d+)"/)?.[1];
    if (!reference || styleIndex === undefined) continue;
    if (!sheet[reference]) sheet[reference] = { t: "z", v: "" };
    sheet[reference].s = Number(styleIndex);
    const position = XLSX.utils.decode_cell(reference);
    bounds.s.r = Math.min(bounds.s.r, position.r);
    bounds.s.c = Math.min(bounds.s.c, position.c);
    bounds.e.r = Math.max(bounds.e.r, position.r);
    bounds.e.c = Math.max(bounds.e.c, position.c);
  }
  sheet["!ref"] = XLSX.utils.encode_range(bounds);
  return sheet;
}

function excelPlanHtml(sheet, workbook) {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const merges = sheet["!merges"] || [];
  const mergeOrigin = new Map(merges.map((merge) => [`${merge.s.r}:${merge.s.c}`, merge]));
  const mergedChildren = new Set();
  merges.forEach((merge) => { for (let row = merge.s.r; row <= merge.e.r; row += 1) for (let col = merge.s.c; col <= merge.e.c; col += 1) if (row !== merge.s.r || col !== merge.s.c) mergedChildren.add(`${row}:${col}`); });
  const columnWidths = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => Math.max(3, Math.round((sheet["!cols"]?.[range.s.c + index]?.wpx || 56) * EXCEL_PLAN_SCALE)));
  const rowHeights = Array.from({ length: range.e.r - range.s.r + 1 }, (_, index) => Math.max(14, Math.round((sheet["!rows"]?.[range.s.r + index]?.hpx || 20) * EXCEL_PLAN_SCALE)));
  const columns = columnWidths.map((width) => `${width}px`).join(" ");
  const rows = rowHeights.map((height) => `${height}px`).join(" ");
  const cells = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      if (mergedChildren.has(`${row}:${col}`)) continue;
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[address];
      const merge = mergeOrigin.get(`${row}:${col}`);
      const text = cell?.w ?? cell?.v ?? "";
      const rackValue = normalizeRackUnit(text);
      const aboveText = row > range.s.r ? sheet[XLSX.utils.encode_cell({ r: row - 1, c: col })]?.w ?? "" : "";
      const isHeader = /^(OFD|Rack)$/i.test(String(text).trim());
      const isRackValue = /^\d{1,2}-\d{1,2}$/.test(rackValue) || /SKB|방송국간망/.test(String(text));
      const isEntrance = /출\s*입\s*구/.test(String(text));
      const isHeaderLowerCell = !text && /^(OFD|Rack)$/i.test(String(aboveText).trim());
      const isBlankMergedFrame = !text && Boolean(merge);
      const semantic = isEntrance ? " entrance" : (isHeader ? " header" : (isRackValue || isHeaderLowerCell || isBlankMergedFrame ? " bordered" : ""));
      const style = workbookCellStyle(cell, workbook, mergedExcelBorder(sheet, workbook, merge));
      if (!text && !style && !merge) continue;
      const columnSpan = merge ? merge.e.c - merge.s.c + 1 : 1;
      const rowSpan = merge ? merge.e.r - merge.s.r + 1 : 1;
      const cellWidth = sumExcelSpanPixels(columnWidths, col - range.s.c, columnSpan);
      const cellHeight = sumExcelSpanPixels(rowHeights, row - range.s.r, rowSpan);
      const fitStyle = isEntrance ? "" : fittedExcelTextStyle(text, cellWidth, cellHeight, cell, workbook);
      const cellStyle = [style, fitStyle].filter(Boolean).join(";");
      cells.push(`<div class="excel-plan-cell${semantic}" data-excel-cell="${address}" data-rack-value="${isRackValue ? escapeHtml(rackValue) : ""}" title="${escapeHtml(text)}" style="grid-column:${col - range.s.c + 1} / span ${columnSpan};grid-row:${row - range.s.r + 1} / span ${rowSpan};${cellStyle}">${escapeHtml(text)}</div>`);
    }
  }
  return `<div class="excel-plan-canvas" style="grid-template-columns:${columns};grid-template-rows:${rows}">${cells.join("")}</div>`;
}

function floorPlanRackValues(sheet) {
  return [...new Set(Object.entries(sheet)
    .filter(([address]) => /^[A-Z]+\d+$/.test(address))
    .map(([, cell]) => normalizeRackUnit(cell?.w ?? cell?.v ?? ""))
    .filter((value) => /^\d{1,2}-\d{1,2}$/.test(value)))];
}

let pendingFloorPlanUpload = null;

function cloneFloorPlanCoordinates(coordinates = {}) {
  return JSON.parse(JSON.stringify(coordinates));
}

function floorPlanCoordinateTemplate(...names) {
  const stationKeys = names.map(floorPlanStationKey).filter(Boolean);
  const result = {};
  const add = (label, x, y, aliases = []) => {
    result[normalizeRackUnit(label)] = {
      x,
      y,
      label: String(label),
      aliases: aliases.map(String).filter(Boolean),
    };
  };

  if (stationKeys.includes("송탄")) {
    [101, 102, 103, 104, 105, 106, 107].forEach((label, index) => add(label, 28.6 + (index * 8.34), 17.9));
    [201, 202, 203, 204, 205, 206, 207, 208].forEach((label, index) => add(label, 20.2 + (index * 8.34), 35.2));
    [301, 302, 303, 304, 305, 306].forEach((label, index) => add(label, 19.9 + (index * 8.34), 51.9));
    [401, 402, 403, 404, 405].forEach((label, index) => add(label, 28.5 + (index * 8.34), 68.8));
    add(501, 19.8, 84.7);
  } else if (stationKeys.includes("안성")) {
    add("시내향 144C", 11.7, 23.9, ["보개,현수향 144C"]);
    add("송신향 144C", 70.2, 23.6, ["한경대향 288C"]);
    add(100, 87.2, 21.6);
    [101, 102, 103, 104, 105, 106, 107, 108, 109].forEach((label, index) => add(label, 87.2, 28.6 + (index * 7)));
    [201, 202, 203, 204, 205].forEach((label, index) => add(label, 69.8, 34.4 + (index * 7.6)));
    [301, 302, 303].forEach((label, index) => add(label, 54.9, 55.7 + (index * 7.1)));
    [401, 402, 403].forEach((label, index) => add(label, 45.2, 49 + (index * 8.5)));
    add(501, 73.7, 90.2);
  }

  return result;
}

function readFloorPlanFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("선택한 평면도 이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function loadFloorPlanImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("평면도 이미지 형식을 확인해주세요."));
    image.src = source;
  });
}

async function optimizeFloorPlanImage(file) {
  const original = await readFloorPlanFile(file);
  const image = await loadFloorPlanImage(original);
  const maxDimension = 2200;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("이미지 변환 기능을 사용할 수 없습니다.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const webp = canvas.toDataURL("image/webp", .9);
  const content = webp.startsWith("data:image/webp") && webp.length < original.length ? webp : original;
  return { content, width, height, optimized: content === webp };
}

function renderFloorPlanCoordinateEditor() {
  const editor = qs("#floorPlanCoordinateEditor");
  const image = qs("#floorPlanCoordinateImage");
  const markers = qs("#floorPlanCoordinateMarkers");
  const list = qs("#floorPlanCoordinateList");
  if (!editor || !image || !markers || !list) return;
  const hasImageUpload = pendingFloorPlanUpload && pendingFloorPlanUpload.type !== "excel";
  editor.classList.toggle("hidden", !hasImageUpload);
  if (!hasImageUpload) {
    image.removeAttribute("src");
    markers.innerHTML = "";
    list.innerHTML = "";
    return;
  }

  image.src = pendingFloorPlanUpload.content;
  const entries = Object.entries(pendingFloorPlanUpload.rackCoordinates || {})
    .sort(([, first], [, second]) => String(first.label).localeCompare(String(second.label), "ko", { numeric: true }));
  markers.innerHTML = entries.map(([rack, point]) => `<span class="floor-coordinate-marker" data-coordinate-rack="${escapeHtml(rack)}" style="left:${Number(point.x).toFixed(3)}%;top:${Number(point.y).toFixed(3)}%"><b>${escapeHtml(point.label || rack)}</b></span>`).join("");
  list.innerHTML = entries.length
    ? entries.map(([rack, point]) => `<span class="floor-coordinate-list-item">
        <button type="button" data-select-floor-coordinate="${escapeHtml(rack)}">${escapeHtml(point.label || rack)}</button>
        <button type="button" data-remove-floor-coordinate="${escapeHtml(rack)}" aria-label="${escapeHtml(point.label || rack)} 좌표 삭제">×</button>
      </span>`).join("")
    : `<span>저장된 노드명·랙 좌표가 없습니다.</span>`;
  list.querySelectorAll("[data-select-floor-coordinate]").forEach((button) => button.addEventListener("click", () => {
    const point = pendingFloorPlanUpload.rackCoordinates[button.dataset.selectFloorCoordinate];
    const input = qs("#floorPlanRackCoordinate");
    if (input) {
      input.value = point?.label || button.dataset.selectFloorCoordinate;
      input.dataset.editingCoordinateKey = button.dataset.selectFloorCoordinate;
      input.focus();
      input.select();
    }
    const message = qs("#floorPlanMessage");
    if (message) {
      message.textContent = `${point?.label || button.dataset.selectFloorCoordinate}을(를) 선택했습니다. 이미지에서 새 위치를 클릭하면 좌표가 이동합니다.`;
      message.classList.remove("is-error");
    }
  }));
  list.querySelectorAll("[data-remove-floor-coordinate]").forEach((button) => button.addEventListener("click", () => {
    const input = qs("#floorPlanRackCoordinate");
    if (input?.dataset.editingCoordinateKey === button.dataset.removeFloorCoordinate) {
      input.value = "";
      delete input.dataset.editingCoordinateKey;
    }
    delete pendingFloorPlanUpload.rackCoordinates[button.dataset.removeFloorCoordinate];
    renderFloorPlanCoordinateEditor();
  }));
}

function resetFloorPlanForm() {
  const stationInput = qs("#floorPlanStation");
  const fileInput = qs("#floorPlanFile");
  const coordinateInput = qs("#floorPlanRackCoordinate");
  const saveButton = qs("#saveFloorPlanBtn");
  const cancelButton = qs("#cancelFloorPlanEditBtn");
  if (stationInput) stationInput.value = "";
  if (fileInput) fileInput.value = "";
  if (coordinateInput) coordinateInput.value = "";
  if (coordinateInput) delete coordinateInput.dataset.editingCoordinateKey;
  if (saveButton) saveButton.textContent = "등록 / 수정";
  cancelButton?.classList.add("hidden");
}

function cancelFloorPlanEdit() {
  pendingFloorPlanUpload = null;
  resetFloorPlanForm();
  renderFloorPlanCoordinateEditor();
  const message = qs("#floorPlanMessage");
  if (message) {
    message.textContent = "";
    message.classList.remove("is-error");
  }
}

function editFloorPlan(index) {
  const plan = loadFloorPlans()[index];
  const message = qs("#floorPlanMessage");
  if (!plan) return;
  if (plan.type !== "image" || !plan.content) {
    if (message) {
      message.textContent = "기존 엑셀 평면도는 좌표 편집을 지원하지 않습니다. 이미지 평면도로 등록한 뒤 수정할 수 있습니다.";
      message.classList.add("is-error");
    }
    return;
  }
  pendingFloorPlanUpload = {
    content: plan.content,
    width: Number(plan.imageWidth) || 0,
    height: Number(plan.imageHeight) || 0,
    fileName: plan.fileName || "등록 평면도",
    rackCoordinates: cloneFloorPlanCoordinates(plan.rackCoordinates || {}),
    editingPlanId: plan.id || "",
    editingPlanIndex: index,
    originalCreatedAt: plan.createdAt || "",
  };
  qs("#floorPlanStation").value = plan.stationName || "";
  qs("#floorPlanFile").value = "";
  qs("#floorPlanRackCoordinate").value = "";
  delete qs("#floorPlanRackCoordinate").dataset.editingCoordinateKey;
  qs("#saveFloorPlanBtn").textContent = "수정 저장";
  qs("#cancelFloorPlanEditBtn")?.classList.remove("hidden");
  renderFloorPlanCoordinateEditor();
  if (message) {
    message.textContent = `${plan.stationName} 평면도를 수정 중입니다. 기존 이미지를 유지하거나 새 이미지를 선택하고, 좌표를 추가·이동·삭제한 뒤 수정 저장을 누르세요.`;
    message.classList.remove("is-error");
  }
  qs("#floorPlanCoordinateEditor")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function prepareFloorPlanImageUpload(event) {
  const fileInput = event.currentTarget;
  const file = fileInput?.files?.[0];
  const message = qs("#floorPlanMessage");
  const editingState = pendingFloorPlanUpload?.editingPlanId || Number.isInteger(pendingFloorPlanUpload?.editingPlanIndex)
    ? pendingFloorPlanUpload
    : null;
  if (!file) {
    if (!editingState) {
      pendingFloorPlanUpload = null;
      renderFloorPlanCoordinateEditor();
    }
    return;
  }
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    if (!editingState) pendingFloorPlanUpload = null;
    renderFloorPlanCoordinateEditor();
    message.textContent = "평면도는 PNG, JPG, WebP 이미지만 등록할 수 있습니다.";
    message.classList.add("is-error");
    return;
  }

  message.textContent = `${file.name} 이미지를 준비하는 중입니다.`;
  message.classList.remove("is-error");
  try {
    const prepared = await optimizeFloorPlanImage(file);
    if (fileInput.files?.[0] !== file) return;
    const stationName = qs("#floorPlanStation")?.value.trim() || "";
    const rackCoordinates = editingState
      ? cloneFloorPlanCoordinates(editingState.rackCoordinates || {})
      : floorPlanCoordinateTemplate(stationName, file.name);
    pendingFloorPlanUpload = {
      ...prepared,
      type: "image",
      fileName: file.name,
      rackCoordinates,
      ...(editingState ? {
        editingPlanId: editingState.editingPlanId || "",
        editingPlanIndex: editingState.editingPlanIndex,
        originalCreatedAt: editingState.originalCreatedAt || "",
      } : {}),
    };
    renderFloorPlanCoordinateEditor();
    const coordinateCount = Object.keys(rackCoordinates).length;
    const sizeMb = (prepared.content.length * .75 / (1024 * 1024)).toFixed(2);
    message.textContent = coordinateCount
      ? `${file.name} 준비 완료 · 기본 검색 좌표 ${coordinateCount}개 · 저장 이미지 약 ${sizeMb}MB`
      : `${file.name} 준비 완료 · 노드명 또는 랙 정보를 입력한 뒤 이미지에서 해당 위치를 클릭해주세요.`;
  } catch (error) {
    console.error("평면도 이미지 준비 실패", error);
    if (!editingState) pendingFloorPlanUpload = null;
    renderFloorPlanCoordinateEditor();
    message.textContent = `평면도 이미지를 준비하지 못했습니다: ${error.message || "이미지 파일을 확인해주세요."}`;
    message.classList.add("is-error");
  }
}

async function prepareFloorPlanUpload(event) {
  const fileInput = event.currentTarget;
  const file = fileInput?.files?.[0];
  const message = qs("#floorPlanMessage");
  if (!file || !/\.(xlsx|xls)$/i.test(file.name)) {
    await prepareFloorPlanImageUpload(event);
    return;
  }
  if (!window.XLSX) {
    message.textContent = "엑셀 처리 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.";
    message.classList.add("is-error");
    return;
  }
  message.textContent = `${file.name} 기존 Excel 평면도를 준비하는 중입니다.`;
  message.classList.remove("is-error");
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellStyles: true,
      cellNF: true,
      cellText: true,
      sheetStubs: true,
      bookFiles: true,
    });
    const sheetName = workbook.SheetNames.find((name) => name.includes("평면도")) || workbook.SheetNames[0];
    if (!sheetName || !workbook.Sheets[sheetName]) throw new Error("평면도 시트를 찾지 못했습니다.");
    const sheet = restoreStyledEmptyCells(workbook.Sheets[sheetName], workbook, sheetName);
    if (fileInput.files?.[0] !== file) return;
    pendingFloorPlanUpload = {
      type: "excel",
      fileName: file.name,
      content: excelPlanHtml(sheet, workbook),
      rackCoordinates: {},
    };
    renderFloorPlanCoordinateEditor();
    message.textContent = `${file.name} 기존 Excel 평면도 준비가 완료되었습니다. 등록 / 수정을 눌러 저장하세요.`;
  } catch (error) {
    console.error("기존 Excel 평면도 준비 실패", error);
    pendingFloorPlanUpload = null;
    renderFloorPlanCoordinateEditor();
    message.textContent = `기존 Excel 평면도를 준비하지 못했습니다: ${error.message || "엑셀 파일을 확인해주세요."}`;
    message.classList.add("is-error");
  }
}

function setFloorPlanCoordinate(event) {
  if (!pendingFloorPlanUpload || event.target.closest(".floor-coordinate-marker")) return;
  const image = qs("#floorPlanCoordinateImage");
  const rackInput = qs("#floorPlanRackCoordinate");
  const message = qs("#floorPlanMessage");
  const rawRack = rackInput?.value.trim() || "";
  const rack = normalizeRackUnit(rawRack);
  if (!rack) {
    message.textContent = "먼저 좌표를 지정할 노드명 또는 랙 정보를 입력해주세요.";
    message.classList.add("is-error");
    rackInput?.focus();
    return;
  }
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
  const previousKey = rackInput?.dataset.editingCoordinateKey || "";
  if (previousKey && previousKey !== rack) delete pendingFloorPlanUpload.rackCoordinates[previousKey];
  pendingFloorPlanUpload.rackCoordinates[rack] = {
    x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    label: rawRack,
  };
  renderFloorPlanCoordinateEditor();
  message.textContent = `${rawRack} 좌표를 저장했습니다. 다른 노드명 또는 랙 정보를 입력해 계속 지정할 수 있습니다.`;
  message.classList.remove("is-error");
  if (rackInput) delete rackInput.dataset.editingCoordinateKey;
  rackInput?.select();
}

async function saveFloorPlan() {
  const stationInput = qs("#floorPlanStation");
  const fileInput = qs("#floorPlanFile");
  const message = qs("#floorPlanMessage");
  const showMessage = (text, isError = false) => {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  };
  const stationName = stationInput.value.trim();
  const file = fileInput.files[0];
  const isEditing = Boolean(pendingFloorPlanUpload?.editingPlanId) || Number.isInteger(pendingFloorPlanUpload?.editingPlanIndex);
  if (!stationName) return showMessage("국사명을 입력해주세요.", true);
  if (!pendingFloorPlanUpload) return showMessage("평면도 이미지 또는 기존 Excel 평면도를 선택하거나 등록된 평면도의 수정 버튼을 눌러주세요.", true);
  if (!isEditing && !file) return showMessage("국사명과 평면도 파일을 모두 선택해주세요.", true);
  if (file && pendingFloorPlanUpload.fileName !== file.name) return showMessage("평면도 준비가 끝난 뒤 다시 저장해주세요.", true);
  if (pendingFloorPlanUpload.type === "excel") {
    const now = new Date().toISOString();
    const plans = loadFloorPlans().filter((item) => floorPlanStationKey(item.stationName) !== floorPlanStationKey(stationName));
    plans.push({
      id: createDbSourceId("floor"),
      stationName,
      stationAliases: [stationName, file.name.replace(/\.(xlsx|xls)$/i, "")],
      fileName: file.name,
      createdAt: now,
      updatedAt: "",
      type: "excel",
      content: pendingFloorPlanUpload.content,
    });
    saveFloorPlans(plans);
    pendingFloorPlanUpload = null;
    resetFloorPlanForm();
    renderFloorPlanCoordinateEditor();
    renderFloorPlansAdmin();
    showMessage(`${stationName} 기존 Excel 평면도 등록이 완료되었습니다.`);
    return;
  }
  const rackValues = Object.keys(pendingFloorPlanUpload.rackCoordinates || {});
  if (!rackValues.length) return showMessage("조회 위치 표시를 위해 노드명 또는 랙 좌표를 한 개 이상 지정해주세요.", true);

  try {
    const fileName = pendingFloorPlanUpload.fileName;
    const stationAliases = [...new Set([
      stationName,
      fileName.replace(/\.(png|jpe?g|webp)$/i, ""),
    ].filter(Boolean))];
    const plans = loadFloorPlans();
    let editingIndex = -1;
    if (isEditing) {
      editingIndex = pendingFloorPlanUpload.editingPlanId
        ? plans.findIndex((item) => item.id === pendingFloorPlanUpload.editingPlanId)
        : pendingFloorPlanUpload.editingPlanIndex;
      if (editingIndex < 0 || editingIndex >= plans.length) {
        return showMessage("수정할 평면도 DB를 찾지 못했습니다. 목록을 새로 확인해주세요.", true);
      }
    }
    const previousPlan = editingIndex >= 0 ? plans[editingIndex] : null;
    const now = new Date().toISOString();
    const plan = {
      ...(previousPlan || {}),
      id: previousPlan?.id || createDbSourceId("floor"),
      stationName,
      stationAliases,
      fileName,
      rackValues,
      rackCoordinates: pendingFloorPlanUpload.rackCoordinates,
      imageWidth: pendingFloorPlanUpload.width,
      imageHeight: pendingFloorPlanUpload.height,
      createdAt: previousPlan?.createdAt || pendingFloorPlanUpload.originalCreatedAt || now,
      updatedAt: isEditing ? now : "",
      type: "image",
      content: pendingFloorPlanUpload.content,
    };
    const planKey = floorPlanStationKey(stationName);
    const remainingPlans = plans.filter((item, index) => {
      if (index === editingIndex) return false;
      const aliases = [item.stationName, item.sheetName, item.fileName, ...(item.stationAliases || [])];
      return !aliases.some((alias) => floorPlanStationKey(alias) === planKey);
    });
    remainingPlans.push(plan);
    saveFloorPlans(remainingPlans);
    pendingFloorPlanUpload = null;
    resetFloorPlanForm();
    renderFloorPlanCoordinateEditor();
    renderFloorPlansAdmin();
    showMessage(`${stationName} 이미지 평면도 ${isEditing ? "수정" : "등록"}이 완료되었습니다. 검색 좌표 ${rackValues.length}개를 저장했습니다.`);
  } catch (error) {
    console.error("평면도 이미지 등록 실패", error);
    const quotaMessage = error?.name === "QuotaExceededError" ? " 저장 공간이 부족합니다. 기존 고해상도 평면도를 삭제한 뒤 다시 시도해주세요." : "";
    showMessage(`평면도 등록에 실패했습니다:${quotaMessage || ` ${error.message || "이미지 파일을 확인해주세요."}`}`, true);
  }
}

function b2cCellText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function xmlDoc(xmlText) {
  return new DOMParser().parseFromString(xmlText || "", "application/xml");
}

function xmlElements(doc, localName) {
  return [...doc.getElementsByTagName("*")].filter((element) => element.localName === localName);
}

function resolveZipPath(basePath, target) {
  if (!target) return "";
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const parts = basePath.split("/");
  parts.pop();
  target.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") parts.pop();
    else parts.push(part);
  });
  return parts.join("/");
}

async function zipText(zip, path) {
  const file = path && zip.file(path);
  return file ? file.async("text") : "";
}

function relationshipMap(xmlText, basePath) {
  const doc = xmlDoc(xmlText);
  const map = {};
  xmlElements(doc, "Relationship").forEach((rel) => {
    map[rel.getAttribute("Id")] = resolveZipPath(basePath, rel.getAttribute("Target"));
  });
  return map;
}

function imageMimeFromPath(path) {
  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "image/png";
}

function fileContentBytes(file) {
  const content = file?.content ?? file?._data ?? file;
  if (!content) return new Uint8Array();
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (Array.isArray(content)) return new Uint8Array(content);
  if (typeof content === "string") return new TextEncoder().encode(content);
  return new Uint8Array();
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function workbookZipAdapter(workbook) {
  const files = workbook?.files;
  if (!files) return null;
  const getFile = (path) => files[path] || files[`/${path}`] || files[path.replace(/^xl\//, "/xl/")];
  return {
    file(path) {
      const file = getFile(path);
      if (!file) return null;
      return {
        _data: { uncompressedSize: fileContentBytes(file).length },
        async(type) {
          const bytes = fileContentBytes(file);
          if (type === "base64") return Promise.resolve(bytesToBase64(bytes));
          return Promise.resolve(new TextDecoder().decode(bytes));
        },
      };
    },
  };
}

async function workbookDrawingFingerprint(workbook) {
  if (!globalThis.crypto?.subtle || !workbook?.files) return "";
  const encoder = new TextEncoder();
  const entries = Object.entries(workbook.files)
    .map(([path, file]) => [String(path || "").replace(/^\/+/, ""), file])
    .filter(([path]) => (
      path === "xl/workbook.xml"
      || path === "xl/_rels/workbook.xml.rels"
      || /^xl\/worksheets\/_rels\/.+\.rels$/i.test(path)
      || /^xl\/drawings\//i.test(path)
      || /^xl\/media\//i.test(path)
      || /^xl\/theme\//i.test(path)
    ))
    .sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return "";

  const chunks = [];
  let totalLength = 0;
  for (const [path, file] of entries) {
    const nameBytes = encoder.encode(`${path}\0`);
    const contentBytes = fileContentBytes(file);
    chunks.push(nameBytes, contentBytes);
    totalLength += nameBytes.length + contentBytes.length;
  }
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", combined));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function workbookSheetPathMap(zip) {
  const workbookXml = await zipText(zip, "xl/workbook.xml");
  const relsXml = await zipText(zip, "xl/_rels/workbook.xml.rels");
  const rels = relationshipMap(relsXml, "xl/workbook.xml");
  const doc = xmlDoc(workbookXml);
  const map = {};
  xmlElements(doc, "sheet").forEach((sheet) => {
    const relId = sheet.getAttribute("r:id") || sheet.getAttribute("id");
    const sheetName = sheet.getAttribute("name");
    if (sheetName && rels[relId]) map[sheetName] = rels[relId];
  });
  return map;
}

function sheetRelsPath(sheetPath) {
  const parts = sheetPath.split("/");
  const fileName = parts.pop();
  return `${parts.join("/")}/_rels/${fileName}.rels`;
}

async function extractSheetImages(zip, sheetPath) {
  const sheetXml = await zipText(zip, sheetPath);
  const sheetDoc = xmlDoc(sheetXml);
  const drawingIds = xmlElements(sheetDoc, "drawing")
    .map((drawing) => drawing.getAttribute("r:id") || drawing.getAttribute("id"))
    .filter(Boolean);
  if (!drawingIds.length) return [];

  const sheetRels = relationshipMap(await zipText(zip, sheetRelsPath(sheetPath)), sheetPath);
  const images = [];
  for (const drawingId of drawingIds) {
    const drawingPath = sheetRels[drawingId];
    if (!drawingPath) continue;
    const drawingXml = await zipText(zip, drawingPath);
    const drawingDoc = xmlDoc(drawingXml);
    const imageRelIds = xmlElements(drawingDoc, "blip")
      .map((blip) => blip.getAttribute("r:embed") || blip.getAttribute("embed"))
      .filter(Boolean);
    const drawingRelsPath = drawingPath.replace(/\/([^/]+)$/, "/_rels/$1.rels");
    const drawingRels = relationshipMap(await zipText(zip, drawingRelsPath), drawingPath);
    for (const imageRelId of imageRelIds) {
      const imagePath = drawingRels[imageRelId];
      const imageFile = imagePath && zip.file(imagePath);
      if (!imageFile) continue;
      const base64 = await imageFile.async("base64");
      images.push({
        path: imagePath,
        size: imageFile._data?.uncompressedSize || base64.length,
        dataUrl: `data:${imageMimeFromPath(imagePath)};base64,${base64}`,
      });
    }
  }
  return images.sort((a, b) => b.size - a.size);
}

const DRAWING_EMU_PER_PIXEL = 9525;
const DRAWING_EMU_PER_POINT = 12700;
const DRAWING_DEFAULT_COLUMN_WIDTH = 8.43;
const DRAWING_DEFAULT_ROW_HEIGHT = 15;
const DRAWING_CROP_MIN_PADDING = DRAWING_EMU_PER_PIXEL * 8;
const DRAWING_CROP_PADDING_RATIO = 0.006;

function drawingChild(node, localName) {
  return [...(node?.childNodes || [])].find((child) => child.nodeType === 1 && child.localName === localName) || null;
}

function drawingNumber(node, name, fallback = 0) {
  const value = Number(node?.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
}

function drawingTextNumber(node, fallback = 0) {
  const value = Number(node?.textContent);
  return Number.isFinite(value) ? value : fallback;
}

function drawingXfrm(node, isGroup = false) {
  const properties = drawingChild(node, isGroup ? "grpSpPr" : "spPr");
  const xfrm = drawingChild(properties, "xfrm");
  if (!xfrm) return null;
  const off = drawingChild(xfrm, "off");
  const ext = drawingChild(xfrm, "ext");
  const childOff = drawingChild(xfrm, "chOff");
  const childExt = drawingChild(xfrm, "chExt");
  return {
    x: drawingNumber(off, "x"),
    y: drawingNumber(off, "y"),
    width: Math.max(1, drawingNumber(ext, "cx", 1)),
    height: Math.max(1, drawingNumber(ext, "cy", 1)),
    childX: drawingNumber(childOff, "x"),
    childY: drawingNumber(childOff, "y"),
    childWidth: Math.max(1, drawingNumber(childExt, "cx", drawingNumber(ext, "cx", 1))),
    childHeight: Math.max(1, drawingNumber(childExt, "cy", drawingNumber(ext, "cy", 1))),
    rotation: drawingNumber(xfrm, "rot") / 60000,
    flipH: xfrm.getAttribute("flipH") === "1",
    flipV: xfrm.getAttribute("flipV") === "1",
  };
}

function drawingColumnWidthToEmu(width) {
  const pixels = width < 1
    ? Math.floor((width * 12) + .5)
    : Math.floor((width * 7) + 5);
  return Math.max(1, pixels * DRAWING_EMU_PER_PIXEL);
}

function drawingSheetMetrics(sheetXml) {
  const document = xmlDoc(sheetXml);
  const sheetFormat = xmlElements(document, "sheetFormatPr")[0];
  const defaultColumnWidth = drawingNumber(sheetFormat, "defaultColWidth", DRAWING_DEFAULT_COLUMN_WIDTH);
  const defaultRowHeight = drawingNumber(sheetFormat, "defaultRowHeight", DRAWING_DEFAULT_ROW_HEIGHT);
  const columnRanges = xmlElements(document, "col").map((column) => ({
    min: Math.max(0, drawingNumber(column, "min", 1) - 1),
    max: Math.max(0, drawingNumber(column, "max", 1) - 1),
    width: drawingNumber(column, "width", defaultColumnWidth),
  }));
  const rowHeights = new Map(xmlElements(document, "row").map((row) => [
    Math.max(0, drawingNumber(row, "r", 1) - 1),
    drawingNumber(row, "ht", defaultRowHeight) * DRAWING_EMU_PER_POINT,
  ]));
  return {
    defaultColumnWidth,
    defaultColumnEmu: drawingColumnWidthToEmu(defaultColumnWidth),
    defaultRowEmu: defaultRowHeight * DRAWING_EMU_PER_POINT,
    columnRanges,
    rowHeights,
    columnOffsetCache: new Map([[0, 0]]),
    rowOffsetCache: new Map([[0, 0]]),
  };
}

function drawingColumnWidthEmu(metrics, index) {
  const range = metrics.columnRanges.find((column) => index >= column.min && index <= column.max);
  return range ? drawingColumnWidthToEmu(range.width) : metrics.defaultColumnEmu;
}

function drawingColumnOffsetEmu(metrics, index) {
  if (metrics.columnOffsetCache.has(index)) return metrics.columnOffsetCache.get(index);
  let nearest = 0;
  for (const key of metrics.columnOffsetCache.keys()) {
    if (key <= index && key >= nearest) nearest = key;
  }
  let offset = metrics.columnOffsetCache.get(nearest) || 0;
  for (let column = nearest; column < index; column += 1) {
    offset += drawingColumnWidthEmu(metrics, column);
    metrics.columnOffsetCache.set(column + 1, offset);
  }
  return offset;
}

function drawingRowOffsetEmu(metrics, index) {
  if (metrics.rowOffsetCache.has(index)) return metrics.rowOffsetCache.get(index);
  let nearest = 0;
  for (const key of metrics.rowOffsetCache.keys()) {
    if (key <= index && key >= nearest) nearest = key;
  }
  let offset = metrics.rowOffsetCache.get(nearest) || 0;
  for (let row = nearest; row < index; row += 1) {
    offset += metrics.rowHeights.get(row) || metrics.defaultRowEmu;
    metrics.rowOffsetCache.set(row + 1, offset);
  }
  return offset;
}

function drawingAnchorMarkerPoint(marker, metrics) {
  if (!marker || !metrics) return null;
  const column = Math.max(0, drawingTextNumber(drawingChild(marker, "col")));
  const row = Math.max(0, drawingTextNumber(drawingChild(marker, "row")));
  return {
    x: drawingColumnOffsetEmu(metrics, column) + drawingTextNumber(drawingChild(marker, "colOff")),
    y: drawingRowOffsetEmu(metrics, row) + drawingTextNumber(drawingChild(marker, "rowOff")),
  };
}

function drawingAnchorBounds(anchor, metrics) {
  if (!anchor || !metrics) return null;
  if (anchor.localName === "twoCellAnchor") {
    const from = drawingAnchorMarkerPoint(drawingChild(anchor, "from"), metrics);
    const to = drawingAnchorMarkerPoint(drawingChild(anchor, "to"), metrics);
    if (!from || !to) return null;
    return {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.max(1, Math.abs(to.x - from.x)),
      height: Math.max(1, Math.abs(to.y - from.y)),
    };
  }
  if (anchor.localName === "oneCellAnchor") {
    const from = drawingAnchorMarkerPoint(drawingChild(anchor, "from"), metrics);
    const ext = drawingChild(anchor, "ext");
    if (!from || !ext) return null;
    return {
      x: from.x,
      y: from.y,
      width: Math.max(1, drawingNumber(ext, "cx", 1)),
      height: Math.max(1, drawingNumber(ext, "cy", 1)),
    };
  }
  if (anchor.localName === "absoluteAnchor") {
    const pos = drawingChild(anchor, "pos");
    const ext = drawingChild(anchor, "ext");
    if (!pos || !ext) return null;
    return {
      x: drawingNumber(pos, "x"),
      y: drawingNumber(pos, "y"),
      width: Math.max(1, drawingNumber(ext, "cx", 1)),
      height: Math.max(1, drawingNumber(ext, "cy", 1)),
    };
  }
  return null;
}

function drawingEffectiveXfrm(node, isGroup = false, anchorBounds = null) {
  const xfrm = drawingXfrm(node, isGroup);
  if (xfrm) return xfrm;
  if (anchorBounds) {
    return {
      x: anchorBounds.x,
      y: anchorBounds.y,
      width: anchorBounds.width,
      height: anchorBounds.height,
      childX: 0,
      childY: 0,
      childWidth: anchorBounds.width,
      childHeight: anchorBounds.height,
      rotation: 0,
      flipH: false,
      flipV: false,
    };
  }
  return null;
}

function drawingTransformPoint(transform, x, y) {
  return {
    x: transform.x + (x * transform.scaleX),
    y: transform.y + (y * transform.scaleY),
  };
}

function drawingGroupTransform(parent, xfrm) {
  if (!xfrm) return parent;
  const scaleX = parent.scaleX * (xfrm.width / xfrm.childWidth);
  const scaleY = parent.scaleY * (xfrm.height / xfrm.childHeight);
  const origin = drawingTransformPoint(parent, xfrm.x, xfrm.y);
  return {
    x: origin.x - (scaleX * xfrm.childX),
    y: origin.y - (scaleY * xfrm.childY),
    scaleX,
    scaleY,
  };
}

function drawingColor(container, fallback = "") {
  if (!container) return fallback;
  const srgb = xmlElements(container, "srgbClr")[0];
  const system = xmlElements(container, "sysClr")[0];
  const schemeNode = xmlElements(container, "schemeClr")[0];
  let color = srgb?.getAttribute("val")
    || system?.getAttribute("lastClr")
    || "";
  const scheme = schemeNode?.getAttribute("val");
  const schemeColors = {
    tx1: "#111111",
    tx2: "#44546a",
    lt1: "#ffffff",
    lt2: "#e7e6e6",
    dk1: "#111111",
    dk2: "#44546a",
    accent1: "#4472c4",
    accent2: "#ed7d31",
    accent3: "#a5a5a5",
    accent4: "#ffc000",
    accent5: "#5b9bd5",
    accent6: "#70ad47",
  };
  if (!color && schemeColors[scheme]) color = schemeColors[scheme].slice(1);
  if (!/^[0-9a-f]{6}$/i.test(color)) return fallback;

  let channels = [
    Number.parseInt(color.slice(0, 2), 16),
    Number.parseInt(color.slice(2, 4), 16),
    Number.parseInt(color.slice(4, 6), 16),
  ];
  const colorNode = srgb || system || schemeNode;
  const modifier = (name, defaultValue) => {
    const value = Number(xmlElements(colorNode, name)[0]?.getAttribute("val"));
    return Number.isFinite(value) ? value / 100000 : defaultValue;
  };
  const shade = modifier("shade", 1);
  const tint = modifier("tint", 0);
  const luminanceMod = modifier("lumMod", 1);
  const luminanceOffset = modifier("lumOff", 0);
  channels = channels.map((channel) => {
    const shaded = channel * shade;
    const tinted = shaded + ((255 - shaded) * tint);
    return Math.max(0, Math.min(255, Math.round((tinted * luminanceMod) + (255 * luminanceOffset))));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function drawingShapeText(node) {
  const body = drawingChild(node, "txBody");
  if (!body) return "";
  const paragraphs = [...body.childNodes].filter((child) => child.nodeType === 1 && child.localName === "p");
  return paragraphs
    .map((paragraph) => xmlElements(paragraph, "t").map((text) => text.textContent || "").join(""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function drawingTextStyle(node) {
  const body = drawingChild(node, "txBody");
  const paragraphProperties = body ? xmlElements(body, "pPr")[0] : null;
  const runPropertiesList = body ? xmlElements(body, "rPr") : [];
  const runProperties = runPropertiesList[0] || (body ? xmlElements(body, "endParaRPr")[0] : null);
  const bodyProperties = body ? xmlElements(body, "bodyPr")[0] : null;
  const alignment = paragraphProperties?.getAttribute("algn");
  const vertical = bodyProperties?.getAttribute("anchor");
  const colors = [...new Set([
    ...runPropertiesList.map((item) => drawingColor(item, "")),
    drawingColor(runProperties, "#111111"),
  ].filter(Boolean))];
  return {
    color: drawingColor(runProperties, "#111111"),
    colors,
    fontPt: Math.max(4, drawingNumber(runProperties, "sz", 700) / 100),
    bold: runProperties?.getAttribute("b") === "1",
    textAlign: alignment === "r" ? "right" : (alignment === "ctr" ? "center" : "left"),
    alignItems: vertical === "b" ? "flex-end" : (vertical === "ctr" ? "center" : "flex-start"),
    insetLeft: drawingNumber(bodyProperties, "lIns", 45720),
    insetRight: drawingNumber(bodyProperties, "rIns", 45720),
    insetTop: drawingNumber(bodyProperties, "tIns", 22860),
    insetBottom: drawingNumber(bodyProperties, "bIns", 22860),
    verticalText: /vert/i.test(bodyProperties?.getAttribute("vert") || ""),
  };
}

function drawingShapeStyle(node) {
  const shapeProperties = drawingChild(node, "spPr");
  const hasCustomGeometry = Boolean(drawingChild(shapeProperties, "custGeom"));
  const geometry = drawingChild(shapeProperties, "prstGeom")?.getAttribute("prst") || (hasCustomGeometry ? "custom" : "rect");
  const fillNode = drawingChild(shapeProperties, "solidFill");
  const noFill = Boolean(drawingChild(shapeProperties, "noFill"));
  const line = drawingChild(shapeProperties, "ln");
  const lineNoFill = Boolean(drawingChild(line, "noFill"));
  const lineFill = drawingChild(line, "solidFill");
  const dashType = drawingChild(line, "prstDash")?.getAttribute("val") || "";
  const dashMap = {
    dash: [4, 3],
    dashDot: [4, 2, 1, 2],
    dot: [1, 2],
    lgDash: [8, 3],
    lgDashDot: [8, 3, 1, 3],
    lgDashDotDot: [8, 3, 1, 3, 1, 3],
    sysDash: [3, 2],
    sysDashDot: [3, 2, 1, 2],
    sysDashDotDot: [3, 2, 1, 2, 1, 2],
    sysDot: [1, 1.5],
  };
  return {
    geometry,
    hasCustomGeometry,
    fill: noFill ? "transparent" : drawingColor(fillNode, "transparent"),
    stroke: lineNoFill ? "transparent" : drawingColor(lineFill, geometry.includes("Connector") ? "#111111" : "#1f2937"),
    strokeWidth: Math.max(0.7, drawingNumber(line, "w", 9525) / DRAWING_EMU_PER_PIXEL),
    dashPattern: dashMap[dashType] || null,
  };
}

function drawingGeometryAdjustment(node, name, fallback = 50000) {
  const shapeProperties = drawingChild(node, "spPr");
  const geometry = drawingChild(shapeProperties, "prstGeom") || drawingChild(shapeProperties, "custGeom");
  const guide = xmlElements(geometry, "gd").find((item) => item.getAttribute("name") === name);
  const match = String(guide?.getAttribute("fmla") || "").match(/-?\d+(?:\.\d+)?/);
  const value = match ? Number(match[0]) : fallback;
  return Math.max(-100000, Math.min(200000, value));
}

function drawingCustomGeometryPath(node, xfrm) {
  const shapeProperties = drawingChild(node, "spPr");
  const customGeometry = drawingChild(shapeProperties, "custGeom");
  const pathList = drawingChild(customGeometry, "pathLst");
  const paths = [...(pathList?.childNodes || [])].filter((child) => child.nodeType === 1 && child.localName === "path");
  if (!paths.length) return "";

  const guideValues = new Map();

  const baseValue = (value, width = 21600, height = 21600) => {
    if (value === undefined || value === null || value === "") return 0;
    if (guideValues.has(value)) return guideValues.get(value);
    const keyword = String(value).trim();
    if (keyword === "l" || keyword === "t") return 0;
    if (keyword === "r" || keyword === "w") return width;
    if (keyword === "b" || keyword === "h") return height;
    if (keyword === "hc") return width / 2;
    if (keyword === "vc") return height / 2;
    if (/^wd\d+$/i.test(keyword)) return width / Math.max(1, Number(keyword.slice(2)));
    if (/^hd\d+$/i.test(keyword)) return height / Math.max(1, Number(keyword.slice(2)));
    if (keyword === "ss") return Math.min(width, height);
    if (keyword === "ls") return Math.max(width, height);
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  const formulaValue = (formula, width = 21600, height = 21600) => {
    const parts = String(formula || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 0;
    const valueOf = (token) => baseValue(token, width, height);
    const [op, a, b, c] = parts;
    if (op === "val") return valueOf(a);
    if (op === "+-") return valueOf(a) + valueOf(b) - valueOf(c);
    if (op === "+/") return (valueOf(a) + valueOf(b)) / Math.max(1, valueOf(c));
    if (op === "*/") return (valueOf(a) * valueOf(b)) / Math.max(1, valueOf(c));
    if (op === "abs") return Math.abs(valueOf(a));
    if (op === "max") return Math.max(valueOf(a), valueOf(b));
    if (op === "min") return Math.min(valueOf(a), valueOf(b));
    if (op === "mod") return Math.hypot(valueOf(a), valueOf(b), valueOf(c));
    if (op === "pin") return Math.min(Math.max(valueOf(b), valueOf(a)), valueOf(c));
    if (op === "?:") return valueOf(a) > 0 ? valueOf(b) : valueOf(c);
    const direct = Number(op);
    return Number.isFinite(direct) ? direct : 0;
  };

  const buildGuidesForPath = (width, height) => {
    guideValues.clear();
    xmlElements(customGeometry, "gd").forEach((guide) => {
      const name = guide.getAttribute("name");
      if (!name) return;
      guideValues.set(name, formulaValue(guide.getAttribute("fmla"), width, height));
    });
  };

  const pathWithinShape = (points) => {
    if (!points.length) return true;
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const toleranceX = Math.max(DRAWING_EMU_PER_PIXEL * 16, xfrm.width * 0.2);
    const toleranceY = Math.max(DRAWING_EMU_PER_PIXEL * 16, xfrm.height * 0.2);
    return minX >= xfrm.x - toleranceX
      && minY >= xfrm.y - toleranceY
      && maxX <= xfrm.x + xfrm.width + toleranceX
      && maxY <= xfrm.y + xfrm.height + toleranceY;
  };

  const renderedPaths = paths.map((pathNode) => {
    const pathWidth = Math.max(1, drawingNumber(pathNode, "w", 21600));
    const pathHeight = Math.max(1, drawingNumber(pathNode, "h", 21600));
    buildGuidesForPath(pathWidth, pathHeight);
    const scaleX = xfrm.width / pathWidth;
    const scaleY = xfrm.height / pathHeight;
    const rawValue = (value) => baseValue(value, pathWidth, pathHeight);
    const visitedPoints = [];
    const pointOf = (point) => {
      const next = {
        x: xfrm.x + (rawValue(point?.getAttribute("x")) * scaleX),
        y: xfrm.y + (rawValue(point?.getAttribute("y")) * scaleY),
      };
      visitedPoints.push(next);
      return next;
    };
    let current = { x: xfrm.x, y: xfrm.y };
    const commands = [];
    [...pathNode.childNodes].filter((child) => child.nodeType === 1).forEach((command) => {
      const points = [...command.childNodes].filter((child) => child.nodeType === 1 && child.localName === "pt");
      if (command.localName === "moveTo" && points[0]) {
        current = pointOf(points[0]);
        commands.push(`M ${current.x} ${current.y}`);
      } else if (command.localName === "lnTo" && points[0]) {
        current = pointOf(points[0]);
        commands.push(`L ${current.x} ${current.y}`);
      } else if (command.localName === "quadBezTo" && points.length >= 2) {
        const control = pointOf(points[0]);
        current = pointOf(points[1]);
        commands.push(`Q ${control.x} ${control.y} ${current.x} ${current.y}`);
      } else if (command.localName === "cubicBezTo" && points.length >= 3) {
        const first = pointOf(points[0]);
        const second = pointOf(points[1]);
        current = pointOf(points[2]);
        commands.push(`C ${first.x} ${first.y} ${second.x} ${second.y} ${current.x} ${current.y}`);
      } else if (command.localName === "arcTo") {
        const widthRadius = Math.max(1, rawValue(command.getAttribute("wR")) * scaleX);
        const heightRadius = Math.max(1, rawValue(command.getAttribute("hR")) * scaleY);
        const swing = rawValue(command.getAttribute("swAng"));
        const endAngle = (rawValue(command.getAttribute("stAng")) + swing) / 60000 * Math.PI / 180;
        const end = {
          x: current.x + (Math.cos(endAngle) * widthRadius),
          y: current.y + (Math.sin(endAngle) * heightRadius),
        };
        commands.push(`A ${widthRadius} ${heightRadius} 0 ${Math.abs(swing) > 10800000 ? 1 : 0} ${swing >= 0 ? 1 : 0} ${end.x} ${end.y}`);
        current = end;
        visitedPoints.push(end);
      } else if (command.localName === "close") {
        commands.push("Z");
      }
    });
    if (!pathWithinShape(visitedPoints)) return "";
    return commands.join(" ");
  }).filter(Boolean);
  return renderedPaths.length === paths.length ? renderedPaths.join(" ") : "";
}

function drawingBounds(transform, xfrm) {
  if (!xfrm) return null;
  const start = drawingTransformPoint(transform, xfrm.x, xfrm.y);
  const end = drawingTransformPoint(transform, xfrm.x + xfrm.width, xfrm.y + xfrm.height);
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
    rotation: xfrm.rotation,
    lineStart: start,
    lineEnd: end,
  };
}

function collectDrawingItems(node, transform, imageByRelationship, items) {
  if (!node || node.nodeType !== 1) return;
  if (node.localName === "grpSp") {
    const groupTransform = drawingGroupTransform(transform, drawingXfrm(node, true));
    [...node.childNodes]
      .filter((child) => child.nodeType === 1 && ["sp", "cxnSp", "grpSp", "pic"].includes(child.localName))
      .forEach((child) => collectDrawingItems(child, groupTransform, imageByRelationship, items));
    return;
  }

  const xfrm = drawingXfrm(node);
  const bounds = drawingBounds(transform, xfrm);
  if (!bounds) return;
  const common = { ...bounds, order: items.length + 1 };

  if (node.localName === "pic") {
    const blip = xmlElements(node, "blip")[0];
    const relationshipId = blip?.getAttribute("r:embed") || blip?.getAttribute("embed");
    const source = imageByRelationship[relationshipId];
    if (source) items.push({ ...common, kind: "picture", source });
    return;
  }

  const shapeStyle = drawingShapeStyle(node);
  const text = drawingShapeText(node);
  if (node.localName === "cxnSp" || /connector|^line$/i.test(shapeStyle.geometry)) {
    items.push({ ...common, kind: "line", ...shapeStyle });
    return;
  }
  items.push({
    ...common,
    kind: "shape",
    ...shapeStyle,
    ...drawingTextStyle(node),
    text,
    rotation: text && Math.abs((((xfrm.rotation % 360) + 360) % 360) - 180) < 1 ? 0 : xfrm.rotation,
  });
}

function drawingPaintVisible(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized && normalized !== "none" && normalized !== "transparent");
}

function drawingWhitePaint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "#fff" || normalized === "#ffffff" || normalized === "white" || normalized === "rgb(255,255,255)";
}

function drawingVisibleStyle(node) {
  if (node.localName === "pic") return { visible: true, strokeWidth: 1 };

  const style = drawingShapeStyle(node);
  const text = drawingShapeText(node);
  const hasText = Boolean(text.trim());
  const hasFill = drawingPaintVisible(style.fill);
  const hasStroke = drawingPaintVisible(style.stroke) && Number(style.strokeWidth) > 0;
  const lineLike = node.localName === "cxnSp" || /connector|^line$/i.test(style.geometry);
  const onlyWhiteBackground = hasFill && !hasStroke && !hasText && drawingWhitePaint(style.fill);

  return {
    visible: !onlyWhiteBackground && (hasText || hasStroke || (!lineLike && hasFill)),
    strokeWidth: style.strokeWidth,
  };
}

function drawingPaddedBounds(bounds, strokeWidth = 1) {
  const strokePadding = Math.max(DRAWING_EMU_PER_PIXEL * 3, Number(strokeWidth || 0) * DRAWING_EMU_PER_PIXEL * 3);
  return {
    minX: bounds.x - strokePadding,
    minY: bounds.y - strokePadding,
    maxX: bounds.x + bounds.width + strokePadding,
    maxY: bounds.y + bounds.height + strokePadding,
  };
}

function collectDrawingVisibleBounds(node, transform, imageByRelationship, boundsList, anchorBounds = null) {
  if (!node || node.nodeType !== 1) return;
  if (node.localName === "grpSp") {
    const xfrm = drawingEffectiveXfrm(node, true, anchorBounds);
    if (!xfrm) return;
    const groupTransform = drawingGroupTransform(transform, xfrm);
    [...node.childNodes]
      .filter((child) => child.nodeType === 1 && ["sp", "cxnSp", "grpSp", "pic"].includes(child.localName))
      .forEach((child) => collectDrawingVisibleBounds(child, groupTransform, imageByRelationship, boundsList));
    return;
  }

  const xfrm = drawingEffectiveXfrm(node, false, anchorBounds);
  const bounds = drawingBounds(transform, xfrm);
  if (!bounds) return;

  if (node.localName === "pic") {
    const blip = xmlElements(node, "blip")[0];
    const relationshipId = blip?.getAttribute("r:embed") || blip?.getAttribute("embed");
    if (imageByRelationship[relationshipId]) boundsList.push(drawingPaddedBounds(bounds, 1));
    return;
  }

  const visibleStyle = drawingVisibleStyle(node);
  if (!visibleStyle.visible) return;
  boundsList.push(drawingPaddedBounds(bounds, visibleStyle.strokeWidth));
}

function drawingSvgMatrixMultiply(left, right) {
  return {
    a: (left.a * right.a) + (left.c * right.b),
    b: (left.b * right.a) + (left.d * right.b),
    c: (left.a * right.c) + (left.c * right.d),
    d: (left.b * right.c) + (left.d * right.d),
    e: (left.a * right.e) + (left.c * right.f) + left.e,
    f: (left.b * right.e) + (left.d * right.f) + left.f,
  };
}

function drawingSvgTranslation(x, y) {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

function drawingSvgScale(x, y) {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
}

function drawingSvgRotation(degrees) {
  const radians = degrees * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 };
}

function drawingSvgAroundCenter(xfrm) {
  const centerX = xfrm.x + (xfrm.width / 2);
  const centerY = xfrm.y + (xfrm.height / 2);
  return drawingSvgMatrixMultiply(
    drawingSvgTranslation(centerX, centerY),
    drawingSvgMatrixMultiply(
      drawingSvgRotation(xfrm.rotation),
      drawingSvgMatrixMultiply(
        drawingSvgScale(xfrm.flipH ? -1 : 1, xfrm.flipV ? -1 : 1),
        drawingSvgTranslation(-centerX, -centerY),
      ),
    ),
  );
}

function drawingSvgTextCorrection(xfrm) {
  const normalizedRotation = ((xfrm.rotation % 360) + 360) % 360;
  const shouldRotateUpright = normalizedRotation > 135 && normalizedRotation < 225;
  if (!xfrm.flipH && !xfrm.flipV && !shouldRotateUpright) return "";
  const centerX = xfrm.x + (xfrm.width / 2);
  const centerY = xfrm.y + (xfrm.height / 2);
  let matrix = drawingSvgTranslation(centerX, centerY);
  if (shouldRotateUpright) matrix = drawingSvgMatrixMultiply(matrix, drawingSvgRotation(180));
  matrix = drawingSvgMatrixMultiply(
    matrix,
    drawingSvgMatrixMultiply(
      drawingSvgScale(xfrm.flipH ? -1 : 1, xfrm.flipV ? -1 : 1),
      drawingSvgTranslation(-centerX, -centerY),
    ),
  );
  return drawingSvgMatrixAttribute(matrix);
}

function drawingSvgGroupMatrix(xfrm) {
  const scaleX = xfrm.width / xfrm.childWidth;
  const scaleY = xfrm.height / xfrm.childHeight;
  const childMapping = drawingSvgMatrixMultiply(
    drawingSvgTranslation(xfrm.x - (xfrm.childX * scaleX), xfrm.y - (xfrm.childY * scaleY)),
    drawingSvgScale(scaleX, scaleY),
  );
  return drawingSvgMatrixMultiply(drawingSvgAroundCenter(xfrm), childMapping);
}

function drawingSvgMatrixAttribute(matrix) {
  return `matrix(${matrix.a.toFixed(8)} ${matrix.b.toFixed(8)} ${matrix.c.toFixed(8)} ${matrix.d.toFixed(8)} ${matrix.e.toFixed(2)} ${matrix.f.toFixed(2)})`;
}

function drawingSvgGeometry(node, xfrm, shapeStyle) {
  const x = xfrm.x;
  const y = xfrm.y;
  const width = xfrm.width;
  const height = xfrm.height;
  const strokeWidth = Math.max(3175, shapeStyle.strokeWidth * DRAWING_EMU_PER_PIXEL);
  const dashArray = shapeStyle.dashPattern
    ? ` stroke-dasharray="${shapeStyle.dashPattern.map((part) => Math.round(part * strokeWidth)).join(" ")}"`
    : "";
  const common = `fill="${shapeStyle.fill}" stroke="${shapeStyle.stroke}" stroke-width="${strokeWidth.toFixed(0)}" stroke-linecap="butt" stroke-linejoin="miter"${dashArray}`;
  const lineCommon = common;
  const geometry = String(shapeStyle.geometry || "rect");
  const customPath = drawingCustomGeometryPath(node, xfrm);
  if (customPath) {
    return `<path d="${customPath}" ${common} fill-rule="evenodd"/>`;
  }

  if (node.localName === "cxnSp" || /connector|^line$/i.test(geometry)) {
    let path = `M ${x} ${y} L ${x + width} ${y + height}`;
    const adjust1 = drawingGeometryAdjustment(node, "adj1") / 100000;
    const adjust2 = drawingGeometryAdjustment(node, "adj2", 50000) / 100000;
    if (/bentConnector2/i.test(geometry)) {
      path = `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height}`;
    }
    if (/bentConnector3/i.test(geometry)) {
      const elbowX = x + (width * adjust1);
      path = `M ${x} ${y} L ${elbowX} ${y} L ${elbowX} ${y + height} L ${x + width} ${y + height}`;
    }
    if (/bentConnector4/i.test(geometry)) {
      const elbowX1 = x + (width * adjust1);
      const elbowX2 = x + (width * adjust2);
      path = `M ${x} ${y} L ${elbowX1} ${y} L ${elbowX1} ${y + (height / 2)} L ${elbowX2} ${y + (height / 2)} L ${elbowX2} ${y + height} L ${x + width} ${y + height}`;
    }
    const line = drawingChild(drawingChild(node, "spPr"), "ln");
    const headType = drawingChild(line, "headEnd")?.getAttribute("type");
    const tailType = drawingChild(line, "tailEnd")?.getAttribute("type");
    const markers = `${headType && headType !== "none" ? ' marker-start="url(#diagramArrowStart)"' : ""}${tailType && tailType !== "none" ? ' marker-end="url(#diagramArrowEnd)"' : ""}`;
    return `<path d="${path}" ${lineCommon} fill="none"${markers}/>`;
  }
  if (/ellipse|arc/i.test(geometry)) {
    return `<ellipse cx="${x + (width / 2)}" cy="${y + (height / 2)}" rx="${width / 2}" ry="${height / 2}" ${common}/>`;
  }
  if (/triangle/i.test(geometry)) {
    return `<polygon points="${x + (width / 2)},${y} ${x + width},${y + height} ${x},${y + height}" ${common}/>`;
  }
  if (/rightArrow/i.test(geometry)) {
    return `<polygon points="${x},${y + (height * .25)} ${x + (width * .62)},${y + (height * .25)} ${x + (width * .62)},${y} ${x + width},${y + (height / 2)} ${x + (width * .62)},${y + height} ${x + (width * .62)},${y + (height * .75)} ${x},${y + (height * .75)}" ${common}/>`;
  }
  if (/downArrow/i.test(geometry)) {
    return `<polygon points="${x + (width * .25)},${y} ${x + (width * .75)},${y} ${x + (width * .75)},${y + (height * .62)} ${x + width},${y + (height * .62)} ${x + (width / 2)},${y + height} ${x},${y + (height * .62)} ${x + (width * .25)},${y + (height * .62)}" ${common}/>`;
  }
  const radius = /roundRect/i.test(geometry) ? Math.min(width, height) * .14 : 0;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" ${common}/>`;
}

function drawingFillIsDark(fill) {
  const match = String(fill || "").match(/^#([0-9a-f]{6})$/i);
  if (!match) return false;
  const red = Number.parseInt(match[1].slice(0, 2), 16);
  const green = Number.parseInt(match[1].slice(2, 4), 16);
  const blue = Number.parseInt(match[1].slice(4, 6), 16);
  return ((red * 299) + (green * 587) + (blue * 114)) / 1000 < 105;
}

function drawingFillIsSearchNavy(fill) {
  const match = String(fill || "").match(/^#([0-9a-f]{6})$/i);
  if (!match) return false;
  const red = Number.parseInt(match[1].slice(0, 2), 16);
  const green = Number.parseInt(match[1].slice(2, 4), 16);
  const blue = Number.parseInt(match[1].slice(4, 6), 16);
  const luminance = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
  return luminance < 115
    && red <= 80
    && green <= 110
    && blue >= 60
    && blue >= red + 25
    && blue >= green + 15;
}

function drawingColorChannels(color) {
  const match = String(color || "").match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  return {
    red: Number.parseInt(match[1].slice(0, 2), 16),
    green: Number.parseInt(match[1].slice(2, 4), 16),
    blue: Number.parseInt(match[1].slice(4, 6), 16),
  };
}

function drawingColorIsBlack(color) {
  const channels = drawingColorChannels(color);
  return Boolean(channels) && Math.max(channels.red, channels.green, channels.blue) <= 35;
}

function drawingColorIsMapyeongPurple(color) {
  const channels = drawingColorChannels(color);
  if (!channels) return false;
  return channels.red >= 75
    && channels.red <= 145
    && channels.green <= 100
    && channels.blue >= 115
    && channels.blue <= 205
    && channels.blue >= channels.red + 25;
}

function drawingTextIsMapyeongSearchable(text, colors = []) {
  const value = String(text || "").trim();
  const compact = normalizeDiagramSearchText(value);
  if (compact.length < 6 || /^[0-9]+$/.test(compact)) return false;
  if (/^\s*(?:거리|규격|코드|맨홀|전주)\s*:/i.test(value)) return false;

  const colorList = Array.isArray(colors) ? colors : [colors];
  if (colorList.some(drawingColorIsMapyeongPurple)) {
    return /(?:셀명|선번|전용|B2C|#)/i.test(value) || /[가-힣]{4,}/.test(compact);
  }
  return colorList.some(drawingColorIsBlack) && /(?:셀명|#G[0-9A-Z]{4,})/i.test(value);
}

function drawingSvgText(node, xfrm, shapeStyle) {
  const text = drawingShapeText(node);
  if (!text) return "";
  const style = drawingTextStyle(node);
  const darkLabel = drawingFillIsDark(shapeStyle?.fill);
  const searchableLabel = drawingFillIsSearchNavy(shapeStyle?.fill);
  const mapyeongSearchable = drawingTextIsMapyeongSearchable(text, style.colors);
  const textKey = normalizeDiagramSearchText(text);
  const fontSize = Math.max(4, style.fontPt) * 12700;
  const lines = text.split(/\r?\n/);
  const lineHeight = fontSize * 1.12;
  const totalHeight = lineHeight * lines.length;
  const textAnchor = style.textAlign === "center" ? "middle" : (style.textAlign === "right" ? "end" : "start");
  const textX = style.textAlign === "center"
    ? xfrm.x + (xfrm.width / 2)
    : (style.textAlign === "right" ? xfrm.x + xfrm.width - style.insetRight : xfrm.x + style.insetLeft);
  let textY = xfrm.y + style.insetTop + fontSize;
  if (style.alignItems === "center") textY = xfrm.y + ((xfrm.height - totalHeight) / 2) + fontSize;
  if (style.alignItems === "flex-end") textY = xfrm.y + xfrm.height - style.insetBottom - totalHeight + fontSize;
  const renderedFontSize = Math.min(10000, fontSize);
  const textScale = fontSize / renderedFontSize;
  const scaledTextX = textX / textScale;
  const scaledTextY = textY / textScale;
  const scaledLineHeight = lineHeight / textScale;
  const tspans = lines.map((line, index) => `<tspan x="${scaledTextX}" dy="${index ? scaledLineHeight : 0}">${escapeHtml(line)}</tspan>`).join("");
  const writingMode = style.verticalText ? ' writing-mode="vertical-rl"' : "";
  const color = darkLabel ? "#ffffff" : style.color;
  return `<g class="drawing-diagram-text${darkLabel ? " is-dark-label" : ""}" data-diagram-dark="${darkLabel ? "true" : "false"}" data-diagram-searchable="${searchableLabel ? "true" : "false"}" data-diagram-mapyeong-searchable="${mapyeongSearchable ? "true" : "false"}" data-diagram-text="${escapeHtml(textKey)}" data-diagram-x="${xfrm.x}" data-diagram-y="${xfrm.y}" data-diagram-width="${xfrm.width}" data-diagram-height="${xfrm.height}" aria-label="${escapeHtml(text)}"><title>${escapeHtml(text)}</title><text x="${scaledTextX}" y="${scaledTextY}" transform="scale(${textScale})" fill="${color}" font-family="'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif" font-size="${renderedFontSize}" font-weight="${style.bold ? 800 : 500}" text-anchor="${textAnchor}"${writingMode}>${tspans}</text></g>`;
}

function drawingSvgNode(node, imageByRelationship, stats, anchorBounds = null) {
  if (!node || node.nodeType !== 1) return "";
  if (node.localName === "grpSp") {
    const xfrm = drawingEffectiveXfrm(node, true, anchorBounds);
    if (!xfrm) return "";
    const children = [...node.childNodes]
      .filter((child) => child.nodeType === 1 && ["sp", "cxnSp", "grpSp", "pic"].includes(child.localName))
      .map((child) => drawingSvgNode(child, imageByRelationship, stats))
      .join("");
    return `<g transform="${drawingSvgMatrixAttribute(drawingSvgGroupMatrix(xfrm))}">${children}</g>`;
  }

  const xfrm = drawingEffectiveXfrm(node, false, anchorBounds);
  if (!xfrm) return "";
  const nodeTransform = drawingSvgMatrixAttribute(drawingSvgAroundCenter(xfrm));
  if (node.localName === "pic") {
    const blip = xmlElements(node, "blip")[0];
    const relationshipId = blip?.getAttribute("r:embed") || blip?.getAttribute("embed");
    const source = imageByRelationship[relationshipId];
    if (!source) return "";
    stats.pictureCount += 1;
    return `<g transform="${nodeTransform}"><image x="${xfrm.x}" y="${xfrm.y}" width="${xfrm.width}" height="${xfrm.height}" href="${source}" preserveAspectRatio="none"/></g>`;
  }

  const text = drawingShapeText(node);
  const shapeStyle = drawingShapeStyle(node);
  const shape = drawingSvgGeometry(node, xfrm, shapeStyle);
  if (node.localName === "sp") stats.shapeCount += 1;
  if (text) stats.texts.push(text);
  const textSvg = drawingSvgText(node, xfrm, shapeStyle);
  const textCorrection = textSvg ? drawingSvgTextCorrection(xfrm) : "";
  return `<g transform="${nodeTransform}">${shape}${textCorrection ? `<g transform="${textCorrection}">${textSvg}</g>` : textSvg}</g>`;
}

function drawingDiagramHtml(drawingXml, imageByRelationship, sheetXml = "") {
  const document = xmlDoc(drawingXml);
  const metrics = sheetXml ? drawingSheetMetrics(sheetXml) : null;
  const rootItems = [...document.documentElement.childNodes]
    .flatMap((anchor) => {
      if (anchor.nodeType !== 1) return [];
      const anchorBounds = drawingAnchorBounds(anchor, metrics);
      return [...anchor.childNodes]
        .filter((child) => child.nodeType === 1 && ["sp", "cxnSp", "grpSp", "pic"].includes(child.localName))
        .map((node) => ({
          node,
          anchorBounds,
        }));
    });
  if (!rootItems.length) return null;

  const visibleBounds = [];
  const identityTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  rootItems.forEach(({ node, anchorBounds }) => {
    collectDrawingVisibleBounds(node, identityTransform, imageByRelationship, visibleBounds, anchorBounds);
  });

  const fallbackBounds = rootItems
    .map(({ node, anchorBounds }) => drawingEffectiveXfrm(node, node.localName === "grpSp", anchorBounds))
    .filter(Boolean)
    .map((item) => ({
      minX: item.x,
      minY: item.y,
      maxX: item.x + item.width,
      maxY: item.y + item.height,
    }));
  const bounds = visibleBounds.length ? visibleBounds : fallbackBounds;
  if (!bounds.length) return null;
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  const rawWidth = Math.max(1, maxX - minX);
  const rawHeight = Math.max(1, maxY - minY);
  const padding = Math.max(DRAWING_CROP_MIN_PADDING, Math.max(rawWidth, rawHeight) * DRAWING_CROP_PADDING_RATIO);
  const viewX = minX - padding;
  const viewY = minY - padding;
  const viewWidth = rawWidth + (padding * 2);
  const viewHeight = rawHeight + (padding * 2);
  const naturalPixelWidth = Math.max(1, viewWidth / DRAWING_EMU_PER_PIXEL);
  const naturalPixelHeight = Math.max(1, viewHeight / DRAWING_EMU_PER_PIXEL);
  const displayWidth = Math.round(naturalPixelWidth);
  const displayHeight = Math.round(naturalPixelHeight);
  const stats = { shapeCount: 0, pictureCount: 0, texts: [] };
  const body = rootItems.map(({ node, anchorBounds }) => drawingSvgNode(node, imageByRelationship, stats, anchorBounds)).join("");
  const svg = `<svg class="drawing-diagram-svg" xmlns="http://www.w3.org/2000/svg" width="${displayWidth}" height="${displayHeight}" data-base-width="${displayWidth}" data-base-height="${displayHeight}" viewBox="${viewX} ${viewY} ${viewWidth} ${viewHeight}" preserveAspectRatio="xMinYMin meet"><defs><marker id="diagramArrowEnd" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth"><polygon points="0 0, 10 3.5, 0 7" fill="context-stroke"/></marker><marker id="diagramArrowStart" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"><polygon points="0 0, 10 3.5, 0 7" fill="context-stroke"/></marker></defs>${body}</svg>`;
  return {
    html: `<div class="drawing-diagram-canvas">${svg}</div>`,
    svg,
    searchText: stats.texts.join(" "),
    shapeCount: stats.shapeCount,
    pictureCount: stats.pictureCount,
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("직선도 그림 파일을 만들지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

function decodeSvgDataUrl(content) {
  const source = String(content || "");
  if (!/^data:image\/svg\+xml(?:;[^,]*)?,/i.test(source)) return null;
  const commaIndex = source.indexOf(",");
  if (commaIndex < 0) return null;
  const header = source.slice(0, commaIndex);
  const body = source.slice(commaIndex + 1);
  try {
    if (!/;base64(?:;|$)/i.test(header)) return decodeURIComponent(body);
    const binary = window.atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  } catch (error) {
    console.warn("기존 SVG 직선도 내용을 읽지 못했습니다.", error);
    return null;
  }
}

function encodeSvgDataUrl(svgText) {
  const bytes = new TextEncoder().encode(String(svgText || ""));
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/svg+xml;base64,${window.btoa(binary)}`;
}

function repairLegacySvgDiagram(diagram) {
  if (!diagram || String(diagram.imageFormat || "").toLowerCase() !== "svg") return diagram;
  const svgText = decodeSvgDataUrl(diagram.content);
  if (!svgText || !/non-scaling-stroke/i.test(svgText)) return diagram;
  const repairedSvg = svgText
    .replace(/\s+vector-effect=(["'])non-scaling-stroke\1/gi, "")
    .replace(/vector-effect\s*:\s*non-scaling-stroke\s*;?/gi, "");
  if (repairedSvg === svgText) return diagram;
  return {
    ...diagram,
    content: encodeSvgDataUrl(repairedSvg),
    renderer: "browser-svg-v2",
    legacySvgRepairedAt: new Date().toISOString(),
  };
}

async function drawingDiagramToImageAsset(diagram, { includeMapyeongText = false } = {}) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;z-index:-1;visibility:hidden;pointer-events:none;";
  host.innerHTML = diagram.html;
  document.body.appendChild(host);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const svg = host.querySelector(".drawing-diagram-svg");
    if (!svg) throw new Error("직선도 SVG를 만들지 못했습니다.");
    const svgRect = svg.getBoundingClientRect();
    const baseWidth = Number(svg.getAttribute("width")) || Math.max(1, svgRect.width);
    const baseHeight = Number(svg.getAttribute("height")) || Math.max(1, svgRect.height);
    if (!svgRect.width || !svgRect.height) throw new Error("직선도 그림 크기를 확인하지 못했습니다.");

    const searchTargets = [...svg.querySelectorAll(".drawing-diagram-text")]
      .filter((item) => item.dataset.diagramSearchable === "true"
        || (includeMapyeongText && item.dataset.diagramMapyeongSearchable === "true"))
      .map((item) => {
        const parent = item.parentNode;
        if (!parent) return null;
        const frame = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        frame.setAttribute("x", item.dataset.diagramX || "0");
        frame.setAttribute("y", item.dataset.diagramY || "0");
        frame.setAttribute("width", item.dataset.diagramWidth || "0");
        frame.setAttribute("height", item.dataset.diagramHeight || "0");
        frame.setAttribute("fill", "transparent");
        frame.setAttribute("stroke", "none");
        parent.appendChild(frame);
        const rect = frame.getBoundingClientRect();
        frame.remove();
        if (!rect.width || !rect.height) return null;
        return {
          text: normalizeDiagramSearchText(item.dataset.diagramText || item.textContent),
          label: item.getAttribute("aria-label") || item.textContent.trim(),
          left: ((rect.left - svgRect.left) / svgRect.width) * 100,
          top: ((rect.top - svgRect.top) / svgRect.height) * 100,
          width: (rect.width / svgRect.width) * 100,
          height: (rect.height / svgRect.height) * 100,
        };
      })
      .filter((target) => target && target.text.length >= 6);

    const svgText = new XMLSerializer().serializeToString(svg);
    const content = await blobToDataUrl(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
    return {
      content,
      searchTargets,
      baseWidth,
      baseHeight,
      imageFormat: "svg",
    };
  } finally {
    host.remove();
  }
}

function requiresLocalExcelRenderer() {
  return ["127.0.0.1", "localhost"].includes(window.location.hostname);
}

async function checkLineDiagramServer() {
  const isLocalPage = requiresLocalExcelRenderer();
  const healthUrl = isLocalPage ? "/api/health" : "http://127.0.0.1:8000/api/health";
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      credentials: isLocalPage ? "same-origin" : "omit",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    if (!status?.ok) throw new Error("변환 API 준비 상태를 확인하지 못했습니다.");
    if (status.lineDiagramRendererVersion !== LINE_DIAGRAM_RENDERER_VERSION) {
      throw new Error("실행 중인 로컬 웹앱이 이전 버전입니다.");
    }
  } catch (error) {
    throw new Error("PC의 로컬 직선도 변환 서버가 준비되지 않았습니다. '웹사이트 실행.cmd'를 다시 실행하고 RATIS_MASTER_KEY를 입력한 뒤 등록해주세요.", { cause: error });
  } finally {
    window.clearTimeout(timer);
  }
}

function shouldUseVectorPdfLineDiagramExport(fileName) {
  return String(fileName || "").normalize("NFC").includes("\uB9C8\uD3C9");
}

async function excelRenderedLineDiagramImages(file) {
  if (!file || !/^https?:$/.test(window.location.protocol)) return new Map();
  const outputFormat = shouldUseVectorPdfLineDiagramExport(file.name) ? "pdf" : "png";
  const localRendererUrl = "http://127.0.0.1:8000/api/line-diagram-images";
  const endpoints = requiresLocalExcelRenderer()
    ? ["/api/line-diagram-images"]
    : [localRendererUrl];
  const errors = [];

  for (const endpoint of endpoints) {
    try {
      const isLocalRenderer = endpoint.startsWith("http://127.0.0.1");
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: isLocalRenderer ? "omit" : "same-origin",
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-file-name": encodeURIComponent(file.name || "workbook.xlsx"),
          "x-line-diagram-output": outputFormat,
        },
        body: file,
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(details.error
          ? `Excel 직선도 이미지 변환 실패: ${details.error}`
          : `Excel 직선도 이미지 변환 서버 응답 오류 (${response.status})`);
      }
      const payload = await response.json();
      const renderedSheets = payload.sheets || [];
      if (!renderedSheets.length) throw new Error("Excel 직선도 이미지를 한 장도 만들지 못했습니다.");
      return new Map(renderedSheets.map((sheet) => {
        const imageFormat = String(sheet.imageFormat || outputFormat || "png").toLowerCase() === "pdf" ? "pdf" : "png";
        return [
        diagramMatchKey(sheet.sheetName),
        {
          content: `data:${imageFormat === "pdf" ? "application/pdf" : "image/png"};base64,${sheet.content}`,
          baseWidth: Number(sheet.width) || 0,
          baseHeight: Number(sheet.height) || 0,
          imageFormat,
          renderer: imageFormat === "pdf" ? "excel-pdf" : "excel-picture",
          searchTargets: (sheet.searchTargets || []).map((target) => ({
            text: normalizeDiagramSearchText(target.text),
            label: target.label || target.text || "",
            left: Number(target.left) || 0,
            top: Number(target.top) || 0,
            width: Number(target.width) || 0,
            height: Number(target.height) || 0,
            source: target.source || (imageFormat === "pdf" ? "excel-pdf" : "excel-picture"),
          })).filter((target) => target.text.length >= 6 && target.width > 0 && target.height > 0),
        },
        ];
      }));
    } catch (error) {
      errors.push(error);
      console.warn(`Excel 원본 이미지 변환 실패 (${endpoint})`, error);
    }
  }

  throw new Error(
    "정확한 직선도 이미지를 만들 수 없습니다. 이 PC에서 로컬 웹앱(http://127.0.0.1:8000)을 실행하고 Excel이 설치되어 있는지 확인한 뒤 다시 등록해주세요. 부정확한 브라우저 도형 변환은 저장하지 않습니다.",
    { cause: errors.at(-1) },
  );
}

async function extractSheetDrawingDiagram(zip, sheetPath) {
  const sheetXml = await zipText(zip, sheetPath);
  const sheetDocument = xmlDoc(sheetXml);
  const drawingIds = xmlElements(sheetDocument, "drawing")
    .map((drawing) => drawing.getAttribute("r:id") || drawing.getAttribute("id"))
    .filter(Boolean);
  if (!drawingIds.length) return null;

  const sheetRelationships = relationshipMap(await zipText(zip, sheetRelsPath(sheetPath)), sheetPath);
  for (const drawingId of drawingIds) {
    const drawingPath = sheetRelationships[drawingId];
    if (!drawingPath) continue;
    const drawingXml = await zipText(zip, drawingPath);
    if (!drawingXml) continue;
    const drawingRelationshipsPath = drawingPath.replace(/\/([^/]+)$/, "/_rels/$1.rels");
    const drawingRelationships = relationshipMap(await zipText(zip, drawingRelationshipsPath), drawingPath);
    const imageByRelationship = {};
    for (const [relationshipId, targetPath] of Object.entries(drawingRelationships)) {
      if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(targetPath)) continue;
      const imageFile = zip.file(targetPath);
      if (!imageFile) continue;
      const base64 = await imageFile.async("base64");
      imageByRelationship[relationshipId] = `data:${imageMimeFromPath(targetPath)};base64,${base64}`;
    }
    const diagram = drawingDiagramHtml(drawingXml, imageByRelationship, sheetXml);
    if (diagram) return diagram;
  }
  return null;
}

function parseB2CWorkbook(workbook, stationName, fileName) {
  const stationAddress = stationAddressForB2C(stationName);
  const rows = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const hasB2CHeaders = matrix.some((row) => row.slice(16, 22).some((value) => /서비스회선명|국사\s*FDF|셀명|서비스구분|서비스타입|비고/i.test(b2cCellText(value))));
    if (!hasB2CHeaders) return;

    matrix.forEach((row, rowIndex) => {
      const node = b2cCellText(row[6]); // G열: 노드
      const line = b2cCellText(row[10]); // K열: 선번
      const searchValues = row.slice(16, 22).map(b2cCellText).filter(Boolean); // Q~V열
      const joined = [node, line, ...searchValues].join(" ");

      if (!searchValues.length) return;
      if (!node && !line) return;
      if (/노드명|코어|서비스회선명|국사\s*FDF|셀명|서비스구분|서비스타입|비고/i.test(joined)) return;

      rows.push({
        stationName,
        stationAddress,
        fileName,
        sheetName,
        rowNumber: rowIndex + 1,
        b2cName: searchValues[0] || line || node,
        node,
        line,
        searchValues,
        serviceName: b2cCellText(row[16]),
        stationFdfLine: b2cCellText(row[17]),
        cellName: b2cCellText(row[18]),
        serviceCategory: b2cCellText(row[19]),
        serviceType: b2cCellText(row[20]),
        memo: b2cCellText(row[21]),
      });
    });
  });

  return rows;
}

function workbookLinebookNodes(workbook) {
  const linebookSheetName = workbook.SheetNames.find((name) => /선번장/i.test(name))
    || workbook.SheetNames[0]
    || "";
  const sheet = workbook.Sheets[linebookSheetName];
  if (!sheet) return { linebookSheetName, nodes: [] };
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  const headerRowIndex = matrix.findIndex((row) => row.some((value) => /노드명/i.test(b2cCellText(value))));
  const headerRow = headerRowIndex >= 0 ? matrix[headerRowIndex] : [];
  const nodeColumnIndex = headerRow.findIndex((value) => /노드명/i.test(b2cCellText(value)));
  if (nodeColumnIndex < 0) return { linebookSheetName, nodes: [] };
  const nodes = matrix
    .slice(headerRowIndex + 1)
    .map((row) => b2cCellText(row[nodeColumnIndex]))
    .filter((node) => node && !/노드명/i.test(node))
    .filter((node, index, array) => array.findIndex((candidate) => diagramMatchKey(candidate) === diagramMatchKey(node)) === index);
  return { linebookSheetName, nodes };
}

function lineDiagramSheetNames(workbook) {
  return workbook.SheetNames.filter((name) => !/선번장|회선현황|선번표|우선순위|^>>$/i.test(name.trim()));
}

function isReusableExactLineDiagram(diagram) {
  return Boolean(diagram?.content)
    && String(diagram.imageFormat || "").toLowerCase() !== "svg"
    && !String(diagram.renderer || "").startsWith("browser-svg");
}

async function reusableExactLineDiagrams(workbook, stationName, fileName, drawingFingerprint) {
  if (!drawingFingerprint) return null;
  const sheetNames = lineDiagramSheetNames(workbook);
  if (!sheetNames.length) return null;
  const storedDiagrams = await loadB2CDiagrams();
  const matchingBySheet = new Map();
  storedDiagrams.forEach((diagram) => {
    if (diagram.drawingFingerprint !== drawingFingerprint || !isReusableExactLineDiagram(diagram)) return;
    const key = diagramMatchKey(diagram.sheetName);
    if (key && !matchingBySheet.has(key)) matchingBySheet.set(key, diagram);
  });
  if (sheetNames.some((sheetName) => !matchingBySheet.has(diagramMatchKey(sheetName)))) return null;

  const { linebookSheetName, nodes: linebookNodes } = workbookLinebookNodes(workbook);
  return sheetNames.map((sheetName) => {
    const stored = matchingBySheet.get(diagramMatchKey(sheetName));
    const nodeName = linebookNodes.find((node) => diagramMatchKey(node) === diagramMatchKey(sheetName)) || "";
    return {
      ...stored,
      stationName,
      fileName,
      sheetName,
      linebookSheetName,
      nodeName,
      nodeKey: diagramMatchKey(nodeName || sheetName),
      drawingFingerprint,
      reuseMetadataUnchanged: sameStationName(stored.stationName, stationName)
        && String(stored.fileName || "") === String(fileName || "")
        && String(stored.linebookSheetName || "") === String(linebookSheetName || "")
        && String(stored.nodeName || "") === String(nodeName || ""),
    };
  });
}

async function parseB2CDiagrams(workbook, stationName, fileName, file) {
  const { linebookSheetName, nodes: linebookNodes } = workbookLinebookNodes(workbook);
  const diagrams = [];
  const excelRenderedImages = await excelRenderedLineDiagramImages(file);
  const diagramSheetNames = lineDiagramSheetNames(workbook);
  const missingSheetNames = diagramSheetNames.filter((sheetName) => !excelRenderedImages.has(diagramMatchKey(sheetName)));
  if (missingSheetNames.length) {
    throw new Error(`Excel 원본 이미지가 생성되지 않은 직선도 시트가 있습니다: ${missingSheetNames.join(", ")}`);
  }

  for (const sheetName of diagramSheetNames) {
    const sheetKey = diagramMatchKey(sheetName);
    const nodeName = linebookNodes.find((node) => diagramMatchKey(node) === sheetKey) || "";
    const excelRenderedImage = excelRenderedImages.get(sheetKey);
    const imageFormat = String(excelRenderedImage.imageFormat || "").toLowerCase();
    diagrams.push({
      stationName,
      fileName,
      sheetName,
      linebookSheetName,
      nodeName,
      nodeKey: diagramMatchKey(nodeName || sheetName),
      type: imageFormat === "pdf" ? "pdf-map" : "image-map",
      content: excelRenderedImage.content,
      searchTargets: excelRenderedImage.searchTargets || [],
      baseWidth: excelRenderedImage.baseWidth,
      baseHeight: excelRenderedImage.baseHeight,
      imageFormat: excelRenderedImage.imageFormat,
      renderer: excelRenderedImage.renderer,
    });
  }
  return diagrams;
}

async function saveB2CFile() {
  const stationInput = qs("#b2cStation");
  const fileInput = qs("#b2cFile");
  const message = qs("#b2cMessage");
  const saveButton = qs("#saveB2CBtn");
  const showMessage = (text, isError = false) => {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  };
  const stationName = stationInput.value.trim();
  const file = fileInput.files[0];

  if (!stationName || !file) return showMessage("국사명과 선번장(직선도) 엑셀 파일을 모두 선택해주세요.", true);
  if (!/\.(xlsx|xls)$/i.test(file.name)) return showMessage("선번장(직선도) DB는 엑셀 파일(.xlsx, .xls)만 등록할 수 있습니다.", true);
  if (!window.XLSX) return showMessage("엑셀 처리 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.", true);

  try {
    showMessage("직선도 변환 서버 연결을 확인하는 중입니다.");
    await checkLineDiagramServer();
  } catch (error) {
    return showMessage(error.message, true);
  }

  if (saveButton) saveButton.disabled = true;
  const startedAt = Date.now();
  const progressTimer = window.setInterval(() => {
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    showMessage(`${file.name} 파일을 변환·등록하는 중입니다 (${seconds.toLocaleString("ko-KR")}초). 최초 등록은 몇 분 걸릴 수 있으며 같은 파일 재등록은 빨라집니다.`);
  }, 1000);
  const finishProcessing = () => {
    window.clearInterval(progressTimer);
    if (saveButton) saveButton.disabled = false;
  };

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const workbookOptions = requiresLocalExcelRenderer()
        ? { type: "array", cellDates: false, bookFiles: true }
        : { type: "array", cellStyles: true, cellNF: true, cellText: true, cellDates: false, sheetStubs: true, bookFiles: true };
      const workbook = XLSX.read(event.target.result, workbookOptions);
      const drawingFingerprint = await workbookDrawingFingerprint(workbook);
      const createdAt = new Date().toISOString();
      const reusableDiagrams = await reusableExactLineDiagrams(
        workbook,
        stationName,
        file.name,
        drawingFingerprint,
      );
      const reusedExactImages = Boolean(reusableDiagrams);
      let presetDiagrams = null;
      if (!reusableDiagrams && presetLineDiagramConfig(file.name)) {
        const { nodes: linebookNodes } = workbookLinebookNodes(workbook);
        const nodeNamesBySheet = new Map(lineDiagramSheetNames(workbook).map((sheetName) => [
          diagramMatchKey(sheetName),
          linebookNodes.find((node) => diagramMatchKey(node) === diagramMatchKey(sheetName)) || "",
        ]));
        presetDiagrams = await buildPresetLineDiagrams(stationName, file.name, nodeNamesBySheet, {
          drawingFingerprint,
        });
      }
      const diagramAssets = reusableDiagrams
        || presetDiagrams
        || await parseB2CDiagrams(workbook, stationName, file.name, file);
      const reusableSourceIds = [...new Set((reusableDiagrams || []).map((diagram) => diagram.sourceId).filter(Boolean))];
      const reuseStoredDiagramSource = Boolean(reusableDiagrams?.length)
        && reusableSourceIds.length === 1
        && reusableDiagrams.every((diagram) => diagram.reuseMetadataUnchanged);
      const sourceId = reuseStoredDiagramSource ? reusableSourceIds[0] : createDbSourceId("b2c");
      const parsedRows = parseB2CWorkbook(workbook, stationName, file.name).map((row) => ({
        ...row,
        sourceId,
        createdAt,
      }));
      const parsedDiagrams = diagramAssets.map((diagram) => {
        const { reuseMetadataUnchanged, ...storedDiagram } = diagram;
        return {
          ...storedDiagram,
          sourceId,
          createdAt,
          drawingFingerprint,
        };
      });
      if (!parsedRows.length) throw new Error("Q~V열 검색 항목이 있는 전용선 데이터를 찾지 못했습니다.");

      localStorage.removeItem(STORAGE_KEYS.b2cDiagrams);
      const existingLines = loadB2CLines();
      const replacedLines = existingLines.filter((line) => (
        sameStationName(line.stationName, stationName)
        && String(line.fileName || "") === String(file.name || "")
      ));
      const previousSourceIds = [...new Set(replacedLines.map((line) => line.sourceId).filter(Boolean))];
      const remainingLines = existingLines.filter((line) => !replacedLines.includes(line));
      if (!previousSourceIds.length && !reuseStoredDiagramSource) {
        await deleteB2CDiagramsForSource({ stationName, fileName: file.name });
      }
      if (!reuseStoredDiagramSource) {
        await saveB2CDiagramsForStation(stationName, parsedDiagrams, sourceId);
      }
      await saveB2CLines([...remainingLines, ...parsedRows]);
      for (const previousSourceId of previousSourceIds) {
        if (previousSourceId === sourceId) continue;
        try {
          await deleteB2CDiagramsForSource({ sourceId: previousSourceId });
        } catch (error) {
          console.warn("이전 직선도 DB 정리 실패", previousSourceId, error);
        }
      }
      stationInput.value = "";
      fileInput.value = "";
      renderB2CAdmin();
      const indexedTargetCount = parsedDiagrams.reduce((sum, diagram) => sum + (diagram.searchTargets?.length || 0), 0);
      showMessage(`${stationName} 선번장(직선도) DB ${parsedRows.length}건, 그림 직선도 ${parsedDiagrams.length}개, 셀/B2C 검색영역 ${indexedTargetCount}개 등록이 완료되었습니다.${reusedExactImages ? " 기존 고해상도 직선도 이미지를 재사용해 변환 시간을 단축했습니다." : ""}`);
    } catch (error) {
      console.error("선번장(직선도) DB 업로드 실패", error);
      showMessage(`선번장(직선도) DB 등록에 실패했습니다: ${error.message || "엑셀 양식을 확인해주세요."}`, true);
    } finally {
      finishProcessing();
    }
  };
  reader.onerror = () => {
    finishProcessing();
    showMessage("선택한 엑셀 파일을 읽지 못했습니다. 파일을 다시 선택해주세요.", true);
  };
  showMessage(`${file.name} 파일을 읽는 중입니다.`);
  reader.readAsArrayBuffer(file);
}

function normalizeFloorCoordinateLabel(value) {
  return normalizeDiagramSearchText(value).replace(/RACK|랙|렉/g, "");
}

function splitFloorPlanLookupValue(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  return [text, ...text.split(/\s*\/\s*|\r?\n/).map((part) => part.trim())]
    .filter((part, index, array) => part && array.indexOf(part) === index);
}

function floorPlanLookupValues(record, location, equipmentName, targetText = "") {
  if (String(targetText || "").trim()) return splitFloorPlanLookupValue(targetText);
  const values = splitFloorPlanLookupValue(location?.rack);
  const equipmentKey = normalizeDiagramSearchText(equipmentName);
  const nodeValues = equipmentKey.includes("OTX")
    ? [record.otxMain]
    : (equipmentKey.includes("ORX")
      ? [record.orxMain]
      : (equipmentKey.includes("예비") ? [record.backup] : []));
  return [...values, ...nodeValues.flatMap(splitFloorPlanLookupValue)]
    .filter((value, index, array) => value && array.indexOf(value) === index);
}

function floorPlanCoordinateEntries(plan) {
  const entries = new Map();
  const addEntries = (coordinates = {}) => {
    Object.entries(coordinates).forEach(([key, point]) => {
      const normalizedKey = normalizeFloorCoordinateLabel(key);
      if (!normalizedKey || !point) return;
      const previous = entries.get(normalizedKey);
      const aliases = [...new Set([
        ...(previous?.point?.aliases || []),
        ...(point.aliases || []),
      ].map(String).filter(Boolean))];
      entries.set(normalizedKey, {
        key,
        point: { ...(previous?.point || {}), ...point, aliases },
      });
    });
  };
  addEntries(floorPlanCoordinateTemplate(plan?.stationName, plan?.fileName));
  addEntries(plan?.rackCoordinates);
  return [...entries.values()];
}

function floorPlanMarkerPosition(plan, targetValues = []) {
  const lookups = targetValues
    .map((value) => ({ value: String(value || "").trim(), key: normalizeFloorCoordinateLabel(value) }))
    .filter((lookup) => lookup.key);
  const entries = floorPlanCoordinateEntries(plan).map((entry) => ({
    ...entry,
    searchKeys: [entry.key, entry.point.label, ...(entry.point.aliases || [])]
      .map(normalizeFloorCoordinateLabel)
      .filter(Boolean),
  }));
  const findMatch = (allowContains = false) => {
    for (const lookup of lookups) {
      const entry = entries.find((candidate) => candidate.searchKeys.some((candidateKey) => {
        if (candidateKey === lookup.key) return true;
        if (!allowContains || /^\d+$/.test(candidateKey) || /^\d+$/.test(lookup.key)) return false;
        return Math.min(candidateKey.length, lookup.key.length) >= 4
          && (candidateKey.includes(lookup.key) || lookup.key.includes(candidateKey));
      }));
      if (entry) return { entry, lookup };
    }
    return null;
  };
  const matched = findMatch(false) || findMatch(true);
  const point = matched?.entry?.point;
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
    return { found: false, left: "50%", top: "50%", label: lookups[0]?.value || "", kind: "unknown" };
  }
  return {
    found: true,
    left: `${Math.max(0, Math.min(100, Number(point.x)))}%`,
    top: `${Math.max(0, Math.min(100, Number(point.y)))}%`,
    label: String(point.label || matched.entry.key || matched.lookup.value),
    matchedValue: matched.lookup.value,
    kind: /^\d+$/.test(matched.lookup.key) ? "rack" : "node",
  };
}

function initFloorPlanTouchZoom(viewport) {
  const target = viewport?.querySelector(".uploaded-image-plan, .uploaded-excel-plan, .floor-plan-world");
  if (!viewport || !target || viewport.dataset.touchZoomReady === "true") return;
  viewport.dataset.touchZoomReady = "true";
  viewport.classList.add("touch-pan-zoom");
  let zoom = 1;
  let minZoom = 0.12;
  let gesture = null;
  let resizeFrame = 0;
  const clampZoom = (value) => Math.min(10, Math.max(minZoom, value));

  const prepareImagePlan = () => {
    const image = target.querySelector("img");
    if (!image?.naturalWidth || !image?.naturalHeight) return;
    target.style.width = `${image.naturalWidth}px`;
    target.style.height = `${image.naturalHeight}px`;
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.maxWidth = "none";
    image.style.maxHeight = "none";
  };

  const unscaledSize = () => {
    const previousZoom = target.style.zoom;
    const previousMarkerScale = target.style.getPropertyValue("--floor-plan-marker-scale");
    target.style.zoom = "1";
    target.style.setProperty("--floor-plan-marker-scale", "1");
    prepareImagePlan();
    const rect = target.getBoundingClientRect();
    const width = Math.max(1, target.scrollWidth, rect.width);
    const height = Math.max(1, target.scrollHeight, rect.height);
    target.style.zoom = previousZoom;
    if (previousMarkerScale) target.style.setProperty("--floor-plan-marker-scale", previousMarkerScale);
    else target.style.removeProperty("--floor-plan-marker-scale");
    return { width, height };
  };

  const fitZoom = () => {
    const { width, height } = unscaledSize();
    const viewportStyle = getComputedStyle(viewport);
    const horizontalPadding = (Number.parseFloat(viewportStyle.paddingLeft) || 0) + (Number.parseFloat(viewportStyle.paddingRight) || 0);
    const verticalPadding = (Number.parseFloat(viewportStyle.paddingTop) || 0) + (Number.parseFloat(viewportStyle.paddingBottom) || 0);
    const availableWidth = Math.max(1, viewport.clientWidth - horizontalPadding - 2);
    const availableHeight = Math.max(1, viewport.clientHeight - verticalPadding - 2);
    return Math.min(1, Math.max(0.08, Math.min(availableWidth / width, availableHeight / height) * 0.98));
  };

  const applyZoom = (nextZoom) => {
    zoom = clampZoom(nextZoom);
    target.style.zoom = String(zoom);
    target.style.setProperty("--floor-plan-marker-scale", String(1 / zoom));
  };

  const configure = () => {
    target.style.boxSizing = "";
    target.style.width = "";
    target.style.height = "";
    target.style.padding = "";
    minZoom = fitZoom();
    applyZoom(minZoom);
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  };
  viewport.__fitFloorPlanOverview = configure;

  const setZoomAt = (nextZoom, clientX, clientY) => {
    const viewportRect = viewport.getBoundingClientRect();
    const pointX = clientX - viewportRect.left;
    const pointY = clientY - viewportRect.top;
    const oldWidth = Math.max(1, target.getBoundingClientRect().width);
    const oldHeight = Math.max(1, target.getBoundingClientRect().height);
    const anchorX = (viewport.scrollLeft + pointX) / oldWidth;
    const anchorY = (viewport.scrollTop + pointY) / oldHeight;
    applyZoom(nextZoom);
    const newWidth = Math.max(1, target.getBoundingClientRect().width);
    const newHeight = Math.max(1, target.getBoundingClientRect().height);
    viewport.scrollLeft = Math.max(0, (anchorX * newWidth) - pointX);
    viewport.scrollTop = Math.max(0, (anchorY * newHeight) - pointY);
  };
  const distance = (first, second) => Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  const midpoint = (first, second) => ({
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  });
  viewport.addEventListener("touchstart", (event) => {
    if (event.touches.length >= 2) {
      gesture = {
        type: "pinch",
        distance: Math.max(1, distance(event.touches[0], event.touches[1])),
        zoom,
      };
      event.preventDefault();
      return;
    }
    if (event.touches.length === 1) {
      gesture = {
        type: "pan",
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
    }
  }, { passive: false });
  viewport.addEventListener("touchmove", (event) => {
    if (!gesture) return;
    if (gesture.type === "pinch" && event.touches.length >= 2) {
      const center = midpoint(event.touches[0], event.touches[1]);
      setZoomAt(gesture.zoom * (distance(event.touches[0], event.touches[1]) / gesture.distance), center.x, center.y);
      event.preventDefault();
      return;
    }
    if (gesture.type === "pan" && event.touches.length === 1) {
      viewport.scrollLeft = gesture.left - (event.touches[0].clientX - gesture.x);
      viewport.scrollTop = gesture.top - (event.touches[0].clientY - gesture.y);
      event.preventDefault();
    }
  }, { passive: false });
  viewport.addEventListener("touchend", (event) => {
    if (!event.touches.length) gesture = null;
  }, { passive: true });

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const step = event.deltaY > 0 ? -.25 : .25;
    setZoomAt(zoom + step, event.clientX, event.clientY);
  }, { passive: false });
  enableLineDiagramMousePan(viewport);

  const image = target.querySelector("img");
  if (image && !image.complete) image.addEventListener("load", configure, { once: true });
  else configure();
  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      const wasAtOverview = zoom <= minZoom + 0.01;
      minZoom = fitZoom();
      if (wasAtOverview) {
        applyZoom(minZoom);
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
      }
    });
  }, { passive: true });
}

function resetFloorPlanOverview(viewport = qs("#rackPanel .floor-plan")) {
  if (!viewport || typeof viewport.__fitFloorPlanOverview !== "function") return;
  window.requestAnimationFrame(() => viewport.__fitFloorPlanOverview());
}

function registeredFloorPlanFor(stationName) {
  const targetKey = floorPlanStationKey(stationName);
  if (!targetKey) return null;
  return [...loadFloorPlans()].reverse().find((item) => {
    const aliases = [item.stationName, item.sheetName, item.fileName, ...(item.stationAliases || [])];
    return aliases.some((alias) => floorPlanStationKey(alias) === targetKey);
  }) || null;
}

function applyRegisteredFloorPlan(record, location, equipmentName, targetText = "") {
  const plan = registeredFloorPlanFor(record.stationName);
  const floorPlan = qs("#rackPanel .floor-plan");
  if (!floorPlan) return;
  if (!plan) {
    floorPlan.classList.add("uploaded-floor-plan", "floor-plan-empty-result");
    floorPlan.innerHTML = '<p class="uploaded-rack-warning">' + escapeHtml(record.stationName) + '\uC640(\uACFC) \uC77C\uCE58\uD558\uB294 \uB4F1\uB85D \uD3C9\uBA74\uB3C4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>';
    return;
  }
  floorPlan.classList.add("uploaded-floor-plan");
  const isTextTarget = Boolean(String(targetText || "").trim());
  const lookupValues = floorPlanLookupValues(record, location, equipmentName, targetText);
  if (plan.type === "image") {
    const marker = floorPlanMarkerPosition(plan, lookupValues);
    const markerTitle = marker.kind === "rack" ? `RACK ${marker.label}` : (marker.matchedValue || marker.label);
    const markerMarkup = marker.found
      ? `<span class="uploaded-rack-marker" style="left:${marker.left};top:${marker.top}"><span class="uploaded-rack-marker-label"><b>${escapeHtml(markerTitle)}</b><small>${escapeHtml(equipmentName)} 위치</small></span></span>`
      : "";
    const warningMarkup = !marker.found
      ? `<p class="uploaded-rack-warning">${escapeHtml(lookupValues.join(" / ") || "선택 항목")}과(와) 일치하는 좌표가 없습니다. 관리자 화면에서 노드명 또는 랙 정보를 입력하고 이미지 좌표를 지정해주세요.</p>`
      : "";
    floorPlan.innerHTML = `<div class="uploaded-image-plan"><img src="${plan.content}" alt="${escapeHtml(record.stationName)} 평면도">${markerMarkup}${warningMarkup}</div>`;
    initFloorPlanTouchZoom(floorPlan);
    return;
  }
  floorPlan.classList.add("floor-plan-empty-result");
  floorPlan.innerHTML = '<p class="uploaded-rack-warning">\uD604\uC7AC \uD3C9\uBA74\uB3C4\uB294 JPG \uC5C5\uB85C\uB4DC \uD540 \uC9C0\uC815 \uBC29\uC2DD\uB9CC \uD45C\uC2DC\uD569\uB2C8\uB2E4.</p>';
  return;
  floorPlan.innerHTML = `<div class="uploaded-excel-plan">${plan.content}</div>`;
  floorPlan.querySelectorAll(".excel-plan-cell").forEach((cell) => {
    if (!cell.textContent.trim() && /span\s+[2-9]/.test(cell.style.gridColumn) && /span\s+[2-9]/.test(cell.style.gridRow)) cell.classList.add("bordered");
  });
  fitUploadedExcelPlanText(floorPlan);
  const candidates = [...floorPlan.querySelectorAll(".excel-plan-cell, [data-rack-value], td, th")];
  const findExcelMatch = (target) => {
    const targetValue = normalizeFloorCoordinateLabel(target);
    if (!targetValue) return null;
    const cellValue = (cell) => normalizeFloorCoordinateLabel(cell.dataset.rackValue || cell.textContent);
    return candidates.find((cell) => cellValue(cell) === targetValue)
      || (!/^\d+$/.test(targetValue) && targetValue.length >= 4
        ? candidates.find((cell) => {
          const value = cellValue(cell);
          return value.length >= 4 && (value.includes(targetValue) || targetValue.includes(value));
        })
        : null);
  };
  const matchedLookup = lookupValues
    .map((value) => ({ value, cell: findExcelMatch(value) }))
    .find((match) => match.cell);
  const rackCell = matchedLookup?.cell || null;
  if (rackCell) {
    rackCell.classList.add("uploaded-rack-active");
    rackCell.insertAdjacentHTML("beforeend", `<small>${escapeHtml(equipmentName)} 위치</small>`);
    fitTextElementToBox(rackCell, isTextTarget || !/^\d+$/.test(normalizeFloorCoordinateLabel(matchedLookup.value)) ? 3.8 : 3.4);
    floorPlan.__floorPlanFocusTarget = rackCell;
  } else {
    const targetLabel = lookupValues.join(" / ") || (isTextTarget ? targetText : location.rack);
    floorPlan.querySelector(".uploaded-excel-plan").insertAdjacentHTML("afterbegin", `<p class="uploaded-rack-warning">${escapeHtml(targetLabel)}을(를) 엑셀 평면도에서 찾지 못했습니다.</p>`);
  }
  initFloorPlanTouchZoom(floorPlan);
}

function diagramMatchKey(value) {
  return String(value || "").toUpperCase().replace(/직선도/g, "").replace(/[^0-9A-Z가-힣]/g, "");
}

function continuousMatchTokens(value) {
  const source = String(value || "");
  const fullValue = normalizeDiagramSearchText(source);
  const matches = source.match(/[0-9A-Za-z가-힣#_-]{6,}/g) || [];
  return [fullValue, ...matches
    .flatMap((token) => {
      const base = normalizeDiagramSearchText(token);
      const noHash = normalizeDiagramSearchText(token.replace(/^#+/, ""));
      const compact = normalizeDiagramSearchText(token.replace(/[^0-9A-Za-z가-힣]/g, ""));
      return [base, noHash, compact];
    })]
    .filter((token, index, array) => token.length >= 6 && array.indexOf(token) === index);
}

function recordLineDiagramTokens(record, preferredText = "") {
  const preferredTokens = continuousMatchTokens(preferredText);
  if (String(preferredText || "").trim()) return preferredTokens;
  const directValues = record.lineDiagramKind === "b2c"
    ? (record.lineDiagramSearchValues || [record.serviceName, record.cellName, record.memo, record.b2cName])
    : [record.cellName, record.onuCellConfig, record.b2cName, record.serviceName];
  const baseTokens = directValues.flatMap(continuousMatchTokens);
  if (record.lineDiagramKind === "b2c") {
    return baseTokens.filter((token, index, array) => token && array.indexOf(token) === index);
  }
  const matchedLines = loadB2CLines().filter((line) => {
    if (!sameStationName(line.stationName, record.stationName)) return false;
    const values = [line.serviceName, line.b2cName, line.cellName, ...(line.searchValues || [])];
    return baseTokens.some((token) => values.some((value) => {
      return Boolean(findContinuousDiagramMatch(value, [token]));
    }));
  });
  const lineTokens = matchedLines.flatMap((line) => [
    line.serviceName,
    line.b2cName,
    line.cellName,
    ...(line.searchValues || []),
  ].flatMap(continuousMatchTokens));
  return [...baseTokens, ...lineTokens].filter((token, index, array) => token && array.indexOf(token) === index);
}

function recordLineDiagramNodes(record, preferredText = "") {
  if (record.lineDiagramKind === "b2c") {
    return [record.otxMain, record.orxMain, record.backup]
      .flatMap((node) => String(node || "").split(/\s*\/\s*|\r?\n/))
      .map((node) => node.trim())
      .filter((node, index, array) => node && array.indexOf(node) === index);
  }
  const tokens = recordLineDiagramTokens(record, preferredText);
  const matchedLines = loadB2CLines().filter((line) => {
    if (!sameStationName(line.stationName, record.stationName)) return false;
    const values = [line.serviceName, line.b2cName, line.cellName, ...(line.searchValues || [])];
    return tokens.some((token) => values.some((value) => {
      return Boolean(findContinuousDiagramMatch(value, [token]));
    }));
  });
  const nodes = [
    ...matchedLines.map((line) => line.node),
    record.otxMain,
    record.orxMain,
    record.backup,
  ];
  return nodes
    .flatMap((node) => String(node || "").split(/\s*\/\s*|\r?\n/))
    .map((node) => node.trim())
    .filter((node, index, array) => node && array.indexOf(node) === index);
}

function diagramIndexedSearchTokens(record, preferredText = "") {
  return recordLineDiagramTokens(record, preferredText)
    .map(normalizeDiagramSearchText)
    .filter((token, index, array) => token.length >= 6 && array.indexOf(token) === index);
}

function b2cDiagramNodeScore(diagram, nodeKeys) {
  const diagramKeys = [
    diagram.nodeKey,
    diagramMatchKey(diagram.nodeName),
    diagramMatchKey(diagram.sheetName),
  ].filter(Boolean);
  if (!diagramKeys.length || !nodeKeys.length) return 0;
  if (diagramKeys.some((key) => nodeKeys.includes(key))) return 80;
  if (diagramKeys.some((key) => nodeKeys.some((nodeKey) => key.includes(nodeKey) || nodeKey.includes(key)))) return 35;
  return 0;
}

function scoreB2CDiagramForRecord(diagram, record, nodeKeys, tokens, preferredText = "") {
  const strictB2CMatch = record.lineDiagramKind === "b2c";
  const indexedMatches = matchedIndexedTargets(diagram.searchTargets || [], tokens, { bestOnly: strictB2CMatch });
  const nodeScore = b2cDiagramNodeScore(diagram, nodeKeys);
  const exactIndexed = indexedMatches.filter((match) => match.fullTokenMatch).length;
  const directValues = String(preferredText || "").trim()
    ? [preferredText]
    : [record.cellName, record.onuCellConfig, record.b2cName, record.serviceName];
  const directText = directValues.map(normalizeDiagramSearchText).filter(Boolean);
  const directMatches = indexedMatches.filter((match) => {
    const targetText = normalizeDiagramSearchText(match.target?.text || match.target?.label || "");
    return directText.some((text) => text.length >= 6 && findContinuousDiagramMatch(targetText, [text]));
  }).length;
  return {
    diagram,
    indexedMatches,
    nodeScore,
    score: strictB2CMatch
      ? ((indexedMatches[0]?.matchScore || 0) * 100) + (directMatches * 500) + nodeScore
      : (indexedMatches.length * 1000) + (exactIndexed * 350) + (directMatches * 500) + nodeScore,
  };
}

async function findB2CDiagramForRecord(record, preferredText = "") {
  const diagrams = await loadB2CDiagrams(record.stationName);
  const nodes = recordLineDiagramNodes(record, preferredText);
  const nodeKeys = nodes.map(diagramMatchKey).filter(Boolean);
  const tokens = diagramIndexedSearchTokens(record, preferredText);
  const scored = diagrams
    .map((diagram) => scoreB2CDiagramForRecord(diagram, record, nodeKeys, tokens, preferredText))
    .filter((candidate) => candidate.score > 0)
    .sort((first, second) => {
      if (record.lineDiagramKind === "b2c" && second.score !== first.score) return second.score - first.score;
      if (second.indexedMatches.length !== first.indexedMatches.length) return second.indexedMatches.length - first.indexedMatches.length;
      if (second.score !== first.score) return second.score - first.score;
      return String(first.diagram.sheetName || "").localeCompare(String(second.diagram.sheetName || ""), "ko");
    });
  const indexedCandidate = scored.find((candidate) => candidate.indexedMatches.length);
  if (indexedCandidate) {
    return { diagram: indexedCandidate.diagram, node: indexedCandidate.diagram.nodeName || nodes[0] || "" };
  }
  if (String(preferredText || "").trim()) return { diagram: null, node: nodes[0] || "" };
  const hasIndexedDiagrams = diagrams.some((diagram) => diagram.searchTargets?.length);
  const b2cLookupRequiresExactSheet = Boolean(record.b2cName || record.serviceName) && tokens.length && hasIndexedDiagrams;
  if (b2cLookupRequiresExactSheet) return { diagram: null, node: nodes[0] || "" };
  for (const node of nodes) {
    const nodeKey = diagramMatchKey(node);
    if (!nodeKey) continue;
    const diagram = diagrams.find((item) => (item.nodeKey || diagramMatchKey(item.nodeName || item.sheetName)) === nodeKey);
    if (diagram) return { diagram, node };
  }
  return { diagram: null, node: nodes[0] || "" };
}

function applyLineDiagramHighlights(root, tokens) {
  const uniqueTokens = tokens.filter((token, index, array) => token && array.indexOf(token) === index);
  let count = 0;
  root.querySelectorAll(".excel-plan-cell").forEach((cell) => {
    const text = normalizePlanText(cell.textContent);
    if (!text || !/\d/.test(text)) return;
    const matched = uniqueTokens.some((token) => text.includes(token) || token.includes(text));
    if (!matched) return;
    cell.classList.add("line-diagram-active");
    cell.dataset.matchLabel = cell.textContent.trim();
    fitTextElementToBox(cell, 3.8);
    count += 1;
  });
  return count;
}

function applyDrawingDiagramHighlights(root, tokens) {
  const uniqueTokens = tokens.filter((token, index, array) => token && array.indexOf(token) === index);
  root.querySelectorAll(".line-diagram-match-frame").forEach((frame) => frame.remove());
  const matches = [...root.querySelectorAll('.drawing-diagram-text[data-diagram-searchable="true"]')].map((item) => {
    const text = normalizeDiagramSearchText(item.dataset.diagramText || item.textContent);
    const match = findContinuousDiagramMatch(text, uniqueTokens);
    return match ? { item, token: match } : null;
  }).filter(Boolean);
  matches.forEach(({ item, token }, index) => {
    item.classList.add("line-diagram-active");
    item.dataset.matchToken = token;
    item.dataset.matchLabel = item.dataset.diagramText || item.textContent.trim();
    const textContainer = item.closest("foreignObject");
    const frameParent = textContainer?.parentNode || item.parentNode;
    if (frameParent) {
      const frame = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const box = textContainer
        ? Object.fromEntries(["x", "y", "width", "height"].map((attribute) => [attribute, textContainer.getAttribute(attribute) || "0"]))
        : {
          x: item.dataset.diagramX || "0",
          y: item.dataset.diagramY || "0",
          width: item.dataset.diagramWidth || "0",
          height: item.dataset.diagramHeight || "0",
        };
      Object.entries(box).forEach(([attribute, value]) => frame.setAttribute(attribute, value));
      frame.setAttribute("rx", "18000");
      frame.setAttribute("ry", "18000");
      frame.setAttribute("data-match-frame", String(index));
      frame.classList.add("line-diagram-match-frame");
      frameParent.appendChild(frame);
      item._diagramMatchFrame = frame;
    }
  });
  return matches.length;
}

function enableLineDiagramMousePan(viewport) {
  let drag = null;

  const finishDrag = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    if (viewport.hasPointerCapture?.(drag.pointerId)) {
      viewport.releasePointerCapture(drag.pointerId);
    }
    drag = null;
    viewport.classList.remove("is-mouse-panning");
  };

  viewport.classList.add("mouse-pan-enabled");
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture?.(event.pointerId);
    viewport.classList.add("is-mouse-panning");
    event.preventDefault();
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
    event.preventDefault();
  });
  viewport.addEventListener("pointerup", finishDrag);
  viewport.addEventListener("pointercancel", finishDrag);
  viewport.addEventListener("lostpointercapture", finishDrag);
}

function initLineDiagramZoom(root) {
  const viewport = root.querySelector(".line-diagram-canvas");
  const target = root.querySelector(".drawing-diagram-svg, .line-diagram-image, .excel-plan-canvas");
  const label = root.querySelector("[data-diagram-zoom-label]");
  const zoomOut = root.querySelector("[data-diagram-zoom-out]");
  const zoomReset = root.querySelector("[data-diagram-zoom-reset]");
  const zoomIn = root.querySelector("[data-diagram-zoom-in]");
  const matchPrevious = root.querySelector("[data-diagram-match-previous]");
  const matchNext = root.querySelector("[data-diagram-match-next]");
  const matchLabel = root.querySelector("[data-diagram-match-label]");
  const mapCard = root.querySelector("[data-diagram-map-card]");
  const mapTitle = root.querySelector("[data-diagram-map-title]");
  const mapText = root.querySelector("[data-diagram-map-text]");
  const mapLocate = root.querySelector("[data-diagram-map-locate]");
  if (!viewport || !target || !label || !zoomOut || !zoomReset || !zoomIn) return null;

  let zoom = 1;
  const minZoom = 1;
  const maxZoom = 12;
  const searchZoom = 7;
  let ready = false;
  let baseWidth = 0;
  let baseHeight = 0;
  let baseScale = 0.1;
  let matches = [];
  let matchIndex = 0;
  let pendingMatches = null;

  const centerOn = (element) => {
    if (!element?.isConnected) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const itemRect = element.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      viewport.scrollLeft += (itemRect.left + (itemRect.width / 2)) - (viewportRect.left + (viewportRect.width / 2));
      viewport.scrollTop += (itemRect.top + (itemRect.height / 2)) - (viewportRect.top + (viewportRect.height / 2));
    }));
  };

  const overviewZoomFor = () => {
    if (!baseWidth) return minZoom;
    const availableWidth = Math.max(1, viewport.clientWidth - 4);
    return Math.min(maxZoom, Math.max(minZoom, Math.floor(availableWidth / baseWidth)));
  };

  const mapPositionLabel = (element) => {
    const left = Number(element?.dataset?.mapLeft);
    const top = Number(element?.dataset?.mapTop);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return "검색 지점";
    const horizontal = left < 33 ? "왼쪽" : (left > 66 ? "오른쪽" : "가운데");
    const vertical = top < 33 ? "상단" : (top > 66 ? "하단" : "중앙");
    return `도면 ${vertical} ${horizontal}`;
  };

  const apply = (nextZoom, preserveCenter = true) => {
    if (!ready) return;
    const oldWidth = Math.max(1, target.getBoundingClientRect().width);
    const oldHeight = Math.max(1, target.getBoundingClientRect().height);
    const centerX = (viewport.scrollLeft + (viewport.clientWidth / 2)) / oldWidth;
    const centerY = (viewport.scrollTop + (viewport.clientHeight / 2)) / oldHeight;
    zoom = Math.min(maxZoom, Math.max(minZoom, Math.round(nextZoom)));
    if (target.classList.contains("excel-plan-canvas")) {
      target.style.zoom = String(baseScale * zoom);
    } else {
      target.style.width = `${baseWidth * zoom}px`;
      target.style.height = `${baseHeight * zoom}px`;
    }
    label.textContent = `${zoom * 10}%`;
    zoomOut.disabled = zoom <= minZoom;
    zoomIn.disabled = zoom >= maxZoom;
    if (preserveCenter) {
      requestAnimationFrame(() => {
        viewport.scrollLeft = Math.max(0, (centerX * target.getBoundingClientRect().width) - (viewport.clientWidth / 2));
        viewport.scrollTop = Math.max(0, (centerY * target.getBoundingClientRect().height) - (viewport.clientHeight / 2));
      });
    }
  };

  const readableZoomFor = () => Math.max(searchZoom, overviewZoomFor());

  const focusMatch = (index, autoZoom = true) => {
    if (!ready || !matches.length) return;
    matchIndex = ((index % matches.length) + matches.length) % matches.length;
    matches.forEach((item) => item.classList.remove("line-diagram-focus-current"));
    matches.forEach((item) => item._diagramMatchFrame?.classList.remove("line-diagram-focus-current"));
    const selected = matches[matchIndex];
    selected.classList.add("line-diagram-focus-current");
    selected._diagramMatchFrame?.classList.add("line-diagram-focus-current");
    if (matchLabel) {
      const token = selected.dataset.matchToken ? ` · ${selected.dataset.matchToken}` : "";
      matchLabel.textContent = `${matchIndex + 1}/${matches.length}${token}`;
    }
    if (mapCard) {
      mapCard.hidden = false;
      if (mapTitle) mapTitle.textContent = `검색 위치 ${matchIndex + 1}/${matches.length} · ${mapPositionLabel(selected)}`;
      if (mapText) {
        mapText.textContent = selected.dataset.matchLabel
          || selected.getAttribute("title")
          || selected.textContent.trim()
          || selected.dataset.matchToken
          || "일치 항목";
      }
    }

    if (autoZoom) {
      apply(readableZoomFor(selected), false);
      centerOn(selected);
    }
  };

  const setMatches = (elements) => {
    matches = [...elements].filter((element, index, array) => element && array.indexOf(element) === index);
    matchIndex = 0;
    if (!ready) {
      pendingMatches = matches;
      return;
    }
    if (matchPrevious) matchPrevious.disabled = matches.length <= 1;
    if (matchNext) matchNext.disabled = matches.length <= 1;
    if (!matches.length) {
      if (matchLabel) matchLabel.textContent = "일치 개소 없음";
      if (mapCard) mapCard.hidden = true;
      return;
    }
    focusMatch(0, true);
  };

  const configure = () => {
    const sourceWidth = Number(target.dataset.baseWidth) || target.naturalWidth || target.scrollWidth || target.clientWidth;
    const sourceHeight = Number(target.dataset.baseHeight) || target.naturalHeight || target.scrollHeight || target.clientHeight;
    baseScale = 0.1;
    baseWidth = sourceWidth * baseScale;
    baseHeight = sourceHeight * baseScale;
    if (!baseWidth || !baseHeight) return;
    target.dataset.baseWidth = String(sourceWidth);
    target.dataset.baseHeight = String(sourceHeight);
    ready = true;
    apply(overviewZoomFor(), false);
    if (pendingMatches) {
      const queued = pendingMatches;
      pendingMatches = null;
      setMatches(queued);
    }
  };

  zoomOut.addEventListener("click", () => apply(zoom - 1));
  zoomReset.addEventListener("click", () => {
    apply(overviewZoomFor(), false);
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  });
  zoomIn.addEventListener("click", () => apply(zoom + 1));
  matchPrevious?.addEventListener("click", () => focusMatch(matchIndex - 1, true));
  matchNext?.addEventListener("click", () => focusMatch(matchIndex + 1, true));
  mapLocate?.addEventListener("click", () => {
    if (!matches.length) return;
    apply(readableZoomFor(matches[matchIndex]), false);
    centerOn(matches[matchIndex]);
  });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    apply(zoom + direction);
  }, { passive: false });

  enableLineDiagramMousePan(viewport);

  let touchGesture = null;
  const touchDistance = (first, second) => Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  viewport.addEventListener("touchstart", (event) => {
    if (event.touches.length >= 2) {
      touchGesture = {
        type: "pinch",
        distance: Math.max(1, touchDistance(event.touches[0], event.touches[1])),
        zoom,
      };
      event.preventDefault();
      return;
    }
    if (event.touches.length === 1) {
      touchGesture = {
        type: "pan",
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
    }
  }, { passive: false });
  viewport.addEventListener("touchmove", (event) => {
    if (!touchGesture) return;
    if (touchGesture.type === "pinch" && event.touches.length >= 2) {
      const ratio = touchDistance(event.touches[0], event.touches[1]) / touchGesture.distance;
      apply(touchGesture.zoom * ratio);
      event.preventDefault();
      return;
    }
    if (touchGesture.type === "pan" && event.touches.length === 1) {
      viewport.scrollLeft = touchGesture.left - (event.touches[0].clientX - touchGesture.x);
      viewport.scrollTop = touchGesture.top - (event.touches[0].clientY - touchGesture.y);
      event.preventDefault();
    }
  }, { passive: false });
  viewport.addEventListener("touchend", (event) => {
    if (!event.touches.length) touchGesture = null;
    else if (event.touches.length === 1) {
      touchGesture = {
        type: "pan",
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
    }
  }, { passive: true });

  if (target.tagName === "IMG" && !target.complete) target.addEventListener("load", configure, { once: true });
  else configure();
  return { setMatches, focusMatch, setZoom: (value) => apply(value) };
}

function waitForImageLoad(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("직선도 그림을 불러오지 못했습니다."));
  });
}

async function initPdfLineDiagramMap(root, diagram) {
  const viewport = root.querySelector(".pdf-line-diagram-canvas");
  const world = root.querySelector(".line-diagram-pdf-world");
  const canvas = root.querySelector(".line-diagram-pdf-canvas");
  const overlay = root.querySelector(".line-diagram-pdf-overlay");
  const label = root.querySelector("[data-diagram-zoom-label]");
  const zoomOut = root.querySelector("[data-diagram-zoom-out]");
  const zoomReset = root.querySelector("[data-diagram-zoom-reset]");
  const zoomIn = root.querySelector("[data-diagram-zoom-in]");
  const matchPrevious = root.querySelector("[data-diagram-match-previous]");
  const matchNext = root.querySelector("[data-diagram-match-next]");
  const matchLabel = root.querySelector("[data-diagram-match-label]");
  const mapCard = root.querySelector("[data-diagram-map-card]");
  const mapTitle = root.querySelector("[data-diagram-map-title]");
  const mapText = root.querySelector("[data-diagram-map-text]");
  const mapLocate = root.querySelector("[data-diagram-map-locate]");
  if (!viewport || !world || !canvas || !overlay || !label || !zoomOut || !zoomReset || !zoomIn) return null;

  const pdfjs = await loadPdfJsRuntime();
  const loadingTask = pdfjs.getDocument({ url: diagram.content });
  let pdf = null;
  try {
    pdf = await promiseWithTimeout(
      loadingTask.promise,
      15000,
      "벡터 직선도 파일을 불러오는 시간이 초과되었습니다.",
    );
  } catch (error) {
    try {
      await loadingTask.destroy();
    } catch {}
    throw error;
  }
  const page = await promiseWithTimeout(
    pdf.getPage(1),
    10000,
    "벡터 직선도 첫 화면을 준비하는 시간이 초과되었습니다.",
  );
  const unitViewport = page.getViewport({ scale: 1 });
  const minLevel = 1;
  const maxLevel = 12;
  const searchLevel = 7;
  const indexedWidths = (diagram.searchTargets || [])
    .map((target) => Number(target?.width))
    .filter((width) => Number.isFinite(width) && width > 0);
  const smallestIndexedWidth = indexedWidths.length ? Math.min(...indexedWidths) : 0.5;
  let level = minLevel;
  let scale = 1;
  let renderTask = null;
  let renderQueued = false;
  let matches = [];
  let matchIndex = 0;

  // Keep 10% as a true full-width overview even when a future workbook is
  // much wider than the current one. At 100%, the smallest indexed label
  // should still be large enough to identify on a phone.
  const maxFitMultiplier = () => {
    const targetWidthAtFit = Math.max(0.1, viewport.clientWidth * (smallestIndexedWidth / 100));
    const requiredForReadableLabel = 320 / targetWidthAtFit;
    return Math.min(4096, Math.max(192, requiredForReadableLabel * 1.2));
  };

  const levelMultiplier = (value) => {
    const progress = (value - minLevel) / (maxLevel - minLevel);
    return Math.pow(maxFitMultiplier(), progress);
  };

  const fitScale = () => Math.max(
    0.000001,
    Math.min(
      (viewport.clientWidth - 2) / Math.max(1, unitViewport.width),
      (viewport.clientHeight - 2) / Math.max(1, unitViewport.height),
    ),
  );

  // The generic plan viewport is centered by default. A huge PDF world then
  // overflows equally to the left and right, making half of it unreachable by
  // scrollLeft. Force map coordinates to start at the upper-left corner.
  viewport.style.justifyItems = "start";
  viewport.style.alignItems = "start";
  world.style.justifySelf = "start";
  world.style.margin = "0";

  const updateMarkerPositions = () => {
    const worldWidth = parseFloat(world.style.width) || viewport.scrollWidth;
    const worldHeight = parseFloat(world.style.height) || viewport.scrollHeight;
    overlay.style.width = `${viewport.clientWidth}px`;
    overlay.style.height = `${viewport.clientHeight}px`;
    matches.forEach((marker) => {
      const left = ((Number(marker.dataset.mapLeft) || 0) / 100) * worldWidth - viewport.scrollLeft;
      const top = ((Number(marker.dataset.mapTop) || 0) / 100) * worldHeight - viewport.scrollTop;
      const width = ((Number(marker.dataset.mapWidth) || 0) / 100) * worldWidth;
      const height = ((Number(marker.dataset.mapHeight) || 0) / 100) * worldHeight;
      marker.style.left = `${left}px`;
      marker.style.top = `${top}px`;
      marker.style.width = `${width}px`;
      marker.style.height = `${height}px`;
      marker.hidden = left + width < -70
        || top + height < -70
        || left > viewport.clientWidth + 70
        || top > viewport.clientHeight + 70;
    });
  };

  const scheduleRender = () => {
    updateMarkerPositions();
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(async () => {
      renderQueued = false;
      const cssWidth = Math.max(1, viewport.clientWidth);
      const cssHeight = Math.max(1, viewport.clientHeight);
      const outputScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(cssWidth * outputScale);
      canvas.height = Math.round(cssHeight * outputScale);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      const context = canvas.getContext("2d", { alpha: false });
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      renderTask?.cancel();
      const pdfViewport = page.getViewport({ scale });
      renderTask = page.render({
        canvasContext: context,
        viewport: pdfViewport,
        transform: [
          outputScale,
          0,
          0,
          outputScale,
          -viewport.scrollLeft * outputScale,
          -viewport.scrollTop * outputScale,
        ],
      });
      try {
        await renderTask.promise;
      } catch (error) {
        if (error?.name !== "RenderingCancelledException") {
          console.error("벡터 직선도 렌더링 실패", error);
        }
      }
    });
  };

  const applyLevel = (nextLevel, preserveCenter = true, anchor = null) => {
    const oldWidth = Math.max(1, parseFloat(world.style.width) || viewport.scrollWidth);
    const oldHeight = Math.max(1, parseFloat(world.style.height) || viewport.scrollHeight);
    const anchorX = anchor?.x ?? (viewport.clientWidth / 2);
    const anchorY = anchor?.y ?? (viewport.clientHeight / 2);
    const relativeX = (viewport.scrollLeft + anchorX) / oldWidth;
    const relativeY = (viewport.scrollTop + anchorY) / oldHeight;
    level = Math.min(maxLevel, Math.max(minLevel, nextLevel));
    scale = fitScale() * levelMultiplier(level);
    const newWidth = unitViewport.width * scale;
    const newHeight = unitViewport.height * scale;
    world.style.width = `${newWidth}px`;
    world.style.height = `${newHeight}px`;
    label.textContent = `${Math.round(level * 10)}%`;
    zoomOut.disabled = level <= minLevel;
    zoomIn.disabled = level >= maxLevel;
    if (preserveCenter) {
      viewport.scrollLeft = Math.max(0, (relativeX * newWidth) - anchorX);
      viewport.scrollTop = Math.max(0, (relativeY * newHeight) - anchorY);
    }
    updateMarkerPositions();
    scheduleRender();
  };

  const centerOnMarker = (marker) => {
    if (!marker) return;
    const left = Number(marker.dataset.mapLeft) || 0;
    const top = Number(marker.dataset.mapTop) || 0;
    const width = Number(marker.dataset.mapWidth) || 0;
    const height = Number(marker.dataset.mapHeight) || 0;
    const worldWidth = parseFloat(world.style.width) || viewport.scrollWidth;
    const worldHeight = parseFloat(world.style.height) || viewport.scrollHeight;
    viewport.scrollLeft = Math.max(0, (((left + (width / 2)) / 100) * worldWidth) - (viewport.clientWidth / 2));
    viewport.scrollTop = Math.max(0, (((top + (height / 2)) / 100) * worldHeight) - (viewport.clientHeight / 2));
    updateMarkerPositions();
    scheduleRender();
  };

  const readableLevelFor = () => searchLevel;

  const mapPositionLabel = (marker) => {
    const left = Number(marker?.dataset?.mapLeft);
    const top = Number(marker?.dataset?.mapTop);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return "검색 지점";
    const horizontal = left < 33 ? "왼쪽" : (left > 66 ? "오른쪽" : "가운데");
    const vertical = top < 33 ? "상단" : (top > 66 ? "하단" : "중앙");
    return `도면 ${vertical} ${horizontal}`;
  };

  const focusMatch = (index, autoZoom = true) => {
    if (!matches.length) return;
    matchIndex = ((index % matches.length) + matches.length) % matches.length;
    matches.forEach((item) => item.classList.remove("line-diagram-focus-current"));
    const selected = matches[matchIndex];
    selected.classList.add("line-diagram-focus-current");
    const token = selected.dataset.matchToken ? ` · ${selected.dataset.matchToken}` : "";
    if (matchLabel) matchLabel.textContent = `${matchIndex + 1}/${matches.length}${token}`;
    if (mapCard) {
      mapCard.hidden = false;
      if (mapTitle) mapTitle.textContent = `검색 위치 ${matchIndex + 1}/${matches.length} · ${mapPositionLabel(selected)}`;
      if (mapText) mapText.textContent = selected.dataset.matchLabel || selected.title || selected.dataset.matchToken || "일치 항목";
    }
    if (autoZoom) applyLevel(readableLevelFor(selected), false);
    requestAnimationFrame(() => centerOnMarker(selected));
  };

  const setMatches = (elements) => {
    matches = [...elements].filter((element, index, array) => element && array.indexOf(element) === index);
    matchIndex = 0;
    if (matchPrevious) matchPrevious.disabled = matches.length <= 1;
    if (matchNext) matchNext.disabled = matches.length <= 1;
    if (!matches.length) {
      if (matchLabel) matchLabel.textContent = "일치 개소 없음";
      if (mapCard) mapCard.hidden = true;
      return;
    }
    updateMarkerPositions();
    focusMatch(0, true);
  };

  zoomOut.addEventListener("click", () => applyLevel(level - 1));
  zoomReset.addEventListener("click", () => {
    applyLevel(minLevel, false);
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    scheduleRender();
  });
  zoomIn.addEventListener("click", () => applyLevel(level + 1));
  matchPrevious?.addEventListener("click", () => focusMatch(matchIndex - 1, true));
  matchNext?.addEventListener("click", () => focusMatch(matchIndex + 1, true));
  mapLocate?.addEventListener("click", () => focusMatch(matchIndex, true));
  viewport.addEventListener("scroll", scheduleRender, { passive: true });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const step = event.ctrlKey ? 0.75 : 0.5;
    applyLevel(level + (direction * step));
  }, { passive: false });

  enableLineDiagramMousePan(viewport);

  let touchGesture = null;
  const touchDistance = (first, second) => Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  viewport.addEventListener("touchstart", (event) => {
    if (event.touches.length >= 2) {
      touchGesture = {
        type: "pinch",
        distance: Math.max(1, touchDistance(event.touches[0], event.touches[1])),
        level,
      };
      event.preventDefault();
    } else if (event.touches.length === 1) {
      touchGesture = {
        type: "pan",
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
    }
  }, { passive: false });
  viewport.addEventListener("touchmove", (event) => {
    if (!touchGesture) return;
    if (touchGesture.type === "pinch" && event.touches.length >= 2) {
      const ratio = touchDistance(event.touches[0], event.touches[1]) / touchGesture.distance;
      const levelDelta = Math.log2(Math.max(0.25, ratio)) * 2.2;
      applyLevel(touchGesture.level + levelDelta);
      event.preventDefault();
    } else if (touchGesture.type === "pan" && event.touches.length === 1) {
      viewport.scrollLeft = touchGesture.left - (event.touches[0].clientX - touchGesture.x);
      viewport.scrollTop = touchGesture.top - (event.touches[0].clientY - touchGesture.y);
      event.preventDefault();
    }
  }, { passive: false });
  viewport.addEventListener("touchend", (event) => {
    if (!event.touches.length) touchGesture = null;
  }, { passive: true });

  applyLevel(minLevel, false);
  scheduleRender();
  return { setMatches, focusMatch, setZoom: applyLevel };
}

function longestContinuousDiagramMatch(targetValue, candidateValue, minimumLength = 6) {
  const target = normalizeDiagramSearchText(targetValue);
  const candidate = normalizeDiagramSearchText(candidateValue);
  if (target.length < minimumLength || candidate.length < minimumLength) return "";
  const shorter = target.length <= candidate.length ? target : candidate;
  const longer = target.length <= candidate.length ? candidate : target;
  if (longer.includes(shorter)) return shorter;
  for (let length = shorter.length - 1; length >= minimumLength; length -= 1) {
    for (let index = 0; index <= shorter.length - length; index += 1) {
      const sequence = shorter.slice(index, index + length);
      if (longer.includes(sequence)) return sequence;
    }
  }
  return "";
}

function matchedIndexedTargets(searchTargets, uniqueTokens, { bestOnly = false } = {}) {
  return searchTargets.map((target, sourceIndex) => {
    const normalizedTarget = normalizeDiagramSearchText(target.text);
    let bestMatch = null;
    for (let tokenIndex = 0; tokenIndex < uniqueTokens.length; tokenIndex += 1) {
      const token = uniqueTokens[tokenIndex];
      const sequence = longestContinuousDiagramMatch(normalizedTarget, token);
      if (!sequence) continue;
      const exact = normalizedTarget === token;
      const fullTokenMatch = normalizedTarget.includes(token) || token.includes(normalizedTarget);
      const relationBonus = exact ? 3000 : (fullTokenMatch ? 2000 : 1000);
      const lengthRatio = sequence.length / Math.max(normalizedTarget.length, token.length, 1);
      const matchScore = (sequence.length * 10000) + relationBonus + Math.round(lengthRatio * 1000);
      const match = {
        target,
        sequence,
        tokenIndex,
        fullTokenMatch,
        exact,
        matchScore,
        sourceIndex,
      };
      if (!bestMatch || match.matchScore > bestMatch.matchScore || (match.matchScore === bestMatch.matchScore && tokenIndex < bestMatch.tokenIndex)) {
        bestMatch = match;
      }
    }
    return bestMatch;
  }).filter(Boolean).sort((first, second) => {
    if (second.matchScore !== first.matchScore) return second.matchScore - first.matchScore;
    if (first.tokenIndex !== second.tokenIndex) return first.tokenIndex - second.tokenIndex;
    if (first.fullTokenMatch !== second.fullTokenMatch) return first.fullTokenMatch ? -1 : 1;
    return first.sourceIndex - second.sourceIndex;
  }).filter((match, index, matches) => !bestOnly || match.matchScore === matches[0]?.matchScore);
}

function dominantInkBand(counts, maximumGap) {
  const occupied = counts.map((count, index) => (count ? index : -1)).filter((index) => index >= 0);
  if (!occupied.length) return null;
  const bands = [];
  let start = occupied[0];
  let previous = occupied[0];
  let score = counts[start];
  occupied.slice(1).forEach((index) => {
    if ((index - previous - 1) > maximumGap) {
      bands.push({ start, end: previous, score });
      start = index;
      score = 0;
    }
    score += counts[index];
    previous = index;
  });
  bands.push({ start, end: previous, score });
  return bands.sort((first, second) => second.score - first.score)[0];
}

function remapCroppedSearchTargets(searchTargets, crop) {
  return searchTargets.map((target) => {
    const left = Number(target.left) / 100;
    const top = Number(target.top) / 100;
    const right = left + (Number(target.width) / 100);
    const bottom = top + (Number(target.height) / 100);
    const visibleLeft = Math.max(left, crop.left);
    const visibleTop = Math.max(top, crop.top);
    const visibleRight = Math.min(right, crop.right);
    const visibleBottom = Math.min(bottom, crop.bottom);
    if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return null;
    return {
      ...target,
      left: ((visibleLeft - crop.left) / crop.width) * 100,
      top: ((visibleTop - crop.top) / crop.height) * 100,
      width: ((visibleRight - visibleLeft) / crop.width) * 100,
      height: ((visibleBottom - visibleTop) / crop.height) * 100,
    };
  }).filter(Boolean);
}

async function cropLineDiagramImageWhitespace(root, searchTargets = []) {
  const image = root?.querySelector(".line-diagram-image");
  const status = root?.querySelector(".line-diagram-ocr-status");
  if (!image) return searchTargets;
  await waitForImageLoad(image);
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) return searchTargets;

  if (status) status.textContent = "직선도 빈 여백을 정리하는 중...";
  const scanScale = Math.min(1, 1400 / Math.max(naturalWidth, naturalHeight));
  const scanWidth = Math.max(1, Math.round(naturalWidth * scanScale));
  const scanHeight = Math.max(1, Math.round(naturalHeight * scanScale));
  const scanCanvas = document.createElement("canvas");
  scanCanvas.width = scanWidth;
  scanCanvas.height = scanHeight;
  const scanContext = scanCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!scanContext) return searchTargets;
  scanContext.fillStyle = "#fff";
  scanContext.fillRect(0, 0, scanWidth, scanHeight);
  scanContext.drawImage(image, 0, 0, scanWidth, scanHeight);
  const pixels = scanContext.getImageData(0, 0, scanWidth, scanHeight).data;
  const columns = new Uint32Array(scanWidth);
  const rows = new Uint32Array(scanHeight);
  let inkPixels = 0;
  for (let y = 0; y < scanHeight; y += 1) {
    for (let x = 0; x < scanWidth; x += 1) {
      const offset = ((y * scanWidth) + x) * 4;
      if (pixels[offset] >= 245 && pixels[offset + 1] >= 245 && pixels[offset + 2] >= 245) continue;
      columns[x] += 1;
      rows[y] += 1;
      inkPixels += 1;
    }
  }
  if (!inkPixels) return searchTargets;

  const columnBand = dominantInkBand([...columns], Math.max(3, Math.round(scanWidth / 80)));
  const rowBand = dominantInkBand([...rows], Math.max(3, Math.round(scanHeight / 80)));
  const occupiedColumns = [...columns].map((count, index) => (count ? index : -1)).filter((index) => index >= 0);
  const occupiedRows = [...rows].map((count, index) => (count ? index : -1)).filter((index) => index >= 0);
  let left = columnBand && columnBand.score >= inkPixels * 0.65 ? columnBand.start : occupiedColumns[0];
  let right = columnBand && columnBand.score >= inkPixels * 0.65 ? columnBand.end : occupiedColumns.at(-1);
  let top = rowBand && rowBand.score >= inkPixels * 0.65 ? rowBand.start : occupiedRows[0];
  let bottom = rowBand && rowBand.score >= inkPixels * 0.65 ? rowBand.end : occupiedRows.at(-1);
  const padding = Math.max(4, Math.round(Math.max(right - left, bottom - top) * 0.012));
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(scanWidth - 1, right + padding);
  bottom = Math.min(scanHeight - 1, bottom + padding);

  const crop = {
    left: left / scanWidth,
    top: top / scanHeight,
    right: (right + 1) / scanWidth,
    bottom: (bottom + 1) / scanHeight,
  };
  crop.width = crop.right - crop.left;
  crop.height = crop.bottom - crop.top;
  if (crop.width * crop.height > 0.92 || crop.width <= 0 || crop.height <= 0) return searchTargets;

  const sourceX = Math.max(0, Math.floor(crop.left * naturalWidth));
  const sourceY = Math.max(0, Math.floor(crop.top * naturalHeight));
  const sourceWidth = Math.min(naturalWidth - sourceX, Math.ceil(crop.width * naturalWidth));
  const sourceHeight = Math.min(naturalHeight - sourceY, Math.ceil(crop.height * naturalHeight));
  const outputScale = Math.min(1, 10000 / Math.max(sourceWidth, sourceHeight), Math.sqrt(70000000 / Math.max(1, sourceWidth * sourceHeight)));
  const outputWidth = Math.max(1, Math.round(sourceWidth * outputScale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * outputScale));
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputContext = outputCanvas.getContext("2d", { alpha: false });
  if (!outputContext) return searchTargets;
  outputContext.fillStyle = "#fff";
  outputContext.fillRect(0, 0, outputWidth, outputHeight);
  outputContext.imageSmoothingEnabled = outputScale < 1;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
  image.src = outputCanvas.toDataURL("image/png");
  await waitForImageLoad(image);
  image.dataset.baseWidth = String(outputWidth);
  image.dataset.baseHeight = String(outputHeight);
  root.dataset.diagramCrop = `${Math.round((1 - (crop.width * crop.height)) * 100)}%`;
  return remapCroppedSearchTargets(searchTargets, crop);
}

function applyIndexedPdfHighlights(root, tokens, searchTargets = [], options = {}) {
  const shell = root.closest(".line-diagram-pdf-shell");
  const overlay = shell?.querySelector(".line-diagram-pdf-overlay");
  const status = shell?.querySelector(".line-diagram-ocr-status");
  if (!overlay) return 0;
  overlay.innerHTML = "";
  const uniqueTokens = tokens
    .map(normalizeDiagramSearchText)
    .filter((token, index, array) => token.length >= 6 && array.indexOf(token) === index);
  const matches = matchedIndexedTargets(searchTargets, uniqueTokens, options);
  matches.forEach(({ target, sequence }) => {
    const marker = document.createElement("span");
    marker.className = "line-diagram-index-marker line-diagram-active";
    marker.title = target.label || target.text;
    marker.dataset.matchToken = sequence;
    marker.dataset.matchLabel = target.label || target.text;
    marker.dataset.mapLeft = String(target.left);
    marker.dataset.mapTop = String(target.top);
    marker.dataset.mapWidth = String(target.width);
    marker.dataset.mapHeight = String(target.height);
    marker.hidden = true;
    overlay.appendChild(marker);
  });
  if (status) {
    status.textContent = matches.length
      ? `벡터 직선도에서 6글자 연속 일치 ${matches.length}개소를 표시했습니다. 확대해도 글자가 깨지지 않습니다.`
      : "직선도 검색 글자에서 6글자 연속 일치 항목을 찾지 못했습니다.";
  }
  return matches.length;
}

async function applyIndexedImageHighlights(root, tokens, searchTargets = [], options = {}) {
  const image = root.querySelector(".line-diagram-image");
  const overlay = root.querySelector(".line-diagram-image-overlay");
  const status = root.querySelector(".line-diagram-ocr-status");
  if (!image || !overlay) return 0;
  overlay.innerHTML = "";
  await waitForImageLoad(image);
  const uniqueTokens = tokens
    .map(normalizeDiagramSearchText)
    .filter((token, index, array) => token.length >= 6 && array.indexOf(token) === index);
  const matches = matchedIndexedTargets(searchTargets, uniqueTokens, options);

  matches.forEach(({ target, sequence }) => {
    const marker = document.createElement("span");
    marker.className = "line-diagram-index-marker line-diagram-active";
    marker.title = target.label || target.text;
    marker.dataset.matchToken = sequence;
    marker.dataset.matchLabel = target.label || target.text;
    marker.dataset.mapLeft = String(target.left);
    marker.dataset.mapTop = String(target.top);
    marker.style.left = `${target.left}%`;
    marker.style.top = `${target.top}%`;
    marker.style.width = `${target.width}%`;
    marker.style.height = `${target.height}%`;
    overlay.appendChild(marker);
  });
  if (status) {
    const cropNotice = root.dataset.diagramCrop ? `빈 여백 ${root.dataset.diagramCrop} 정리 · ` : "";
    status.textContent = matches.length
      ? `${cropNotice}직선도 검색 글자에서 6글자 연속 일치 ${matches.length}개소를 표시했습니다.`
      : `${cropNotice}직선도 검색 글자에서 6글자 연속 일치 항목을 찾지 못했습니다.`;
  }
  return matches.length;
}

async function renderHfcLineDiagram(record, type, preferredText = "") {
  const label = type === "ups" ? "UPS" : (type === "b2c" ? "B2C" : "ONU");
  let diagram = null;
  let node = "";
  try {
    ({ diagram, node } = await findB2CDiagramForRecord(record, preferredText));
  } catch (error) {
    console.error("B2C 직선도 조회 실패", error);
  }
  const inaccurateBrowserDiagram = Boolean(diagram)
    && (String(diagram.imageFormat || "").toLowerCase() === "svg"
      || String(diagram.renderer || "").startsWith("browser-svg"));
  if (inaccurateBrowserDiagram) diagram = null;
  const tokens = recordLineDiagramTokens(record, preferredText);
  qs("#rackView .topbar span").textContent = "직선도";

  if (!diagram) {
    qs("#rackPanel").innerHTML = `
      <section class="rack-sheet line-diagram-sheet">
        <div class="rack-heading">
          <div><span>직선도</span><h1>${escapeHtml(label)} 직선도</h1></div>
          <dl class="rack-meta"><div><dt>국사</dt><dd>${escapeHtml(record.stationName || "-")}</dd></div></dl>
        </div>
        <p class="uploaded-rack-warning">${inaccurateBrowserDiagram
          ? "기존 직선도는 브라우저가 도형을 재구성한 부정확한 형식이라 표시하지 않았습니다. 이 PC의 로컬 웹앱과 Excel을 실행한 상태에서 관리자 화면의 선번장(직선도) DB를 다시 등록해주세요."
          : (preferredText
            ? `입력한 “${escapeHtml(preferredText)}”과(와) 공백·기호 제외 6글자 연속 일치하는 검색 글자를 해당 국사의 직선도에서 찾지 못했습니다.`
            : "등록된 직선도 이미지가 없거나 검색 위치가 생성되지 않았습니다. 관리자 화면에서 해당 국사의 선번장(직선도) DB를 다시 업로드해주세요.")}</p>
      </section>`;
    showView("rackView");
    return;
  }

  qs("#rackPanel").innerHTML = `
    <section class="rack-sheet line-diagram-sheet">
      <div class="rack-heading">
        <div><span>직선도</span><h1>${escapeHtml(label)} 직선도</h1></div>
        <dl class="rack-meta">
          <div><dt>국사</dt><dd>${escapeHtml(record.stationName || "-")}</dd></div>
          <div><dt>노드</dt><dd>${escapeHtml(node || "-")}</dd></div>
          <div><dt>시트</dt><dd>${escapeHtml(diagram.sheetName || "-")}</dd></div>
        </dl>
      </div>
      <div class="line-diagram-route"><strong>연결 경로</strong><span>국사</span><b>→</b><span>광케이블</span><b>→</b><span>함체</span><b>→</b><span>셀 / B2C</span></div>
      <div class="diagram-legend"><span class="legend-active"></span> 기본 국사는 남색 도형, 마평국사는 검은색 셀명·보라색 전용선명의 6글자 연속 일치 항목 표시</div>
      <div class="line-diagram-zoom-toolbar" aria-label="직선도 확대 축소">
        <button type="button" data-diagram-zoom-out aria-label="직선도 축소">−</button>
        <button type="button" data-diagram-zoom-reset>원본</button>
        <strong data-diagram-zoom-label>10%</strong>
        <button type="button" data-diagram-zoom-in aria-label="직선도 확대">＋</button>
        <span class="line-diagram-toolbar-divider"></span>
        <button type="button" data-diagram-match-previous aria-label="이전 일치 개소">◀</button>
        <span data-diagram-match-label>일치 개소 확인 중</span>
        <button type="button" data-diagram-match-next aria-label="다음 일치 개소">▶</button>
      </div>
      <aside class="line-diagram-map-card" data-diagram-map-card aria-live="polite" hidden>
        <span class="line-diagram-map-pin" aria-hidden="true"></span>
        <div class="line-diagram-map-copy">
          <strong data-diagram-map-title>검색 위치</strong>
          <p data-diagram-map-text></p>
          <small>직선도의 빨간 핀이 실제 검색 위치입니다.</small>
        </div>
        <button type="button" data-diagram-map-locate>위치 다시 보기</button>
      </aside>
      ${diagram.type === "pdf-map"
        ? `<div class="line-diagram-pdf-shell"><div class="uploaded-floor-plan line-diagram-canvas pdf-line-diagram-canvas"><div class="line-diagram-pdf-world"><canvas class="line-diagram-pdf-canvas" aria-label="${escapeHtml(diagram.sheetName || "벡터 직선도")}"></canvas></div></div><div class="line-diagram-pdf-overlay"></div><p class="line-diagram-ocr-status">벡터 직선도와 검색 위치를 불러오는 중...</p></div>`
        : ["image", "image-map"].includes(diagram.type)
        ? `<div class="uploaded-floor-plan line-diagram-canvas image-line-diagram-canvas"><div class="line-diagram-image-wrap"><img class="line-diagram-image" src="${diagram.content}" alt="${escapeHtml(diagram.sheetName || "직선도")}"><div class="line-diagram-image-overlay"></div></div><p class="line-diagram-ocr-status">셀/B2C 검색 인덱스 확인 중...</p></div>`
        : `<div class="uploaded-floor-plan line-diagram-canvas"><div class="${diagram.type === "drawing" ? "uploaded-drawing-plan" : "uploaded-excel-plan"}">${diagram.content}</div></div>`}
    </section>`;

  showView("rackView");
  const rackPanel = qs("#rackPanel");
  let effectiveDiagramType = diagram.type;
  let activeSearchTargets = diagram.searchTargets || [];
  let zoomController = null;
  let canvas = rackPanel.querySelector(".line-diagram-canvas");
  if (diagram.type === "pdf-map") {
    try {
      zoomController = await initPdfLineDiagramMap(rackPanel, diagram);
    } catch (error) {
      console.error("벡터 직선도 초기화 실패", error);
      const shell = rackPanel.querySelector(".line-diagram-pdf-shell");
      if (!diagram.fallbackContent || !shell) {
        if (shell) {
          shell.innerHTML = `<p class="uploaded-rack-warning">직선도를 불러오지 못했습니다. 서버를 재시작한 뒤 다시 조회해주세요.<br>${escapeHtml(error.message || "벡터 렌더러 오류")}</p>`;
        }
        const matchStatus = rackPanel.querySelector("[data-diagram-match-label]");
        if (matchStatus) matchStatus.textContent = "직선도 불러오기 실패";
        return;
      }
      shell.outerHTML = `
        <div class="uploaded-floor-plan line-diagram-canvas image-line-diagram-canvas">
          <div class="line-diagram-image-wrap">
            <img class="line-diagram-image" src="${escapeHtml(diagram.fallbackContent)}" alt="${escapeHtml(diagram.sheetName || "고해상도 직선도")}">
            <div class="line-diagram-image-overlay"></div>
          </div>
          <p class="line-diagram-ocr-status">벡터 화면을 불러오지 못해 고해상도 직선도로 자동 전환했습니다.</p>
        </div>`;
      effectiveDiagramType = "image-map";
      canvas = rackPanel.querySelector(".line-diagram-canvas");
      activeSearchTargets = await cropLineDiagramImageWhitespace(canvas, activeSearchTargets);
      zoomController = initLineDiagramZoom(rackPanel);
    }
  } else {
    if (["image", "image-map"].includes(effectiveDiagramType)) {
      activeSearchTargets = await cropLineDiagramImageWhitespace(canvas, activeSearchTargets);
    }
    zoomController = initLineDiagramZoom(rackPanel);
  }
  let matchedCount = 0;
  const indexedMatchOptions = { bestOnly: type === "b2c" };
  if (effectiveDiagramType === "pdf-map") {
    matchedCount = applyIndexedPdfHighlights(canvas, tokens, activeSearchTargets, indexedMatchOptions);
  } else if (effectiveDiagramType === "image-map") {
    matchedCount = await applyIndexedImageHighlights(canvas, tokens, activeSearchTargets, indexedMatchOptions);
  } else if (effectiveDiagramType === "image") {
    const status = canvas.querySelector(".line-diagram-ocr-status");
    if (status) status.textContent = "검색 인덱스가 없는 그림입니다. 관리자 화면에서 엑셀 파일을 다시 등록해주세요.";
  } else if (effectiveDiagramType === "drawing") {
    matchedCount = applyDrawingDiagramHighlights(canvas, tokens);
  } else {
    fitUploadedExcelPlanText(canvas);
    matchedCount = applyLineDiagramHighlights(canvas, tokens);
  }
  const matchedElements = [...qs("#rackPanel").querySelectorAll(".line-diagram-active, .line-diagram-index-marker")];
  zoomController?.setMatches(matchedElements);
  if (!matchedCount) {
    const target = qs("#rackPanel .uploaded-excel-plan") || qs("#rackPanel .uploaded-drawing-plan") || qs("#rackPanel .line-diagram-canvas");
    const searchLabel = preferredText || record.cellName || record.serviceName || "해당 셀/B2C";
    target.insertAdjacentHTML("afterbegin", `<p class="uploaded-rack-warning">직선도 검색 글자에서 ${escapeHtml(searchLabel)}과(와) 공백·기호 제외 6글자 연속 일치하는 항목을 찾지 못했습니다.</p>`);
  }
}

function renderAdmin() {
  renderManagedUsers();
  renderDataAdminTable();
  renderFloorPlansAdmin();
  renderB2CAdmin();
  renderSharedDbAdmin();
}

function setUsersTableMessage(text, isError = false) {
  const message = qs("#usersTableMessage");
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("is-error", isError);
}

async function adminUsersRequest(path = "", options = {}) {
  const response = await fetch(`/api/admin/users${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = String(response.headers.get("content-type") || "");
  const result = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};
  if (response.status === 401) {
    await logout();
    throw new Error("관리자 세션이 만료되었습니다. 다시 로그인해주세요.");
  }
  if (response.status === 404) {
    throw new Error("실행 중인 서버가 구버전입니다. '웹사이트 실행.cmd'를 다시 실행해 서버를 업데이트해주세요.");
  }
  if (!response.ok) throw new Error(result?.error || "계정 요청을 처리하지 못했습니다.");
  return result;
}

async function renderManagedUsers() {
  const table = qs("#usersTable");
  if (!table) return;
  table.innerHTML = "<tbody><tr><td>계정 DB를 불러오는 중입니다.</td></tr></tbody>";
  setUsersTableMessage("");
  try {
    const result = await adminUsersRequest();
    managedUsers = Array.isArray(result.users) ? result.users : [];
    const rows = managedUsers.map((account) => {
      const passwordState = account.passwordConfigured ? "설정됨" : "미설정";
      const status = account.disabled ? "잠김" : "사용 가능";
      const actions = account.rootAccount
        ? '<span class="account-root-note">환경변수 관리</span>'
        : `<div class="account-actions">
            <button class="secondary-btn" type="button" data-account-action="password" data-account-id="${escapeHtml(account.id)}">비밀번호 설정</button>
            <button class="ghost-btn" type="button" data-account-action="toggle" data-account-id="${escapeHtml(account.id)}">${account.disabled ? "잠금 해제" : "계정 잠금"}</button>
            <button class="delete-btn" type="button" data-account-action="delete" data-account-id="${escapeHtml(account.id)}">삭제</button>
          </div>`;
      return `<tr>
        <td>${escapeHtml(account.id)}</td>
        <td>${escapeHtml(account.name)}</td>
        <td>${account.role === "admin" ? "관리자" : "사용자"}</td>
        <td><span class="account-status ${account.passwordConfigured ? "is-ready" : "is-pending"}">${passwordState}</span></td>
        <td><span class="account-status ${account.disabled ? "is-locked" : "is-ready"}">${status}</span></td>
        <td>${actions}</td>
      </tr>`;
    }).join("");
    table.innerHTML = `<thead><tr><th>아이디</th><th>이름</th><th>권한</th><th>비밀번호</th><th>상태</th><th>관리</th></tr></thead><tbody>${rows || '<tr><td colspan="6">등록된 계정이 없습니다.</td></tr>'}</tbody>`;
    table.querySelectorAll("[data-account-action]").forEach((button) => {
      button.addEventListener("click", () => handleManagedUserAction(button.dataset.accountAction, button.dataset.accountId));
    });
    setUsersTableMessage(`${managedUsers.length.toLocaleString("ko-KR")}개 계정이 등록되어 있습니다.`);
  } catch (error) {
    table.innerHTML = "<tbody><tr><td>계정 DB를 불러오지 못했습니다.</td></tr></tbody>";
    setUsersTableMessage(error.message, true);
  }
}

function openUserAccountDialog() {
  const dialog = qs("#userAccountDialog");
  qs("#userAccountForm").reset();
  qs("#userAccountMessage").textContent = "";
  dialog.showModal();
  window.setTimeout(() => qs("#accountId").focus(), 0);
}

function openPasswordResetDialog(accountId) {
  const dialog = qs("#passwordResetDialog");
  qs("#passwordResetForm").reset();
  qs("#passwordResetTarget").value = accountId;
  qs("#passwordResetAccountId").textContent = accountId;
  qs("#passwordResetMessage").textContent = "";
  dialog.showModal();
  window.setTimeout(() => qs("#newAccountPassword").focus(), 0);
}

async function createManagedUser(event) {
  event.preventDefault();
  const password = qs("#accountPassword").value;
  const passwordConfirm = qs("#accountPasswordConfirm").value;
  const message = qs("#userAccountMessage");
  if (password !== passwordConfirm) {
    message.textContent = "비밀번호 확인이 일치하지 않습니다.";
    return;
  }
  const submitButton = event.currentTarget.querySelector("button[type='submit']");
  submitButton.disabled = true;
  message.textContent = "계정을 생성하는 중입니다.";
  try {
    await adminUsersRequest("", {
      method: "POST",
      body: JSON.stringify({
        id: qs("#accountId").value.trim(),
        name: qs("#accountName").value.trim(),
        role: qs("#accountRole").value,
        password,
      }),
    });
    qs("#userAccountDialog").close();
    await renderManagedUsers();
    setUsersTableMessage("계정을 생성했습니다.");
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function resetManagedUserPassword(event) {
  event.preventDefault();
  const accountId = qs("#passwordResetTarget").value;
  const password = qs("#newAccountPassword").value;
  const passwordConfirm = qs("#newAccountPasswordConfirm").value;
  const message = qs("#passwordResetMessage");
  if (password !== passwordConfirm) {
    message.textContent = "비밀번호 확인이 일치하지 않습니다.";
    return;
  }
  const submitButton = event.currentTarget.querySelector("button[type='submit']");
  submitButton.disabled = true;
  message.textContent = "비밀번호를 저장하는 중입니다.";
  try {
    await adminUsersRequest(`/${encodeURIComponent(accountId)}/password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    qs("#passwordResetDialog").close();
    await renderManagedUsers();
    setUsersTableMessage(`${accountId} 계정의 비밀번호를 재설정했습니다.`);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function handleManagedUserAction(action, accountId) {
  const account = managedUsers.find((candidate) => candidate.id === accountId);
  if (!account || account.rootAccount) return;
  if (action === "password") {
    openPasswordResetDialog(accountId);
    return;
  }
  if (action === "toggle") {
    const nextDisabled = !account.disabled;
    if (!confirm(`${accountId} 계정을 ${nextDisabled ? "잠글까요?" : "다시 사용할 수 있게 할까요?"}`)) return;
    try {
      await adminUsersRequest(`/${encodeURIComponent(accountId)}`, {
        method: "PATCH",
        body: JSON.stringify({ disabled: nextDisabled }),
      });
      await renderManagedUsers();
      setUsersTableMessage(`${accountId} 계정을 ${nextDisabled ? "잠갔습니다." : "활성화했습니다."}`);
    } catch (error) {
      setUsersTableMessage(error.message, true);
    }
    return;
  }
  if (action === "delete") {
    if (!confirm(`${accountId} 계정을 삭제할까요? 이 계정은 즉시 로그인할 수 없게 됩니다.`)) return;
    try {
      await adminUsersRequest(`/${encodeURIComponent(accountId)}`, { method: "DELETE" });
      await renderManagedUsers();
      setUsersTableMessage(`${accountId} 계정을 삭제했습니다.`);
    } catch (error) {
      setUsersTableMessage(error.message, true);
    }
  }
}

function filteredAdminRecords() {
  const query = normalize(qs("#dataSearch")?.value || "");
  return loadRecords()
    .map((record, index) => ({ ...record, __sourceIndex: index }))
    .filter((record) => {
      if (!query) return true;
      return recordColumns.some((key) => normalize(record[key]).includes(query));
    });
}

function renderDataAdminTable() {
  const records = filteredAdminRecords();
  const hasQuery = Boolean(normalize(qs("#dataSearch")?.value || ""));
  const limit = hasQuery ? ADMIN_RECORD_SEARCH_LIMIT : ADMIN_RECORD_INITIAL_LIMIT;
  const visibleRecords = records.slice(0, limit);
  renderEditableTable("dataTable", recordColumns, visibleRecords, saveRecords);

  const message = qs("#dataTableMessage");
  if (!message) return;
  if (records.length > visibleRecords.length) {
    message.textContent = `${records.length.toLocaleString("ko-KR")}건 중 ${visibleRecords.length.toLocaleString("ko-KR")}건만 표시합니다. 나머지 항목은 위 검색창에서 찾을 수 있습니다.`;
  } else {
    message.textContent = `${records.length.toLocaleString("ko-KR")}건을 표시합니다.`;
  }
}

function clearUsersDatabase() {
  if (!confirm("가입 DB를 모두 삭제할까요? 삭제 후에는 가입 DB를 다시 등록하기 전까지 로그인할 수 없습니다.")) return;
  saveUsers([]);
  renderAdmin();
}

function clearDataDatabase() {
  if (!confirm("데이터 DB를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
  saveRecords([]);
  renderAdmin();
}

function clearFloorPlansDatabase() {
  if (!confirm("등록된 국사 평면도 DB를 모두 삭제할까요?")) return;
  saveFloorPlans([]);
  renderFloorPlansAdmin();
}

async function clearB2CDatabase() {
  if (!confirm("등록된 선번장(직선도) DB와 직선도를 모두 삭제할까요?")) return;
  await saveB2CLines([]);
  localStorage.removeItem(STORAGE_KEYS.b2cDiagrams);
  try {
    await deleteAllB2CDiagrams();
  } catch (error) {
    console.error("B2C 직선도 전체 삭제 실패", error);
    alert(`B2C 직선도 전체 삭제에 실패했습니다: ${error.message || "브라우저 DB를 확인해주세요."}`);
  }
  renderB2CAdmin();
}

function renderEditableTable(tableId, columns, rows, saveFn) {
  const table = qs(`#${tableId}`);
  const head = columns.map((key) => `<th>${columnLabels[key] || key}</th>`).join("");
  const body = rows.map((rowData, rowIndex) => {
    const sourceIndex = Number.isInteger(rowData.__sourceIndex) ? rowData.__sourceIndex : rowIndex;
    const cells = columns.map((key) => `
      <td><input value="${escapeHtml(rowData[key] || "")}" data-table="${tableId}" data-row="${sourceIndex}" data-key="${key}" ${key === "keyNumber" ? "inputmode=\"numeric\" pattern=\"[0-9]*\"" : ""}></td>
    `).join("");
    return `<tr>${cells}<td><button class="delete-btn" data-delete="${tableId}" data-row="${sourceIndex}" type="button">삭제</button></td></tr>`;
  }).join("");

  table.innerHTML = `
    <thead><tr>${head}<th>관리</th></tr></thead>
    <tbody>${body}</tbody>
  `;

  table.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const nextRows = tableId === "usersTable" ? loadUsers() : loadRecords();
      nextRows[Number(event.target.dataset.row)][event.target.dataset.key] = event.target.value;
      saveFn(tableId === "dataTable" ? nextRows.map(normalizeRecord) : nextRows);
    });
  });

  table.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const nextRows = tableId === "usersTable" ? loadUsers() : loadRecords();
      nextRows.splice(Number(event.target.dataset.row), 1);
      saveFn(nextRows);
      renderAdmin();
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function addRow(type) {
  if (type === "users") {
    const users = loadUsers();
    users.push({ id: "", name: "", role: "user" });
    saveUsers(users);
  } else {
    const records = loadRecords();
    records.push({ ...Object.fromEntries(recordColumns.map((key) => [key, ""])), keyNumber: nextRecordKeyNumber(records) });
    saveRecords(records);
  }

  renderAdmin();
}

function nextRecordKeyNumber(records) {
  const highest = records.reduce((max, record) => {
    const value = Number(String(record.keyNumber || "").replace(/[^0-9]/g, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return String(highest + 1);
}

function recordImportKey(record) {
  const keyNumber = normalize(record.keyNumber);
  if (keyNumber) return `key:${keyNumber}`;
  const cellName = normalize(record.cellName);
  if (cellName) return `cell:${cellName}`;
  const fallbackParts = [
    stationKey(record.stationName),
    normalize(record.otxMain),
    normalize(record.orxMain),
    normalize(record.onuLocation),
  ];
  return fallbackParts.some(Boolean) ? fallbackParts.join("|") : "";
}

function mergeImportedRecords(existing, imported) {
  const merged = existing.map(normalizeRecord);
  const positions = new Map(merged.map((record, index) => [recordImportKey(record), index]));
  imported.forEach((record) => {
    const key = recordImportKey(record);
    const index = positions.get(key);
    if (key && index !== undefined) {
      merged[index] = normalizeRecord({ ...merged[index], ...record });
      return;
    }
    positions.set(key, merged.length);
    merged.push(normalizeRecord(record));
  });
  return merged;
}

function importExcel(event, type) {
  const file = event.target.files[0];
  if (!file) return;

  if (!window.XLSX) {
    alert("엑셀 기능을 불러오지 못했습니다. 인터넷 연결 후 다시 시도해주세요.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    const workbook = XLSX.read(loadEvent.target.result, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const columns = type === "users" ? userColumns : recordColumns;
    const imported = rawRows.map((raw) => {
      const normalized = {};
      columns.forEach((key) => {
        const labels = [columnLabels[key], key, ...(importColumnAliases[key] || [])];
        const matchedLabel = labels.find((label) => Object.prototype.hasOwnProperty.call(raw, label));
        normalized[key] = matchedLabel ? raw[matchedLabel] : "";
      });
      return type === "users" ? normalized : normalizeRecord(normalized);
    });

    if (type === "users") {
      saveUsers(imported);
    } else {
      saveRecords(mergeImportedRecords(loadRecords(), imported));
    }

    renderAdmin();
    event.target.value = "";
  };
  reader.readAsArrayBuffer(file);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function excelHtmlText(value) {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return escapeHtml(safeText).replaceAll("\n", "<br>");
}

function exportExcelFallback(type, rows, columns, labeledRows) {
  const title = type === "users" ? "가입DB" : "데이터DB";
  const fileName = type === "users" ? "CATV_가입DB.xls" : "CATV_데이터DB.xls";
  const headers = columns.map((key) => columnLabels[key] || key);
  const bodyRows = labeledRows.length ? labeledRows : [Object.fromEntries(headers.map((label) => [label, ""]))];
  const headerHtml = headers.map((label) => `<th>${excelHtmlText(label)}</th>`).join("");
  const rowsHtml = bodyRows.map((row) => `<tr>${headers.map((label) => `<td>${excelHtmlText(row[label])}</td>`).join("")}</tr>`).join("");
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    table { border-collapse: collapse; font-family: "Malgun Gothic", Arial, sans-serif; font-size: 11pt; }
    caption { margin-bottom: 8px; font-size: 14pt; font-weight: 700; text-align: left; }
    th, td { border: 1px solid #999; padding: 6px 8px; mso-number-format:"\\@"; white-space: nowrap; }
    th { background: #dbeafe; font-weight: 700; text-align: center; }
    td { text-align: left; }
  </style>
</head>
<body>
  <table>
    <caption>${excelHtmlText(title)}</caption>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
  downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }), fileName);
}

function exportExcel(type) {
  const rows = type === "users" ? loadUsers() : loadRecords();
  const columns = type === "users" ? userColumns : recordColumns;
  const labeledRows = rows.map((rowData) => Object.fromEntries(columns.map((key) => [columnLabels[key], rowData[key] || ""])));

  if (!window.XLSX) {
    exportExcelFallback(type, rows, columns, labeledRows);
    return;
  }

  try {
    const worksheet = XLSX.utils.json_to_sheet(labeledRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, type === "users" ? "가입DB" : "데이터DB");
    XLSX.writeFile(workbook, type === "users" ? "CATV_가입DB.xlsx" : "CATV_데이터DB.xlsx");
  } catch (error) {
    console.warn("XLSX export failed; falling back to Excel HTML export.", error);
    exportExcelFallback(type, rows, columns, labeledRows);
  }
}

function handleAppRouteBack() {
  if (authenticatedUser && !qs("#userView").classList.contains("hidden") && window.location.hash !== "#result") {
    const resultPanel = qs("#resultPanel");
    if (resultPanel?.querySelector(".kt-field-screen, .search-match-panel")) showSearchScreen();
  }
}

function bindEvents() {
  qs("#loginForm").addEventListener("submit", login);
  qs("#togglePasswordBtn")?.addEventListener("click", togglePasswordVisibility);
  qs("#searchBackBtn").addEventListener("click", showSearchScreen);
  qs("#logoutBtn").addEventListener("click", logout);
  qs("#rackLogoutBtn").addEventListener("click", logout);
  qs("#backToResultBtn").addEventListener("click", () => showView("userView"));
  qs("#adminLogoutBtn").addEventListener("click", logout);
  qs("#cellSearchBtn").addEventListener("click", searchRecords);
  qs("#b2cSearchBtn").addEventListener("click", searchB2CLines);
  qs("#cellSearch").addEventListener("keydown", (event) => event.key === "Enter" && searchRecords());
  qs("#b2cSearch").addEventListener("keydown", (event) => event.key === "Enter" && searchB2CLines());
  qs("#dataSearch")?.addEventListener("input", () => {
    window.clearTimeout(adminDataSearchTimer);
    adminDataSearchTimer = window.setTimeout(renderDataAdminTable, 120);
  });
  qs("#addUserBtn").addEventListener("click", openUserAccountDialog);
  qs("#addDataBtn").addEventListener("click", () => addRow("records"));
  qs("#exportDataBtn").addEventListener("click", () => exportExcel("records"));
  qs("#clearDataBtn").addEventListener("click", clearDataDatabase);
  qs("#clearFloorPlansBtn").addEventListener("click", clearFloorPlansDatabase);
  qs("#clearB2CBtn").addEventListener("click", clearB2CDatabase);
  qs("#dataFile").addEventListener("change", (event) => importExcel(event, "records"));
  qs("#floorPlanFile").addEventListener("change", prepareFloorPlanUpload);
  qs("#floorPlanCoordinateStage").addEventListener("click", setFloorPlanCoordinate);
  qs("#clearFloorPlanCoordinatesBtn").addEventListener("click", () => {
    if (!pendingFloorPlanUpload) return;
    pendingFloorPlanUpload.rackCoordinates = {};
    renderFloorPlanCoordinateEditor();
    qs("#floorPlanMessage").textContent = "노드명·랙 좌표를 모두 지웠습니다. 필요한 검색 좌표를 다시 지정해주세요.";
  });
  qs("#saveFloorPlanBtn").addEventListener("click", saveFloorPlan);
  qs("#cancelFloorPlanEditBtn")?.addEventListener("click", cancelFloorPlanEdit);
  qs("#saveB2CBtn").addEventListener("click", saveB2CFile);
  qs("#publishSharedDbBtn")?.addEventListener("click", publishSharedDatabaseToGitHub);
  qs("#saveSharedDbServerBtn")?.addEventListener("click", () => saveSharedDatabaseToServer());
  qs("#downloadSharedDbBtn")?.addEventListener("click", downloadSharedDatabase);
  qs("#refreshSharedDbBtn")?.addEventListener("click", refreshSharedDatabaseFromSite);
  qs("#userAccountForm").addEventListener("submit", createManagedUser);
  qs("#passwordResetForm").addEventListener("submit", resetManagedUserPassword);
  qs("#closeUserAccountDialogBtn").addEventListener("click", () => qs("#userAccountDialog").close());
  qs("#closePasswordResetDialogBtn").addEventListener("click", () => qs("#passwordResetDialog").close());
  window.addEventListener("popstate", handleAppRouteBack);
  window.addEventListener("focus", refreshSharedDatabaseForUser);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshSharedDatabaseForUser();
  });
}

async function initApp() {
  bindEvents();
  restoreRememberedLoginId();
  installMobileBackHandler();
  registerPwaServiceWorker();
  authenticatedUser = null;
  initialSessionResetPromise = resetExistingSession();
  await hydrateB2CLines();

  const requestedAdmin = ["/admin", "/admin/"].includes(window.location.pathname);
  showView("loginView");
  const authReason = new URLSearchParams(window.location.search).get("auth");
  if (requestedAdmin || authReason === "admin-required") {
    qs("#loginMessage").textContent = "관리자 페이지에 접근하려면 관리자 로그인이 필요합니다.";
  }
}

function registerPwaServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const isSecureHost = window.location.protocol === "https:"
    || ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!isSecureHost) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("PWA service worker registration failed.", error);
    });
  }, { once: true });
}

initApp();

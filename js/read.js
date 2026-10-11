const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_CHUNK_SIZE = 1000;
const scanButton = document.getElementById("scan-btn");
const againButton = document.getElementById("again-btn");
const video = document.getElementById("camera-frame");
const canvas = document.getElementById("scan-canvas");
const readerCard = document.getElementById("reader-card");
const currentFile = document.getElementById("current-file");
const progressBar = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-label");
const speedLabel = document.getElementById("speed-label");
const result = document.getElementById("result");
const previewContent = document.getElementById("preview-content");
const banner = document.getElementById("banner");
let stream = null;
let animationFrame = null;
let batch = null;
let fileCount = 0;
let currentFileIndex = -1;
let session = null;
let chunks = new Map();
let totalChunks = 0;
let fileSize = 0;
let mime = "application/octet-stream";
let name = "received-file";
let receivedUrls = [];
let receivedBytes = 0;
let receiveStartedAt = 0;

const showBanner = (message, type = "error") => {
  banner.textContent = message;
  banner.className = `banner ${type}`;
  banner.classList.remove("hidden");
};
const fromBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
const fromTextBase64 = (value) => new TextDecoder().decode(fromBase64(value));

function updateProgress() {
  const percent = totalChunks ? Math.floor((chunks.size / totalChunks) * 100) : 0;
  progressBar.style.width = `${percent}%`;
  progressLabel.textContent = `${percent}%（${chunks.size} / ${totalChunks || "?"} チャンク）`;
  if (speedLabel) {
    const elapsed = receiveStartedAt ? (performance.now() - receiveStartedAt) / 1000 : 0;
    const speed = elapsed > 0 ? receivedBytes / 1024 / elapsed : 0;
    speedLabel.textContent = speed > 0 ? `受信速度: ${speed.toFixed(1)} KB/s` : "受信速度: 計測中";
  }
}

function resetTransfer() {
  batch = null;
  fileCount = 0;
  currentFileIndex = -1;
  session = null;
  chunks = new Map();
  totalChunks = 0;
  fileSize = 0;
  receivedBytes = 0;
  receiveStartedAt = 0;
  currentFile.textContent = "QRを待機中";
  updateProgress();
  previewContent.replaceChildren();
  receivedUrls.forEach((url) => URL.revokeObjectURL(url));
  receivedUrls = [];
  result.classList.add("hidden");
  banner.classList.add("hidden");
}

function stopCamera() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  scanButton.classList.remove("hidden");
}

function appendPreview(blob) {
  const url = URL.createObjectURL(blob);
  receivedUrls.push(url);
  const item = document.createElement("article");
  item.className = "received-item";
  const title = document.createElement("strong");
  title.textContent = `${name}（${Math.round(fileSize / 1024)} KB）`;
  item.append(title);
  if (mime.startsWith("image/")) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = name;
    item.append(image);
  } else if (mime.startsWith("video/")) {
    const player = document.createElement("video");
    player.src = url;
    player.controls = true;
    player.playsInline = true;
    item.append(player);
  } else if (mime.startsWith("audio/")) {
    const player = document.createElement("audio");
    player.src = url;
    player.controls = true;
    item.append(player);
  } else if (mime === "application/pdf") {
    const frame = document.createElement("iframe");
    frame.src = url;
    frame.title = name;
    frame.height = 320;
    item.append(frame);
  } else {
    const note = document.createElement("p");
    note.textContent = "プレビュー非対応の形式です。ダウンロードして確認してください。";
    item.append(note);
  }
  const link = document.createElement("a");
  link.className = "secondary-link";
  link.href = url;
  link.download = name;
  link.textContent = "ファイルをダウンロード";
  item.append(link);
  previewContent.append(item);
  result.classList.remove("hidden");
}

function completeFile() {
  const bytes = new Uint8Array(fileSize);
  let offset = 0;
  for (let index = 0; index < totalChunks; index += 1) {
    const chunk = chunks.get(index);
    if (!chunk) return;
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  appendPreview(new Blob([bytes], { type: mime }));
  if (currentFileIndex + 1 >= fileCount) {
    stopCamera();
    currentFile.textContent = "すべてのファイルを受信しました";
    showBanner("受信が完了しました。カメラを停止しています。", "ok");
  } else {
    currentFile.textContent = `次のファイルを待機中（${currentFileIndex + 2} / ${fileCount}）`;
  }
}

function processCode(code) {
  const parts = code.split("|");
  if (parts[0] !== "OneCode1") return;
  if (parts[1] === "meta" && parts.length === 10) {
    const [nextBatch, fileIndexText, countText, nextSession] = parts.slice(2, 6);
    const fileIndex = Number(fileIndexText);
    const declaredCount = Number(countText);
    if (!/^[a-zA-Z0-9]{8,32}$/.test(nextBatch) || !/^[a-zA-Z0-9]{8,32}$/.test(nextSession)) return;
    if (!Number.isInteger(fileIndex) || !Number.isInteger(declaredCount) || fileIndex < 0 || declaredCount < 1 || fileIndex >= declaredCount) return;
    if (batch && batch !== nextBatch) return;
    if (session === nextSession) return;
    if (fileIndex !== currentFileIndex + 1) return;
    const declaredChunks = Number(parts[6]);
    const declaredSize = Number(parts[7]);
    if (!Number.isSafeInteger(declaredChunks) || declaredChunks < 1 || !Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > MAX_FILE_SIZE || declaredChunks !== Math.max(1, Math.ceil(declaredSize / MAX_CHUNK_SIZE))) return;
    batch = nextBatch;
    fileCount = declaredCount;
    currentFileIndex = fileIndex;
    session = nextSession;
    totalChunks = declaredChunks;
    fileSize = declaredSize;
    mime = fromTextBase64(parts[8]).slice(0, 128) || "application/octet-stream";
    name = fromTextBase64(parts[9]).slice(0, 255) || "received-file";
    chunks = new Map();
    currentFile.textContent = `受信中: ${name}（${fileIndex + 1} / ${fileCount}）`;
    updateProgress();
    return;
  }
  if (parts[1] !== "data" || parts.length !== 8 || parts[2] !== batch || Number(parts[3]) !== currentFileIndex || parts[4] !== session || Number(parts[6]) !== totalChunks) return;
  const index = Number(parts[5]);
  if (!Number.isInteger(index) || index < 0 || index >= totalChunks || chunks.has(index)) return;
  const chunk = fromBase64(parts[7]);
  const expectedLength = index === totalChunks - 1 ? fileSize - MAX_CHUNK_SIZE * index : MAX_CHUNK_SIZE;
  if (chunk.length !== expectedLength) return;
  chunks.set(index, chunk);
  receivedBytes += chunk.length;
  if (!receiveStartedAt) receiveStartedAt = performance.now();
  updateProgress();
  if (chunks.size === totalChunks) completeFile();
}

function scanLoop() {
  if (!stream) return;
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
    if (code?.data) processCode(code.data);
  }
  animationFrame = requestAnimationFrame(scanLoop);
}

async function startCamera() {
  resetTransfer();
  if (!navigator.mediaDevices?.getUserMedia) {
    showBanner("カメラはHTTPSまたはlocalhostでのみ利用できます。");
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = stream;
    await video.play();
    scanButton.classList.add("hidden");
    animationFrame = requestAnimationFrame(scanLoop);
  } catch (error) {
    showBanner(`カメラを起動できませんでした: ${error.message}`);
  }
}

scanButton.addEventListener("click", startCamera);
againButton.addEventListener("click", startCamera);
window.addEventListener("pagehide", stopCamera);
resetTransfer();

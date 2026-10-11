const MAX_FILE_SIZE = 50 * 1024 * 1024;
// Keep payloads comfortably below the camera decoder limit, then repeat frames.
const CHUNK_SIZE = 600;
const FRAME_INTERVAL = 220;
const DATA_REPEATS = 2;
const META_REPEATS = 4;

const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");
const fileCard = document.getElementById("file-card");
const fileList = document.getElementById("file-list");
const startButton = document.getElementById("start-btn");
const stopButton = document.getElementById("stop-btn");
const panel = document.getElementById("transfer-panel");
const qrElement = document.getElementById("qrcode");
const qrStatus = document.getElementById("qr-status");
const banner = document.getElementById("banner");
let selectedFiles = [];
let timer = null;
let frames = [];
let currentFrame = 0;
let currentRepeat = 0;
let objectUrls = [];

const showBanner = (message, type = "error") => {
  banner.textContent = message;
  banner.className = `banner ${type}`;
  banner.classList.remove("hidden");
};

const formatSize = (bytes) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const toBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};
const textBase64 = (text) => toBase64(new TextEncoder().encode(text));

function fileParts(fileName) {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return { base: fileName, extension: "" };
  return { base: fileName.slice(0, dot), extension: fileName.slice(dot + 1).toUpperCase() };
}

function fileKind(file) {
  if (file.type.startsWith("image/")) return { className: "type-image", icon: "image", label: "" };
  if (file.type.startsWith("video/")) return { className: "type-video", icon: "movie", label: "動画" };
  if (file.type.startsWith("audio/")) return { className: "type-audio", icon: "music_note", label: "音声" };
  if (file.type === "application/pdf") return { className: "type-pdf", icon: "picture_as_pdf", label: "PDF" };
  if (file.type.includes("zip") || file.type.includes("compressed")) return { className: "type-archive", icon: "folder_zip", label: "" };
  return { className: "type-document", icon: "description", label: "" };
}

function updateFileName(index, value) {
  const current = selectedFiles[index];
  const { extension } = fileParts(current.name);
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, "_");
  if (!cleaned) return;
  const nextName = extension ? `${cleaned}.${extension.toLowerCase()}` : cleaned;
  selectedFiles[index] = new File([current], nextName, {
    type: current.type,
    lastModified: current.lastModified,
  });
}

function renderFileList() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  fileList.replaceChildren();
  selectedFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "file-item";
    const kind = fileKind(file);
    item.classList.add(kind.className);
    if (kind.className === "type-image") {
      const image = document.createElement("img");
      image.className = "file-thumb";
      image.alt = file.name;
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      image.src = url;
      item.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "file-thumb file-thumb-placeholder";
      const icon = document.createElement("span");
      icon.className = "material-symbols-rounded file-type-icon";
      icon.textContent = kind.icon;
      const extension = document.createElement("span");
      extension.className = "file-extension";
      extension.textContent = fileParts(file.name).extension || kind.label || "FILE";
      placeholder.append(icon, extension);
      item.append(placeholder);
    }
    const info = document.createElement("div");
    info.className = "file-item-info";
    const { base } = fileParts(file.name);
    const nameEditor = document.createElement("label");
    nameEditor.className = "file-name-editor";
    const name = document.createElement("input");
    name.className = "file-item-name";
    name.type = "text";
    name.value = base;
    name.setAttribute("aria-label", `${file.name}の拡張子を除いたファイル名`);
    name.addEventListener("change", () => {
      updateFileName(index, name.value);
      renderFileList();
    });
    name.addEventListener("blur", () => {
      updateFileName(index, name.value);
      name.value = fileParts(selectedFiles[index].name).base;
    });
    const extension = document.createElement("span");
    extension.className = "file-name-extension";
    extension.textContent = fileParts(file.name).extension
      ? `.${fileParts(file.name).extension.toLowerCase()}`
      : "";
    nameEditor.append(name, extension);
    const meta = document.createElement("p");
    meta.className = "file-item-meta";
    meta.textContent = `${formatSize(file.size)} / ${file.type || "形式不明"}`;
    info.append(nameEditor, meta);
    item.append(info);
    const actions = document.createElement("div");
    actions.className = "file-item-actions";
    const remove = document.createElement("button");
    remove.className = "secondary";
    remove.type = "button";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderFileList();
    });
    actions.append(remove);
    item.append(actions);
    fileList.append(item);
  });
  fileCard.classList.toggle("hidden", selectedFiles.length === 0);
}

function addFiles(files) {
  const invalid = files.find((file) => file.size > MAX_FILE_SIZE);
  if (invalid) {
    showBanner(`${invalid.name} は大きすぎます。1ファイル最大50MBです。`);
    return;
  }
  selectedFiles.push(...files);
  renderFileList();
  banner.classList.add("hidden");
}

fileInput.addEventListener("change", () => {
  addFiles([...fileInput.files]);
  fileInput.value = "";
});
["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
}));
["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
}));
dropZone.addEventListener("drop", (event) => addFiles([...event.dataTransfer.files]));

function renderFrame(index) {
  try {
    const qr = qrcode(0, "M");
    qr.addData(frames[index].payload, "Byte");
    qr.make();
    qrElement.innerHTML = qr.createImgTag(6, 0);
    qrStatus.textContent = `QR ${index + 1} / ${frames.length}`;
  } catch (error) {
    showBanner(`QRの生成に失敗しました: ${error.message}`);
    stopTransfer();
  }
}

function scheduleNextFrame() {
  if (!timer) return;
  timer = window.setTimeout(() => {
    currentRepeat += 1;
    if (currentRepeat >= frames[currentFrame].repeats) {
      currentRepeat = 0;
      currentFrame = (currentFrame + 1) % frames.length;
      renderFrame(currentFrame);
    }
    scheduleNextFrame();
  }, FRAME_INTERVAL);
}

async function startTransfer() {
  if (!selectedFiles.length) return;
  startButton.disabled = true;
  try {
    const batch = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    frames = [];
    for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex += 1) {
      const file = selectedFiles[fileIndex];
      const bytes = new Uint8Array(await file.arrayBuffer());
      const total = Math.max(1, Math.ceil(bytes.length / CHUNK_SIZE));
      const session = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      frames.push({
        payload: `OneCode1|meta|${batch}|${fileIndex}|${selectedFiles.length}|${session}|${total}|${file.size}|${textBase64(file.type || "application/octet-stream")}|${textBase64(file.name)}`,
        repeats: META_REPEATS,
      });
      for (let index = 0; index < total; index += 1) {
        const chunk = bytes.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        frames.push({
          payload: `OneCode1|data|${batch}|${fileIndex}|${session}|${index}|${total}|${toBase64(chunk)}`,
          repeats: DATA_REPEATS,
        });
      }
    }
    currentFrame = 0;
    dropZone.classList.add("hidden");
    fileCard.classList.add("hidden");
    panel.classList.remove("hidden");
    startButton.textContent = "転送中…";
    renderFrame(0);
    currentRepeat = 0;
    timer = true;
    scheduleNextFrame();
    showBanner(`${selectedFiles.length}個のファイルを転送しています。`, "ok");
  } catch (error) {
    showBanner(`ファイルの準備に失敗しました: ${error.message}`);
    startButton.disabled = false;
  }
}

function stopTransfer() {
  if (timer) clearTimeout(timer);
  timer = null;
  frames = [];
  currentFrame = 0;
  currentRepeat = 0;
  panel.classList.add("hidden");
  dropZone.classList.remove("hidden");
  fileCard.classList.toggle("hidden", selectedFiles.length === 0);
  startButton.disabled = false;
  startButton.textContent = "QR転送を開始";
  qrElement.replaceChildren();
  qrStatus.textContent = "";
  showBanner("転送を停止しました。ファイルを追加・編集して再開できます。", "warn");
}

startButton.addEventListener("click", startTransfer);
stopButton.addEventListener("click", stopTransfer);

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import JSZip from 'jszip';
import { useUiStore } from '@/stores/ui';
import { buildTgaBytes } from './tgaBytes';

const ui = useUiStore();

const SIZE_OPTIONS = [
    { key: '1x1', w: 32, h: 32, label: '1x1', dims: '32x32' },
    { key: '1x2', w: 32, h: 64, label: '1x2', dims: '32x64' },
    { key: '1x3', w: 32, h: 96, label: '1x3', dims: '32x96' }
];

const filesList = ref([]);
const currentFileIndex = ref(-1);
const currentSize = ref({ w: 32, h: 32 });
const currentSizeKey = ref('1x1');
const isDragOver = ref(false);
const isProcessing = ref(false);

const previewCanvas = ref(null);
const dropZone = ref(null);
const fileInput = ref(null);

const currentFile = computed(() => (currentFileIndex.value === -1 ? null : filesList.value[currentFileIndex.value]));

const downloadLabel = computed(() => {
    if (filesList.value.length > 5) return `📦 ZIP-ARCHIV EXPORT (${filesList.value.length})`;
    if (filesList.value.length > 1) return `📂 BATCH DOWNLOAD (${filesList.value.length})`;
    return '💾 TGA HERUNTERLADEN';
});

const isBatchMode = computed(() => filesList.value.length > 5);

function selectSize(opt) {
    currentSizeKey.value = opt.key;
    currentSize.value = { w: opt.w, h: opt.h };
    if (currentFileIndex.value !== -1) renderPreview();
}

function handleFiles(fileList) {
    if (!fileList.length) return;
    for (const file of fileList) {
        if (!file.type.match('image.*')) continue;

        const reader = new FileReader();
        reader.onload = (e) => {
            filesList.value.push({
                name: file.name,
                data: e.target.result,
                id: Date.now() + Math.random(),
                size: { ...currentSize.value }
            });
            if (currentFileIndex.value === -1) selectFile(0);
            else selectFile(filesList.value.length - 1);
        };
        reader.readAsDataURL(file);
    }
}

function onDrop(e) {
    isDragOver.value = false;
    handleFiles(e.dataTransfer.files);
}

function onFileInputChange(e) {
    handleFiles(e.target.files);
}

function selectFile(index) {
    if (index < 0 || index >= filesList.value.length) return;
    currentFileIndex.value = index;

    const file = filesList.value[index];
    const sizeKey = file.size.h === 32 ? '1x1' : (file.size.h === 64 ? '1x2' : '1x3');
    currentSizeKey.value = sizeKey;
    currentSize.value = { ...file.size };

    renderPreview();
}

function removeFile(index) {
    filesList.value.splice(index, 1);
    if (currentFileIndex.value >= filesList.value.length) currentFileIndex.value = filesList.value.length - 1;
    if (filesList.value.length === 0) {
        currentFileIndex.value = -1;
    } else {
        selectFile(currentFileIndex.value);
    }
}

function prevFile() {
    if (currentFileIndex.value > 0) selectFile(currentFileIndex.value - 1);
}
function nextFile() {
    if (currentFileIndex.value < filesList.value.length - 1) selectFile(currentFileIndex.value + 1);
}

async function renderPreview() {
    if (currentFileIndex.value === -1) return;
    const file = filesList.value[currentFileIndex.value];

    await nextTick();
    const canvas = previewCanvas.value;
    if (!canvas) return;

    const img = new Image();
    img.onload = () => {
        canvas.width = currentSize.value.w;
        canvas.height = currentSize.value.h;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, currentSize.value.w, currentSize.value.h);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, currentSize.value.w, currentSize.value.h);

        canvas.classList.remove('update-pulse');
        void canvas.offsetWidth;
        canvas.classList.add('update-pulse');
    };
    img.src = file.data;
}

/**
 * Encodes an image as an uncompressed 32-bit TGA (with alpha), the
 * format Metin2 expects for item/icon textures.
 */
async function createImageTGA(imageSrc, width, height) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const imageData = ctx.getImageData(0, 0, width, height);
            resolve(buildTgaBytes(width, height, imageData.data));
        };
        img.src = imageSrc;
    });
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
}

async function downloadAll() {
    if (filesList.value.length === 0) return;

    isProcessing.value = true;
    try {
        if (filesList.value.length > 1) {
            const zip = new JSZip();
            for (const file of filesList.value) {
                const tgaData = await createImageTGA(file.data, file.size.w, file.size.h);
                const name = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                zip.file(`${name}.tga`, tgaData);
            }
            const content = await zip.generateAsync({ type: 'blob' });
            const isBatch = filesList.value.length > 5;
            triggerDownload(content, isBatch ? `M2Tools_TGA_Batch_${Date.now()}.zip` : 'M2Tools_Icons.zip');
            ui.toast(`${filesList.value.length} ${isBatch ? 'TGAs als ZIP' : 'Dateien'} exportiert!`, 'success');
        } else {
            const file = filesList.value[0];
            const tgaData = await createImageTGA(file.data, file.size.w, file.size.h);
            const name = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            triggerDownload(new Blob([tgaData]), `${name}.tga`);
            ui.toast(`TGA "${name}" gespeichert!`, 'success');
        }
    } catch (err) {
        ui.toast('Export-Fehler: ' + err.message, 'error');
    } finally {
        isProcessing.value = false;
    }
}

function onKeydown(e) {
    if (e.key === 'ArrowLeft') prevFile();
    if (e.key === 'ArrowRight') nextFile();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="page-header">
        <div class="header-breadcrumb">
            <router-link to="/index.html">Dashboard</router-link> / <span class="accent-text">PNG ZU TGA KONVERTER</span>
        </div>
        <div class="header-main-row">
            <div>
                <h1>PNG zu <span class="accent">TGA</span> Konverter</h1>
                <p class="m2-hint">Ziehe transparente PNGs hinein und exportiere einsatzbereite TGAs direkt im Browser.</p>
            </div>
        </div>
    </div>

    <div class="converter-layout">
        <section class="converter-box glass-panel">
            <div class="box-header">
                <h2>PNG-Eingabe</h2>
                <div class="box-meta">
                    <span class="m2-badge">PNG, JPG unterstützt</span>
                </div>
            </div>

            <div
                ref="dropZone"
                class="drop-zone"
                :class="{ 'drag-over': isDragOver }"
                @click="fileInput.click()"
                @dragover.prevent="isDragOver = true"
                @dragleave="isDragOver = false"
                @drop.prevent="onDrop"
            >
                <div class="drop-content">
                    <div class="drop-icon">📤</div>
                    <p class="main-text">PNGs hier ablegen oder zum Auswählen klicken</p>
                    <p class="sub-text">Du kannst auch mehrere Dateien gleichzeitig hinzufügen.</p>
                </div>
                <input ref="fileInput" type="file" multiple accept="image/png, image/jpeg" style="display: none;" @change="onFileInputChange">
            </div>

            <div class="settings-section">
                <h3 class="m2-label">Item-Größe auswählen</h3>
                <div class="size-selector">
                    <div
                        v-for="opt in SIZE_OPTIONS"
                        :key="opt.key"
                        class="size-option"
                        :class="{ active: currentSizeKey === opt.key }"
                        @click="selectSize(opt)"
                    >
                        <div class="size-preview" :class="`s${opt.key}`"></div>
                        <div class="size-info">
                            <strong>{{ opt.label }}</strong>
                            <span>{{ opt.dims }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="export-area">
                <div class="export-info">
                    <h3>TGA-Export</h3>
                    <p>Exportiert das Bild im 32-Bit TGA Format inklusive Alpha-Kanal für Metin2.</p>
                </div>
                <button
                    id="download-btn"
                    class="m2-btn m2-btn-primary"
                    :class="{ 'batch-mode': isBatchMode }"
                    :disabled="filesList.length === 0 || isProcessing"
                    @click="downloadAll"
                >
                    {{ isProcessing ? '⚙️ VERARBEITE...' : downloadLabel }}
                </button>
            </div>
        </section>

        <section class="preview-box glass-panel">
            <div class="box-header">
                <h2>Vorschau</h2>
                <span class="preview-dim">{{ currentSize.w }}x{{ currentSize.h }}</span>
            </div>

            <div class="preview-container">
                <div v-if="!currentFile" class="preview-placeholder">
                    <div class="p-icon">🖼️</div>
                    <p>Noch kein Bild geladen</p>
                </div>
                <div v-else class="preview-stage">
                    <div class="canvas-wrapper">
                        <canvas ref="previewCanvas"></canvas>
                    </div>
                    <div class="preview-nav">
                        <button class="nav-btn" title="Vorheriges" @click="prevFile">◀</button>
                        <span class="nav-info">{{ currentFileIndex + 1 }} / {{ filesList.length }}</span>
                        <button class="nav-btn" title="Nächstes" @click="nextFile">▶</button>
                    </div>
                    <p class="m2-hint">Vorschau (4x vergrößert für Details)</p>
                </div>
            </div>
        </section>
    </div>

    <section class="file-list-section" style="margin-top: 40px;">
        <h3 class="m2-label">Geladene Dateien ({{ filesList.length }})</h3>
        <div class="file-grid">
            <div
                v-for="(f, index) in filesList"
                :key="f.id"
                class="file-item"
                :class="{ active: index === currentFileIndex }"
                @click="selectFile(index)"
            >
                <img :src="f.data" class="f-thumb">
                <div class="f-info">
                    <span class="f-name">{{ f.name }}</span>
                    <small>{{ (f.data.length / 1024).toFixed(1) }} KB • {{ f.size.w }}x{{ f.size.h }}</small>
                </div>
                <button class="f-remove" @click.stop="removeFile(index)">✕</button>
            </div>
        </div>
    </section>
</template>

<style scoped>
.converter-layout {
    display: grid;
    grid-template-columns: 1fr 420px;
    gap: 30px;
    margin-top: 20px;
    align-items: start;
}

@media (max-width: 1200px) {
    .converter-layout { grid-template-columns: 1fr; }
}

.box-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 15px;
}

.box-header h2 { font-family: var(--font-heading); font-size: 1.3rem; letter-spacing: 1.5px; color: var(--gold-primary); }

.drop-zone {
    border: 2px dashed var(--border-color);
    border-radius: var(--radius-md);
    padding: 40px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s;
    background: rgba(255, 255, 255, 0.02);
}

.drop-zone:hover, .drop-zone.drag-over {
    border-color: var(--gold-primary);
    background: rgba(181, 149, 81, 0.05);
    transform: translateY(-2px);
}

.drop-icon { font-size: 3rem; margin-bottom: 20px; opacity: 0.7; }
.main-text { font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.sub-text { font-size: 0.85rem; color: var(--text-muted); }

.size-selector {
    display: flex;
    gap: 15px;
    margin-top: 15px;
}

.size-option {
    flex: 1;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 15px;
    cursor: pointer;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    gap: 15px;
}

.size-option:hover { border-color: var(--gold-accent); transform: translateY(-3px); }
.size-option.active { border-color: var(--gold-primary); background: rgba(181, 149, 81, 0.1); box-shadow: 0 0 15px var(--gold-subtle); }

.size-preview {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid var(--border-color);
    border-radius: 4px;
}

.s1x1 { width: 32px; height: 32px; }
.s1x2 { width: 32px; height: 64px; }
.s1x3 { width: 32px; height: 96px; }

.size-info strong { display: block; font-family: var(--font-heading); color: var(--gold-primary); }
.size-info span { font-size: 0.75rem; color: var(--text-muted); }

.export-area {
    background: rgba(181, 149, 81, 0.05);
    border: 1px solid var(--gold-subtle);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
}

.export-info h3 { font-family: var(--font-heading); font-size: 1rem; color: var(--gold-primary); margin-bottom: 5px; }
.export-info p { font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; }

#download-btn { min-width: 200px; padding: 15px; }

.preview-container {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    background:
        linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.05) 75%),
        linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.05) 75%);
    background-size: 20px 20px;
    background-position: 0 0, 10px 10px;
    border-radius: var(--radius-md);
    min-height: 300px;
    position: relative;
    border: 1px solid var(--border-color);
}

.preview-placeholder { text-align: center; color: var(--text-muted); }
.p-icon { font-size: 3rem; margin-bottom: 15px; opacity: 0.5; }

.preview-stage { text-align: center; }
.canvas-wrapper {
    background: transparent;
    padding: 20px;
    border: 1px dashed var(--gold-primary);
    border-radius: 4px;
    display: inline-block;
    margin-bottom: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

.canvas-wrapper canvas {
    width: 128px;
    height: auto;
    image-rendering: crisp-edges;
    image-rendering: pixelated;
    display: block;
}

.preview-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    margin: 15px 0;
}

.nav-btn {
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    color: var(--gold-primary);
    padding: 8px 15px;
    border-radius: 6px;
    cursor: pointer;
    transition: 0.2s;
    font-size: 1.1rem;
    font-weight: 900;
}

.nav-btn:hover { border-color: var(--gold-primary); background: var(--bg-hover); transform: scale(1.1); }
.nav-info { font-family: var(--font-heading); color: var(--text-heading); font-size: 0.9rem; letter-spacing: 1px; }

.file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 15px;
}

@keyframes updatePulse {
    0% { transform: scale(1); filter: brightness(1); }
    50% { transform: scale(1.05); filter: brightness(1.3) drop-shadow(0 0 10px var(--gold-glow)); }
    100% { transform: scale(1); filter: brightness(1); }
}
.canvas-wrapper canvas.update-pulse { animation: updatePulse 0.4s ease-out; }

.m2-btn.batch-mode {
    background: linear-gradient(135deg, #b59551, #d4af37);
    color: #111;
    font-weight: 800;
    box-shadow: 0 0 20px rgba(181, 149, 81, 0.3);
}

.file-item {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    padding: 10px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: 0.2s;
    position: relative;
}

.file-item:hover { border-color: var(--gold-primary); background: var(--bg-hover); }
.file-item.active { border-color: var(--gold-primary); background: var(--gold-subtle); }

.f-thumb {
    width: 32px;
    height: 32px;
    background: #000;
    border-radius: 2px;
    object-fit: contain;
    border: 1px solid var(--border-color);
}

.f-info {
    flex: 1;
    overflow: hidden;
    font-size: 0.8rem;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.f-info span { display: block; font-weight: 700; color: var(--text-primary); }
.f-info small { color: var(--text-muted); font-size: 0.7rem; }

.f-remove {
    background: none; border: none; font-size: 1rem; color: var(--danger); cursor: pointer; padding: 5px; opacity: 0.7;
}
.f-remove:hover { opacity: 1; transform: scale(1.1); }
</style>

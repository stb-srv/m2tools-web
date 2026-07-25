/**
 * M2-Tools – PNG to TGA Converter Engine (32-Bit Alpha & Batch ZIP Support)
 */

let filesList = [];
let currentFileIndex = -1;
let currentSize = { w: 32, h: 32 };

// ── DOM ELEMENTS ─────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileGrid = document.getElementById('file-grid');
const fileCountSpan = document.getElementById('file-count');
const downloadBtn = document.getElementById('download-btn');
const sizeOptions = document.querySelectorAll('.size-option');
const previewCanvas = document.getElementById('preview-canvas');
const previewPlaceholder = document.getElementById('preview-placeholder');
const previewStage = document.getElementById('preview-stage');
const previewDim = document.getElementById('preview-dim');

// Nav
const prevPreview = document.getElementById('prev-preview');
const nextPreview = document.getElementById('next-preview');
const currNum = document.getElementById('curr-num');
const totalNum = document.getElementById('total-num');

// ── INIT ─────────────────────────────────────────────
dropZone.onclick = () => fileInput.click();
fileInput.onchange = (e) => handleFiles(e.target.files);

// Drag & Drop
dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); };
dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
};

// Size Selection
sizeOptions.forEach(opt => {
    opt.onclick = () => {
        sizeOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const sizeKey = opt.dataset.size;
        if (sizeKey === '1x1') { currentSize = { w: 32, h: 32 }; }
        else if (sizeKey === '1x2') { currentSize = { w: 32, h: 64 }; }
        else if (sizeKey === '1x3') { currentSize = { w: 32, h: 96 }; }
        
        previewDim.textContent = `${currentSize.w}x${currentSize.h}`;
        if (currentFileIndex !== -1) renderPreview();
    };
});

// Navigation
if (prevPreview) prevPreview.onclick = () => { if (currentFileIndex > 0) selectFile(currentFileIndex - 1); };
if (nextPreview) nextPreview.onclick = () => { if (currentFileIndex < filesList.length - 1) selectFile(currentFileIndex + 1); };

// Keyboard Nav
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') prevPreview.click();
    if (e.key === 'ArrowRight') nextPreview.click();
});

// ── FILE HANDLING ───────────────────────────────────
function handleFiles(files) {
    if (!files.length) return;

    for (let file of files) {
        if (!file.type.match('image.*')) continue;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            filesList.push({
                name: file.name,
                data: e.target.result,
                id: Date.now() + Math.random(),
                size: { ...currentSize } // Store current selected size for this file
            });
            updateUI();
            if (currentFileIndex === -1) selectFile(0);
            else selectFile(filesList.length - 1); // Select the newest one
        };
        reader.readAsDataURL(file);
    }
}

function updateUI() {
    fileCountSpan.textContent = filesList.length;
    totalNum.textContent = filesList.length || 0;
    
    fileGrid.innerHTML = filesList.map((f, index) => `
        <div class="file-item ${index === currentFileIndex ? 'active' : ''}" onclick="selectFile(${index})">
            <img src="${f.data}" class="f-thumb">
            <div class="f-info">
                <span class="f-name">${f.name}</span>
                <small>${(f.data.length / 1024).toFixed(1)} KB • ${f.size.w}x${f.size.h}</small>
            </div>
            <button class="f-remove" onclick="event.stopPropagation(); removeFile(${index})">✕</button>
        </div>
    `).join('');
    
    if (filesList.length > 5) {
        downloadBtn.innerHTML = `<span>📦</span> ZIP-ARCHIV EXPORT (${filesList.length})`;
        downloadBtn.classList.add('batch-mode');
    } else if (filesList.length > 1) {
        downloadBtn.innerHTML = `<span>📂</span> BATCH DOWNLOAD (${filesList.length})`;
        downloadBtn.classList.remove('batch-mode');
    } else {
        downloadBtn.innerHTML = `<span>💾</span> TGA HERUNTERLADEN`;
        downloadBtn.classList.remove('batch-mode');
    }
    
    downloadBtn.disabled = filesList.length === 0;
}

window.selectFile = (index) => {
    if (index < 0 || index >= filesList.length) return;
    currentFileIndex = index;
    currNum.textContent = index + 1;
    
    // Sync size selector with file's custom size
    const file = filesList[index];
    const sizeKey = file.size.h === 32 ? '1x1' : (file.size.h === 64 ? '1x2' : '1x3');
    sizeOptions.forEach(opt => {
        if (opt.dataset.size === sizeKey) opt.classList.add('active');
        else opt.classList.remove('active');
    });
    currentSize = { ...file.size };
    previewDim.textContent = `${currentSize.w}x${currentSize.h}`;

    updateUI();
    renderPreview();
};

window.removeFile = (index) => {
    filesList.splice(index, 1);
    if (currentFileIndex >= filesList.length) currentFileIndex = filesList.length - 1;
    if (filesList.length === 0) {
        currentFileIndex = -1;
        previewStage.classList.add('hidden');
        previewPlaceholder.classList.remove('hidden');
    } else {
        selectFile(currentFileIndex);
    }
    updateUI();
};

// ── PREVIEW ──────────────────────────────────────────
function renderPreview() {
    if (currentFileIndex === -1) return;
    
    const file = filesList[currentFileIndex];
    const img = new Image();
    img.onload = () => {
        previewPlaceholder.classList.add('hidden');
        previewStage.classList.remove('hidden');
        
        previewCanvas.width = currentSize.w;
        previewCanvas.height = currentSize.h;
        const ctx = previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, currentSize.w, currentSize.h);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, currentSize.w, currentSize.h);
        
        // Visual enhancement: pulse effect on update
        previewCanvas.classList.remove('update-pulse');
        void previewCanvas.offsetWidth; 
        previewCanvas.classList.add('update-pulse');
    };
    img.src = file.data;
}

// ── TGA EXPORT CORE ──────────────────────────────────
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
            const data = imageData.data;

            const header = new Uint8Array(18);
            header[2]  = 2;          
            header[12] = width & 0xFF;        
            header[13] = (width >> 8) & 0xFF;  
            header[14] = height & 0xFF;       
            header[15] = (height >> 8) & 0xFF; 
            header[16] = 32;         
            header[17] = 8;          

            const pixelCount = width * height;
            const tgaData = new Uint8Array(pixelCount * 4);
            
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const sourceY = height - 1 - y;
                    const sourceIdx = (sourceY * width + x) * 4;
                    const targetIdx = (y * width + x) * 4;
                    
                    tgaData[targetIdx + 0] = data[sourceIdx + 2]; // B
                    tgaData[targetIdx + 1] = data[sourceIdx + 1]; // G
                    tgaData[targetIdx + 2] = data[sourceIdx + 0]; // R
                    tgaData[targetIdx + 3] = data[sourceIdx + 3]; // A
                }
            }
            resolve(new Uint8Array([...header, ...tgaData]));
        };
        img.src = imageSrc;
    });
}

downloadBtn.onclick = async () => {
    if (filesList.length === 0) return;
    
    downloadBtn.disabled = true;
    const originalContent = downloadBtn.innerHTML;
    downloadBtn.textContent = '⚙️ VERARBEITE...';

    try {
        if (filesList.length > 5) {
            // ZIP EXPORT
            const zip = new JSZip();
            for (let file of filesList) {
                const tgaData = await createImageTGA(file.data, file.size.w, file.size.h);
                let name = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                zip.file(`${name}.tga`, tgaData);
            }
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.download = `M2Tools_TGA_Batch_${Date.now()}.zip`;
            link.href = url;
            link.click();
            if (window.m2Toast) window.m2Toast(`${filesList.length} TGAs als ZIP exportiert!`, 'success');
        } else if (filesList.length > 1) {
            // Smaller ZIP for consistency if multi-file
            const zip = new JSZip();
            for (let file of filesList) {
                const tgaData = await createImageTGA(file.data, file.size.w, file.size.h);
                let name = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                zip.file(`${name}.tga`, tgaData);
            }
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.download = `M2Tools_Icons.zip`;
            link.href = url;
            link.click();
            if (window.m2Toast) window.m2Toast(`${filesList.length} Dateien exportiert!`, 'success');
        } else {
            // Single file
            const file = filesList[0];
            const tgaData = await createImageTGA(file.data, file.size.w, file.size.h);
            const url = URL.createObjectURL(new Blob([tgaData]));
            const link = document.createElement('a');
            let name = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            link.download = `${name}.tga`;
            link.href = url;
            link.click();
            if (window.m2Toast) window.m2Toast(`TGA "${name}" gespeichert!`, 'success');
        }
    } catch (err) {
        if (window.m2Toast) window.m2Toast('Export-Fehler: ' + err.message, 'error');
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = originalContent;
    }
};

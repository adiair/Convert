// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let selectedFiles = [];
let currentMode = 'pdf-to-png';

function switchTab(mode) {
    // Update active tab
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Update active section
    document.querySelectorAll('.converter-section').forEach(section => section.classList.remove('active'));
    document.getElementById(mode).classList.add('active');

    currentMode = mode;
    selectedFiles = [];
    updateConvertButton();
    hideResults();
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e, type) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files);
    processFiles(files, type);
}

function handleFileSelect(e, type) {
    const files = Array.from(e.target.files);
    processFiles(files, type);
}

function processFiles(files, type) {
    const validFiles = files.filter(file => {
        if (type === 'pdf') {
            return file.type === 'application/pdf';
        } else {
            return file.type === 'image/png';
        }
    });

    if (validFiles.length === 0) {
        showError(`Please select valid ${type.toUpperCase()} files.`);
        return;
    }

    selectedFiles = validFiles;
    updateConvertButton();
    hideResults();
    showFilePreview(validFiles, type);
}

function showFilePreview(files, type) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
                <h3 style="margin-bottom: 15px; color: #333;">Selected Files:</h3>
                ${files.map((file, index) => `
                    <div class="result-item">
                        <div class="result-info">
                            <span class="result-icon">${type === 'pdf' ? '📄' : '🖼️'}</span>
                            <div>
                                <div style="font-weight: 600;">${file.name}</div>
                                <div style="color: #666; font-size: 0.9em;">${formatFileSize(file.size)}</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            `;
    resultsDiv.style.display = 'block';
}

function updateConvertButton() {
    const pdfBtn = document.getElementById('pdf-convert-btn');
    const pngBtn = document.getElementById('png-convert-btn');

    if (currentMode === 'pdf-to-png') {
        pdfBtn.disabled = selectedFiles.length === 0;
    } else {
        pngBtn.disabled = selectedFiles.length === 0;
    }
}

async function convertPdfToPng() {
    if (selectedFiles.length === 0) return;

    showLoading();
    hideResults();

    try {
        const file = selectedFiles[0];
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const quality = parseInt(document.getElementById('pdf-quality').value);
        const scale = quality; // Scale factor for rendering
        const pagesInput = document.getElementById('pdf-pages').value.trim();

        let pagesToConvert = [];
        if (pagesInput) {
            pagesToConvert = parsePageRange(pagesInput, pdf.numPages);
        } else {
            pagesToConvert = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
        }

        const results = [];

        for (const pageNum of pagesToConvert) {
            try {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport }).promise;

                const blob = await new Promise(resolve => {
                    canvas.toBlob(resolve, 'image/png', 1.0);
                });

                const filename = `${file.name.replace('.pdf', '')}_page_${pageNum}.png`;
                results.push({ blob, filename, pageNum });
            } catch (error) {
                console.error(`Error converting page ${pageNum}:`, error);
            }
        }

        hideLoading();
        showResults(results, 'png');

    } catch (error) {
        hideLoading();
        showError('Error converting PDF: ' + error.message);
    }
}

async function convertPngToPdf() {
    if (selectedFiles.length === 0) return;

    showLoading();
    hideResults();

    try {
        const pdfDoc = await PDFLib.PDFDocument.create();
        const pageSize = document.getElementById('png-page-size').value;
        const fitMode = document.getElementById('png-fit').value;

        for (const file of selectedFiles) {
            const arrayBuffer = await file.arrayBuffer();
            const pngImage = await pdfDoc.embedPng(arrayBuffer);

            let page;
            if (pageSize === 'Fit') {
                page = pdfDoc.addPage([pngImage.width, pngImage.height]);
                page.drawImage(pngImage, {
                    x: 0,
                    y: 0,
                    width: pngImage.width,
                    height: pngImage.height,
                });
            } else {
                // Standard page sizes
                const pageSizes = {
                    'A4': [595, 842],
                    'Letter': [612, 792],
                    'Legal': [612, 1008]
                };

                const [pageWidth, pageHeight] = pageSizes[pageSize];
                page = pdfDoc.addPage([pageWidth, pageHeight]);

                const { width, height, x, y } = calculateImageDimensions(
                    pngImage.width, pngImage.height,
                    pageWidth, pageHeight, fitMode
                );

                page.drawImage(pngImage, { x, y, width, height });
            }
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });

        const filename = selectedFiles.length === 1
            ? selectedFiles[0].name.replace('.png', '.pdf')
            : 'converted_images.pdf';

        hideLoading();
        showResults([{ blob, filename }], 'pdf');

    } catch (error) {
        hideLoading();
        showError('Error converting PNG to PDF: ' + error.message);
    }
}

function calculateImageDimensions(imgWidth, imgHeight, pageWidth, pageHeight, fitMode) {
    const imgAspectRatio = imgWidth / imgHeight;
    const pageAspectRatio = pageWidth / pageHeight;

    let width, height, x, y;

    if (fitMode === 'contain') {
        if (imgAspectRatio > pageAspectRatio) {
            width = pageWidth;
            height = pageWidth / imgAspectRatio;
        } else {
            width = pageHeight * imgAspectRatio;
            height = pageHeight;
        }
        x = (pageWidth - width) / 2;
        y = (pageHeight - height) / 2;
    } else if (fitMode === 'cover') {
        if (imgAspectRatio > pageAspectRatio) {
            width = pageHeight * imgAspectRatio;
            height = pageHeight;
        } else {
            width = pageWidth;
            height = pageWidth / imgAspectRatio;
        }
        x = (pageWidth - width) / 2;
        y = (pageHeight - height) / 2;
    } else { // stretch
        width = pageWidth;
        height = pageHeight;
        x = 0;
        y = 0;
    }

    return { width, height, x, y };
}

function parsePageRange(input, totalPages) {
    const pages = [];
    const parts = input.split(',');

    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.includes('-')) {
            const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
            for (let i = start; i <= Math.min(end, totalPages); i++) {
                if (i >= 1) pages.push(i);
            }
        } else {
            const pageNum = parseInt(trimmed);
            if (pageNum >= 1 && pageNum <= totalPages) {
                pages.push(pageNum);
            }
        }
    }

    return [...new Set(pages)].sort((a, b) => a - b);
}

function showResults(results, type) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
                <h3 style="margin-bottom: 15px; color: #333;">Conversion Complete!</h3>
                ${results.map((result, index) => `
                    <div class="result-item">
                        <div class="result-info">
                            <span class="result-icon">${type === 'pdf' ? '📄' : '🖼️'}</span>
                            <div>
                                <div style="font-weight: 600;">${result.filename}</div>
                                <div style="color: #666; font-size: 0.9em;">${formatFileSize(result.blob.size)}</div>
                            </div>
                        </div>
                        <button class="download-btn" onclick="downloadFile('${result.filename}', ${index})">
                            Download
                        </button>
                    </div>
                `).join('')}
            `;
    resultsDiv.style.display = 'block';

    // Store results for download
    window.conversionResults = results;
}

function downloadFile(filename, index) {
    const result = window.conversionResults[index];
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showLoading() {
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function hideResults() {
    document.getElementById('results').style.display = 'none';
}

function showError(message) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<div class="error">${message}</div>`;
    resultsDiv.style.display = 'block';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
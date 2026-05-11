// --- UI Interactions ---

// Settings accordion toggle
const settingsToggle = document.getElementById('settings-toggle');
const settingsCard = document.querySelector('.settings-card');

settingsToggle.addEventListener('click', () => {
    settingsCard.classList.toggle('open');
});

// Sync color inputs with their text labels
const colorInputs = document.querySelectorAll('input[type="color"]');
colorInputs.forEach(input => {
    input.addEventListener('input', (e) => {
        const span = e.target.nextElementSibling;
        if (span && span.classList.contains('color-val')) {
            span.textContent = e.target.value.toLowerCase();
        }
    });
});

// --- Validation & URL Parsing ---

const slidesUrlInput = document.getElementById('slides-url');
const docsUrlInput = document.getElementById('docs-url');
const exportBtn = document.getElementById('export-btn');

function validateInputs() {
    const slidesId = extractIdFromUrl(slidesUrlInput.value);
    const docsId = extractIdFromUrl(docsUrlInput.value);
    
    // Enable export button if both URLs have valid IDs and user is authenticated
    if (slidesId && docsId) {
        exportBtn.disabled = !isAuthenticated;
        
        if (!isAuthenticated) {
            exportBtn.title = "Please Connect Google first";
        } else {
            exportBtn.title = "";
        }
    } else {
        exportBtn.disabled = true;
    }
}

function extractIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

slidesUrlInput.addEventListener('input', validateInputs);
docsUrlInput.addEventListener('input', validateInputs);

// --- Google Auth & Export Logic ---

/**
 * IMPORTANT NOTE ABOUT RUNNING LOCALLY:
 * 
 * Yes, you must deal with Auth if running this as a local webpage. 
 * Just being logged into Google in your browser is NOT enough because 
 * browsers block local files from accessing cross-origin data (like Google APIs) 
 * for security reasons.
 * 
 * To make this work:
 * 1. Go to Google Cloud Console (console.cloud.google.com)
 * 2. Create a Project and enable Google Slides API and Google Docs API.
 * 3. Create OAuth 2.0 Client IDs (Web application).
 * 4. Add "http://localhost:5500" (or wherever you host this) to Authorized JavaScript origins.
 * 5. Paste your CLIENT_ID below.
 */

const CLIENT_ID = '824698592565-bqspd7oci5klqbttj1epnstl4e8lggeg.apps.googleusercontent.com'; // <-- PASTE YOUR CLIENT ID HERE
const DISCOVERY_DOCS = [
    "https://slides.googleapis.com/$discovery/rest?version=v1",
    "https://docs.googleapis.com/$discovery/rest?version=v1"
];
const SCOPES = "https://www.googleapis.com/auth/presentations.readonly https://www.googleapis.com/auth/documents";

let tokenClient;
let gapiInited = false;
let gisInited = false;
let isAuthenticated = false;

const authBtn = document.getElementById('auth-btn');

// Initialize the Google API client library (gapi)
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            discoveryDocs: DISCOVERY_DOCS,
        });
        gapiInited = true;
        maybeEnableAuth();
    } catch (e) {
        console.error("Error initializing gapi:", e);
    }
}

// Initialize Google Identity Services
function gisLoaded() {
    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
        console.warn("Please configure your Google CLIENT_ID in script.js to enable authentication.");
        return;
    }
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableAuth();
}

function maybeEnableAuth() {
    if (gapiInited && gisInited) {
        authBtn.disabled = false;
    }
}

authBtn.addEventListener('click', () => {
    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
        alert("You must add your Google Client ID to script.js to use this feature.\n\nRunning locally requires an OAuth configuration because the browser's Same-Origin Policy prevents local files from automatically using your logged-in Google session.");
        return;
    }
    
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        isAuthenticated = true;
        authBtn.textContent = "Connected!";
        authBtn.classList.add('connected');
        validateInputs();
    };

    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data.
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({prompt: ''});
    }
});

// Load the scripts dynamically
function loadGoogleScripts() {
    const gapiScript = document.createElement('script');
    gapiScript.src = "https://apis.google.com/js/api.js";
    gapiScript.onload = gapiLoaded;
    document.head.appendChild(gapiScript);
    
    const gisScript = document.createElement('script');
    gisScript.src = "https://accounts.google.com/gsi/client";
    gisScript.onload = gisLoaded;
    document.head.appendChild(gisScript);
}

loadGoogleScripts();

// --- Export Process ---
const statusMessage = document.getElementById('status-message');
const messageText = statusMessage.querySelector('.message-text');
const spinner = statusMessage.querySelector('.spinner');

exportBtn.addEventListener('click', async () => {
    const slidesId = extractIdFromUrl(slidesUrlInput.value);
    const docsId = extractIdFromUrl(docsUrlInput.value);
    
    if (!slidesId || !docsId) return;
    
    // Gather settings
    const config = {
        excludeSkipped: document.getElementById('exclude-skipped').checked,
        greySkipped: document.getElementById('grey-skipped').checked,
        skippedColor: document.getElementById('skipped-color').value,
        contentSize: parseInt(document.getElementById('content-size').value, 10),
        contentColor: document.getElementById('content-color').value,
        headingSize: parseInt(document.getElementById('heading-size').value, 10),
        headingColor: document.getElementById('heading-color').value,
        dashesText: document.getElementById('dashes-text').value,
        dashesColor: document.getElementById('dashes-color').value,
        tagSize: parseInt(document.getElementById('tag-size').value, 10),
        tagColor: document.getElementById('tag-color').value
    };

    // UI Feedback
    statusMessage.classList.remove('hidden', 'error');
    messageText.textContent = "Fetching Slides data...";
    spinner.style.display = "block";
    exportBtn.disabled = true;

    try {
        if (!isAuthenticated) {
            throw new Error("You must connect to Google first.");
        }
        
        await performExport(slidesId, docsId, config, messageText);
        
        // Success
        spinner.style.display = "none";
        statusMessage.classList.remove('error');
        messageText.textContent = "Export completed successfully!";
    } catch (err) {
        // Error
        spinner.style.display = "none";
        statusMessage.classList.add('error');
        messageText.textContent = "Error: " + (err.message || err.result?.error?.message || "Something went wrong");
        console.error(err);
    } finally {
        exportBtn.disabled = false;
    }
});

// Helper for hex color to RGB percentage for Google Docs API
function hexToRgb(hex) {
    let r = parseInt(hex.slice(1,3), 16) / 255;
    let g = parseInt(hex.slice(3,5), 16) / 255;
    let b = parseInt(hex.slice(5,7), 16) / 255;
    return { red: r, green: g, blue: b };
}

async function performExport(slidesId, docsId, config, messageText) {
    messageText.textContent = "Fetching Slides data...";
    const presentation = await gapi.client.slides.presentations.get({ presentationId: slidesId });
    const slides = presentation.result.slides || [];
    const fileName = presentation.result.title || "Exported Presentation";

    messageText.textContent = "Fetching Docs data...";
    const doc = await gapi.client.docs.documents.get({ documentId: docsId });
    
    let requests = [];
    
    // Find the end index of the document
    let currentIndex = doc.result.body.content[doc.result.body.content.length - 1].endIndex - 1;

    function insertTextWithStyle(text, styleObj) {
        if (!text) return;
        requests.push({
            insertText: {
                location: { index: currentIndex },
                text: text
            }
        });
        
        let start = currentIndex;
        currentIndex += text.length;
        let end = currentIndex;

        if (styleObj) {
            let textStyle = {};
            let hasTextStyle = false;
            
            if (styleObj.fontSize) {
                textStyle.fontSize = { magnitude: styleObj.fontSize, unit: 'PT' };
                hasTextStyle = true;
            }
            if (styleObj.color) {
                textStyle.foregroundColor = { color: { rgbColor: hexToRgb(styleObj.color) } };
                hasTextStyle = true;
            }
            if (styleObj.bold !== undefined) {
                textStyle.bold = styleObj.bold;
                hasTextStyle = true;
            }
            if (styleObj.italic !== undefined) {
                textStyle.italic = styleObj.italic;
                hasTextStyle = true;
            }
            
            if (hasTextStyle) {
                requests.push({
                    updateTextStyle: {
                        range: { startIndex: start, endIndex: end },
                        textStyle: textStyle,
                        fields: Object.keys(textStyle).join(',')
                    }
                });
            }

            if (styleObj.heading) {
                requests.push({
                    updateParagraphStyle: {
                        range: { startIndex: start, endIndex: end },
                        paragraphStyle: { namedStyleType: styleObj.heading },
                        fields: 'namedStyleType'
                    }
                });
            }
        }
    }

    messageText.textContent = "Processing notes...";
    
    // 1) Add Title
    insertTextWithStyle(fileName + "\n", { 
        heading: 'HEADING_2', 
        fontSize: config.headingSize, 
        color: config.headingColor 
    });

    let processedSlideCount = 0;

    for (let sIdx = 0; sIdx < slides.length; sIdx++) {
        const slide = slides[sIdx];
        const slideId = slide.objectId;
        const isSkipped = slide.slideProperties && slide.slideProperties.isSkipped;

        if (config.excludeSkipped && isSkipped) {
            continue;
        }

        let rawNotes = '';
        if (slide.slideProperties && slide.slideProperties.notesPage && slide.slideProperties.notesPage.pageElements) {
            const elements = slide.slideProperties.notesPage.pageElements;
            let bestLength = 0;
            for (let el of elements) {
                if (el.shape && el.shape.text && el.shape.text.textElements) {
                    let textStr = '';
                    for (let te of el.shape.text.textElements) {
                        if (te.textRun && te.textRun.content) {
                            textStr += te.textRun.content;
                        }
                    }
                    if (el.shape.placeholder && el.shape.placeholder.type === 'BODY') {
                        rawNotes = textStr;
                        break;
                    } else if (textStr.length > bestLength) {
                        bestLength = textStr.length;
                        rawNotes = textStr;
                    }
                }
            }
        }

        let noteText = rawNotes.replace(/\r\n?/g, '\n').replace(/[\u000B\u2028]/g, 'SOFT_RETURN');

        // Dashes
        if (processedSlideCount > 0) {
            insertTextWithStyle(config.dashesText + "\n", { color: config.dashesColor });
        }

        // Tag
        insertTextWithStyle(`{id: ${slideId}}\n`, { fontSize: config.tagSize, color: config.tagColor });

        processedSlideCount++;

        if (!noteText.trim()) continue;

        let contentColor = (config.greySkipped && isSkipped) ? config.skippedColor : config.contentColor;
        let headingColor = (config.greySkipped && isSkipped) ? config.skippedColor : config.headingColor;

        let parts = noteText.split(/^(#\s*.+?(?:\s*SOFT_RETURN.*)?)$/gm);
        
        for (let p of parts) {
            if (!p) continue;
            if (p.startsWith('#')) {
                let headingMatch = p.match(/^#\s*(.+?)(?:\s*SOFT_RETURN(.*))?$/);
                if (headingMatch) {
                    let headingText = headingMatch[1] + '\n';
                    insertTextWithStyle(headingText, {
                        heading: 'HEADING_2',
                        fontSize: config.headingSize,
                        color: headingColor
                    });
                    if (headingMatch[2]) {
                        processInlineFormatting(headingMatch[2] + '\n', contentColor, config.contentSize);
                    }
                } else {
                    processInlineFormatting(p + '\n', contentColor, config.contentSize);
                }
            } else {
                processInlineFormatting(p, contentColor, config.contentSize);
            }
        }
    }

    function processInlineFormatting(text, baseColor, baseSize) {
        if (!text) return;
        
        let tokenized = text.replace(/\*\*(.*?)\*\*/g, "BOLD_START$1BOLD_END")
                            .replace(/\*(.*?)\*/g, "ITALIC_START$1ITALIC_END")
                            .replace(/SOFT_RETURN/g, "\n");
                            
        let currentText = tokenized;
        while (currentText.length > 0) {
            let boldStart = currentText.indexOf("BOLD_START");
            let italicStart = currentText.indexOf("ITALIC_START");
            
            let nextMarker = -1;
            let markerType = '';
            if (boldStart !== -1 && (italicStart === -1 || boldStart < italicStart)) {
                nextMarker = boldStart;
                markerType = 'bold';
            } else if (italicStart !== -1) {
                nextMarker = italicStart;
                markerType = 'italic';
            }
            
            if (nextMarker === -1) {
                insertTextWithStyle(currentText, { color: baseColor, fontSize: baseSize });
                break;
            }
            
            if (nextMarker > 0) {
                insertTextWithStyle(currentText.substring(0, nextMarker), { color: baseColor, fontSize: baseSize });
            }
            
            if (markerType === 'bold') {
                currentText = currentText.substring(nextMarker + 10);
                let endIdx = currentText.indexOf("BOLD_END");
                if (endIdx !== -1) {
                    insertTextWithStyle(currentText.substring(0, endIdx), { color: baseColor, fontSize: baseSize, bold: true });
                    currentText = currentText.substring(endIdx + 8);
                } else {
                    insertTextWithStyle("BOLD_START" + currentText, { color: baseColor, fontSize: baseSize });
                    break;
                }
            } else if (markerType === 'italic') {
                currentText = currentText.substring(nextMarker + 12);
                let endIdx = currentText.indexOf("ITALIC_END");
                if (endIdx !== -1) {
                    insertTextWithStyle(currentText.substring(0, endIdx), { color: baseColor, fontSize: baseSize, italic: true });
                    currentText = currentText.substring(endIdx + 10);
                } else {
                    insertTextWithStyle("ITALIC_START" + currentText, { color: baseColor, fontSize: baseSize });
                    break;
                }
            }
        }
    }

    messageText.textContent = "Writing to Google Doc...";
    
    if (requests.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < requests.length; i += chunkSize) {
            const chunk = requests.slice(i, i + chunkSize);
            await gapi.client.docs.documents.batchUpdate({
                documentId: docsId,
                resource: { requests: chunk }
            });
        }
    }
}

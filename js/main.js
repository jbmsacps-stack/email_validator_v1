const siteHeader = document.querySelector(".site-header");
const uploadZone = document.querySelector(".upload-zone");
const fileInput = document.querySelector("#csvFile");
const fileMeta = document.querySelector("#fileMeta");
const errorMessage = document.querySelector("#errorMessage");
const validateButton = document.querySelector("#validateButton");
const progressWrap = document.querySelector("#progressWrap");
const progressBar = document.querySelector("#progressBar");
const resultsSection = document.querySelector("#resultsSection");

const totalCount = document.querySelector("#totalCount");
const validCount = document.querySelector("#validCount");
const invalidCount = document.querySelector("#invalidCount");

const validList = document.querySelector("#validList");
const invalidList = document.querySelector("#invalidList");
const validPill = document.querySelector("#validPill");
const invalidPill = document.querySelector("#invalidPill");

const downloadButton = document.querySelector("#downloadButton");
const resetButton = document.querySelector("#resetButton");

let selectedFile = null;
let cleanedCsvContent = "";

/**
 * Adds a shadow to the navbar after the user scrolls down.
 */
function handleNavbarShadow() {
  if (window.scrollY > 8) {
    siteHeader.classList.add("is-scrolled");
  } else {
    siteHeader.classList.remove("is-scrolled");
  }
}

/**
 * Escapes user-provided text before inserting it into the page.
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Converts a file size from bytes into a readable KB or MB format.
 */
function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Displays an error message inside the upload card.
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add("is-visible");
  errorMessage.setAttribute("role", "alert");
}

/**
 * Hides and clears the current error message.
 */
function clearError() {
  errorMessage.textContent = "";
  errorMessage.classList.remove("is-visible");
}

/**
 * Checks whether the selected file is a CSV file.
 */
function isCsvFile(file) {
  return file && file.name.toLowerCase().endsWith(".csv");
}

/**
 * Stores a valid selected CSV file and updates the upload UI.
 */
function setSelectedFile(file) {
  clearError();

  if (!isCsvFile(file)) {
    selectedFile = null;
    fileInput.value = "";
    validateButton.disabled = true;
    uploadZone.classList.remove("has-file");
    fileMeta.classList.remove("is-visible");
    showError("Please select a valid .csv file.");
    return;
  }

  selectedFile = file;
  validateButton.disabled = false;
  uploadZone.classList.add("has-file");

  fileMeta.innerHTML = `
    <strong>Selected file:</strong> ${escapeHtml(file.name)}
    <br>
    <span>${escapeHtml(formatFileSize(file.size))}</span>
  `;

  fileMeta.classList.add("is-visible");
}

/**
 * Opens the file browser when the upload zone is clicked.
 */
function handleUploadZoneClick() {
  fileInput.click();
}

/**
 * Handles file selection from the hidden file input.
 */
function handleFileInputChange(event) {
  const file = event.target.files[0];

  if (file) {
    setSelectedFile(file);
  }
}

/**
 * Prevents the browser from opening a dragged file directly.
 */
function preventDefaultDragBehavior(event) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Applies the drag-over visual state to the upload zone.
 */
function handleDragEnter() {
  uploadZone.classList.add("drag-over");
}

/**
 * Removes the drag-over visual state from the upload zone.
 */
function handleDragLeave() {
  uploadZone.classList.remove("drag-over");
}

/**
 * Reads the dropped file and passes it into the selected-file handler.
 */
function handleDrop(event) {
  uploadZone.classList.remove("drag-over");

  const file = event.dataTransfer.files[0];

  if (file) {
    setSelectedFile(file);
  }
}

/**
 * Shows the progress bar and simulates movement while the backend processes.
 */
function startProgress() {
  progressWrap.classList.add("is-visible");
  progressBar.style.width = "18%";

  setTimeout(function () {
    progressBar.style.width = "58%";
  }, 180);

  setTimeout(function () {
    progressBar.style.width = "82%";
  }, 420);
}

/**
 * Completes the progress bar after validation finishes.
 */
function finishProgress() {
  progressBar.style.width = "100%";

  setTimeout(function () {
    progressWrap.classList.remove("is-visible");
    progressBar.style.width = "0%";
  }, 450);
}

/**
 * Sends the selected CSV file to the backend validation endpoint.
 */
async function validateSelectedFile() {
  if (!selectedFile) {
    showError("Please select a CSV file before validating.");
    return;
  }

  clearError();

  const formData = new FormData();
  formData.append("csvFile", selectedFile);

  validateButton.disabled = true;
  validateButton.textContent = "Validating...";
  startProgress();

  try {
    const response = await fetch("/api/validate-emails", {
      method: "POST",
      body: formData
    });

    const contentType = response.headers.get("content-type");

    if (!contentType || !contentType.includes("application/json")) {
      throw new Error(
        "Server returned HTML instead of JSON. Make sure you opened http://localhost:5000 and not Live Server."
      );
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Validation failed. Please try again.");
    }

    cleanedCsvContent = data.cleanedCsv || "";
    renderResults(data);
    finishProgress();

    setTimeout(function () {
      resultsSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 300);
  } catch (error) {
    finishProgress();
    showError(error.message || "Something went wrong while validating the file.");
  } finally {
    validateButton.disabled = false;
    validateButton.textContent = "Validate Emails";
  }
}

/**
 * Creates a valid email list item.
 */
function createValidEmailItem(email) {
  const listItem = document.createElement("li");
  listItem.className = "email-item";
  listItem.innerHTML = escapeHtml(email);
  return listItem;
}

/**
 * Creates an invalid email list item with its removal reason.
 */
function createInvalidEmailItem(item) {
  const listItem = document.createElement("li");
  listItem.className = "email-item invalid";

  listItem.innerHTML = `
    <strong>${escapeHtml(item.email || "(empty line)")}</strong>
    <span>${escapeHtml(item.reason)}</span>
  `;

  return listItem;
}

/**
 * Renders all validation results into the summary and email list panels.
 */
function renderResults(data) {
  const summary = data.summary || {
    total: 0,
    valid: 0,
    invalid: 0
  };

  totalCount.textContent = summary.total;
  validCount.textContent = summary.valid;
  invalidCount.textContent = summary.invalid;

  validPill.textContent = `${summary.valid} kept`;
  invalidPill.textContent = `${summary.invalid} removed`;

  validList.innerHTML = "";
  invalidList.innerHTML = "";

  if (data.valid.length === 0) {
    validList.innerHTML = `<li class="empty-state">No valid emails found.</li>`;
  } else {
    data.valid.forEach(function (email) {
      validList.appendChild(createValidEmailItem(email));
    });
  }

  if (data.invalid.length === 0) {
    invalidList.innerHTML = `<li class="empty-state">No invalid emails found.</li>`;
  } else {
    data.invalid.forEach(function (item) {
      invalidList.appendChild(createInvalidEmailItem(item));
    });
  }

  downloadButton.disabled = data.valid.length === 0;
  resultsSection.classList.add("is-visible");
}

/**
 * Downloads the cleaned CSV file containing only valid emails.
 */
function downloadCleanCsv() {
  const blob = new Blob([cleanedCsvContent], {
    type: "text/csv;charset=utf-8"
  });

  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = "clean-valid-emails.csv";
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);
}

/**
 * Clears the selected file, progress state, errors, and results panel.
 */
function resetValidator() {
  selectedFile = null;
  cleanedCsvContent = "";

  fileInput.value = "";
  validateButton.disabled = true;
  validateButton.textContent = "Validate Emails";

  uploadZone.classList.remove("has-file", "drag-over");
  fileMeta.classList.remove("is-visible");
  fileMeta.innerHTML = "";

  clearError();

  progressWrap.classList.remove("is-visible");
  progressBar.style.width = "0%";

  resultsSection.classList.remove("is-visible");

  totalCount.textContent = "0";
  validCount.textContent = "0";
  invalidCount.textContent = "0";

  validList.innerHTML = "";
  invalidList.innerHTML = "";
}

/**
 * Registers all browser events used by the validator interface.
 */
function registerEventListeners() {
  window.addEventListener("scroll", handleNavbarShadow);

  uploadZone.addEventListener("click", handleUploadZoneClick);
  uploadZone.addEventListener("keydown", handleUploadZoneKeydown);
  fileInput.addEventListener("change", handleFileInputChange);

  ["dragenter", "dragover", "dragleave", "drop"].forEach(function (eventName) {
    uploadZone.addEventListener(eventName, preventDefaultDragBehavior);
  });

  uploadZone.addEventListener("dragenter", handleDragEnter);
  uploadZone.addEventListener("dragover", handleDragEnter);
  uploadZone.addEventListener("dragleave", handleDragLeave);
  uploadZone.addEventListener("drop", handleDrop);

  validateButton.addEventListener("click", validateSelectedFile);
  downloadButton.addEventListener("click", downloadCleanCsv);
  resetButton.addEventListener("click", resetValidator);
}

/**
 * Starts the frontend behavior after the page loads.
 */
function initEmailValidator() {
  registerEventListeners();
  handleNavbarShadow();
}

initEmailValidator();

/**
 * Opens the file browser when Enter or Space is pressed on the upload zone.
 */
function handleUploadZoneKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
}
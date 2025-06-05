<template>
  <div class="file-explorer">
    <!-- Toast Container -->
    <div class="toast-container">
      <transition-group name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast', toast.type]"
        >
          {{ toast.message }}
        </div>
      </transition-group>
    </div>

    <!-- Sidebar -->
    <div class="sidebar">
      <h2>Image Explorer</h2>

      <div v-if="selectedFolder" class="selected-folder">
        Selected folder: {{ selectedFolder }}
      </div>

      <div class="file-list">
        <ul v-if="files.length">
          <li
            v-for="file in files"
            :key="file"
            :class="{ active: selectedImage === file }"
            @click="selectImage(file)"
          >
            {{ file }}
          </li>
        </ul>
        <p v-else>
          No images found. Please
          <a href="#" @click.prevent="selectFolder">select a folder</a>.
          <br />
          <small class="supported-formats">
            Supported formats: JPG, JPEG, PNG, WEBP
          </small>
        </p>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="main-content-area">
      <div class="image-viewer-container">
        <ImageViewer
          :image-path="selectedImage"
          :initial-selection="currentSelectionSettings"
          @selection-change="handleSelectionChange"
        />
      </div>
      <div class="bottom-bar">
        <div v-if="existingTags.length > 0" class="existing-tags">
          <label class="tags-label">Used tags:</label>
          <div class="tags-list">
            <span
              v-for="tag in existingTags"
              :key="tag"
              class="tag-badge"
              @click="addTagToCaption(tag)"
            >
              {{ tag }}
            </span>
          </div>
        </div>
        <div class="input-row">
          <input
            ref="captionInput"
            type="text"
            class="caption-input"
            placeholder="Enter image caption..."
            v-model="imageCaption"
            @keydown="handleKeyDown"
          />
          <button
            type="button"
            class="clone-button"
            @click="handleClone"
            :disabled="!selectedImage"
          >
            Clone Image
          </button>
          <button
            type="button"
            class="save-button"
            @click="handleSave"
            :disabled="!selectedImage || !imageSettings.has(selectedImage)"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, toRaw, reactive, computed } from "vue";
import ImageViewer from "./ImageViewer.vue";
import { SelectionData } from "../../../shared/types";

// State
const selectedFolder = ref("");
const files = ref<string[]>([]);
const selectedImage = ref("");
const existingTagsSet = reactive(new Set<string>());
const existingTags = computed(() => Array.from(existingTagsSet));

// Add new state for selections
const imageSettings = ref<Map<string, SelectionData>>(new Map());
const currentSelectionSettings = ref<SelectionData | undefined>(undefined);

// Add new ref for caption
const imageCaption = ref("");

// Add ref for the caption input element
const captionInput = ref<HTMLInputElement | null>(null);

// Add these new interfaces after the existing type definitions
interface Toast {
  message: string;
  type: "success" | "error";
  id: number;
}

// Add these new refs with the other state declarations
const toasts = ref<Toast[]>([]);
let toastCounter = 0;

// Add this flag to track if a save is in progress
const isSaving = ref(false);

// Move handleKeyDown outside of onMounted to avoid recreating it
function handleKeyDown(event: KeyboardEvent) {
  switch (event.key) {
    case "Enter":
    case "Tab":
    case "ArrowDown":
      event.preventDefault();
      selectNextImage();
      break;
    case "ArrowUp":
      event.preventDefault();
      selectPreviousImage();
      break;
    default:
      if (event.target instanceof HTMLInputElement) {
        return;
      }
      // Check if key is alphanumeric
      if (event.key.length === 1 && /^[a-zA-Z0-9]$/.test(event.key)) {
        event.preventDefault();
        captionInput.value?.focus();
        imageCaption.value = imageCaption.value.endsWith(",") ? imageCaption.value + event.key : imageCaption.value + "," + event.key;
      }
  }
}

// Lifecycle hooks
onMounted(async () => {
  // Wait for window to be ready
  if (document.readyState === "complete") {
    window.addEventListener("keydown", handleKeyDown);
    selectFolder();
  } else {
    window.addEventListener("load", () => {
      window.addEventListener("keydown", handleKeyDown);
      selectFolder();
    });
  }
});

// Clean up event listener when component is unmounted
onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});

async function selectFolder() {
  const folderPath = await window.api.openFolderDialog();
  if (folderPath) {
    selectedFolder.value = folderPath;
    selectedImage.value = "";
    try {
      files.value = await window.api.getFiles(folderPath);

      // Load existing dictionary data
      const dictionaryData = await window.api.getDictionary();

      // Clear existing settings
      imageSettings.value.clear();

      // Populate imageSettings with existing data
      dictionaryData.forEach((entry) => {
        imageSettings.value.set(entry.imagePath, {
          imagePath: entry.imagePath,
          x: entry.selection.x,
          y: entry.selection.y,
          width: entry.selection.width,
          height: entry.selection.height,
          caption: entry.caption,
        });

        entry.caption.split(",").forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag !== "") {
            existingTagsSet.add(trimmedTag);
          }
        });
      });
    } catch (error) {
      console.error("Error getting files or dictionary:", error);
    }
  }
}

// Modify the selectImage function to avoid unnecessary saves
async function selectImage(filename: string) {
  if (filename === selectedImage.value) return; // Don't process if same image

  await handleSave();

  // Update selected image
  selectedImage.value = filename;
  const settings = imageSettings.value.get(filename)!;

  if (!settings) {
    console.error("Error loading saved selection:", filename);
  }

  currentSelectionSettings.value = settings;
  imageCaption.value = settings?.caption || "";
}

async function selectNextImage() {
  if (!files.value.length) return;

  const currentIndex = files.value.indexOf(selectedImage.value);
  const nextIndex =
    currentIndex === files.value.length - 1 ? 0 : currentIndex + 1;
  await selectImage(files.value[nextIndex]);
}

async function selectPreviousImage() {
  if (!files.value.length) return;

  const currentIndex = files.value.indexOf(selectedImage.value);
  const previousIndex =
    currentIndex <= 0 ? files.value.length - 1 : currentIndex - 1;
  await selectImage(files.value[previousIndex]);
}

function handleSelectionChange(selection: SelectionData) {
  // Preserve existing caption when updating selection
  const existingSettings = imageSettings.value.get(selection.imagePath);
  selection.caption = existingSettings?.caption;
  imageSettings.value.set(selection.imagePath, selection);
}

// Add this new function to handle showing toasts
function showToast(message: string, type: "success" | "error") {
  const id = toastCounter++;
  toasts.value.push({ message, type, id });

  // Remove the toast after 3 seconds
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 3000);
}

// Add function to handle tag clicking
function addTagToCaption(tag: string) {
  if (imageCaption.value) {
    // Add comma and space if there's already content
    const currentTags = imageCaption.value.split(',').map(t => t.trim());
    if (!currentTags.includes(tag)) {
      imageCaption.value += ', ' + tag;
    }
  } else {
    // Set as the first tag
    imageCaption.value = tag;
  }
  captionInput.value?.focus();
}

// Add function to handle image cloning
async function handleClone() {
  if (!selectedImage.value) return;

  try {
    const clonedFilename = await window.api.cloneImage(selectedImage.value);
    
    // Add the cloned file to the files list
    files.value.push(clonedFilename);
    
    // Sort the files list to maintain order
    files.value.sort();
    
    showToast(`Image cloned as ${clonedFilename}`, "success");
  } catch (error) {
    console.error("Error cloning image:", error);
    showToast("Failed to clone image", "error");
  }
}

// Modify the handleSave function to use the flag
async function handleSave() {
  if (
    !selectedImage.value ||
    !imageSettings.value.has(selectedImage.value) ||
    isSaving.value
  )
    return;

  try {
    isSaving.value = true;
    const currentSelection = imageSettings.value.get(selectedImage.value)!;
    currentSelection.caption = imageCaption.value;

    imageCaption.value.split(",").forEach(tag => {
      const trimmedTag = tag.trim();
      if (trimmedTag !== "") {
        existingTagsSet.add(trimmedTag);
      }
    });

    await window.api.saveSelections({
      imagePath: selectedImage.value,
      selection: toRaw(currentSelection),
    });
    showToast("Changes saved successfully", "success");
  } catch (error) {
    console.error("Error saving selection:", error);
    showToast("Failed to save changes", "error");
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
.file-explorer {
  display: flex;
  height: calc(100vh - 4rem);
  width: 100%;
}

.sidebar {
  width: 300px;
  background-color: #f5f5f5;
  border-right: 1px solid #ddd;
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.main-content-area {
  flex: 1;
  display: grid;
  grid-template-rows: 1fr auto;
  background-color: #fff;
  overflow: hidden;
}

.image-viewer-container {
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.bottom-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background-color: #f5f5f5;
  border-top: 1px solid #ddd;
}

.existing-tags {
  margin-bottom: 4px;
}

.tags-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 6px;
  display: block;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-badge {
  background-color: #e9ecef;
  color: #495057;
  border: 1px solid #ced4da;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tag-badge:hover {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}

.input-row {
  display: flex;
  gap: 16px;
}

.caption-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.selected-folder {
  margin: 10px 0;
  padding: 10px;
  background-color: #fff;
  border-radius: 4px;
  font-size: 0.9em;
  word-break: break-all;
}

.file-list {
  margin-top: 20px;
  flex: 1;
  overflow-y: auto;
}

.file-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-list li {
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background-color 0.2s;
}

.file-list li:hover {
  background-color: #e0e0e0;
}

.file-list li.active {
  background-color: #007bff;
  color: white;
}

.supported-formats {
  color: #666;
  font-size: 0.9em;
  margin-top: 8px;
  display: inline-block;
}

h2 {
  margin: 0;
  padding-bottom: 15px;
  border-bottom: 1px solid #ddd;
}

.save-button {
  padding: 12px 24px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.save-button:hover {
  background-color: #0056b3;
}

.save-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.clone-button {
  padding: 12px 24px;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.clone-button:hover {
  background-color: #218838;
}

.clone-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
}

.toast {
  padding: 6px 12px;
  margin-bottom: 8px;
  border-radius: 4px;
  color: white;
  font-size: 11px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  min-width: 200px;
}

.toast.success {
  background-color: #4caf50;
}

.toast.error {
  background-color: #f44336;
}

/* Toast Animation */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>

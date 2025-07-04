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
        <ul v-if="filteredFiles.length" @keydown.prevent="handleKeyDown">
          <li
            v-for="file in filteredFiles"
            :key="file"
            :class="{ active: selectedImage === file }"
            @click="selectImage(file)"
            tabindex="0"
          >
            {{ file }}
          </li>
        </ul>
        <p v-else-if="currentTagFilter">
          No images found with tag "{{ currentTagFilter }}".
          <a href="#" @click.prevent="currentTagFilter = null">Clear filter</a>.
        </p>
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
          <label class="tags-label">
            Used tags:
            <span v-if="currentTagFilter" class="filter-indicator">
              (Filtered by: {{ currentTagFilter }})
            </span>
          </label>
          <div class="tags-list">
            <span
              v-for="tag in existingTags"
              :key="tag.tag"
              :class="[
                'tag-badge',
                { 'tag-badge-filtered': currentTagFilter === tag.tag },
              ]"
              :style="getTagBadgeStyle(tag.count)"
              :title="`Used in ${tag.count} image${tag.count === 1 ? '' : 's'}. Left-click to add to caption, right-click to filter.`"
              @click="addTagToCaption(tag.tag)"
              @contextmenu="handleTagRightClick($event, tag.tag)"
            >
              {{ tag.tag }} ({{ tag.count }})
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
import { ref, onUnmounted, toRaw, reactive, computed, watch } from "vue";
import ImageViewer from "./ImageViewer.vue";
import { SelectionData } from "../../../shared/types";

// State
const selectedFolder = ref("");
const files = ref<string[]>([]);
const selectedImage = ref("");
const existingTagsMap = reactive(new Map<string, number>());
const existingTags = computed(() => {
  // Convert Map to array and sort by usage count (descending)
  return Array.from(existingTagsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
});

// Add new state for selections
const imageSettings = ref<Map<string, SelectionData>>(new Map());
const currentSelectionSettings = ref<SelectionData | undefined>(undefined);

// Add state to track original data when image is first loaded (for change detection)
const originalImageData = ref<{
  caption: string;
  selection: SelectionData;
} | null>(null);

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

// Add new state for tag filtering
const currentTagFilter = ref<string | null>(null);

// Add computed property for filtered files
const filteredFiles = computed(() => {
  if (!currentTagFilter.value) {
    return files.value;
  }

  return files.value.filter((filename) => {
    const settings = imageSettings.value.get(filename);
    if (!settings || !settings.caption) return false;

    const tags = settings.caption.split(",").map((tag) => tag.trim());
    return tags.includes(currentTagFilter.value!);
  });
});

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
        imageCaption.value = imageCaption.value.endsWith(",")
          ? imageCaption.value + event.key
          : imageCaption.value + "," + event.key;
      }
  }
}

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

      // Clear existing settings and tags
      imageSettings.value.clear();
      existingTagsMap.clear();

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

        entry.caption.split(",").forEach((tag) => {
          const trimmedTag = tag.trim();
          if (trimmedTag !== "") {
            existingTagsMap.set(
              trimmedTag,
              (existingTagsMap.get(trimmedTag) || 0) + 1
            );
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

  // Store original data for change detection
  originalImageData.value = settings
    ? {
        caption: settings.caption || "",
        selection: { ...settings },
      }
    : null;
}

async function selectNextImage() {
  if (!filteredFiles.value.length) return;

  const currentIndex = filteredFiles.value.indexOf(selectedImage.value);
  const nextIndex =
    currentIndex === filteredFiles.value.length - 1 ? 0 : currentIndex + 1;
  await selectImage(filteredFiles.value[nextIndex]);
}

async function selectPreviousImage() {
  if (!filteredFiles.value.length) return;

  const currentIndex = filteredFiles.value.indexOf(selectedImage.value);
  const previousIndex =
    currentIndex <= 0 ? filteredFiles.value.length - 1 : currentIndex - 1;
  await selectImage(filteredFiles.value[previousIndex]);
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
    const currentTags = imageCaption.value.split(",").map((t) => t.trim());
    if (!currentTags.includes(tag)) {
      imageCaption.value += imageCaption.value.trim().endsWith(",")
        ? tag
        : ", " + tag;
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
  ) {
    return;
  }

  try {
    isSaving.value = true;
    const currentSelection = imageSettings.value.get(selectedImage.value)!;

    // Check if caption has changed
    const captionChanged =
      (originalImageData.value?.caption || "") !== imageCaption.value;

    // Check if selection coordinates/dimensions have changed
    const originalSelection = originalImageData.value?.selection;
    const selectionChanged =
      !originalSelection ||
      originalSelection.x !== currentSelection.x ||
      originalSelection.y !== currentSelection.y ||
      originalSelection.width !== currentSelection.width ||
      originalSelection.height !== currentSelection.height;

    if (!captionChanged && !selectionChanged) {
      // No changes detected, skip save
      return;
    }

    // Get previous tags before updating the caption
    const previousTags = new Set(
      (currentSelection.caption || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "")
    );

    // Update the caption
    currentSelection.caption = imageCaption.value;

    // Get current tags after updating
    const currentTags = new Set(
      imageCaption.value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "")
    );

    // Only increment counts for newly added tags
    for (const tag of previousTags) {
      const count = existingTagsMap.get(tag);
      if (count) {
        if (count > 2) {
          existingTagsMap.set(tag, count - 1);
        } else {
          existingTagsMap.delete(tag);
        }
      }
    }
    for (const tag of currentTags) {
      existingTagsMap.set(tag, (existingTagsMap.get(tag) || 0) + 1);
    }

    if (
      currentTagFilter.value &&
      !existingTagsMap.has(currentTagFilter.value)
    ) {
      currentTagFilter.value = null;
    }

    await window.api.saveSelections({
      imagePath: selectedImage.value,
      selection: toRaw(currentSelection),
    });

    // Update original data after successful save
    originalImageData.value = {
      caption: imageCaption.value,
      selection: { ...currentSelection },
    };

    showToast("Changes saved successfully", "success");
  } catch (error) {
    console.error("Error saving selection:", error);
    showToast("Failed to save changes", "error");
  } finally {
    isSaving.value = false;
  }
}

function getTagBadgeStyle(count: number) {
  // Calculate the maximum count for normalization
  const maxCount = Math.max(...Array.from(existingTagsMap.values()));
  // const totalImages = files.value.length || 1;

  // Calculate usage percentage (0 to 1)
  const usagePercentage = count / maxCount;

  // Create orange color gradient from light to dark
  // Light orange: #FFE4B5 (255, 228, 181) to Dark orange: #FF8C00 (255, 140, 0)
  const lightR = 255,
    lightG = 228,
    lightB = 181;
  const darkR = 255,
    darkG = 140,
    darkB = 0;

  const r = Math.round(lightR + (darkR - lightR) * usagePercentage);
  const g = Math.round(lightG + (darkG - lightG) * usagePercentage);
  const b = Math.round(lightB + (darkB - lightB) * usagePercentage);

  // Determine text color based on background darkness
  const textColor = usagePercentage > 0.5 ? "#ffffff" : "#333333";

  return {
    backgroundColor: `rgb(${r}, ${g}, ${b})`,
    color: textColor,
    border: "1px solid #ddd",
  };
}

// Add function to handle tag right-click filtering
function handleTagRightClick(event: MouseEvent, tag: string) {
  event.preventDefault();

  if (currentTagFilter.value === tag) {
    // Clear filter if clicking on the same tag
    currentTagFilter.value = null;
    showToast("Filter cleared", "success");
  } else {
    // Set new filter
    currentTagFilter.value = tag;
    showToast(`Filtering by tag: ${tag}`, "success");
  }
}

// Watch for changes in filtered files and adjust selected image if needed
watch(
  filteredFiles,
  (newFilteredFiles) => {
    // If current selected image is not in filtered list, select first available
    if (
      selectedImage.value &&
      !newFilteredFiles.includes(selectedImage.value)
    ) {
      if (newFilteredFiles.length > 0) {
        selectImage(newFilteredFiles[0]);
      } else {
        selectedImage.value = "";
        currentSelectionSettings.value = undefined;
        imageCaption.value = "";
      }
    }
  },
  { immediate: false }
);
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

.tag-badge-filtered {
  background-color: #007bff !important;
  color: white !important;
  border-color: #007bff !important;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.filter-indicator {
  font-weight: bold;
  color: #007bff;
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

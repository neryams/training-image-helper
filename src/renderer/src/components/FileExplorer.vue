<template>
    <div class="file-explorer">
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
            No images found. Please <a href="#" @click.prevent="selectFolder">select a folder</a>.
            <br>
            <small class="supported-formats">
              Supported formats: JPG, JPEG, PNG, WEBP
            </small>
          </p>
        </div>
      </div>
  
      <!-- Main Content -->
      <div class="main-content">
        <ImageViewer 
          :image-path="selectedImage"
          :initial-selection="currentCropSettings"
          @selection-change="handleSelectionChange"
        />
      </div>
  
      <!-- Save Button -->
      <button 
        class="save-button"
        @click="handleSave"
        :disabled="!selectedImage || !imageCropSettings.has(selectedImage)"
      >
        Save Changes
      </button>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted, toRaw } from 'vue'
  import ImageViewer from './ImageViewer.vue'
  import { SelectionData } from '../../../shared/types'
  
  // Add type definitions for the electron API
  declare global {
    interface Window {
      api: {
        openFolderDialog: () => Promise<string | null>;
        getFiles: () => Promise<string[]>;
        getImageMetadata: (filename: string) => Promise<{
          width: number;
          height: number;
          format: string;
        }>;
        saveSelections: (params: {imagePath: string, selection: SelectionData}) => Promise<void>;
      }
    }
  }
  
  // State
  const selectedFolder = ref('')
  const files = ref<string[]>([])
  const selectedImage = ref('')
  
  // Add new state for selections
  const imageCropSettings = ref<Map<string, SelectionData>>(new Map());
  const currentCropSettings = ref<SelectionData | undefined>(undefined);
  
  // Lifecycle hook
  onMounted(async () => {
    await selectFolder();
    window.addEventListener('keydown', handleKeyDown)
  })
  
  async function selectFolder() {
    const folderPath = await window.api.openFolderDialog()
    if (folderPath) {
      selectedFolder.value = folderPath
      selectedImage.value = ''
      try {
        files.value = await window.api.getFiles()
      } catch (error) {
        console.error('Error getting files:', error)
      }
    }
  }
  
  async function selectImage(filename: string) {
    // Save current selection before changing images
    if (selectedImage.value && imageCropSettings.value.has(selectedImage.value)) {
      await handleSave()
    }

    // Update selected image
    selectedImage.value = filename
    currentCropSettings.value = imageCropSettings.value.get(filename);
  }
  
  async function selectNextImage() {
    if (!files.value.length) return
    
    const currentIndex = files.value.indexOf(selectedImage.value)
    const nextIndex = currentIndex === files.value.length - 1 ? 0 : currentIndex + 1
    await selectImage(files.value[nextIndex])
  }
  
  async function selectPreviousImage() {
    if (!files.value.length) return
    
    const currentIndex = files.value.indexOf(selectedImage.value)
    const previousIndex = currentIndex <= 0 ? files.value.length - 1 : currentIndex - 1
    await selectImage(files.value[previousIndex])
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Enter':
      case 'Tab':
      case 'ArrowDown':
        event.preventDefault()
        selectNextImage()
        break
      case 'ArrowUp':
        event.preventDefault()
        selectPreviousImage()
        break
    }
  }
  
  function handleSelectionChange(selection: SelectionData) {
    // Save the selection data for this image
    imageCropSettings.value.set(selection.imagePath, selection)
  }
  
  async function handleSave() {
    if (!selectedImage.value || !imageCropSettings.value.has(selectedImage.value)) return

    try {
      const currentSelection = imageCropSettings.value.get(selectedImage.value)!
      
      await window.api.saveSelections({
        imagePath: selectedImage.value,
        selection: toRaw(currentSelection)
      })
    } catch (error) {
      console.error('Error saving selection:', error)
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
  
  .main-content {
    flex: 1;
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #fff;
    overflow: hidden;
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
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 24px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
    z-index: 100;
  }
  
  .save-button:hover {
    background-color: #0056b3;
  }
  
  .save-button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
  </style> 
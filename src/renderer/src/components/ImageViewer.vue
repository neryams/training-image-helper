<template>
  <div class="image-viewer" ref="viewerContainer">
    <div class="metadata-overlay" v-if="imageMetadata">
      {{ imageMetadata.width }} x {{ imageMetadata.height }}
    </div>
    <div class="image-container" ref="imageContainer" v-if="imageUrl">
      <img 
        :src="imageUrl" 
        :alt="imagePath" 
        ref="imageRef"
        :style="imageStyle"
      />
      <div v-if="selectionDimensions.width" class="selection-overlay" :style="{
        width: `${selectionDimensions.width}px`,
        height: `${selectionDimensions.height}px`,
        transform: `translate(${selectionPos.x}px, ${selectionPos.y}px)`
      }" @mousedown.self="startDrag">
        <!-- Corner handles -->
        <div class="resize-handle top-left" @mousedown.stop="startResize('top-left')"></div>
        <div class="resize-handle top-right" @mousedown.stop="startResize('top-right')"></div>
        <div class="resize-handle bottom-left" @mousedown.stop="startResize('bottom-left')"></div>
        <div class="resize-handle bottom-right" @mousedown.stop="startResize('bottom-right')"></div>
      </div>
    </div>
    <div v-else class="no-image">
      <p>Select an image from the sidebar to view it</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, reactive } from 'vue'
import { SelectionData } from '../../../shared/types'

interface SelectionDimensions {
  width: number
  height: number
}

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const props = defineProps<{
  imagePath: string
  initialSelection?: SelectionData
}>()

const imageMetadata = ref<{ width: number; height: number; format: string } | null>(null)
const imageContainer = ref<HTMLDivElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const selectionDimensions = ref<SelectionDimensions>({ width: 0, height: 0 })
const selectionPos = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const isResizing = ref(false)
const resizingCorner = ref<Corner | null>(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 })
const viewerContainer = ref<HTMLDivElement | null>(null)
const imageStyle = ref({ width: '0px', height: '0px' })
const imageDimensions = reactive({ displayWidth: 0, displayHeight: 0, nativeWidth: 0, nativeHeight: 0 })

const imageUrl = computed(() => {
  if (!props.imagePath) return ''
  return `atom://${props.imagePath}`
})

const emit = defineEmits<{
  (event: 'selectionChange', data: {
    x: number,
    y: number,
    width: number,
    height: number,
    imagePath: string
  }): void
}>()

async function calculateImageDimensions() {
  if (!viewerContainer.value || !imageUrl.value) return

  const metadata = await getImageMetadata(imageUrl.value);
  if(!metadata) return;

  const containerWidth = viewerContainer.value.clientWidth
  const containerHeight = viewerContainer.value.clientHeight
  const imageAspectRatio = metadata.width / metadata.height
  const containerAspectRatio = containerWidth / containerHeight

  let width: number, height: number;

  if (imageAspectRatio > containerAspectRatio) {
    // Image is wider relative to container
    width = Math.min(containerWidth, metadata.width)
    height = width / imageAspectRatio
  } else {
    // Image is taller relative to container
    height = Math.min(containerHeight, metadata.height)
    width = height * imageAspectRatio
  }

  // Final check to ensure neither dimension exceeds native size
  if (width > metadata.width) {
    width = metadata.width
    height = width / imageAspectRatio
  }
  if (height > metadata.height) {
    height = metadata.height
    width = height * imageAspectRatio
  }

  imageStyle.value = {
    width: `${width}px`,
    height: `${height}px`
  }
  imageDimensions.displayHeight = height;
  imageDimensions.displayWidth = width;
  imageDimensions.nativeHeight = metadata.height;
  imageDimensions.nativeWidth = metadata.width;

  return imageDimensions;
}

function getImageScale(): number {
  if (!imageRef.value || !imageMetadata.value) return 1

  // Calculate scale by comparing displayed size to actual image size
  const displayedWidth = imageDimensions.displayWidth
  const actualWidth = imageDimensions.nativeWidth
  
  return actualWidth / displayedWidth
}

async function getImageMetadata(path: string) {
    try {
      imageMetadata.value = await window.api.getImageMetadata(path)
    } catch (error) {
      console.error('Error getting image metadata:', error)
      imageMetadata.value = null
    }
    return imageMetadata.value;
}

watch(() => props.imagePath, async (newPath) => {
  if (newPath) {
    const dimensions = await calculateImageDimensions();
    if(!dimensions) return;

    if (!props.initialSelection || !props.initialSelection.width || !props.initialSelection.height) {
      // Set default selection size and position
      const size = Math.min(imageDimensions.displayWidth, imageDimensions.displayHeight)
      selectionDimensions.value = {
        width: size,
        height: size
      }
      selectionPos.value = {
        x: (imageDimensions.displayWidth - size) / 2,
        y: (imageDimensions.displayHeight - size) / 2
      }
      
      emitSelectionChange();
    } else {
      // Convert saved selection from actual coordinates to display coordinates
      const scale = getImageScale()
      // Restore saved selection
      selectionDimensions.value = {
        width: props.initialSelection.width / scale,
        height: props.initialSelection.height / scale
      }
      selectionPos.value = {
        x: props.initialSelection.x / scale,
        y: props.initialSelection.y / scale
      }
    }
  } else {
    imageMetadata.value = null
  }
}, { immediate: true })

function startDrag(e: MouseEvent) {
  isDragging.value = true
  dragStart.value = {
    x: e.clientX - selectionPos.value.x,
    y: e.clientY - selectionPos.value.y
  }

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value) return

  let newX = e.clientX - dragStart.value.x
  let newY = e.clientY - dragStart.value.y

  // Remove constraints - allow selection to go outside image bounds
  selectionPos.value = { x: newX, y: newY }
  
  // Emit the change
  emitSelectionChange()
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

function startResize(corner: Corner) {
  isResizing.value = true
  resizingCorner.value = corner
  
  resizeStart.value = {
    x: selectionPos.value.x,
    y: selectionPos.value.y,
    width: selectionDimensions.value.width,
    height: selectionDimensions.value.height,
    left: selectionPos.value.x,
    top: selectionPos.value.y
  }

  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  if (!isResizing.value || !imageRef.value || !resizingCorner.value) return

  const rect = imageRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  let newWidth = selectionDimensions.value.width
  let newHeight = selectionDimensions.value.height
  let newX = selectionPos.value.x
  let newY = selectionPos.value.y

  switch (resizingCorner.value) {
    case 'bottom-right':
      newWidth = mouseX - selectionPos.value.x
      newHeight = mouseY - selectionPos.value.y
      break
    case 'top-left':
      newWidth = resizeStart.value.width + (resizeStart.value.left - mouseX)
      newHeight = resizeStart.value.height + (resizeStart.value.top - mouseY)
      newX = mouseX
      newY = mouseY
      break
    case 'top-right':
      newWidth = mouseX - selectionPos.value.x
      newHeight = resizeStart.value.height + (resizeStart.value.top - mouseY)
      newY = mouseY
      break
    case 'bottom-left':
      newWidth = resizeStart.value.width + (resizeStart.value.left - mouseX)
      newHeight = mouseY - selectionPos.value.y
      newX = mouseX
      break
  }

  // Force 1:1 aspect ratio by using the smaller dimension
  const size = Math.min(Math.abs(newWidth), Math.abs(newHeight))
  
  // Ensure minimum size but allow extending beyond image bounds
  const finalSize = Math.max(size, 10) // Minimum 10px size

  // Update position and dimensions while maintaining aspect ratio
  if (resizingCorner.value.includes('left')) {
    newX = selectionPos.value.x + (selectionDimensions.value.width - finalSize)
  }
  if (resizingCorner.value.includes('top')) {
    newY = selectionPos.value.y + (selectionDimensions.value.height - finalSize)
  }

  // Remove image bounds constraints - allow selection to extend beyond image
  selectionDimensions.value = {
    width: finalSize,
    height: finalSize
  }
  selectionPos.value = { x: newX, y: newY }
  
  // Emit the change
  emitSelectionChange()
}

function stopResize() {
  isResizing.value = false
  resizingCorner.value = null
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

function emitSelectionChange() {
  if (!imageMetadata.value) return

  const scale = getImageScale()
  
  emit('selectionChange', {
    x: Math.round(selectionPos.value.x * scale),
    y: Math.round(selectionPos.value.y * scale),
    width: Math.round(selectionDimensions.value.width * scale),
    height: Math.round(selectionDimensions.value.height * scale),
    imagePath: props.imagePath
  })
}

onMounted(() => {
  const resizeObserver = new ResizeObserver(() => {
    calculateImageDimensions()
  })
  
  if (viewerContainer.value) {
    resizeObserver.observe(viewerContainer.value)
  }

  onUnmounted(() => {
    resizeObserver.disconnect()
  })
})
</script>

<style scoped>
.image-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  overflow: hidden;
}

.image-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-viewer img {
  display: block;
  object-fit: contain;
  pointer-events: none;
}

.selection-overlay {
  position: absolute;
  border: 2px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  cursor: move;
  touch-action: none;
  box-sizing: border-box;
  top: 0px;
  left: 0px;
}

.resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background-color: white;
  border: 1px solid rgba(0, 0, 0, 0.3);
}

.resize-handle.top-left {
  top: -5px;
  left: -5px;
  cursor: nw-resize;
}

.resize-handle.top-right {
  top: -5px;
  right: -5px;
  cursor: ne-resize;
}

.resize-handle.bottom-left {
  bottom: -5px;
  left: -5px;
  cursor: sw-resize;
}

.resize-handle.bottom-right {
  bottom: -5px;
  right: -5px;
  cursor: se-resize;
}

.metadata-overlay {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 14px;
  z-index: 1;
}

.no-image {
  color: #666;
  text-align: center;
}
</style>
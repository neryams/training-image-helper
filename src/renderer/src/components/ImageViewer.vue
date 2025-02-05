<template>
  <div class="image-viewer">
    <div class="metadata-overlay" v-if="imageMetadata">
      {{ imageMetadata.width }} × {{ imageMetadata.height }}
    </div>
    <img v-if="imageUrl" :src="imageUrl" :alt="imagePath" />
    <div v-else class="no-image">
      <p>Select an image from the sidebar to view it</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  imagePath: string
}>()

const imageMetadata = ref<{ width: number; height: number; format: string } | null>(null)

const imageUrl = computed(() => {
  if (!props.imagePath) return ''
  return `atom://${props.imagePath}`
})

watch(() => props.imagePath, async (newPath) => {
  if (newPath) {
    try {
      imageMetadata.value = await window.api.getImageMetadata(newPath)
    } catch (error) {
      console.error('Error getting image metadata:', error)
      imageMetadata.value = null
    }
  } else {
    imageMetadata.value = null
  }
}, { immediate: true })
</script>

<style scoped>
.image-viewer {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-viewer img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
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
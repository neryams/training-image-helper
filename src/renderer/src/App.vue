<script setup lang="ts">
import Versions from './components/Versions.vue'
import FileExplorer from './components/FileExplorer.vue'

const ipcHandle = () => window.electron.ipcRenderer.send('ping')
</script>

<template>
  <FileExplorer />
  <!-- <Versions /> -->
</template>

<style>
</style>

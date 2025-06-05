import { ElectronAPI } from '@electron-toolkit/preload'
import { SelectionData, ImageDictionaryEntry } from '../shared/types'

interface API {
  openFolderDialog: () => Promise<string | null>
  getFiles: (folderPath: string) => Promise<string[]>
  getImageMetadata: (filename: string) => Promise<any>
  saveSelections: (data: { imagePath: string, selection: SelectionData }) => Promise<string>
  getDictionary: () => Promise<ImageDictionaryEntry[]>
  getSelection: (imagePath: string) => Promise<SelectionData | null>
  cloneImage: (filename: string) => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}

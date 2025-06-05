export interface SelectionData {
  x: number
  y: number
  width: number
  height: number
  imagePath: string
  caption?: string
} 

export interface ImageDictionaryEntry {
  imagePath: string;
  caption: string;
  selection: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

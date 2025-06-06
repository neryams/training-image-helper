# image-tagger

An electron app to help with quickly cropping and captioning images to build a consistent dataset for LoRA training.

![image](https://github.com/user-attachments/assets/3ce685a5-adbc-482e-b66a-8d24b25d7a0e)

- Comprehensive keyboard shortcuts (arrow keys to navigate, type to tag, enter to save)
- Saves images alongside .txt sidecar files with captions/tags. Also stores a .json with all selections for folder.
- Keeps track of tags used on other images for re-use
- Optimized for manual tagging on smaller datasets for optimal LoRA training

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

// Centralized avatars loader using Vite's glob import
// Put images in this folder (png/jpg/jpeg/svg/webp/gif). Example: src/assets/avatars/lavinia.png
// Usage:
//   import { getAvatar } from './assets/avatars';
//   const url = getAvatar('lavinia') // by stem (filename without extension)
//   const url2 = getAvatar('lavinia.png') // by exact filename

const modules = import.meta.glob('./**/*.{png,jpg,jpeg,svg,webp,gif}', {
  eager: true,
  import: 'default',
});

const registry = {};
for (const [path, url] of Object.entries(modules)) {
  const parts = path.split('/');
  const file = parts[parts.length - 1]; // e.g., 'lavinia.png'
  const stem = file.replace(/\.[^.]+$/, ''); // e.g., 'lavinia'
  // Map by filename and stem
  if (!registry[file]) registry[file] = url;
  if (!registry[stem]) registry[stem] = url;
}

export function getAvatar(key) {
  return registry[key] || null;
}

export function listAvatars() {
  return { ...registry };
}

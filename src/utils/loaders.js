import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Nạp tất cả slash command trong thư mục (hỗ trợ thư mục con).
export async function loadCommands(dir, collection) {
  for (const file of walk(dir)) {
    const mod = await import(pathToFileURL(file).href);
    if (mod?.data && typeof mod.execute === 'function') {
      collection.set(mod.data.name, mod);
    } else {
      console.warn(`[loader] Bỏ qua ${file}: thiếu export data/execute`);
    }
  }
  return collection;
}

// Nạp tất cả event trong thư mục. Mỗi file export: name, execute, (tuỳ chọn) once.
export async function loadEvents(client, dir) {
  for (const file of walk(dir)) {
    const mod = await import(pathToFileURL(file).href);
    if (!mod?.name || typeof mod.execute !== 'function') {
      console.warn(`[loader] Bỏ qua ${file}: thiếu export name/execute`);
      continue;
    }
    const handler = (...args) => mod.execute(...args, client);
    if (mod.once) client.once(mod.name, handler);
    else client.on(mod.name, handler);
  }
}

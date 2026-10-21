#!/usr/bin/env node
/**
 * Gera todos os icones / logos / banners do Arquimedes a partir dos SVG masters
 * em `resources/brand/`.
 *
 * Uso: node scripts/generate-brand-icons.mjs
 *
 * Saidas:
 *   resources/app.png                                        (1024x1024 - app/exec)
 *   resources/app.ico                                        (multi-size 16..256)
 *   resources/app.icns                                       (16..1024)
 *   resources/app_dev.png                                    (1024x1024)
 *   resources/icon.png                                       (512x512)
 *   resources/arquimedes-banner-1.png                        (1280x320 - README)
 *   resources/arquimedes_readme_header.png                   (1600x400 - README)
 *   resources/arquimedes_logo_no_border.png                  (512x512, transparente)
 *   packages/desktop/src/renderer/assets/logos/brand/app.png (1024x1024 - login page)
 *   mobile/assets/images/icon.png                            (1024x1024 - Expo app icon)
 *   public/pwa/icon-512.png / icon-192.png / icon-180.png    (favicon + PWA)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = path.join(ROOT, 'resources', 'brand');

const readSvg = (name) => fs.readFile(path.join(BRAND, name));

async function renderPng(svgBuf, width, height = width) {
  return sharp(svgBuf, { density: 512 })
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO container with PNG-compressed entries (Vista+). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/** ICNS container with PNG payloads. */
function buildIcns(chunks) {
  const body = Buffer.concat(
    chunks.map(({ type, data }) => {
      const head = Buffer.alloc(8);
      head.write(type, 0, 4, 'ascii');
      head.writeUInt32BE(data.length + 8, 4);
      return Buffer.concat([head, data]);
    })
  );
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

async function write(rel, buf) {
  const target = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buf);
  let dims = '';
  try {
    const meta = await sharp(buf).metadata();
    dims = `${meta.width}x${meta.height}`;
  } catch {
    dims = '(container)';
  }
  console.log(`${rel.padEnd(60)} ${String(buf.length).padStart(9)} bytes  ${dims}`);
}

const iconSvg = await readSvg('arquimedes-icon.svg');
const markSvg = await readSvg('arquimedes-mark.svg');
const bannerSvg = await readSvg('arquimedes-banner.svg');

// 1) App / exec icons ------------------------------------------------------------
const app1024 = await renderPng(iconSvg, 1024);
await write('resources/app.png', app1024);
await write('resources/app_dev.png', app1024);
await write('resources/icon.png', await renderPng(iconSvg, 512));
await write('packages/desktop/src/renderer/assets/logos/brand/app.png', app1024);
await write('mobile/assets/images/icon.png', app1024);

// 2) Windows icon ----------------------------------------------------------------
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = [];
for (const size of icoSizes) {
  icoImages.push({ size, data: await renderPng(iconSvg, size) });
}
await write('resources/app.ico', buildIco(icoImages));

// 3) macOS icon ------------------------------------------------------------------
const icnsTypes = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
];
const icnsChunks = [];
for (const [type, size] of icnsTypes) {
  icnsChunks.push({ type, data: await renderPng(iconSvg, size) });
}
await write('resources/app.icns', buildIcns(icnsChunks));

// 4) PWA / favicon ----------------------------------------------------------------
await write('public/pwa/icon-512.png', await renderPng(iconSvg, 512));
await write('public/pwa/icon-192.png', await renderPng(iconSvg, 192));
await write('public/pwa/icon-180.png', await renderPng(iconSvg, 180));

// 5) README assets ----------------------------------------------------------------
await write('resources/arquimedes-banner-1.png', await renderPng(bannerSvg, 1280, 320));
await write('resources/arquimedes_readme_header.png', await renderPng(bannerSvg, 1600, 400));
await write('resources/arquimedes_logo_no_border.png', await renderPng(markSvg, 512));

// 6) Contact card (WhatsApp) --------------------------------------------------------
const contactSvg = await readSvg('contact-whatsapp.svg');
await write('resources/contactus-whatsapp.png', await renderPng(contactSvg, 600, 300));

console.log('\nBrand assets regenerated from resources/brand/*.svg');

#!/usr/bin/env node
/**
 * Gera o icone do Windows (resources/app.ico) a partir do PNG da marca.
 *
 * Por que nao usamos um .ico "comprimido em PNG"?
 * - O rcedit (usado pelo electron-builder para gravar o icone no .exe) tem
 *   dificuldade com entradas PNG-only e acaba embaralhando os icones.
 * - O .NET / Windows Shell tambem preferem entradas DIB (Bitmap) classicas.
 * Por isso aqui geramos um .ico classico: cada tamanho e um DIB 32bpp
 * (BGRA, de baixo para cima) + mascara AND, exatamente como o Windows espera.
 *
 * Uso: node scripts/build-app-icon.js [entrada.png] [saida.ico]
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
// Fonte preferida: o SVG da marca. Rasterizar o vetor direto em cada
// tamanho e nitido demais (reduzir o PNG de 1024 faz as linhas sumirem
// em 16 px, que e o tamanho que o Windows usa na barra de tarefas).
const DEFAULT_SRC = path.join(ROOT, 'resources', 'brand', 'arquimedes-icon.svg');
const DEFAULT_OUT = path.join(ROOT, 'resources', 'app.ico');

// Tamanhos multiplos de 16 (Windows usa 16/24/32 para barras e listas).
const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function loadSharp() {
  try {
    const mod = require('sharp');
    // Depending on the version / interop mode the callable lives in "default".
    const fn = typeof mod === 'function' ? mod : mod && mod.default;
    if (typeof fn !== 'function') {
      throw new Error('export invalido do sharp: ' + Object.keys(mod || {}).join(','));
    }
    return fn;
  } catch (error) {
    console.error('ERRO: o pacote "sharp" nao esta disponivel (' + error.message + ').');
    process.exit(1);
  }
}

/** Monta uma entrada DIB (BITMAPINFOHEADER + XOR BGRA + mascara AND). */
function buildDibEntry(rgba, size) {
  const width = size;
  const height = size;
  const xor = Buffer.alloc(width * height * 4);

  // XOR: linhas de baixo para cima, canais B G R A.
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = y * width * 4;
    for (let x = 0; x < width; x++) {
      const si = srcRow + x * 4;
      const di = dstRow + x * 4;
      xor[di] = rgba[si + 2];
      xor[di + 1] = rgba[si + 1];
      xor[di + 2] = rgba[si];
      xor[di + 3] = rgba[si + 3];
    }
  }

  // AND: 1 bit por pixel (1 = transparente), linhas de baixo para cima,
  // cada linha alinhada em 4 bytes.
  const andStride = Math.ceil(width / 32) * 4;
  const and = Buffer.alloc(andStride * height, 0);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const alpha = rgba[srcRow + x * 4 + 3];
      if (alpha < 128) {
        and[y * andStride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(width, 4); // biWidth
  header.writeInt32LE(height * 2, 8); // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // biCompression = BI_RGB
  header.writeUInt32LE(xor.length + and.length, 20); // biSizeImage

  return Buffer.concat([header, xor, and]);
}

async function main() {
  const sharp = await loadSharp();
  const src = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SRC;
  const out = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUT;

  if (!fs.existsSync(src)) {
    console.error(`ERRO: imagem de origem nao encontrada: ${src}`);
    process.exit(1);
  }

  const isVector = path.extname(src).toLowerCase() === '.svg';
  const entries = [];
  for (const size of SIZES) {
    const { data } = await sharp(src, isVector ? { density: 384 } : {})
      // Em SVG, densidade alta = render grande + downscale, o que da
      // antialiasing muito melhor nos tamanhos pequenos de barra de tarefas.
      .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    entries.push({ size, payload: buildDibEntry(data, size) });
  }

  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); // reservado
  dir.writeUInt16LE(1, 2); // tipo 1 = icone
  dir.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = dir.length + directory.length;
  entries.forEach((entry, index) => {
    const at = index * 16;
    directory[at] = entry.size >= 256 ? 0 : entry.size;
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size;
    directory.writeUInt16LE(0, at + 2); // paleta
    directory.writeUInt16LE(0, at + 3); // reservado
    directory.writeUInt16LE(1, at + 4); // planos
    directory.writeUInt16LE(32, at + 6); // bits por pixel
    directory.writeUInt32LE(entry.payload.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.payload.length;
  });

  const ico = Buffer.concat([dir, directory, ...entries.map((entry) => entry.payload)]);
  fs.writeFileSync(out, ico);

  console.log(`icone gerado: ${out}`);
  console.log(`  tamanhos: ${entries.map((entry) => `${entry.size}x${entry.size}`).join(', ')}`);
  console.log(`  formato: ICO classico (DIB 32bpp + mascara AND)`);
  console.log(`  tamanho final: ${ico.length} bytes`);
}

main().catch((error) => {
  console.error('ERRO:', error && error.message ? error.message : error);
  process.exit(1);
});

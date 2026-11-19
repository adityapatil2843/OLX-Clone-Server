import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';
import jwt from 'jsonwebtoken';
import { uploadBufferToCloudinary } from '../src/integrations/storage/cloudinary.service.js';

// Simple CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function padPngToSize(basePngBuf, targetSizeBytes) {
  if (basePngBuf.length >= targetSizeBytes) {
    return basePngBuf;
  }
  // Find IEND chunk (last 12 bytes: 00 00 00 00 49 45 4E 44 AE 42 60 82)
  const iendIndex = basePngBuf.lastIndexOf(Buffer.from('IEND'));
  if (iendIndex === -1) return basePngBuf;
  const chunkStart = iendIndex - 4; // 4 bytes of length before IEND

  const beforeIend = basePngBuf.subarray(0, chunkStart);
  const iendChunk = basePngBuf.subarray(chunkStart);

  // We want total size to be targetSizeBytes
  // New chunk structure: 4 bytes length + 4 bytes 'tEXt' + data + 4 bytes CRC
  const overhead = 12;
  const neededDataLength = targetSizeBytes - basePngBuf.length - overhead;
  if (neededDataLength <= 10) return basePngBuf;

  const keyword = Buffer.from('Comment\0', 'ascii');
  const data = Buffer.alloc(neededDataLength);
  keyword.copy(data, 0);
  // Fill remaining bytes with 'A'
  data.fill(0x41, keyword.length);

  const type = Buffer.from('tEXt', 'ascii');
  const typeAndData = Buffer.concat([type, data]);
  const chunkCrc = crc32(typeAndData);

  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(chunkCrc, 0);

  return Buffer.concat([beforeIend, lengthBuf, type, data, crcBuf, iendChunk]);
}

const generateToken = (user, role = 'USER') =>
  jwt.sign(
    { sub: user.id, role: user.role || role, email: user.email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

async function runBaselineBenchmark() {
  console.log('=== Establishing Listing Photo Upload Baseline ===\n');

  const baseImagePath = path.resolve('mobile/assets/images/icon.png');
  const baseImageBuf = fs.readFileSync(baseImagePath);
  console.log(`Loaded base real image (${baseImagePath}, size: ${(baseImageBuf.length / 1024).toFixed(1)} KB)`);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const suffix = `bench-${Date.now()}`;
  let seller, category, listing;

  try {
    seller = await prisma.user.create({
      data: { name: 'Benchmark Seller', email: `seller-${suffix}@example.com`, passwordHash: 'hash' },
    });
    category = await prisma.category.create({
      data: { name: `Cat ${suffix}`, slug: `cat-${suffix}` },
    });
    listing = await prisma.listing.create({
      data: {
        title: 'Benchmark Listing',
        price: 50000,
        categoryId: category.id,
        ownerId: seller.id,
        contactPhone: '+919876543210',
      },
    });

    const token = generateToken(seller);

    // Test image set representing 5 realistic smartphone listing photos
    const testImages = [
      { name: 'photo_1.png', sizeBytes: Math.round(2.5 * 1024 * 1024) },
      { name: 'photo_2.png', sizeBytes: Math.round(2.8 * 1024 * 1024) },
      { name: 'photo_3.png', sizeBytes: Math.round(2.2 * 1024 * 1024) },
      { name: 'photo_4.png', sizeBytes: Math.round(3.0 * 1024 * 1024) },
      { name: 'photo_5.png', sizeBytes: Math.round(2.0 * 1024 * 1024) },
    ];

    console.log(`Test set: ${testImages.length} images, total size: ${(testImages.reduce((acc, img) => acc + img.sizeBytes, 0) / (1024 * 1024)).toFixed(2)} MB`);
    console.log('Current Baseline Flow: Sequential (concurrency = 1) via Express Backend double-hop (/listings/:id/media/upload)\n');

    const measurements = [];
    const overallStart = performance.now();

    for (let i = 0; i < testImages.length; i++) {
      const img = testImages[i];
      console.log(`Processing image ${i + 1}/${testImages.length}: ${img.name} (${(img.sizeBytes / (1024 * 1024)).toFixed(2)} MB)...`);

      // 1. Client preparation time (Baseline = 0ms, uncompressed)
      const prepDuration = 0;

      // 2. Prepare multipart request body
      const rawBuffer = padPngToSize(baseImageBuf, img.sizeBytes);
      const reqStart = performance.now();
      const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
      const header = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${img.name}"\r\nContent-Type: image/png\r\n\r\n`
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([header, rawBuffer, footer]);

      const res = await fetch(`${baseUrl}/listings/${listing.id}/media/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body,
      });

      const totalImageDuration = performance.now() - reqStart;
      const resJson = await res.json();

      if (!res.ok) {
        console.error(`Upload failed for ${img.name}:`, resJson);
        throw new Error(`Upload failed with status ${res.status}`);
      }

      measurements.push({
        image: img.name,
        sizeMB: (img.sizeBytes / (1024 * 1024)).toFixed(2),
        prepMs: prepDuration,
        totalMs: totalImageDuration,
      });
      console.log(`  -> Completed in ${totalImageDuration.toFixed(1)} ms`);
    }

    const overallTotalDuration = performance.now() - overallStart;

    console.log('\n=== Baseline Measurement Breakdown ===');
    console.log('------------------------------------------------------------');
    console.log('Image        | Size (MB) | Prep (ms) | Upload+Backend+DB (ms)');
    console.log('------------------------------------------------------------');
    measurements.forEach((m) => {
      console.log(
        `${m.image.padEnd(12)} | ${m.sizeMB.padStart(9)} | ${m.prepMs.toFixed(1).padStart(9)} | ${m.totalMs.toFixed(1).padStart(22)}`
      );
    });
    console.log('------------------------------------------------------------');
    console.log(`Total Sequential Upload Time (5 images): ${overallTotalDuration.toFixed(1)} ms (${(overallTotalDuration / 1000).toFixed(2)} s)`);
    console.log(`Average Per-Image Time: ${(overallTotalDuration / testImages.length).toFixed(1)} ms`);

    // Measure isolated backend stages
    console.log('\n--- Isolated Backend Stage Measurements ---');
    const sampleBuffer = padPngToSize(baseImageBuf, Math.round(2.5 * 1024 * 1024));

    // Stage A: Provider upload isolated
    const providerStart = performance.now();
    const providerResult = await uploadBufferToCloudinary(sampleBuffer, {
      resourceType: 'image',
      folder: `listings/${seller.id}/${listing.id}`,
    });
    const providerDuration = performance.now() - providerStart;
    console.log(`1. Provider Upload Time (Cloudinary): ${providerDuration.toFixed(1)} ms (public_id: ${providerResult.public_id})`);

    // Stage B: Database media creation isolated
    const dbStart = performance.now();
    await prisma.listingMedia.create({
      data: {
        listingId: listing.id,
        type: 'IMAGE',
        storageKey: `sample-${Date.now()}`,
        provider: 'cloudinary',
        thumbnailKey: `https://example.com/sample-${Date.now()}.jpg`,
        displayOrder: 99,
      },
    });
    const dbDuration = performance.now() - dbStart;
    console.log(`2. Database Media Creation Time (Prisma/PostgreSQL): ${dbDuration.toFixed(1)} ms`);

    // Stage C: Signature generation isolated
    const sigStart = performance.now();
    const sigRes = await fetch(`${baseUrl}/listings/${listing.id}/media/upload-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'IMAGE',
        fileName: 'photo_test.png',
        fileType: 'image/png',
        fileSizeBytes: Math.round(2.5 * 1024 * 1024),
      }),
    });
    const sigDuration = performance.now() - sigStart;
    const sigJson = await sigRes.json();
    console.log(`3. Direct-Upload Signature Generation (Backend): ${sigDuration.toFixed(1)} ms`);
    console.log(`   Signature URL: ${sigJson.data?.uploadUrl}`);

    console.log('\nBaseline benchmark complete.');
  } finally {
    if (listing) {
      await prisma.listingMedia.deleteMany({ where: { listingId: listing.id } }).catch(() => {});
      await prisma.listing.deleteMany({ where: { id: listing.id } }).catch(() => {});
    }
    if (category) await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    if (seller) await prisma.user.deleteMany({ where: { id: seller.id } }).catch(() => {});
    server.close();
    await prisma.$disconnect().catch(() => {});
  }
}

runBaselineBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});

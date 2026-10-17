import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

test('Reels Module — Feed, Creation & Validation', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1/reels`;

  let testReelId = null;

  try {
    // 1. GET /api/v1/reels (feed)
    const feedRes = await fetch(baseUrl);
    assert.equal(feedRes.status, 200);
    const feedJson = await feedRes.json();
    assert.equal(feedJson.success, true);
    const reelsList = feedJson.data.data || feedJson.data;
    assert.ok(Array.isArray(reelsList));

    // 2. GET /api/v1/reels with string creatorId (dev creator test)
    const creatorFeedRes = await fetch(`${baseUrl}?creatorId=dev-creator-001`);
    assert.equal(creatorFeedRes.status, 200, 'Must accept string creatorId in query');

    // 3. GET /api/v1/reels/:reelId for non-existent reel returns 404
    const notFoundRes = await fetch(`${baseUrl}/00000000-0000-0000-0000-000000000000`);
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.success, false);

    // 4. POST /api/v1/reels (create reel with dev creator identity attached)
    const createRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: 'First test reel #marketplace #video',
        hashtags: ['marketplace', 'video'],
        locationText: 'Bengaluru, Karnataka',
      }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    assert.equal(createJson.success, true);
    assert.equal(createJson.data.caption, 'First test reel #marketplace #video');
    assert.equal(createJson.data.creatorId, 'dev-creator-001');
    testReelId = createJson.data.id;

    // 5. GET /api/v1/reels/:reelId
    const getRes = await fetch(`${baseUrl}/${testReelId}`);
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.data.id, testReelId);

    // 6. PATCH /api/v1/reels/:reelId
    const patchRes = await fetch(`${baseUrl}/${testReelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: 'Updated reel caption #updated',
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchJson = await patchRes.json();
    assert.equal(patchJson.data.caption, 'Updated reel caption #updated');

    // 7. POST /api/v1/reels/:reelId/upload-url (storage signature)
    const uploadUrlRes = await fetch(`${baseUrl}/${testReelId}/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'sample_video.mp4',
        fileType: 'video/mp4',
        fileSizeBytes: 10485760, // 10 MB
      }),
    });
    assert.equal(uploadUrlRes.status, 200);
    const uploadUrlJson = await uploadUrlRes.json();
    assert.equal(uploadUrlJson.success, true);
    assert.ok(uploadUrlJson.data.uploadUrl);

    // 8. DELETE /api/v1/reels/:reelId (archive)
    const deleteRes = await fetch(`${baseUrl}/${testReelId}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);
  } finally {
    if (testReelId) {
      await prisma.reel.deleteMany({ where: { id: testReelId } });
    }
    server.close();
  }
});

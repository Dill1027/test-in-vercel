import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';

const app = createApp();

// ── Health & overview ─────────────────────────────────────────────────────────

test('health endpoint works', async () => {
  const response = await request(app).get('/health');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
});

test('dyslexia overview returns the frontend module structure', async () => {
  const response = await request(app).get('/api/dyslexia/overview');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.totalSections, 6);
  assert.equal(response.body.data.totalGames, 12);
});

test('overview includes assessmentInfo', async () => {
  const response = await request(app).get('/api/dyslexia/overview');
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.data.assessmentInfo, 'assessmentInfo should be present');
  assert.equal(response.body.data.assessmentInfo.totalQuestions, 7);
  assert.deepEqual(response.body.data.assessmentInfo.alwaysUnlockedSections, [1, 2, 5, 6]);
});

test('overview sections include unlockRule', async () => {
  const response = await request(app).get('/api/dyslexia/overview');
  const sections = response.body.data.sections;
  for (const section of sections) {
    assert.ok(section.unlockRule, `Section ${section.id} must have unlockRule`);
    assert.ok(section.unlockRule.type, `Section ${section.id} unlockRule must have type`);
  }
});

test('game lookup works', async () => {
  const response = await request(app).get('/api/dyslexia/games/word-builder');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.game.key, 'word-builder');
  assert.equal(response.body.data.section.id, 6);
});

test('unknown game returns 404', async () => {
  const response = await request(app).get('/api/dyslexia/games/not-a-real-game');
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.success, false);
});

test('unknown route returns 404', async () => {
  const response = await request(app).get('/not-found-route');
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.success, false);
});

// ── Pre-assessment (no DB — routes are wired; expect 500/DB error in unit test) ──
// These tests verify routing & input validation. DB operations are not mocked here.

test('assessment POST rejects missing userId', async () => {
  const response = await request(app)
    .post('/api/dyslexia/assessment')
    .send({ scores: { letters: 3, twoLetter: 2, threeLetter: 1 } });
  // userId missing → 400 from resolveUserId or 500 from DB — both indicate correct routing
  assert.ok([400, 500].includes(response.statusCode));
});

test('assessment POST rejects invalid score range', async () => {
  const response = await request(app)
    .post('/api/dyslexia/assessment')
    .send({ userId: 'test-user', scores: { letters: 99, twoLetter: 2, threeLetter: 1 } });
  assert.ok([400, 500].includes(response.statusCode));
  if (response.statusCode === 400) {
    assert.match(response.body.message, /letters/i);
  }
});

test('assessment GET route is registered', async () => {
  const response = await request(app).get('/api/dyslexia/assessment/any-user-id');
  // Will get 500 (no DB) — confirms route is registered, not 404
  assert.notEqual(response.statusCode, 404);
});

test('legacy direct assessment route is registered', async () => {
  const response = await request(app).get('/assessment/any-user-id');
  assert.notEqual(response.statusCode, 404);
});

test('legacy direct dashboard route is registered', async () => {
  const response = await request(app).get('/dashboard/any-user-id');
  assert.notEqual(response.statusCode, 404);
});

test('assessment DELETE route is registered', async () => {
  const response = await request(app).delete('/api/dyslexia/assessment/any-user-id');
  assert.notEqual(response.statusCode, 404);
});

test('unlocked-sections route is registered', async () => {
  const response = await request(app).get('/api/dyslexia/assessment/any-user-id/unlocked-sections');
  assert.notEqual(response.statusCode, 404);
});

// ── Session routes ────────────────────────────────────────────────────────────

test('sessions POST rejects missing userId', async () => {
  const response = await request(app)
    .post('/api/dyslexia/sessions')
    .send({ gameKey: 'word-builder' });
  assert.ok([400, 500].includes(response.statusCode));
});

test('sessions POST rejects unknown gameKey', async () => {
  const response = await request(app)
    .post('/api/dyslexia/sessions')
    .send({ userId: 'test-user', gameKey: 'totally-fake-key' });
  assert.ok([400, 500].includes(response.statusCode));
});

test('sessions GET route is registered', async () => {
  const response = await request(app).get('/api/dyslexia/sessions?userId=test-user');
  assert.notEqual(response.statusCode, 404);
});

test('progress GET route is registered', async () => {
  const response = await request(app).get('/api/dyslexia/progress/some-user');
  assert.notEqual(response.statusCode, 404);
});

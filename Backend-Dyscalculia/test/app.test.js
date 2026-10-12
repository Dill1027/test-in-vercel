import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';

const app = createApp();

test('health endpoint works', async () => {
  const response = await request(app).get('/health');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
});

test('dyscalculia overview exposes the activity catalog', async () => {
  const response = await request(app).get('/api/dyscalculia/overview');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.moduleId, 'dyscalculia');
  assert.equal(response.body.data.totalSections, 4);
  assert.equal(response.body.data.totalGames, 6);
});

test('game lookup works', async () => {
  const response = await request(app).get('/api/dyscalculia/games/balloon-pop');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.game.key, 'balloon-pop');
});

test('unknown game and route return 404', async () => {
  const gameResponse = await request(app).get('/api/dyscalculia/games/unknown');
  const routeResponse = await request(app).get('/not-found');
  assert.equal(gameResponse.statusCode, 404);
  assert.equal(routeResponse.statusCode, 404);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiClientError, createApiClient, mapApiResponse, mapJobResponse } from '../src/apiClient';
import { SearchSession, type JobApi, type SearchSessionState, MAX_NETWORK_FAILURES } from '../src/searchSession';
import { clearCurrentSearchId, loadCurrentSearchId, saveCurrentSearchId, type JobStorage } from '../src/searchStorage';
import type { SearchJobResponse } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/settings';

const result = mapApiResponse(JSON.parse(readFileSync(new URL('../../fixtures/synthetic-analysis-snapshot.json', import.meta.url), 'utf8')));
const running: SearchJobResponse = { searchId: 'job-123', status: 'RUNNING', startedAt: '2026-09-09T15:00:00.000Z' };
const completed: SearchJobResponse = { ...running, status: 'COMPLETED', completedAt: '2026-09-09T15:01:00.000Z', response: result };
const failed: SearchJobResponse = { ...running, status: 'FAILED', completedAt: '2026-09-09T15:01:00.000Z', error: { code: 'SOURCE_UNAVAILABLE', message: 'Source could not be accessed.' } };
function store(): JobStorage {
  const values = new Map<string, string>();
  return { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
}
function harness(api: JobApi, storage = store()) {
  let time = 0;
  const tasks = new Set<{ callback: () => void; at: number }>();
  const states: SearchSessionState[] = [];
  const session = new SearchSession(api, storage, state => states.push(state), { now: () => time, schedule: (callback, ms) => {
    assert.ok(ms > 0); const task = { callback, at: time + ms }; tasks.add(task); return () => tasks.delete(task);
  } });
  return { session, storage, states, tasks,
    async tick() {
      const next = [...tasks].sort((a, b) => a.at - b.at)[0]; assert.ok(next, 'Expected scheduled recovery');
      tasks.delete(next); time = next.at; next.callback();
      for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve));
    },
  };
}
const api = (overrides: Partial<JobApi> = {}): JobApi => ({ search: async () => running, getJob: async () => running, current: async () => null, ...overrides });

test('currentSearchId save/load/clear uses durable storage', async () => {
  const storage = store();
  assert.equal(await loadCurrentSearchId(storage), null);
  await saveCurrentSearchId(storage, running.searchId);
  assert.equal(await loadCurrentSearchId(storage), running.searchId);
  await clearCurrentSearchId(storage); assert.equal(await loadCurrentSearchId(storage), null);
  await assert.rejects(saveCurrentSearchId(storage, '../invalid'));
});
test('maps RUNNING, COMPLETED and FAILED jobs using the real nested response contract', () => {
  for (const job of [running, completed, failed]) assert.deepEqual(mapJobResponse(job), job);
  assert.throws(() => mapJobResponse({ ...running, status: 'FINISHED' }));
  assert.throws(() => mapJobResponse({ ...completed, response: {} }));
});
test('HTTP client preserves existing searchId in 409 and supports status/current GETs', async () => {
  const paths: string[] = [];
  const client = createApiClient('http://pc.example', { fetcher: async (url, init) => {
    paths.push(String(url));
    if (init?.method === 'POST') return new Response(JSON.stringify({ error: { code: 'SEARCH_IN_PROGRESS', message: 'busy' }, searchId: running.searchId }), { status: 409 });
    return new Response(JSON.stringify(String(url).endsWith('/current') ? null : running));
  } });
  await assert.rejects(client.search(DEFAULT_SETTINGS), { code: 'SEARCH_IN_PROGRESS', searchId: running.searchId });
  assert.deepEqual(await client.getJob(running.searchId), running);
  assert.equal(await client.current(), null);
  assert.ok(paths[1]?.endsWith('/api/cars/search/job-123'));
});
test('start persists ID immediately and polls no faster than 2 seconds', async () => {
  const h = harness(api());
  await h.session.resume(); await h.session.start(DEFAULT_SETTINGS);
  assert.equal(await loadCurrentSearchId(h.storage), running.searchId);
  assert.equal(h.session.state.phase, 'RUNNING');
  assert.equal([...h.tasks][0]?.at, 2000);
  await h.tick(); assert.equal([...h.tasks][0]?.at, 4000);
  h.session.dispose();
});
test('409 with searchId attaches and never submits another search', async () => {
  let posts = 0;
  const h = harness(api({ search: async () => { posts++; throw new ApiClientError('SEARCH_IN_PROGRESS', running.searchId); } }));
  await h.session.resume(); await h.session.start(DEFAULT_SETTINGS);
  assert.equal(await loadCurrentSearchId(h.storage), running.searchId);
  assert.equal(h.session.state.phase, 'RUNNING');
  await h.session.start(DEFAULT_SETTINGS); await h.tick();
  assert.equal(posts, 1); h.session.dispose();
});
test('startup without saved ID reattaches to server current job without POST', async () => {
  const h = harness(api({ current: async () => running, search: async () => { throw new Error('must not POST'); } }));
  await h.session.resume();
  assert.equal(h.session.state.phase, 'RUNNING');
  assert.equal(await loadCurrentSearchId(h.storage), running.searchId); h.session.dispose();
});
test('temporary polling error retains job and recovers completion, clearing currentSearchId', async () => {
  let reads = 0;
  const h = harness(api({ getJob: async () => { if (++reads === 1) throw new ApiClientError('NETWORK'); return completed; } }));
  await h.session.resume(); await h.session.start(DEFAULT_SETTINGS); await h.tick();
  assert.equal(h.session.state.phase, 'RECONNECTING');
  assert.equal(await loadCurrentSearchId(h.storage), running.searchId);
  await h.tick();
  assert.equal(h.session.state.phase, 'COMPLETED');
  assert.deepEqual(h.session.state.response, result);
  assert.equal(await loadCurrentSearchId(h.storage), null); assert.equal(h.tasks.size, 0);
});
test('background stops polling; foreground recovers a completed job', async () => {
  const h = harness(api({ getJob: async () => completed }));
  await h.session.resume(); await h.session.start(DEFAULT_SETTINGS);
  h.session.pause(); assert.equal(h.tasks.size, 0);
  assert.equal(await loadCurrentSearchId(h.storage), running.searchId);
  await h.session.resume(); await h.tick();
  assert.equal(h.session.state.phase, 'COMPLETED');
  assert.equal(await loadCurrentSearchId(h.storage), null);
});
test('reload creates a fresh session that recovers the saved job', async () => {
  const storage = store();
  const first = harness(api(), storage);
  await first.session.resume(); await first.session.start(DEFAULT_SETTINGS); first.session.dispose();
  const second = harness(api({ getJob: async id => { assert.equal(id, running.searchId); return completed; } }), storage);
  await second.session.resume(); assert.equal(second.session.state.phase, 'COMPLETED');
  assert.equal(await loadCurrentSearchId(storage), null);
});
test('failed backend job stops polling and clears persisted ID', async () => {
  const h = harness(api({ getJob: async () => failed }));
  await h.session.resume(); await h.session.start(DEFAULT_SETTINGS); await h.tick();
  assert.equal(h.session.state.phase, 'FAILED'); assert.equal(h.session.state.error?.code, 'SOURCE_UNAVAILABLE');
  assert.equal(await loadCurrentSearchId(h.storage), null); assert.equal(h.tasks.size, 0);
});
test('retry budget pauses reconnection without discarding job or resubmitting', async () => {
  let reads = 0;
  const h = harness(api({ getJob: async () => { reads++; throw new ApiClientError('NETWORK'); } }));
  await h.session.resume(); await h.session.start(DEFAULT_SETTINGS);
  for (let i = 0; i < MAX_NETWORK_FAILURES; i++) await h.tick();
  assert.equal(reads, 5); assert.equal(h.session.state.phase, 'PAUSED'); assert.equal(h.tasks.size, 0);
  assert.equal(await loadCurrentSearchId(h.storage), running.searchId);
});
test('lost POST response reconciles current/latest instead of automatically resubmitting', async () => {
  let posts = 0;
  const h = harness(api({ current: async () => posts ? completed : null,
    search: async () => { posts++; throw new ApiClientError('TIMEOUT'); } }));
  await h.session.resume(); await h.session.start(DEFAULT_SETTINGS);
  assert.equal(h.session.state.phase, 'RECONNECTING');
  await h.tick(); assert.equal(h.session.state.phase, 'COMPLETED'); assert.equal(posts, 1);
});
test('a POST accepted during background persists its ID but does not poll', async () => {
  let release!: (job: SearchJobResponse) => void;
  const h = harness(api({ search: async () => new Promise(resolve => { release = resolve; }) }));
  await h.session.resume(); const started = h.session.start(DEFAULT_SETTINGS);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  h.session.pause(); release(running); await started;
  assert.equal(await loadCurrentSearchId(h.storage), running.searchId); assert.equal(h.tasks.size, 0);
  h.session.dispose();
});
test('backend restart clears a stale ID and explains missing result without an automatic POST', async () => {
  const storage = store(); await saveCurrentSearchId(storage, running.searchId);
  const h = harness(api({ getJob: async () => { throw new ApiClientError('SEARCH_NOT_FOUND'); } }), storage);
  await h.session.resume(); assert.equal(h.session.state.phase, 'ERROR');
  assert.equal(h.session.state.error?.code, 'SEARCH_NOT_FOUND'); assert.equal(await loadCurrentSearchId(storage), null);
});

test('rapid foreground events share in-flight status and schedule only one polling loop', async () => {
  let release!: (job: SearchJobResponse) => void;
  let reads = 0;
  const storage = store(); await saveCurrentSearchId(storage, running.searchId);
  const h = harness(api({ getJob: async () => { reads++; return new Promise(resolve => { release = resolve; }); } }), storage);
  const first = h.session.resume();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const second = h.session.resume();
  release(running); await Promise.all([first, second]);
  assert.equal(reads, 1); assert.equal(h.tasks.size, 1);
  assert.equal([...h.tasks][0]?.at, 2000); h.session.dispose();
});

test('a disposed session cannot erase a newer search ID when an old response arrives', async () => {
  let release!: (job: SearchJobResponse) => void;
  const storage = store(); await saveCurrentSearchId(storage, running.searchId);
  const h = harness(api({ getJob: async () => new Promise(resolve => { release = resolve; }) }), storage);
  const pending = h.session.resume();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  h.session.dispose(); await saveCurrentSearchId(storage, 'newer-job'); release(completed); await pending;
  assert.equal(await loadCurrentSearchId(storage), 'newer-job');
});

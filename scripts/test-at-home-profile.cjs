const assert = require('node:assert/strict');
const { test } = require('node:test');

const core = import('../assets/at-home-profile-core.js');

const COLLECTIONS = {
  'q1:use:graphic-tees': { url: '/collections/graphic-tees-boutique-sellers', title: 'Graphic tees' },
  'q1:use:decorator': { url: '/collections/all', title: 'All blanks' },
  'q2:premium_feel': { url: '/collections/premium-blanks', title: 'Premium blanks' },
  'q3:dtf': { url: '/collections/dtf', title: 'DTF blanks' },
  'q3:embroidery': { url: '/collections/embroidery', title: 'Embroidery blanks' },
  'q3:screen-print': { url: '/collections/screen-print', title: 'Screen print blanks' },
  'q3:htv': { url: '/collections/htv', title: 'HTV blanks' },
  // q2:lowest_price and q3:dtg deliberately unset
};

const Q1 = 'use:graphic-tees';
const Q2 = 'premium_feel';
const Q3 = ['dtf', 'embroidery'];

// The eight saved-answer states from the strategy's "Signed-in profile states" table.
const STATES = [
  { name: 'None', answers: {}, question: 'q1', mode: 'question', links: [] },
  { name: 'Q1 only', answers: { q1: Q1 }, question: 'q2', mode: 'question', links: ['q1:use:graphic-tees'] },
  { name: 'Q1 and Q2', answers: { q1: Q1, q2: Q2 }, question: 'q3', mode: 'question', links: ['q1:use:graphic-tees', 'q2:premium_feel'] },
  { name: 'Q1, Q2 and Q3', answers: { q1: Q1, q2: Q2, q3: Q3 }, question: null, mode: 'complete', links: ['q1:use:graphic-tees', 'q2:premium_feel', 'q3:dtf', 'q3:embroidery'] },
  { name: 'Q2 only', answers: { q2: Q2 }, question: 'q1', mode: 'question', links: ['q2:premium_feel'] },
  { name: 'Q3 only', answers: { q3: Q3 }, question: 'q1', mode: 'question', links: ['q3:dtf', 'q3:embroidery'] },
  { name: 'Q1 and Q3', answers: { q1: Q1, q3: Q3 }, question: 'q2', mode: 'question', links: ['q1:use:graphic-tees', 'q3:dtf', 'q3:embroidery'] },
  { name: 'Q2 and Q3', answers: { q2: Q2, q3: Q3 }, question: 'q1', mode: 'question', links: ['q2:premium_feel', 'q3:dtf', 'q3:embroidery'] },
];

const keysOf = (links) => [links.project, links.priority, ...links.methods].filter(Boolean).map((link) => link.key);

for (const state of STATES) {
  test(`saved answers "${state.name}": asks ${state.question ?? 'nothing'} and shows its links`, async () => {
    const { normalizeAnswers, profileView, nextQuestion, questionNumber } = await core;
    const answers = normalizeAnswers(state.answers);
    assert.equal(nextQuestion(answers), state.question);
    const view = profileView(answers, COLLECTIONS);
    assert.equal(view.mode, state.mode);
    assert.equal(view.question, state.question);
    assert.equal(view.number, state.question ? questionNumber(state.question) : null);
    assert.deepEqual(keysOf(view.links), state.links);
    assert.equal(view.hasLinks, state.links.length > 0);
    assert.equal(view.hidden, false);
  });
}

test('question numbers follow the strategy (Question N of 3)', async () => {
  const { questionNumber } = await core;
  assert.deepEqual(['q1', 'q2', 'q3'].map(questionNumber), [1, 2, 3]);
});

test('None counts as answered, is exclusive and yields no decoration link', async () => {
  const { normalizeAnswers, profileView, isAnswered } = await core;
  const answers = normalizeAnswers({ q1: Q1, q2: Q2, q3: ['none'] });
  assert.equal(isAnswered(answers, 'q3'), true);
  const view = profileView(answers, COLLECTIONS);
  assert.equal(view.mode, 'complete');
  assert.equal(view.noneOnly, true);
  assert.deepEqual(view.links.methods, []);
  assert.deepEqual(keysOf(view.links), ['q1:use:graphic-tees', 'q2:premium_feel']);
  // Only None, with Q1 missing: Q1 is asked, nothing to link yet.
  const q3None = profileView(normalizeAnswers({ q3: ['none'] }), COLLECTIONS);
  assert.equal(q3None.question, 'q1');
  assert.equal(q3None.hasLinks, false);
});

test('Q3 normalization: canonical order, unknowns dropped, None mixed with methods dropped, empty is unanswered', async () => {
  const { normalizeMethods, normalizeAnswers } = await core;
  assert.deepEqual(normalizeMethods(['embroidery', 'dtf', 'bogus']), ['dtf', 'embroidery']);
  assert.deepEqual(normalizeMethods(['none', 'dtf']), ['dtf']);
  assert.deepEqual(normalizeMethods(['none']), ['none']);
  assert.equal(normalizeMethods([]), null);
  assert.equal(normalizeMethods(null), null);
  assert.equal(normalizeMethods('dtf'), null);
  assert.deepEqual(normalizeAnswers({ q1: 'graphic-tees', q2: 'cheap', q3: [] }), { q1: null, q2: null, q3: null });
  assert.deepEqual(normalizeAnswers(null), { q1: null, q2: null, q3: null });
});

test('an answer whose collection is unset shows no link', async () => {
  const { normalizeAnswers, collectionLinks } = await core;
  const links = collectionLinks(normalizeAnswers({ q1: 'use:personal', q2: 'lowest_price', q3: ['dtg', 'dtf'] }), COLLECTIONS);
  assert.equal(links.project, null);
  assert.equal(links.priority, null);
  assert.deepEqual(links.methods.map((link) => link.key), ['q3:dtf']);
  const blankUrl = collectionLinks({ q1: Q1 }, { 'q1:use:graphic-tees': { url: '', title: 'x' } });
  assert.equal(blankUrl.project, null);
});

test('more than two methods: two show, the rest sit behind "See all your methods"', async () => {
  const { normalizeAnswers, profileView, splitMethods } = await core;
  const view = profileView(normalizeAnswers({ q1: Q1, q2: Q2, q3: ['htv', 'dtf', 'embroidery', 'screen-print'] }), COLLECTIONS);
  assert.deepEqual(view.methods.shown.map((link) => link.value), ['screen-print', 'dtf']);
  assert.deepEqual(view.methods.more.map((link) => link.value), ['embroidery', 'htv']);
  assert.deepEqual(splitMethods(['a', 'b']), { shown: ['a', 'b'], more: [] });
  assert.deepEqual(splitMethods(['a']), { shown: ['a'], more: [] });
  assert.deepEqual(splitMethods(undefined), { shown: [], more: [] });
});

test('Maybe later hides the question; links stay; nothing left hides the section', async () => {
  const { normalizeAnswers, profileView } = await core;
  const withLinks = profileView(normalizeAnswers({ q2: Q2 }), COLLECTIONS, { later: true });
  assert.equal(withLinks.question, null);
  assert.equal(withLinks.mode, 'question');
  assert.equal(withLinks.hasLinks, true);
  assert.equal(withLinks.hidden, false);
  const empty = profileView(normalizeAnswers({}), COLLECTIONS, { later: true });
  assert.equal(empty.hidden, true);
  // Complete profiles ignore "Maybe later".
  const done = profileView(normalizeAnswers({ q1: Q1, q2: Q2, q3: ['none'] }), COLLECTIONS, { later: true });
  assert.equal(done.mode, 'complete');
  assert.equal(done.hidden, false);
});

test('toggleMethod keeps None exclusive', async () => {
  const { toggleMethod } = await core;
  assert.deepEqual(toggleMethod(['dtf', 'htv'], 'none', true), ['none']);
  assert.deepEqual(toggleMethod(['none'], 'dtf', true), ['dtf']);
  assert.deepEqual(toggleMethod(['dtf'], 'embroidery', true), ['dtf', 'embroidery']);
  assert.deepEqual(toggleMethod(['dtf', 'embroidery'], 'dtf', false), ['embroidery']);
  assert.deepEqual(toggleMethod(['dtf'], 'bogus', true), ['dtf']);
});

test('buildSaveBody: one value per single question, a non-empty list for Q3', async () => {
  const { buildSaveBody } = await core;
  assert.deepEqual(buildSaveBody('q1', 'use:personal'), { ok: true, body: { q1: 'use:personal' } });
  assert.deepEqual(buildSaveBody('q2', 'in_stock'), { ok: true, body: { q2: 'in_stock' } });
  assert.deepEqual(buildSaveBody('q2', ''), { ok: false, error: 'empty' });
  assert.deepEqual(buildSaveBody('q1', 'personal'), { ok: false, error: 'invalid' });
  assert.deepEqual(buildSaveBody('q3', ['embroidery', 'dtf']), { ok: true, body: { q3: ['dtf', 'embroidery'] } });
  assert.deepEqual(buildSaveBody('q3', ['none']), { ok: true, body: { q3: ['none'] } });
  assert.deepEqual(buildSaveBody('q3', []), { ok: false, error: 'empty' });
  assert.deepEqual(buildSaveBody('q3', ['none', 'dtf']), { ok: false, error: 'invalid' });
  assert.deepEqual(buildSaveBody('q3', ['dtf', 'bogus']), { ok: false, error: 'invalid' });
  assert.deepEqual(buildSaveBody('q4', 'x'), { ok: false, error: 'invalid' });
});

test('applySave advances to the next question, preferring the answers Wagner echoed', async () => {
  const { applySave, nextQuestion, linksForQuestion } = await core;
  let answers = applySave({}, { q1: Q1 }, { ok: true, answers: { q1: Q1, q2: null, q3: [] }, refresh: 'queued' });
  assert.deepEqual(answers, { q1: Q1, q2: null, q3: null });
  assert.equal(nextQuestion(answers), 'q2');
  assert.deepEqual(linksForQuestion('q1', answers, COLLECTIONS).map((link) => link.url), ['/collections/graphic-tees-boutique-sellers']);
  answers = applySave(answers, { q2: Q2 }, { ok: true });
  assert.equal(nextQuestion(answers), 'q3');
  answers = applySave(answers, { q3: ['embroidery', 'htv'] }, { ok: true, answers: { q3: ['embroidery', 'htv'] } });
  assert.equal(nextQuestion(answers), null);
  assert.deepEqual(linksForQuestion('q3', answers, COLLECTIONS).map((link) => link.value), ['embroidery', 'htv']);
  // Editing one answer leaves the others alone.
  answers = applySave(answers, { q1: 'use:decorator' }, null);
  assert.deepEqual(answers, { q1: 'use:decorator', q2: Q2, q3: ['embroidery', 'htv'] });
});

test('save errors read as plain English', async () => {
  const { saveErrorMessage } = await core;
  assert.match(saveErrorMessage(404), /switched on/);
  assert.match(saveErrorMessage(403), /Sign in/);
  assert.match(saveErrorMessage(429), /minute/);
  assert.match(saveErrorMessage(0), /connection/);
  assert.equal(saveErrorMessage(400, { error: 'invalid', fields: { q3: 'Pick a method.' } }), 'Pick a method.');
  assert.match(saveErrorMessage(500), /Try again/);
});

test('mergePending keeps this session\'s saves until the server catches up or they expire', async () => {
  const { mergePending, PENDING_TTL_MS } = await core;
  const now = 1_000_000;
  const pending = { answers: { q1: Q1, q3: ['dtf'] }, at: now - 1000 };
  const lagging = mergePending({}, pending, now);
  assert.deepEqual(lagging.answers, { q1: Q1, q2: null, q3: ['dtf'] });
  assert.deepEqual(lagging.pending, pending);
  const partly = mergePending({ q1: Q1 }, pending, now);
  assert.deepEqual(partly.answers, { q1: Q1, q2: null, q3: ['dtf'] });
  assert.deepEqual(partly.pending, { answers: { q3: ['dtf'] }, at: pending.at });
  const caughtUp = mergePending({ q1: Q1, q3: ['dtf'] }, pending, now);
  assert.equal(caughtUp.pending, null);
  const expired = mergePending({}, pending, pending.at + PENDING_TTL_MS + 1);
  assert.deepEqual(expired.answers, { q1: null, q2: null, q3: null });
  assert.equal(expired.pending, null);
  assert.equal(mergePending({ q2: Q2 }, null, now).answers.q2, Q2);
  assert.equal(mergePending({}, { answers: {}, at: 'x' }, now).pending, null);
});

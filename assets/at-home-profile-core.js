/**
 * AT Home profile: pure logic for the member profile area on the homepage
 * (sections/at-home-profile.liquid, assets/at-home-profile.js). No imports and no DOM, so every
 * function here is tested in Node (scripts/test-at-home-profile.cjs).
 *
 * Homepage strategy, "Signed-in profile states":
 * - The earliest unanswered question is offered, one at a time (Q1, then Q2, then Q3).
 * - Saved answers show their collection links while questions remain; when all three are saved
 *   the area becomes "Shop for what you make".
 * - Q3 is a list. "none" is exclusive, counts as answered and yields no decoration link.
 * - With more than two decoration links, two show and the rest sit behind "See all your methods".
 *
 * Answers are stored as customer metafields (wagner.onboarding_q1 / q2 / q3) and saved through
 * the app proxy POST /apps/wagner/answers. Wagner queues the metafield write, so a reload right
 * after a save can still render the old answers; `mergePending` lays the answers saved in this
 * browser session over the server's until they match or expire.
 */

export const QUESTIONS = ['q1', 'q2', 'q3'];

export const Q1_VALUES = [
  'use:decorator',
  'use:graphic-tees',
  'use:apparel-brand',
  'use:groups-events',
  'use:business-merch',
  'use:personal',
];
export const Q2_VALUES = ['lowest_price', 'premium_feel', 'trend_styles', 'in_stock', 'matching_families'];
export const Q3_VALUES = [
  'screen-print',
  'plastisol-transfer',
  'dtg',
  'dtf',
  'sublimation',
  'embroidery',
  'htv',
  'none',
];
export const NONE = 'none';
export const METHODS_SHOWN = 2;
export const PENDING_TTL_MS = 15 * 60 * 1000;

const VALUES = { q1: Q1_VALUES, q2: Q2_VALUES, q3: Q3_VALUES };

const pickSingle = (value, allowed) => (typeof value === 'string' && allowed.includes(value.trim()) ? value.trim() : null);

/**
 * Q3 in canonical order, unknown values dropped. "none" alone stays; "none" mixed with methods
 * is dropped (Wagner refuses that mix, so it only appears in stale or hand-edited data).
 * An empty list is unanswered: null.
 */
export function normalizeMethods(value) {
  if (!Array.isArray(value)) return null;
  const set = new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()));
  const methods = Q3_VALUES.filter((item) => item !== NONE && set.has(item));
  if (methods.length) return methods;
  return set.has(NONE) ? [NONE] : null;
}

/** @returns {{ q1: string | null, q2: string | null, q3: string[] | null }} */
export function normalizeAnswers(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    q1: pickSingle(source.q1, Q1_VALUES),
    q2: pickSingle(source.q2, Q2_VALUES),
    q3: normalizeMethods(source.q3),
  };
}

export const isAnswered = (answers, question) => {
  const value = answers?.[question];
  return question === 'q3' ? Array.isArray(value) && value.length > 0 : typeof value === 'string' && value !== '';
};

/** The earliest unanswered question, or null when the profile is complete. */
export const nextQuestion = (answers) => QUESTIONS.find((question) => !isAnswered(answers, question)) ?? null;

export const questionNumber = (question) => QUESTIONS.indexOf(question) + 1;

export const isComplete = (answers) => nextQuestion(answers) === null;

/** Key used for an answer's collection in the section's settings map, e.g. "q2:premium_feel". */
export const linkKey = (question, value) => `${question}:${value}`;

/**
 * Collection links for the saved answers. `collections` maps linkKey -> { url, title }; an answer
 * whose collection is unset has no entry and yields no link. "none" never yields a link.
 */
export function collectionLinks(answers, collections) {
  const lookup = (question, value) => {
    const entry = collections?.[linkKey(question, value)];
    if (!entry || typeof entry.url !== 'string' || entry.url === '') return null;
    return { key: linkKey(question, value), question, value, url: entry.url, title: String(entry.title ?? '') };
  };
  const project = answers?.q1 ? lookup('q1', answers.q1) : null;
  const priority = answers?.q2 ? lookup('q2', answers.q2) : null;
  const methods = (answers?.q3 ?? []).filter((value) => value !== NONE).map((value) => lookup('q3', value)).filter(Boolean);
  return { project, priority, methods };
}

/** The links one question's save reveals (shown with "Saved." after that save). */
export function linksForQuestion(question, answers, collections) {
  const links = collectionLinks(answers, collections);
  if (question === 'q1') return links.project ? [links.project] : [];
  if (question === 'q2') return links.priority ? [links.priority] : [];
  return links.methods;
}

/** Two methods show; the rest wait behind "See all your methods". */
export function splitMethods(methods, shown = METHODS_SHOWN) {
  const list = Array.isArray(methods) ? methods : [];
  if (list.length <= shown) return { shown: list, more: [] };
  return { shown: list.slice(0, shown), more: list.slice(shown) };
}

/**
 * What the section shows.
 * - mode: 'question' while an answer is missing, 'complete' when all three are saved.
 * - question: the question to ask (null when complete, or when "Maybe later" hid it).
 * - hasLinks: whether any saved answer has a collection link.
 * - hidden: nothing to show at all (question hidden for the visit and no links).
 */
export function profileView(answers, collections, { later = false } = {}) {
  const next = nextQuestion(answers);
  const links = collectionLinks(answers, collections);
  const hasLinks = Boolean(links.project || links.priority || links.methods.length);
  const mode = next ? 'question' : 'complete';
  const question = next && !later ? next : null;
  const methods = splitMethods(links.methods);
  return {
    mode,
    question,
    number: question ? questionNumber(question) : null,
    links,
    methods,
    hasLinks,
    noneOnly: Array.isArray(answers?.q3) && answers.q3.length === 1 && answers.q3[0] === NONE,
    hidden: mode === 'question' && !question && !hasLinks,
  };
}

/**
 * Applies one checkbox change to the Q3 selection: checking "none" clears the methods, checking a
 * method clears "none". Returns the selection in canonical order.
 */
export function toggleMethod(selection, value, checked) {
  if (!Q3_VALUES.includes(value)) return Q3_VALUES.filter((item) => (selection ?? []).includes(item));
  let next = new Set(selection ?? []);
  if (checked) {
    if (value === NONE) next = new Set([NONE]);
    else {
      next.delete(NONE);
      next.add(value);
    }
  } else next.delete(value);
  return Q3_VALUES.filter((item) => next.has(item));
}

/**
 * Builds the JSON body for POST /apps/wagner/answers for one question.
 * @returns {{ ok: true, body: object } | { ok: false, error: 'empty' | 'invalid' }}
 */
export function buildSaveBody(question, selection) {
  if (question === 'q3') {
    const list = Array.isArray(selection) ? selection : [];
    if (!list.length) return { ok: false, error: 'empty' };
    const methods = normalizeMethods(list);
    if (!methods || methods.length !== new Set(list).size) return { ok: false, error: 'invalid' };
    return { ok: true, body: { q3: methods } };
  }
  if (!VALUES[question]) return { ok: false, error: 'invalid' };
  if (typeof selection !== 'string' || selection === '') return { ok: false, error: 'empty' };
  const value = pickSingle(selection, VALUES[question]);
  return value ? { ok: true, body: { [question]: value } } : { ok: false, error: 'invalid' };
}

/** Answers after a successful save of `body`, preferring what Wagner echoed back. */
export function applySave(answers, body, response) {
  const echoed = response && typeof response.answers === 'object' && response.answers ? normalizeAnswers(response.answers) : null;
  const next = { ...normalizeAnswers(answers) };
  for (const question of QUESTIONS) {
    if (!(question in (body ?? {}))) continue;
    const sent = normalizeAnswers(body)[question];
    next[question] = echoed && echoed[question] !== null ? echoed[question] : sent;
  }
  return next;
}

/** A plain-English status line for a failed save. */
export function saveErrorMessage(status, data) {
  if (status === 0) return 'Couldn’t reach the store. Check your connection and try again.';
  if (status === 400) {
    const fields = data && typeof data.fields === 'object' && data.fields ? Object.values(data.fields).join(' ') : '';
    return fields || 'That answer couldn’t be saved. Try again.';
  }
  if (status === 401 || status === 403) return 'Sign in again to save your answers.';
  if (status === 404) return 'Saving answers isn’t switched on yet.';
  if (status === 429) return 'That was a lot of saves. Try again in a minute.';
  return 'Couldn’t save right now. Try again.';
}

const sameAnswer = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Lays answers saved in this browser session over the server's answers while Wagner's queued
 * metafield write catches up. `pending` is { answers, at } as stored after a save. Questions the
 * server already agrees on are dropped from the pending record.
 * @returns {{ answers: object, pending: { answers: object, at: number } | null }}
 */
export function mergePending(serverAnswers, pending, now) {
  const server = normalizeAnswers(serverAnswers);
  if (!pending || typeof pending !== 'object' || !Number.isFinite(pending.at) || now - pending.at > PENDING_TTL_MS || now < pending.at) {
    return { answers: server, pending: null };
  }
  const saved = normalizeAnswers(pending.answers);
  const merged = { ...server };
  const left = {};
  for (const question of QUESTIONS) {
    if (!(pending.answers && question in pending.answers) || saved[question] === null) continue;
    if (sameAnswer(saved[question], server[question])) continue;
    merged[question] = saved[question];
    left[question] = saved[question];
  }
  return { answers: merged, pending: Object.keys(left).length ? { answers: left, at: pending.at } : null };
}

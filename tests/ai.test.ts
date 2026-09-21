import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAiProfile } from '../server/ai';

const resume =
  '2024 Korean language teaching and transcription experience. Python, English, Korean.';
const payload = {
  skills: ['Python', 'transcription', 'teaching'],
  languages: ['Korean', 'English'],
  experience: ['2024 Korean language teaching and transcription'],
  education: [],
  keywords: ['teaching', 'transcription'],
  primaryRoleKeywords: ['transcription'],
  skillKeywords: ['Python'],
  languageKeywords: ['Korean'],
};

test('AI opt-in helper sends extracted text with no response storage, validates profile', async () => {
  let sent: Record<string, unknown> = {};
  const mock = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(init?.method, 'POST');
    assert.equal(sent.input, resume);
    return Response.json({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] },
      ],
    });
  }) as typeof fetch;
  const profile = await extractAiProfile(resume, 'test-only-key', 'gpt-4o-mini', mock);
  assert.equal(sent.store, false);
  assert.equal(profile.mode, 'ai');
  assert.deepEqual(profile.skills, payload.skills);
  assert.deepEqual(profile.negativeKeywords, []);
});

test('AI helper fails without a key or on invalid API result', async () => {
  await assert.rejects(extractAiProfile(resume, ''), /사용할 수 없습니다/);
  const invalid = (async () =>
    Response.json({ status: 'completed', output_text: '{broken' })) as typeof fetch;
  await assert.rejects(
    extractAiProfile(resume, 'test-only-key', 'gpt-4o-mini', invalid),
    /읽지 못했습니다/,
  );
});

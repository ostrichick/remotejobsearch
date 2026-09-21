import type { Profile } from '../src/domain';
import { validateProfile } from './profile';

const fields = [
  'skills',
  'languages',
  'experience',
  'education',
  'keywords',
  'primaryRoleKeywords',
  'skillKeywords',
  'languageKeywords',
] as const;

/** Only an opted-in, extracted resume text is sent to the configured API. */
export async function extractAiProfile(
  text: string,
  apiKey: string,
  model = 'gpt-4o-mini',
  request: typeof fetch = fetch,
): Promise<Profile> {
  if (!apiKey.trim()) throw new Error('AI 분석을 사용할 수 없습니다.');
  if (text.length < 40 || text.length > 16000)
    throw new Error('AI 분석 입력은 40~16,000자로 제한됩니다. 기본 분석을 이용해 주세요.');

  const schema = {
    type: 'object',
    properties: Object.fromEntries(
      fields.map((field) => [field, { type: 'array', items: { type: 'string' } }]),
    ),
    required: fields,
    additionalProperties: false,
  };
  const response = await request('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 2000,
      instructions:
        'Extract a job-search profile strictly from the supplied resume text. Never infer skills, education, or experience not explicitly stated. Keep short evidence-grounded phrases. Never include names, contact details, IDs or addresses. Return arrays only. keywords should be relevant job-search terms, negativeKeywords is deliberately not inferred.',
      input: text,
      text: { format: { type: 'json_schema', name: 'resume_profile', strict: true, schema } },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new Error('AI 분석 서비스 요청이 실패했습니다. 기본 분석을 이용해 주세요.');

  const result = (await response.json()) as {
    status?: string;
    output_text?: string;
    output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  };
  if (result.status !== 'completed') throw new Error('AI 분석이 완료되지 않았습니다.');
  const output =
    result.output_text ||
    result.output
      ?.filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === 'output_text')
      .map((item) => item.text ?? '')
      .join('');
  if (!output) throw new Error('AI 분석 결과가 비어 있습니다.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('AI 분석 결과를 읽지 못했습니다.');
  }
  return validateProfile({ ...(parsed as object), mode: 'ai', negativeKeywords: [] });
}

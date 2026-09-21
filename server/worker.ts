import type { Env } from './env';
import { dailyLimit, effectiveMaxBodyBytes } from './env';
import { extractProfile, validateProfile } from './profile';
import { extractAiProfile } from './ai';
import { search } from './jobs';
import { trust } from './trust';
import type { Job, Profile, SearchResult } from '../src/domain';
import {
  EvaluationError,
  deleteEvaluation,
  evaluationCsv,
  evaluationReport,
  listEvaluations,
  saveEvaluation,
  validateEvaluation,
  validateEvaluationId,
} from './evaluation';
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
async function getData(env: Env, table: 'profiles' | 'searches', uid: string) {
  const r = await env.DB.prepare(`SELECT data FROM ${table} WHERE user_id=?`)
    .bind(uid)
    .first<{ data: string }>();
  return r ? JSON.parse(r.data) : null;
}
async function limit(env: Env, uid: string, action: string, max: number) {
  const key = `${new Date().toISOString().slice(0, 10)}:${uid}:${action}`;
  const r = await env.DB.prepare(
    'INSERT INTO limits(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count',
  )
    .bind(key, max)
    .first<{ count: number }>();
  if (!r) throw new Error('오늘의 사용 한도에 도달했습니다. 내일 다시 시도하세요.');
}

class BodySizeError extends Error {}

async function boundedBody(request: Request, max: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length !== null && Number.isFinite(Number(length)) && Number(length) > max)
    throw new BodySizeError('요청 본문 크기 초과');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        try {
          await reader.cancel();
        } catch {
          /* The size error takes precedence. */
        }
        throw new BodySizeError('요청 본문 크기 초과');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function readJson(body: Uint8Array): Record<string, unknown> {
  if (body.byteLength > 100_000) throw new BodySizeError('JSON 본문 크기 초과');
  const value: unknown = JSON.parse(new TextDecoder().decode(body));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('요청 형식이 올바르지 않습니다.');
  return value as Record<string, unknown>;
}

async function profileHash(profile: Profile): Promise<string> {
  // All search filters and score inputs are included. updatedAt and LinkedIn URL have no effect.
  const relevant = {
    skills: profile.skills,
    languages: profile.languages,
    experience: profile.experience,
    education: profile.education,
    keywords: profile.keywords,
    primaryRoleKeywords: profile.primaryRoleKeywords,
    skillKeywords: profile.skillKeywords,
    languageKeywords: profile.languageKeywords,
    negativeKeywords: profile.negativeKeywords,
    preferences: profile.preferences,
  };
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(relevant)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getPreviousSearch(env: Env, uid: string) {
  const row = await env.DB.prepare('SELECT data, profile_hash FROM searches WHERE user_id=?')
    .bind(uid)
    .first<{ data: string; profile_hash: string | null }>();
  return row ? { result: JSON.parse(row.data) as SearchResult, hash: row.profile_hash } : null;
}
export async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    uid = request.headers.get('oai-authenticated-user-id');
  // Sites must strip untrusted incoming identity headers before injecting its authenticated identity.
  // The local Sites plugin does this; production dispatch is a required upstream trust boundary.
  if (
    !uid ||
    uid.length > 256 ||
    uid.includes(',') ||
    [...uid].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
    return json({ error: '로그인이 필요합니다.' }, 401);
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    (request.headers.get('Origin') !== url.origin || request.headers.get('X-RoleScout') !== '1')
  )
    return json({ error: '허용되지 않은 요청입니다.' }, 403);
  try {
    const body = ['GET', 'HEAD'].includes(request.method)
      ? new Uint8Array()
      : await boundedBody(request, effectiveMaxBodyBytes(env));
    if (url.pathname === '/api/me')
      return json({
        email: request.headers.get('oai-authenticated-user-email'),
        analysisMode: 'local',
        aiEnabled: Boolean(env.OPENAI_API_KEY?.trim()),
      });
    if (url.pathname === '/api/trust') return json(trust);
    if (url.pathname === '/api/profile' && request.method === 'GET')
      return json(await getData(env, 'profiles', uid));
    if (url.pathname === '/api/profile' && request.method === 'PUT') {
      const profile = validateProfile(readJson(body));
      profile.updatedAt = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO profiles(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',
      )
        .bind(uid, JSON.stringify(profile), profile.updatedAt)
        .run();
      return json(profile);
    }
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      const form = await new Request(request.url, {
          method: 'POST',
          headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' },
          body: body.buffer.slice(
            body.byteOffset,
            body.byteOffset + body.byteLength,
          ) as ArrayBuffer,
        }).formData(),
        text = String(form.get('text') ?? '');
      if (form.get('analysisConsent') !== 'true')
        return json({ error: '이력서 텍스트 분석 및 프로필 저장에 동의해야 합니다.' }, 422);
      if (text.length < 40 || text.length > 60000)
        return json(
          {
            error:
              '읽을 수 있는 텍스트가 부족하거나 너무 깁니다. 스캔 PDF는 OCR 후 텍스트로 붙여넣으세요 (40~60,000자).',
          },
          422,
        );
      const aiConsent = form.get('aiConsent') === 'true';
      if (aiConsent && !env.OPENAI_API_KEY?.trim())
        return json(
          { error: 'AI 분석 연결이 설정되지 않았습니다. 기본 분석을 이용해 주세요.' },
          422,
        );
      if (aiConsent && text.length > 16000)
        return json(
          { error: 'AI 분석은 16,000자 이하 텍스트만 지원합니다. 기본 분석을 이용해 주세요.' },
          422,
        );
      const existing = (await getData(env, 'profiles', uid)) as Profile | null;
      const file = form.get('file');
      let bytes: Uint8Array | null = null;
      if (file instanceof File) {
        if (file.size > 5_000_000 || !/\.(pdf|docx)$/i.test(file.name))
          return json({ error: '5MB 이하 PDF 또는 DOCX만 지원합니다.' }, 400);
        bytes = new Uint8Array(await file.arrayBuffer());
        if (
          /\.pdf$/i.test(file.name)
            ? new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-'
            : bytes[0] !== 80 || bytes[1] !== 75
        )
          return json({ error: '파일 내용과 확장자가 일치하지 않습니다.' }, 400);
      }
      await limit(env, uid, 'analyze', dailyLimit(env, 'analyze'));
      const extracted = aiConsent
        ? await extractAiProfile(text, env.OPENAI_API_KEY!, env.OPENAI_MODEL)
        : extractProfile(text);
      const profile = validateProfile({
        ...extracted,
        preferences: existing?.preferences,
        linkedinUrl: existing?.linkedinUrl,
      });
      profile.updatedAt = new Date().toISOString();
      if (bytes && file instanceof File) {
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid))),
        )
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const key = `resumes/${hash}/${crypto.randomUUID()}`;
        const previous = await env.DB.prepare('SELECT object_key FROM resumes WHERE user_id=?')
          .bind(uid)
          .first<{ object_key: string }>();
        await env.FILES.put(key, bytes, {
          httpMetadata: { contentType: 'application/octet-stream' },
        });
        try {
          await env.DB.batch([
            env.DB.prepare(
              'INSERT INTO resumes(user_id,object_key,filename,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET object_key=excluded.object_key,filename=excluded.filename,updated_at=excluded.updated_at',
            ).bind(uid, key, file.name.slice(0, 200), profile.updatedAt),
            env.DB.prepare(
              'INSERT INTO profiles(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',
            ).bind(uid, JSON.stringify(profile), profile.updatedAt),
          ]);
        } catch (error) {
          try {
            await env.FILES.delete(key);
          } catch {
            /* Keep the original DB error. */
          }
          throw error;
        }
        if (previous?.object_key && previous.object_key !== key) {
          // Metadata already points to the new object; failure here must not lose the new resume.
          try {
            await env.FILES.delete(previous.object_key);
          } catch {
            /* Keep the newly committed resume. */
          }
        }
      } else {
        await env.DB.prepare(
          'INSERT INTO profiles(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',
        )
          .bind(uid, JSON.stringify(profile), profile.updatedAt)
          .run();
      }
      return json(profile);
    }
    if (url.pathname === '/api/resume' && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT filename,updated_at FROM resumes WHERE user_id=?')
        .bind(uid)
        .first();
      return json(row);
    }
    if (url.pathname === '/api/resume' && request.method === 'DELETE') {
      const row = await env.DB.prepare('SELECT object_key FROM resumes WHERE user_id=?')
        .bind(uid)
        .first<{ object_key: string }>();
      if (row) await env.FILES.delete(row.object_key);
      await env.DB.prepare('DELETE FROM resumes WHERE user_id=?').bind(uid).run();
      return json({ ok: true });
    }
    if (url.pathname === '/api/data' && request.method === 'DELETE') {
      const row = await env.DB.prepare('SELECT object_key FROM resumes WHERE user_id=?')
        .bind(uid)
        .first<{ object_key: string }>();
      if (row) await env.FILES.delete(row.object_key);
      await env.DB.batch([
        ...(['profiles', 'resumes', 'searches', 'saved', 'job_evaluations'] as const).map((t) =>
          env.DB.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(uid),
        ),
        env.DB.prepare('DELETE FROM limits WHERE substr(key,12,length(?))=?').bind(
          `${uid}:`,
          `${uid}:`,
        ),
      ]);
      return json({ ok: true });
    }
    if (url.pathname === '/api/search' && request.method === 'GET') {
      const current = (await getData(env, 'profiles', uid)) as Profile | null;
      const previous = await getPreviousSearch(env, uid);
      return json(
        current && previous?.hash === (await profileHash(current)) ? previous.result : null,
      );
    }
    if (url.pathname === '/api/search' && request.method === 'POST') {
      const profile = (await getData(env, 'profiles', uid)) as Profile | null;
      if (!profile) return json({ error: '먼저 프로필을 저장하세요.' }, 400);
      if (!profile.keywords.some((k) => k.trim().length >= 2 && !/@|https?:|\d{7}/.test(k)))
        return json({ error: '검색 키워드를 하나 이상 입력하세요.' }, 400);
      const fingerprint = await profileHash(profile);
      const old = await getPreviousSearch(env, uid);
      const previous = old?.result;
      if (
        previous &&
        Date.now() - Date.parse(previous.searchedAt) < 60000 &&
        old.hash === fingerprint
      )
        return json(previous);
      await limit(env, uid, 'search', dailyLimit(env, 'search'));
      const result = await search(profile, env);
      if (result.sources.every((s) => s.error))
        return json(
          {
            error: '모든 출처 조회가 실패했습니다. 기존 결과는 유지됩니다.',
            sources: result.sources,
          },
          502,
        );
      if (
        result.sources.some((source) => source.error) &&
        old?.hash === fingerprint &&
        previous?.sources.every((source) => !source.error)
      ) {
        return json(
          {
            error: '일부 출처 조회가 실패했습니다. 이전의 완전한 검색 결과를 유지합니다.',
            sources: result.sources,
          },
          502,
        );
      }
      const comparable =
        old?.hash === fingerprint &&
        previous?.sources.length === result.sources.length &&
        previous.sources.every((source) => !source.error) &&
        result.sources.every((source) => !source.error);
      result.newJobIds = comparable
        ? result.jobs
            .filter((job) => !previous.jobs.some((prior: Job) => prior.id === job.id))
            .map((job) => job.id)
        : [];
      result.previousSearchedAt = comparable ? previous.searchedAt : null;
      await env.DB.prepare(
        'INSERT INTO searches(user_id,data,updated_at,profile_hash) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,profile_hash=excluded.profile_hash',
      )
        .bind(uid, JSON.stringify(result), result.searchedAt, fingerprint)
        .run();
      return json(result);
    }
    if (url.pathname === '/api/evaluations' && request.method === 'GET') {
      const items = await listEvaluations(env.DB, uid);
      return json({ items, report: evaluationReport(items) });
    }
    if (url.pathname === '/api/evaluations/export' && request.method === 'GET') {
      const format = url.searchParams.get('format');
      const includeNotes = url.searchParams.get('includeNotes');
      if (
        !['csv', 'json'].includes(format ?? '') ||
        (includeNotes !== null && includeNotes !== '1') ||
        [...url.searchParams.keys()].some((key) => !['format', 'includeNotes'].includes(key)) ||
        [...url.searchParams.keys()].length !== new Set(url.searchParams.keys()).size
      )
        return json({ error: '내보내기 형식을 선택해 주세요.' }, 400);
      const items = (await listEvaluations(env.DB, uid)).map((item) =>
        includeNotes === '1' ? item : { ...item, notes: '' },
      );
      if (format === 'json') return json({ items, report: evaluationReport(items) });
      return new Response(evaluationCsv(items), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="rolescout-my-evaluations.csv"',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }
    if (
      url.pathname === '/api/evaluations' &&
      (request.method === 'PUT' || request.method === 'DELETE')
    ) {
      if (body.byteLength > 4096)
        return json({ error: '평가 요청 크기 제한을 초과했습니다.' }, 413);
      const payload = readJson(body);
      if (request.method === 'PUT') {
        const item = await saveEvaluation(env.DB, uid, validateEvaluation(payload));
        return json(item);
      }
      if (Object.keys(payload).length !== 1)
        return json({ error: '공고 식별자만 제공해 주세요.' }, 422);
      await deleteEvaluation(env.DB, uid, validateEvaluationId(payload.jobId));
      return json({ ok: true });
    }
    if (url.pathname === '/api/saved' && request.method === 'GET') {
      const r = await env.DB.prepare(
        'SELECT data FROM saved WHERE user_id=? ORDER BY created_at DESC',
      )
        .bind(uid)
        .all<{ data: string }>();
      return json(r.results.map((v) => JSON.parse(v.data)));
    }
    if (url.pathname === '/api/saved' && ['POST', 'DELETE'].includes(request.method)) {
      const payload = readJson(body),
        id = payload.id;
      if (typeof id !== 'string' || id.length > 200) return json({ error: '공고 ID 오류' }, 400);
      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM saved WHERE user_id=? AND job_id=?').bind(uid, id).run();
        return json({ ok: true });
      }
      const result = (await getData(env, 'searches', uid)) as SearchResult | null,
        job = result?.jobs.find((j: Job) => j.id === id);
      if (!job) return json({ error: '본인의 검색 결과에 없는 공고입니다.' }, 404);
      await env.DB.prepare(
        'INSERT INTO saved(user_id,job_id,data,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,job_id) DO UPDATE SET data=excluded.data',
      )
        .bind(uid, id, JSON.stringify(job), new Date().toISOString())
        .run();
      return json({ ok: true });
    }
    return json({ error: '요청을 찾을 수 없습니다.' }, 404);
  } catch (e) {
    if (e instanceof BodySizeError)
      return json({ error: '요청 본문 크기 제한을 초과했습니다.' }, 413);
    if (e instanceof EvaluationError) return json({ error: e.message }, e.status);
    return json(
      {
        error:
          e instanceof Error && /프로필|한도|키워드|길이|형식|AI 분석/.test(e.message)
            ? e.message
            : '요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.',
      },
      e instanceof Error && /한도/.test(e.message) ? 429 : 400,
    );
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env);
    if (url.pathname.startsWith('/.openai') || url.pathname.startsWith('/server'))
      return new Response('Not found', { status: 404 });
    const res = await env.ASSETS.fetch(request);
    return res;
  },
};

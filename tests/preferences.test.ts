import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferences, matchesPreferences, emptyPreferences } from '../src/preferences';
import type { Job } from '../src/domain';
test('natural conditions require review, preserve negation and location distinction', () => {
  const p = parsePreferences('한국에서 가능한 원격근무, 주 20시간 이하').value;
  assert.equal(p.remote, true);
  assert.equal(p.korea, true);
  assert.equal(p.maxWeeklyHours, '20');
  assert.equal(parsePreferences('원격 말고 서울').value.remote, false);
  assert.equal(parsePreferences('서울 재택').value.location, 'Seoul');
});
test('unknown hours and minimum-only hours cannot satisfy maximum', () => {
  const p = { ...emptyPreferences, maxWeeklyHours: '20' };
  const job = { hours: 'Hours: 5-20 hours per week' } as Job;
  assert.equal(matchesPreferences(job, p), true);
  assert.equal(matchesPreferences({ ...job, hours: 'minimum 15 hours per week' }, p), false);
  assert.equal(matchesPreferences({ ...job, hours: null }, p), false);
  assert.equal(matchesPreferences({ ...job, hours: '10-30 hours per week' }, p), false);
});

test('North Korea does not activate South Korea filter and standard weekly limits parse', () => {
  assert.equal(parsePreferences('North Korea remote').value.korea, false);
  assert.equal(parsePreferences('South Korea remote').value.korea, true);
  assert.equal(parsePreferences('북한 원격').value.korea, false);
  assert.equal(parsePreferences('대한민국 원격, 주당 20시간 이하').value.maxWeeklyHours, '20');
  assert.equal(parsePreferences('remote, up to 25 hours per week').value.maxWeeklyHours, '25');
});

test('city names match Korean and English variants, while unknown eligibility fails explicit Korea preference', () => {
  const base = {
    hours: null,
    location: '서울, 대한민국',
    korea: 'confirmed',
    workMode: '원격',
    contract: '계약직',
  } as Job;
  assert.equal(
    matchesPreferences(base, { ...emptyPreferences, location: 'Seoul', korea: true }),
    true,
  );
  assert.equal(
    matchesPreferences(
      { ...base, location: 'Seoul, South Korea' },
      { ...emptyPreferences, location: '서울' },
    ),
    true,
  );
  assert.equal(
    matchesPreferences({ ...base, korea: 'unknown' }, { ...emptyPreferences, korea: true }),
    false,
  );
  assert.equal(
    matchesPreferences(
      { ...base, korea: 'excluded', location: 'North Korea' },
      { ...emptyPreferences, location: 'Korea' },
    ),
    false,
  );
});

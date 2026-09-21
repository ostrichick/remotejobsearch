import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSafetySignals } from '../server/safety';

test('highlights explicit upfront payment demands without declaring fraud', () => {
  const en = detectSafetySignals('Applicants must pay a training fee before starting work.');
  const ko = detectSafetySignals('업무를 시작하려면 교육비를 내야 합니다.');
  assert.equal(en.length, 1);
  assert.match(en[0], /Applicants must pay/);
  assert.equal(ko.length, 1);
});

test('does not flag compensation or warnings not to pay', () => {
  assert.deepEqual(
    detectSafetySignals('We pay $25 per hour. We will never ask you to pay a fee.'),
    [],
  );
  assert.deepEqual(detectSafetySignals('지원자에게 선입금을 요구하지 않습니다.'), []);
});

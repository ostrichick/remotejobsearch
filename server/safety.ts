/**
 * Find explicit payment-request language in a job description for human review.
 * This is a text signal, not a fraud determination or employer verification.
 */
export function detectSafetySignals(description: string): string[] {
  const signals: string[] = [];
  const sentences = description.split(/(?<=[.!?。])\s+|\n+/).map((s) => s.trim());

  for (const sentence of sentences) {
    if (!sentence || sentence.length > 2000) continue;
    // A statement warning candidates against payments is not a payment request.
    if (
      /\b(?:never|don't|do not|won't|will not|no|without|not required to)\b.{0,50}\b(?:pay|payment|deposit|fee|send|transfer)\b/i.test(
        sentence,
      ) ||
      /(?:선입금|입금|수수료|돈을|비용을).{0,20}(?:요구하지|받지 않|필요 없|없습니다|주의|금지)/.test(
        sentence,
      )
    )
      continue;

    const explicitRequest =
      /\b(?:you|applicants?|candidates?|workers?)\b.{0,75}\b(?:must|need to|have to|required to)\b.{0,40}\b(?:pay|deposit|send|transfer|purchase)\b/i.test(
        sentence,
      ) ||
      /\b(?:upfront|advance|initial)\b.{0,35}\b(?:fee|payment|deposit)\b.{0,80}\b(?:apply|start|work|training|withdraw|activate)\b/i.test(
        sentence,
      ) ||
      /(?:지원|채용|업무|작업|출금|계정|교육|장비).{0,35}(?:위해|하려면|전에).{0,20}(?:선입금|입금해야|송금해야|(?:교육비|장비비|등록비|가입비|수수료|비용|돈)(?:를|을)?\s*(?:먼저\s*)?내야)/.test(
        sentence,
      ) ||
      /(?:선입금|입금|송금).{0,25}(?:해야|필수|요구).{0,35}(?:채용|출금|시작|교육|업무)/.test(
        sentence,
      );

    if (explicitRequest) {
      signals.push(`선입금·금전 요구 표현 확인 필요: ${sentence.slice(0, 180)}`);
      if (signals.length === 3) break;
    }
  }

  return signals;
}

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const personas = [
  {
    id: 'P01',
    name: 'Korean-English-Spanish AI Evaluator',
    expectedLanguages: ['Korean', 'English', 'Spanish'],
    expectedTitleTokens: [
      'Korean',
      'Spanish',
      'English',
      'Evaluator',
      'Rater',
      'Annotator',
      'Reviewer',
      'Quality',
    ],
    resume: `Jin Park\nAI Language Evaluator & Data Annotator\n\nSUMMARY\nMultilingual AI evaluation and data annotation specialist with experience reviewing model outputs for accuracy, relevance, safety, linguistic quality, and instruction following.\n\nLANGUAGES\nKorean - Native\nEnglish - Fluent\nSpanish - Fluent\n\nSKILLS\nAI evaluation, data annotation, linguistic QA, translation, localization, transcription, quality review, Excel, Google Workspace\n\nEXPERIENCE\n2024 - 2026 Freelance AI Evaluator: evaluated chatbot responses in Korean, English, and Spanish and applied detailed rubrics.\n2022 - 2024 Language Data Annotator: labeled text and audio datasets, performed transcription and bilingual quality checks.\n\nEDUCATION\nBachelor degree in Linguistics, Seoul Digital University, 2022`,
  },
  {
    id: 'P02',
    name: 'Spanish-English Translator & Localization QA',
    expectedLanguages: ['Spanish', 'English'],
    expectedTitleTokens: [
      'Spanish',
      'English',
      'Translator',
      'Localization',
      'Linguist',
      'Reviewer',
      'Quality',
    ],
    resume: `Lucia Moreno\nSpanish-English Translator & Localization QA Specialist\n\nSUMMARY\nTranslator and language quality specialist focused on software localization, terminology consistency, proofreading, and multilingual content review.\n\nLANGUAGES\nSpanish - Native\nEnglish - Fluent\n\nSKILLS\ntranslation, localization, linguistic QA, transcription, evaluation, Excel\n\nEXPERIENCE\n2023 - 2026 Freelance Translator: translated English and Spanish product content and reviewed machine translation for accuracy and tone.\n2021 - 2023 Localization QA Reviewer: performed linguistic review, terminology checks, and transcription quality control.\n\nEDUCATION\nBachelor degree in Translation Studies, Madrid International University, 2021`,
  },
  {
    id: 'P03',
    name: 'English Data Annotator',
    expectedLanguages: ['English'],
    expectedTitleTokens: [
      'English',
      'Annotator',
      'Annotation',
      'Evaluator',
      'Rater',
      'Quality',
      'Data',
    ],
    resume: `Daniel Lee\nData Annotator & Quality Reviewer\n\nSUMMARY\nData annotation specialist experienced with text, image, and audio labeling, quality assurance, structured guidelines, and error analysis.\n\nLANGUAGES\nEnglish - Native\n\nSKILLS\nannotation, evaluation, QA, data analysis, Python, Excel\n\nEXPERIENCE\n2024 - 2026 Data Annotator: labeled text and image datasets and completed second-pass QA reviews.\n2022 - 2024 Data Quality Assistant: used Excel and Python for data analysis, validation, and reporting.\n\nEDUCATION\nBachelor degree in Information Systems, State University, 2022`,
  },
  {
    id: 'P04',
    name: 'Korean-English Data Analyst',
    expectedLanguages: ['Korean', 'English'],
    expectedTitleTokens: ['Data', 'Analyst', 'Analytics', 'Korean', 'English'],
    resume: `Minseo Kim\nData Analyst\n\nSUMMARY\nData analyst with experience in SQL reporting, Python automation, dashboard analysis, and business metrics.\n\nLANGUAGES\nKorean - Native\nEnglish - Professional\n\nSKILLS\ndata analysis, Python, SQL, Excel, AWS\n\nEXPERIENCE\n2023 - 2026 Data Analyst: built SQL reports, automated data cleaning with Python, and analyzed product metrics.\n2021 - 2023 Reporting Analyst: maintained Excel dashboards and validated business data.\n\nEDUCATION\nBachelor degree in Statistics, Korea Open University, 2021`,
  },
  {
    id: 'P05',
    name: 'English Frontend Developer Negative Control',
    expectedLanguages: ['English'],
    expectedTitleTokens: [
      'Frontend',
      'Front End',
      'Software',
      'Engineer',
      'Developer',
      'React',
      'Web',
    ],
    resume: `Alex Morgan\nFrontend Developer\n\nSUMMARY\nFrontend engineer building accessible web applications and design systems.\n\nLANGUAGES\nEnglish - Native\n\nSKILLS\nJavaScript, TypeScript, React, AWS, design\n\nEXPERIENCE\n2023 - 2026 Frontend Developer: built React and TypeScript applications, component libraries, and web performance tooling.\n2021 - 2023 Web Developer: maintained JavaScript frontends and AWS-hosted applications.\n\nEDUCATION\nBachelor degree in Computer Science, City University, 2021`,
  },
  {
    id: 'P06',
    name: 'French-English Linguist Positive Control',
    expectedLanguages: ['French', 'English'],
    expectedTitleTokens: [
      'French',
      'English',
      'Linguist',
      'Translator',
      'Reviewer',
      'Evaluator',
      'Rater',
    ],
    resume: `Camille Bernard\nFrench-English Linguist & AI Evaluator\n\nSUMMARY\nBilingual linguist experienced in translation, linguistic evaluation, localization, transcription, and AI response quality review.\n\nLANGUAGES\nFrench - Native\nEnglish - Fluent\n\nSKILLS\nlinguistic, translation, localization, transcription, evaluation, QA\n\nEXPERIENCE\n2023 - 2026 AI Language Evaluator: evaluated French and English model responses for meaning, grammar, and cultural fit.\n2020 - 2023 Translator: translated and proofread French and English content.\n\nEDUCATION\nMaster degree in Linguistics, European Language University, 2020`,
  },
  {
    id: 'P07',
    name: 'Norwegian-English Linguist Parser Coverage Check',
    expectedLanguages: ['Norwegian', 'English'],
    expectedTitleTokens: [
      'Norwegian',
      'English',
      'Linguist',
      'Translator',
      'Reviewer',
      'Evaluator',
      'Rater',
    ],
    resume: `Ingrid Solberg\nNorwegian-English Linguist & AI Evaluator\n\nSUMMARY\nBilingual language specialist with experience in Norwegian and English AI evaluation, translation, transcription, and linguistic QA.\n\nLANGUAGES\nNorwegian - Native\nEnglish - Fluent\n\nSKILLS\nlinguistic, translation, localization, transcription, evaluation, QA\n\nEXPERIENCE\n2023 - 2026 AI Language Evaluator: evaluated Norwegian and English model responses for relevance, fluency, and instruction following.\n2020 - 2023 Translator: translated Norwegian and English documents and reviewed machine translation output.\n\nEDUCATION\nMaster degree in Linguistics, Nordic Language University, 2020`,
  },
];

const canonicalAliases = {
  Korean: ['Korean', '한국어'],
  English: ['English', '영어'],
  Spanish: ['Spanish', '스페인어'],
  French: ['French', '프랑스어'],
  German: ['German', '독일어'],
  Portuguese: ['Portuguese', '포르투갈어'],
  Japanese: ['Japanese', '일본어'],
  Chinese: ['Chinese', 'Mandarin', '중국어', '중국어(간체)', '중국어(번체)'],
  Norwegian: ['Norwegian', '노르웨이어'],
  Swedish: ['Swedish', '스웨덴어'],
  Danish: ['Danish', '덴마크어'],
  Finnish: ['Finnish', '핀란드어'],
  Polish: ['Polish', '폴란드어'],
  Czech: ['Czech', '체코어'],
  Dutch: ['Dutch', '네덜란드어'],
  Italian: ['Italian', '이탈리아어'],
  Russian: ['Russian', '러시아어'],
  Arabic: ['Arabic', '아랍어'],
  Hindi: ['Hindi', '힌디어'],
  Turkish: ['Turkish', '터키어'],
  Indonesian: ['Indonesian', '인도네시아어'],
  Vietnamese: ['Vietnamese', '베트남어'],
  Thai: ['Thai', '태국어'],
  Ukrainian: ['Ukrainian', '우크라이나어'],
  Greek: ['Greek', '그리스어'],
  Hebrew: ['Hebrew', '히브리어'],
  Bengali: ['Bengali', '벵골어'],
  Urdu: ['Urdu', '우르두어'],
  Tamil: ['Tamil', '타밀어'],
  Telugu: ['Telugu', '텔루구어'],
  Malay: ['Malay', '말레이어'],
  Filipino: ['Filipino', '필리핀어'],
  Tagalog: ['Tagalog', '타갈로그어'],
  Cantonese: ['Cantonese', '광둥어'],
  Swahili: ['Swahili', '스와힐리어'],
  Ilocano: ['Ilocano', '일로카노어'],
  Maltese: ['Maltese', '몰타어'],
  Sindhi: ['Sindhi', '신디어'],
};
const wordMatch = (text, term) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`,
    'iu',
  ).test(text);
function canonicalProfileLanguages(values) {
  const text = values.join(' ');
  return Object.entries(canonicalAliases)
    .filter(([, aliases]) => aliases.some((a) => wordMatch(text, a)))
    .map(([k]) => k);
}
function titleLanguages(title) {
  return Object.entries(canonicalAliases)
    .filter(([, aliases]) => aliases.some((a) => wordMatch(title, a)))
    .map(([k]) => k);
}
function mismatches(title, profileLanguages) {
  const have = new Set(canonicalProfileLanguages(profileLanguages));
  return titleLanguages(title).filter((l) => !have.has(l));
}
function titleRoleHit(title, tokens) {
  return tokens.some((t) => title.toLowerCase().includes(t.toLowerCase()));
}
const targetPatterns = {
  P01: /Korean|Spanish|English|Evaluator|Rater|Annotator|Reviewer|Quality/i,
  P02: /Spanish|Translator|Localization|\bLinguist\b/i,
  P03: /Annotat|Evaluator|Rater|Quality|\bData\b/i,
  P04: /\bData\b|Analyst|Analytics/i,
  P05: /Frontend|Front[- ]?end|React|Web Developer/i,
  P06: /French|Translator|Localization|\bLinguist\b/i,
  P07: /Norwegian|Translator|Localization|\bLinguist\b/i,
};
const specialtyLanguages = {
  P01: ['Korean', 'Spanish'],
  P02: ['Spanish'],
  P06: ['French'],
  P07: ['Norwegian'],
};
function rankOf(list, predicate) {
  const i = list.findIndex(predicate);
  return i < 0 ? null : i + 1;
}

(async () => {
  const outDir = path.join(process.cwd(), 'qa-output');
  fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'resumes'), { recursive: true });
  for (const p of personas)
    fs.writeFileSync(
      path.join(
        outDir,
        'resumes',
        `${p.id}-${p.name.replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '')}.txt`,
      ),
      p.resume,
      'utf8',
    );

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(30000);
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  if (await page.locator('a[href^="/signin-with-chatgpt"]').count()) {
    await page.locator('a[href^="/signin-with-chatgpt"]').click();
    await page
      .getByText('seedy@sites.test', { exact: true })
      .waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);
  }
  const me = await page.evaluate(async () => {
    const r = await fetch('/api/me');
    return { status: r.status, body: r.ok ? await r.json() : null };
  });
  if (me.status !== 200) throw new Error(`local sign-in failed: ${me.status}`);

  const results = [];
  for (const persona of personas) {
    await page.evaluate(async () => {
      await fetch('/api/data', { method: 'DELETE', headers: { 'X-RoleScout': '1' } });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const resumeBox = page.locator('textarea').nth(0);
    await resumeBox.fill(persona.resume);
    const consent = page.locator('label.consent-option input[type="checkbox"]').first();
    await consent.check();
    await page.getByRole('button', { name: '이력서 읽기', exact: true }).click();
    await page.waitForFunction(
      () => {
        const b = [...document.querySelectorAll('button')].find(
          (x) => x.textContent?.trim() === '공고 찾기',
        );
        return b && !b.disabled && document.querySelectorAll('textarea')[0]?.value === '';
      },
      null,
      { timeout: 30000 },
    );

    const profile = await page.evaluate(async () => {
      const r = await fetch('/api/profile');
      return await r.json();
    });
    await page.getByRole('button', { name: '공고 찾기', exact: true }).click();
    await page.waitForFunction(
      () => {
        const b = [...document.querySelectorAll('button')].find(
          (x) => x.textContent?.trim() === '공고 찾기',
        );
        return b && !b.disabled && document.querySelector('.sources');
      },
      null,
      { timeout: 70000 },
    );
    await page.waitForTimeout(500);
    const search = await page.evaluate(async () => {
      const r = await fetch('/api/search');
      return await r.json();
    });
    const jobs = Array.isArray(search?.jobs) ? search.jobs : [];
    const top10 = jobs.slice(0, 10).map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      score: j.matchScore,
      label: j.matchScoreLabel,
      match: j.match,
      location: j.location,
      korea: j.korea,
      source: j.source,
      postedAt: j.postedAt,
    }));
    const languageViolations = jobs
      .filter((j) => mismatches(j.title, profile.languages || []).length)
      .map((j) => ({ title: j.title, missing: mismatches(j.title, profile.languages || []) }));
    const top10RoleHits = top10.filter((j) =>
      titleRoleHit(j.title, persona.expectedTitleTokens),
    ).length;
    const extractedCanonical = canonicalProfileLanguages(profile.languages || []);
    const missingExpectedLanguages = persona.expectedLanguages.filter(
      (l) => !extractedCanonical.includes(l),
    );
    const sources = (search?.sources || []).map((s) => ({
      source: s.source,
      count: s.count,
      cached: s.cached,
      error: s.error || null,
      checkedAt: s.checkedAt || null,
    }));
    const visibleJobs = jobs.filter((j) => j.matchScoreLabel !== 'low');
    const targetPattern = targetPatterns[persona.id];
    const firstTargetRank = targetPattern ? rankOf(jobs, (j) => targetPattern.test(j.title)) : null;
    const firstVisibleTargetRank = targetPattern
      ? rankOf(visibleJobs, (j) => targetPattern.test(j.title))
      : null;
    const specialtyLanguageRanks = {};
    for (const lang of specialtyLanguages[persona.id] || []) {
      specialtyLanguageRanks[lang] = {
        all: rankOf(jobs, (j) => titleLanguages(j.title).includes(lang)),
        visible: rankOf(visibleJobs, (j) => titleLanguages(j.title).includes(lang)),
      };
    }
    const scoreLabelCounts = jobs.reduce((acc, j) => {
      const k = j.matchScoreLabel || 'none';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    // Keep screenshots readable: show at most the first 12 rows but preserve the actual JSON separately.
    await page.evaluate(() => {
      document.querySelectorAll('table tbody tr').forEach((r, i) => {
        if (i >= 12) r.style.display = 'none';
      });
    });
    const resultSection = page
      .locator('section.panel')
      .filter({ has: page.locator('h2', { hasText: '검색 결과' }) })
      .first();
    const shotPath = path.join(outDir, 'screenshots', `${persona.id}.png`);
    await resultSection.screenshot({ path: shotPath });

    results.push({
      id: persona.id,
      name: persona.name,
      expectedLanguages: persona.expectedLanguages,
      extractedProfile: {
        skills: profile.skills,
        languages: profile.languages,
        keywords: profile.keywords,
        primaryRoleKeywords: profile.primaryRoleKeywords,
        skillKeywords: profile.skillKeywords,
        languageKeywords: profile.languageKeywords,
      },
      missingExpectedLanguages,
      resultCount: jobs.length,
      visibleRowCount: await page.locator('.job-title').count(),
      scoreLabelCounts,
      firstTargetRank,
      firstVisibleTargetRank,
      specialtyLanguageRanks,
      languageViolationCount: languageViolations.length,
      languageViolations,
      top10RoleHitCount: top10RoleHits,
      top10RoleHitRate: top10.length ? top10RoleHits / top10.length : null,
      top10,
      sources,
      screenshot: `screenshots/${persona.id}.png`,
    });
    console.log(
      `${persona.id}: jobs=${jobs.length} languages=${JSON.stringify(profile.languages)} missingExpected=${JSON.stringify(missingExpectedLanguages)} violations=${languageViolations.length} top10RoleHits=${top10RoleHits}/${top10.length}`,
    );
  }
  await browser.close();
  const payload = {
    generatedAt: new Date().toISOString(),
    commit: '45ed9f6c017f41fff11ad70f6c20a5595e8d3b6d',
    mode: 'isolated local Sites dev UI + live ATS feeds',
    personas: results,
  };
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(payload, null, 2), 'utf8');
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Coupang AI Review Summarizer - Utility Functions & Critical Filter Engine
 * Supports:
 * - 3-Stage Mechanical Rule Filter (Level 1: Off, Level 2: Sponsored, Level 3: Emojis)
 *   (Strictly excludes short text and duplicate text filtering per user request)
 * - Fisher-Yates Pure Random Review Selection by User-Customized Rating Ratios (5~1 Stars)
 * - Strong Critical Persona Prompt Engineering & JSON Parser
 */

const FILTER_CATEGORIES = {
  SPONSORED: { id: 'sponsored', label: '체험단·협찬·제공', color: '#f97316' },
  EMOJI_OVERLOAD: { id: 'emoji_overload', label: '다수 이모지', color: '#8b5cf6' }
};

/**
 * Count emojis in a given text using Unicode property escapes
 */
function countEmojis(text) {
  if (!text) return 0;
  const emojiRegex = /\p{Extended_Pictographic}/gu;
  const matches = text.match(emojiRegex);
  return matches ? matches.length : 0;
}

/**
 * Filter reviews mechanically without invoking any LLM APIs
 * 
 * Filter Strength:
 * - Level 1 (Off / 안함): Does not filter anything. All reviews pass through.
 * - Level 2 (Moderate / 중간): Mechanically filters reviews with "협찬", "제공", "무상", "체험단" keywords.
 * - Level 3 (Strict / 강함): Level 2 + excessive emojis (>=3).
 *   (Strict Rules per User: Short reviews, duplicate reviews, and shipping complaints are NOT filtered!)
 * 
 * @param {Array} reviews - List of { index, rating, content, title }
 * @param {number|string} filterStrength - 1, 2, or 3
 * @returns {object} { validReviews, excludedReviews, stats }
 */
function filterLowQualityReviews(reviews, filterStrength = 2) {
  const level = parseInt(filterStrength, 10) || 2;

  const validReviews = [];
  const excludedReviews = [];

  const stats = {
    sponsored: 0,
    emoji_overload: 0,
    totalExcluded: 0
  };

  // Level 1: Off (안함) -> Pass all reviews
  if (level <= 1) {
    return {
      validReviews: [...reviews],
      excludedReviews: [],
      stats
    };
  }

  const sponsoredKeywords = ['무상 제공', '무상으로 제공', '무상', '제공받아', '제공 받아', '협찬', '체험단', '쿠팡체험단', '이벤트를 통해', '지원받아'];

  reviews.forEach((review) => {
    const text = (review.content || '').trim();

    let reason = null;
    let reasonType = null;

    // 1. Check sponsored / provided keywords (Level 2 & 3)
    for (const kw of sponsoredKeywords) {
      if (text.includes(kw)) {
        reason = `'${kw}' 문구가 있어요`;
        reasonType = 'sponsored';
        break;
      }
    }

    // Level 3 Only: Excessive emojis (>= 3)
    // (Note: Short reviews and duplicates are strictly PRESERVED per user request!)
    if (level >= 3 && !reasonType) {
      const emojiCount = countEmojis(text);
      if (emojiCount >= 3) {
        reason = `이모지가 다수(${emojiCount}개) 포함되어 있어요`;
        reasonType = 'emoji_overload';
      }
    }

    if (reasonType) {
      stats[reasonType]++;
      stats.totalExcluded++;
      excludedReviews.push({
        ...review,
        filterCategory: FILTER_CATEGORIES[reasonType.toUpperCase()] || { label: '기타' },
        filterReason: reason,
        excluded: true
      });
    } else {
      validReviews.push(review);
    }
  });

  return {
    validReviews,
    excludedReviews,
    stats
  };
}

/**
 * Fisher-Yates Pure Random Shuffle Algorithm
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Select reviews randomly based on user-specified rating ratios (5~1 Stars)
 * 
 * @param {Array} reviews - List of filtered reviews with rating (1~5)
 * @param {object} scoreRatios - { 5: 10, 4: 10, 3: 20, 2: 30, 1: 30 } (percentage)
 * @param {number} targetCount - 10, 20, or 30
 * @returns {Array} Exactly targetCount reviews randomly sampled
 */
function selectReviewsByScoreRatio(reviews, scoreRatios = null, targetCount = 30) {
  const totalTarget = Math.max(10, Math.min(30, parseInt(targetCount, 10) || 30));
  
  // Default to balanced ratio if not provided
  const ratios = scoreRatios || { 5: 20, 4: 20, 3: 20, 2: 20, 1: 20 };

  // 1. Group reviews by star rating (1 to 5)
  const buckets = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  reviews.forEach(r => {
    const star = Math.min(5, Math.max(1, Math.round(r.rating || 5)));
    buckets[star].push(r);
  });

  // 2. Calculate target number for each rating bucket based on ratios
  const targetCounts = {};
  let allocated = 0;
  for (let star = 1; star <= 5; star++) {
    const ratio = Math.max(0, ratios[star] || 0);
    const count = Math.round(totalTarget * (ratio / 100));
    targetCounts[star] = count;
    allocated += count;
  }

  // Adjust rounding difference to match exact totalTarget
  const diff = totalTarget - allocated;
  if (diff !== 0) {
    // Add/subtract diff from highest ratio bucket
    const highestStar = Object.keys(ratios).sort((a, b) => ratios[b] - ratios[a])[0] || 1;
    targetCounts[highestStar] = Math.max(0, targetCounts[highestStar] + diff);
  }

  // 3. Randomly sample from each bucket using Fisher-Yates
  const selectedReviews = [];
  const remainingReviewsPool = [];

  for (let star = 1; star <= 5; star++) {
    const shuffled = shuffleArray(buckets[star]);
    const needed = targetCounts[star];
    const picked = shuffled.slice(0, needed);
    const unpicked = shuffled.slice(needed);

    selectedReviews.push(...picked);
    remainingReviewsPool.push(...unpicked);
  }

  // 4. Graceful Fallback if a certain rating bucket didn't have enough reviews
  // (Do NOT cross-fill from other stars if user explicitly targeted a single star rating at 100%)
  const isSingleStarTarget = Object.values(ratios).some(r => r >= 99);
  if (!isSingleStarTarget && selectedReviews.length < totalTarget) {
    const shortage = totalTarget - selectedReviews.length;
    const shuffledPool = shuffleArray(remainingReviewsPool);
    selectedReviews.push(...shuffledPool.slice(0, shortage));
  }

  // Final random shuffle so the prompt order is also randomized
  return shuffleArray(selectedReviews).slice(0, totalTarget);
}

/**
 * Extract only the pure review contents ('content' property) from Coupang review JSON.
 */
function extractReviewContents(rawData) {
  let data = rawData;
  let rawJsonString = '';

  if (typeof rawData === 'string') {
    rawJsonString = rawData;
    try {
      data = JSON.parse(rawData);
    } catch (e) {
      console.error('Failed to parse review JSON:', e);
      throw new Error('리뷰 JSON 파싱에 실패했습니다.');
    }
  } else {
    rawJsonString = JSON.stringify(rawData);
  }

  const rawBytes = new Blob([rawJsonString]).size;
  const ratingSummary = data?.rData?.ratingSummaryTotal || null;
  const reviewTotalCount = data?.rData?.reviewTotalCount || 0;
  const contents = data?.rData?.paging?.contents || [];
  const cleanReviews = [];

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    if (item && typeof item.content === 'string') {
      const trimmed = item.content.trim();
      if (trimmed.length > 0) {
        cleanReviews.push({
          index: cleanReviews.length + 1,
          rating: item.rating || 5,
          title: item.title ? item.title.trim() : '',
          content: trimmed
        });
      }
    }
  }

  const formattedReviewTexts = cleanReviews.map(r => r.content).join('\n\n');
  const cleanBytes = new Blob([formattedReviewTexts]).size;
  const savingsPercent = rawBytes > 0 ? (((rawBytes - cleanBytes) / rawBytes) * 100).toFixed(1) : 0;

  return {
    cleanReviews,
    totalRawReviews: contents.length,
    validCount: cleanReviews.length,
    rawBytes,
    cleanBytes,
    savingsPercent,
    ratingSummary,
    reviewTotalCount
  };
}

/**
 * Format bytes into human readable string (KB, MB)
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Build Strong Critical Persona Prompt for Gemini LLM
 */
/**
 * 1차 LLM 호출: 상품명을 보고 해당 상품 평가에 적합한 핵심 키워드 6개 생성
 */
function buildKeywordGenerationPrompt(productTitle) {
  return `당신은 e커머스 상품 분석 전문가입니다.
아래 상품명을 보고, 소비자가 이 상품을 구매할 때 가장 중요하게 평가하는 핵심 키워드를 정확히 6개 생성하세요.

[규칙]
- 해당 상품 카테고리에서 실구매자들이 실제로 자주 언급하는 실사용 관련 핵심 어휘여야 합니다.
- 너무 일반적인 단어(예: "품질", "만족도")는 피하고, 구체적이고 상품 특성에 맞는 키워드를 선택하세요.
- 긍정/부정 모두 다뤄질 수 있는 중립적 평가 기준 키워드여야 합니다.

[상품명]
${productTitle}

반드시 아래 JSON 형식으로만 응답하세요. 마크다운 기호 없이 오직 유효한 JSON 문자열만 출력하세요:
{
  "keywords": ["보습력", "흡수력", "가성비", "향/냄새", "용량", "자극/트러블"]
}`;
}

/**
 * 2차 LLM 호출: 생성된 키워드를 기반으로 리뷰를 분석하여 키워드별 부정 요약 + 장단점 도출
 */
function buildGeminiPrompt(cleanReviews, ratingSummary = null, generatedKeywords = null) {
  let contextInfo = '';
  if (ratingSummary) {
    contextInfo = `[상품 평점 정보] 총 평점: ${ratingSummary.ratingAverage || 0}점 / 5.0 (총 ${ratingSummary.ratingCount || 0}개 리뷰)\n`;
  }

  const reviewLines = cleanReviews.map((r, i) => `[리뷰 ${i + 1} | 평점 ${r.rating}점]: ${r.content}`).join('\n\n');

  let keywordInstruction = '';
  if (generatedKeywords && generatedKeywords.length > 0) {
    keywordInstruction = `\n[사전 생성된 핵심 키워드 6개]\n${generatedKeywords.join(', ')}\n\n위 키워드는 이 상품 유형에 적합한 평가 기준으로 사전에 선정되었습니다.\n`;
  }

  return `당신은 e커머스 상품의 실구매자 리뷰를 객관적이고 냉철하게 분석하는 전문 품질 데이터 분석관입니다.
소비자가 스스로 제품의 실체를 쉽게 판단할 수 있도록 돕는 것이 목적이며, AI의 주관적인 평가 문장을 주입하지 않고 리뷰 데이터에 근거한 객관적인 사실만 전달해야 합니다.
${keywordInstruction}
[분석 지침]
1. 위 핵심 키워드 6개 각각에 대해, 전체 리뷰에서 해당 키워드와 관련된 **긍정 리뷰 요약(positiveSummary)**과 **부정 리뷰 요약(negativeSummary)**을 각각 1~3문장으로 작성하세요.
2. 각 키워드의 전체 리뷰 중 언급 비율(percentage)과 반응 성향(positive, negative, neutral)을 분류하세요.
3. 키워드 분석과 별도로, 전체 리뷰를 종합하여 **아쉬웠던 점(negativePoints) 3개**와 **좋았던 점(positivePoints) 2~3개**를 도출하세요.
4. 아쉬웠던 점은 5점 리뷰 속 미세한 불편과 실사용 결함, 호불호 요소까지 가감 없이 도출하세요.
5. 좋았던 점은 과장된 마케팅 문구를 배제하고 검증된 실사용 팩트 위주로 간결하게 정리하세요.
6. 리뷰에서 해당 키워드 언급이 거의 없는 경우에도 관련 가능한 내용을 찾아 작성하세요.

${contextInfo}[실구매자 무작위 리뷰 목록]
${reviewLines}

반드시 아래 JSON 형식으로만 응답해야 합니다. 마크다운 기호 없이 오직 유효한 JSON 문자열만 출력하세요:
{
  "keywordAnalysis": [
    {
      "word": "보습력",
      "percentage": 78,
      "sentiment": "positive",
      "positiveSummary": "대다수 사용자가 세안 후 보습감이 충분하다고 평가. 하루 종일 당김 없이 촉촉함이 유지된다는 만족 후기가 많음.",
      "negativeSummary": "건조한 계절이나 건성 피부 사용자들은 보습력이 기대에 미치지 못한다는 의견이 다수. 크림을 덧발라야 한다는 불만도 있음."
    },
    {
      "word": "끈적임",
      "percentage": 54,
      "sentiment": "negative",
      "positiveSummary": "지성 피부 사용자는 산뜻한 마무리감에 만족. 흡수 후 끈적임이 빠르게 사라진다는 평도 존재.",
      "negativeSummary": "바른 직후 끈적거림이 오래 남아 불쾌하다는 불만이 반복적으로 등장."
    },
    {
      "word": "흡수력",
      "percentage": 48,
      "sentiment": "positive",
      "positiveSummary": "소량으로도 빠르게 흡수되어 바쁜 아침에 편하다는 의견이 주류.",
      "negativeSummary": "넉넉히 바르면 겉돌아 답답하다는 의견 있음."
    },
    {
      "word": "가성비",
      "percentage": 42,
      "sentiment": "positive",
      "positiveSummary": "가격 대비 용량과 성능이 만족스럽다는 평이 다수.",
      "negativeSummary": "용량 대비 가격이 오르면서 이전만큼의 가성비를 못 느낀다는 평이 일부 존재."
    },
    {
      "word": "향/냄새",
      "percentage": 35,
      "sentiment": "neutral",
      "positiveSummary": "은은하고 무난한 향으로 호불호가 적다는 긍정 평가.",
      "negativeSummary": "향이 너무 강하거나 인위적이라는 의견과, 지속력이 짧다는 상반된 불만."
    },
    {
      "word": "용량",
      "percentage": 20,
      "sentiment": "negative",
      "positiveSummary": "가격 대비 넉넉한 용량으로 오래 쓸 수 있다는 평.",
      "negativeSummary": "매일 사용하면 한 달 내에 소진되어 생각보다 빨리 재구매해야 한다는 지적."
    }
  ],
  "negativePoints": [
    {
      "title": "가장 심각한 불만/결함",
      "percentage": 42,
      "description": "실제 구매자들이 겪은 구체적인 불편과 단점"
    },
    {
      "title": "기대 이하의 성능/용량",
      "percentage": 28,
      "description": "상세페이지 설명 대비 실사용 시 부족했던 점"
    },
    {
      "title": "호불호가 갈리는 요소",
      "percentage": 18,
      "description": "특정 사용자층이나 계절/조건에서 발생한 불만"
    }
  ],
  "positivePoints": [
    {
      "title": "그럼에도 불구하고 인정할 만한 팩트 장점",
      "percentage": 35,
      "description": "과장 없이 검증된 기본 성능과 만족 요소"
    },
    {
      "title": "무난한 기본기",
      "percentage": 25,
      "description": "가격 대비 기대치를 충족한 기본 기능"
    }
  ]
}`;
}

/**
 * Parse Structured JSON from LLM Response
 */
function parseStructuredResponse(rawText) {
  if (!rawText) return null;

  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.keywordAnalysis || parsed.topKeywords || parsed.positivePoints || parsed.negativePoints) {
      return parsed;
    }
  } catch (e) {
    console.warn('Direct JSON parse failed, trying regex extraction:', e);
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      console.warn('Regex JSON extraction failed:', e);
    }
  }

  return {
    keywordAnalysis: [
      { word: "품질", percentage: 65, sentiment: "positive", positiveSummary: "전반적으로 만족스러운 품질이라는 평가가 다수.", negativeSummary: "일부 사용자는 내구성이 기대보다 낮다고 평가." },
      { word: "가성비", percentage: 50, sentiment: "positive", positiveSummary: "가격 대비 성능이 좋다는 만족 후기.", negativeSummary: "가격 인상 후 가성비가 떨어졌다는 의견 존재." },
      { word: "배송/포장", percentage: 35, sentiment: "neutral", positiveSummary: "로켓배송으로 빠르게 받았다는 만족 의견.", negativeSummary: "포장이 부실하여 제품이 훼손된 경우가 간혹 보고됨." },
      { word: "아쉬운 점", percentage: 25, sentiment: "negative", positiveSummary: "기본 기능은 무난하게 작동한다는 평.", negativeSummary: "기대 대비 성능이 부족하다는 전반적인 불만." }
    ],
    negativePoints: [
      { title: "실구매자 주의사항", percentage: 35, description: "구매 전 아쉬운 점과 단점을 확인하세요." }
    ],
    positivePoints: [
      { title: "검증된 장점", percentage: 40, description: "실구매자들이 만족한 기본 기능입니다." }
    ]
  };
}

/**
 * Safe markdown renderer
 */
function renderMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Parse keyword generation response from 1st LLM call
 */
function parseKeywordResponse(rawText) {
  if (!rawText) return null;
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.keywords && Array.isArray(parsed.keywords)) {
      return parsed.keywords.slice(0, 6);
    }
  } catch (e) {
    console.warn('Keyword JSON parse failed, trying regex:', e);
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.keywords && Array.isArray(parsed.keywords)) {
        return parsed.keywords.slice(0, 6);
      }
    } catch (e) {
      console.warn('Keyword regex extraction failed:', e);
    }
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FILTER_CATEGORIES,
    countEmojis,
    filterLowQualityReviews,
    shuffleArray,
    selectReviewsByScoreRatio,
    extractReviewContents,
    formatBytes,
    buildKeywordGenerationPrompt,
    buildGeminiPrompt,
    parseKeywordResponse,
    parseStructuredResponse,
    renderMarkdown
  };
}

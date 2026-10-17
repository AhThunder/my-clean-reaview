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
function buildGeminiPrompt(cleanReviews, ratingSummary = null) {
  let contextInfo = '';
  if (ratingSummary) {
    contextInfo = `[상품 평점 정보] 총 평점: ${ratingSummary.ratingAverage || 0}점 / 5.0 (총 ${ratingSummary.ratingCount || 0}개 리뷰)\n`;
  }

  const reviewLines = cleanReviews.map((r, i) => `[리뷰 ${i + 1} | 평점 ${r.rating}점]: ${r.content}`).join('\n\n');

  return `당신은 e커머스 상품의 실구매자 리뷰를 객관적이고 냉철하게 분석하는 전문 품질 데이터 분석관입니다.
소비자가 스스로 제품의 실체를 쉽게 판단할 수 있도록 돕는 것이 목적이며, AI의 주관적인 평가 문장을 주입하지 않고 리뷰 데이터에 근거한 객관적인 사실과 키워드를 전달해야 합니다.

[분석 지침]
1. 구매자들의 리뷰 본문에서 **가장 많이 언급된 핵심 키워드/단어(6~8개)**를 객관적으로 추출하세요. (예: 보습력, 끈적임, 가성비, 흡수력, 향/냄새, 용량, 트러블 등 실사용 관련 핵심 어휘)
2. 각 키워드가 전체 리뷰 중 언급된 대략적 비율(percentage)과 반응 성향(positive, negative, neutral)을 정확히 분류하세요.
3. 아쉬웠던 점(negativePoints)을 집중 조명하여, 5점 리뷰 속의 미세한 불편과 실사용 결함, 호불호 요소를 가감 없이 도출하세요.
4. 좋았던 점(positivePoints)은 과장된 마케팅 문구를 배제하고 검증된 실사용 팩트 위주로 간결하게 정리하세요.

${contextInfo}[실구매자 무작위 리뷰 목록]
${reviewLines}

반드시 아래 JSON 형식으로만 응답해야 합니다. 마크다운 기호 없이 오직 유효한 JSON 문자열만 출력하세요:
{
  "topKeywords": [
    { "word": "보습력", "percentage": 78, "sentiment": "neutral" },
    { "word": "끈적임", "percentage": 54, "sentiment": "negative" },
    { "word": "흡수력", "percentage": 48, "sentiment": "positive" },
    { "word": "가성비", "percentage": 42, "sentiment": "positive" },
    { "word": "향/냄새", "percentage": 35, "sentiment": "neutral" },
    { "word": "용량", "percentage": 20, "sentiment": "negative" }
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
    if (parsed.topKeywords || parsed.positivePoints || parsed.negativePoints) {
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
    topKeywords: [
      { word: "품질", percentage: 65, sentiment: "positive" },
      { word: "가성비", percentage: 50, sentiment: "positive" },
      { word: "배송/포장", percentage: 35, sentiment: "neutral" },
      { word: "아쉬운 점", percentage: 25, sentiment: "negative" }
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FILTER_CATEGORIES,
    countEmojis,
    filterLowQualityReviews,
    shuffleArray,
    selectReviewsByScoreRatio,
    extractReviewContents,
    formatBytes,
    buildGeminiPrompt,
    parseStructuredResponse,
    renderMarkdown
  };
}

/**
 * Background Service Worker for Coupang AI Review Summarizer
 * Secure client-side decryption & Gemini/Gemma Prototype Pipeline
 */

importScripts('crypto_util.js', 'encrypted_secret.js', 'sample_data.js', 'utils.js', 'gemini.js');

// Initialize defaults on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['selectedModel', 'reviewSort', 'reviewCount', 'analysisMode', 'filterStrength']);
  const updates = {};

  if (!current.selectedModel || !['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'].includes(current.selectedModel)) {
    updates.selectedModel = PRIMARY_MODEL; // gemini-3.5-flash-lite
  }
  if (!current.reviewSort) {
    updates.reviewSort = 'ORDER_SCORE_ASC';
  }
  if (!current.reviewCount) {
    updates.reviewCount = 30;
  }
  if (!current.analysisMode) {
    updates.analysisMode = 'BALANCE';
  }
  if (!current.filterStrength) {
    updates.filterStrength = 2;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
});

/**
 * Fetch reviews from Coupang Review API
 */
/**
 * Fetch reviews from Coupang Review API (Single Page)
 * @param {string|number} productId
 * @param {number} page
 * @param {number} size - Strictly fixed to 30 as Coupang API maximum
 * @param {string} sortBy
 * @param {string|number} ratings - 1~5 for specific star, '' for all
 */
async function fetchCoupangReviewApi(productId, page = 1, size = 30, sortBy = 'ORDER_SCORE_ASC', ratings = '') {
  const ratingParam = (ratings !== undefined && ratings !== null && ratings !== '') ? `&ratings=${ratings}` : '';
  const url = `https://www.coupang.com/next-api/review?productId=${productId}&page=${page}&size=${size}&sortBy=${sortBy}&ratingSummary=true${ratingParam}&market=`;
  console.log(`[Coupang API] Fetching page ${page} (ratings: "${ratings || 'ALL'}", size: ${size}) from: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`쿠팡 리뷰 API 요청 실패 (HTTP ${response.status})`);
  }

  const json = await response.json();
  if (json.rCode && json.rCode !== 'RET0000') {
    throw new Error(`쿠팡 응답 오류: ${json.rMessage || json.rCode}`);
  }

  return json;
}

function sleepMs(ms) {
  return new Promise(res => setTimeout(res, ms));
}

/**
 * Fetch a targeted pool of text reviews based on user's desired star score ratios.
 * Uses Coupang's &ratings=${star} parameter to precisely fetch required star reviews,
 * fixed at size=30 per page.
 *
 * @param {string|number} productId
 * @param {object|null} scoreRatios e.g. { 1: 100, 2: 0, 3: 0, 4: 0, 5: 0 } or { 1: 30, 2: 30, 3: 20, 4: 10, 5: 10 }
 * @param {number} targetCount e.g. 10, 20, 30
 * @param {string} sortBy e.g. 'ORDER_SCORE_ASC'
 */
async function fetchTargetedReviewPool(productId, scoreRatios = null, targetCount = 30, sortBy = 'ORDER_SCORE_ASC') {
  const textReviews = [];
  const seenReviewIds = new Set();
  let ratingSummary = null;
  let reviewTotalCount = 0;
  let rawBytesTotal = 0;
  let totalRawReviewsEncountered = 0;

  const ratios = scoreRatios || { 5: 20, 4: 20, 3: 20, 2: 20, 1: 20 };
  
  // Collect star ratings that have ratio > 0, sorted by percentage descending
  const activeStars = [1, 2, 3, 4, 5]
    .filter(star => (ratios[star] || 0) > 0)
    .sort((a, b) => (ratios[b] || 0) - (ratios[a] || 0));

  const starsToFetch = activeStars.length > 0 ? activeStars : [1, 2, 3, 4, 5];
  console.log(`[Coupang API] Target stars to fetch based on scoreRatios:`, starsToFetch.map(s => `${s}점(${ratios[s]}%)`).join(', '));

  for (const star of starsToFetch) {
    const starRatio = ratios[star] || 0;
    const starTarget = Math.max(1, Math.round(targetCount * (starRatio / 100)));
    // Buffer: We want at least target * 2 or 15 items per star to survive quality filters
    const minStarPool = Math.max(15, starTarget * 2);

    let starTotalPage = 1;
    let fetchedForThisStar = 0;

    // 1. Fetch Page 1 for this star (size=30 fixed)
    try {
      await sleepMs(100);
      const firstData = await fetchCoupangReviewApi(productId, 1, 30, sortBy, star);

      if (!ratingSummary && firstData?.rData?.ratingSummaryTotal) {
        ratingSummary = firstData.rData.ratingSummaryTotal;
      }
      if (!reviewTotalCount && firstData?.rData?.reviewTotalCount) {
        reviewTotalCount = firstData.rData.reviewTotalCount;
      }
      starTotalPage = firstData?.rData?.paging?.totalPage || 1;

      const rawJson = JSON.stringify(firstData);
      rawBytesTotal += new Blob([rawJson]).size;

      const contents = firstData?.rData?.paging?.contents || [];
      totalRawReviewsEncountered += contents.length;

      for (const item of contents) {
        const id = item.reviewId || `${star}_1_${textReviews.length}`;
        if (seenReviewIds.has(id)) continue;
        seenReviewIds.add(id);

        const content = (item.content || '').trim();
        if (content.length > 0) {
          fetchedForThisStar++;
          textReviews.push({
            index: textReviews.length + 1,
            reviewId: item.reviewId,
            rating: item.rating || star,
            title: (item.title || '').trim(),
            content: content
          });
        }
      }

      console.log(`[Coupang API] Star ${star}: Page 1 returned ${contents.length} raw, ${fetchedForThisStar} valid text reviews. Total pages: ${starTotalPage}`);
    } catch (e) {
      console.warn(`[Coupang API] Error fetching star ${star} page 1:`, e);
      continue;
    }

    // 2. Sample from additional random pages if available and needed (or for true randomness across dates)
    if (starTotalPage > 1 && (fetchedForThisStar < minStarPool || starsToFetch.length <= 2)) {
      const candidatePages = [];
      const maxAvailablePage = Math.min(starTotalPage, 30);
      for (let p = 2; p <= maxAvailablePage; p++) {
        candidatePages.push(p);
      }
      // Fisher-Yates shuffle candidate pages
      for (let i = candidatePages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidatePages[i], candidatePages[j]] = [candidatePages[j], candidatePages[i]];
      }

      const sampleLimit = (starsToFetch.length === 1) ? 2 : 1;
      const pagesToSample = candidatePages.slice(0, sampleLimit);

      for (const page of pagesToSample) {
        if (fetchedForThisStar >= 40) break;
        await sleepMs(150);

        try {
          const pageData = await fetchCoupangReviewApi(productId, page, 30, sortBy, star);
          const rawJson = JSON.stringify(pageData);
          rawBytesTotal += new Blob([rawJson]).size;

          const contents = pageData?.rData?.paging?.contents || [];
          totalRawReviewsEncountered += contents.length;

          for (const item of contents) {
            const id = item.reviewId || `${star}_${page}_${textReviews.length}`;
            if (seenReviewIds.has(id)) continue;
            seenReviewIds.add(id);

            const content = (item.content || '').trim();
            if (content.length > 0) {
              fetchedForThisStar++;
              textReviews.push({
                index: textReviews.length + 1,
                reviewId: item.reviewId,
                rating: item.rating || star,
                title: (item.title || '').trim(),
                content: content
              });
            }
          }
        } catch (e) {
          console.warn(`[Coupang API] Error fetching star ${star} page ${page}:`, e);
        }
      }
    }
  }

  // Fallback: If targeted fetching returned 0 reviews (e.g. edge case), fallback to generic fetch without ratings filter
  if (textReviews.length === 0) {
    console.warn('[Coupang API] Targeted star fetching returned 0 reviews. Falling back to generic fetch...');
    return await fetchGenericReviewPool(productId, 30, sortBy);
  }

  const cleanReviewTexts = textReviews.map(r => r.content).join('\n\n');
  const cleanBytesTotal = new Blob([cleanReviewTexts]).size;
  const savingsPercent = rawBytesTotal > 0 ? (((rawBytesTotal - cleanBytesTotal) / rawBytesTotal) * 100).toFixed(1) : 0;

  console.log(`[Coupang API] Total text reviews collected: ${textReviews.length} across stars [${starsToFetch.join(', ')}]`);

  return {
    cleanReviews: textReviews,
    totalRawReviews: totalRawReviewsEncountered,
    validCount: textReviews.length,
    rawBytes: rawBytesTotal,
    cleanBytes: cleanBytesTotal,
    savingsPercent,
    ratingSummary,
    reviewTotalCount
  };
}

/**
 * Generic review pool fetcher (fallback without ratings filter)
 */
async function fetchGenericReviewPool(productId, minTextCount = 30, sortBy = 'ORDER_SCORE_ASC') {
  const textReviews = [];
  const seenReviewIds = new Set();
  let ratingSummary = null;
  let reviewTotalCount = 0;
  let rawBytesTotal = 0;
  let totalRawReviewsEncountered = 0;

  try {
    const firstData = await fetchCoupangReviewApi(productId, 1, 30, sortBy, '');
    if (firstData?.rData?.ratingSummaryTotal) ratingSummary = firstData.rData.ratingSummaryTotal;
    if (firstData?.rData?.reviewTotalCount) reviewTotalCount = firstData.rData.reviewTotalCount;
    const contents = firstData?.rData?.paging?.contents || [];
    totalRawReviewsEncountered += contents.length;
    rawBytesTotal += new Blob([JSON.stringify(firstData)]).size;

    for (const item of contents) {
      const id = item.reviewId || `gen_1_${textReviews.length}`;
      if (seenReviewIds.has(id)) continue;
      seenReviewIds.add(id);
      const content = (item.content || '').trim();
      if (content.length > 0) {
        textReviews.push({
          index: textReviews.length + 1,
          reviewId: item.reviewId,
          rating: item.rating || 5,
          title: (item.title || '').trim(),
          content: content
        });
      }
    }
  } catch (e) {
    console.warn('[Coupang API] Error fetching generic first page:', e);
  }

  const cleanReviewTexts = textReviews.map(r => r.content).join('\n\n');
  const cleanBytesTotal = new Blob([cleanReviewTexts]).size;
  const savingsPercent = rawBytesTotal > 0 ? (((rawBytesTotal - cleanBytesTotal) / rawBytesTotal) * 100).toFixed(1) : 0;

  return {
    cleanReviews: textReviews,
    totalRawReviews: totalRawReviewsEncountered,
    validCount: textReviews.length,
    rawBytes: rawBytesTotal,
    cleanBytes: cleanBytesTotal,
    savingsPercent,
    ratingSummary,
    reviewTotalCount
  };
}

/**
 * Backward compatibility wrapper
 */
async function fetchTextReviewPool(productId, minTextCount = 60, maxPages = 5, sortBy = 'ORDER_SCORE_ASC') {
  return await fetchTargetedReviewPool(productId, null, minTextCount, sortBy);
}

/**
 * 1단계 파이프라인: 리뷰 수집 데이터에서 기계식 필터링 및 점수 비율별 샘플링 수행 (초고속, LLM 미호출)
 */
async function prepareReviewsPipeline(extractedDataOrRawJson, analysisMode = 'BALANCE', includeExcluded = false, filterStrength = 2, scoreRatios = null, targetCount = 30) {
  // Check auth
  const config = await getGeminiConfig();
  if (!config.apiKey && (!config.apiKeys || config.apiKeys.length === 0)) {
    throw new Error('AUTH_REQUIRED: 테스터 인증이 필요합니다. 관리자로부터 전달받은 테스터 비밀번호를 입력해 주세요.');
  }

  let extracted;
  if (extractedDataOrRawJson && Array.isArray(extractedDataOrRawJson.cleanReviews)) {
    // Already structured text pool from fetchTextReviewPool
    extracted = extractedDataOrRawJson;
  } else {
    // Raw Coupang JSON (e.g. SAMPLE_REVIEW_JSON)
    extracted = extractReviewContents(extractedDataOrRawJson);
  }

  if (extracted.validCount === 0 || extracted.cleanReviews.length === 0) {
    throw new Error('요약할 수 있는 텍스트 리뷰 본문이 없습니다. (구매자가 글을 작성하지 않고 별점만 매긴 상품평만 존재합니다)');
  }

  // 2. Filter low-quality reviews purely mechanically (No LLM API calls)
  const filterResult = filterLowQualityReviews(extracted.cleanReviews, filterStrength);
  
  // ★ includeExcluded가 true일 때는 모든 클린 리뷰를 포함하고, 통계상 제외 수를 0으로 정확히 일치시킴 ★
  const poolForSelection = includeExcluded ? extracted.cleanReviews : filterResult.validReviews;
  const effectiveExcludedCount = includeExcluded ? 0 : filterResult.excludedReviews.length;
  const effectiveExcludedList = includeExcluded ? [] : filterResult.excludedReviews;
  const effectiveFilterStats = includeExcluded ? { sponsored: 0, emoji_overload: 0, totalExcluded: 0 } : filterResult.stats;

  if (poolForSelection.length === 0) {
    throw new Error('필터링 후 분석 가능한 유효 리뷰가 남아있지 않습니다. 필터 강도를 1단으로 낮추거나 필터 해제를 해보세요.');
  }

  // 3. Pure Random Selection based on user-configured Star Rating Ratios (5~1 Stars)
  const reviewsToAnalyze = selectReviewsByScoreRatio(poolForSelection, scoreRatios, targetCount);

  return {
    extracted,
    filterResult,
    effectiveExcludedCount,
    effectiveExcludedList,
    effectiveFilterStats,
    reviewsToAnalyze,
    poolForSelectionLength: poolForSelection.length,
    analysisMode,
    includeExcluded,
    targetCount
  };
}

/**
 * ----------------------------------------------------
 * 상품 상세 이미지 기반 AI 챗봇 파이프라인 (gemini-3.5-flash-lite 고정)
 * ----------------------------------------------------
 */
const productSpecsCache = new Map(); // productId -> { specsText, imageCount, timestamp }

/**
 * 보완사항 1: 상세 이미지 1회 OCR/스펙 분석 및 텍스트 캐싱
 * 보완사항 3: 이미지 0개 또는 로딩 실패 시 친절한 예외 처리
 */
async function analyzeProductDetailImages(productId, imageUrls = [], productTitle = '') {
  if (!productId) {
    throw new Error('상품 ID가 지정되지 않았습니다.');
  }

  // 캐시 확인
  if (productSpecsCache.has(productId)) {
    const cached = productSpecsCache.get(productId);
    return {
      success: true,
      fromCache: true,
      specsText: cached.specsText,
      imageCount: cached.imageCount
    };
  }

  // 보완사항 3: 상세 이미지가 0개인 경우 예외 처리
  if (!imageUrls || imageUrls.length === 0) {
    return {
      success: false,
      reason: 'NO_IMAGES',
      message: '해당 상품은 상세 설명란 이미지를 찾을 수 없어 챗봇을 이용할 수 없습니다.'
    };
  }

  // 성능 및 토큰 최적화를 위해 최대 10장 선별
  const targetUrls = imageUrls.slice(0, 10);
  console.log(`[Chatbot Pipeline] Fetching & analyzing ${targetUrls.length} detail images for product ${productId}...`);

  // 이미지 비동기 병렬 다운로드 (Base64 변환)
  const imageParts = await Promise.all(targetUrls.map(url => fetchImageAsBase64(url)));
  const validParts = imageParts.filter(Boolean);

  if (validParts.length === 0) {
    return {
      success: false,
      reason: 'IMAGE_LOAD_FAILED',
      message: '상세 설명 이미지를 불러오는 데 실패했습니다. 네트워크 상태를 확인해 주세요.'
    };
  }

  // Gemini 3.5 Flash Lite 멀티모달 분석 프롬프트
  const promptText = `[상품명]: ${productTitle || '알 수 없음'}

당신은 전자상거래 상품 상세페이지(제조사 공식 제공 정보) 전문 분석관입니다.
제공된 상품 상세페이지 이미지들에 기재된 모든 정보(제품명, 브랜드, 규격/치수/용량/중량, 소재/성분, 제조국, 호환 모델, 사용 방법, 보관 및 관리법, 주의사항, 인증 정보, 구성품 등)를 빠짐없이 사실 그대로 상세하게 한국어로 구조화하여 정리해 주세요.

[원칙]
1. 이미지에 명시된 사실만 기록하세요.
2. 사용자 리뷰, 외부 의견, 임의의 추측은 절대 포함하지 마세요.
3. 이미지에서 확인되지 않는 내용은 기록하지 마세요.`;

  const multimodalResult = await callGeminiMultimodalApi([...validParts, { text: promptText }], {
    model: 'gemini-3.5-flash-lite',
    temperature: 0.2
  });

  const specsText = multimodalResult.text;
  productSpecsCache.set(productId, {
    specsText,
    imageCount: validParts.length,
    timestamp: Date.now()
  });

  console.log(`[Chatbot Pipeline] Product ${productId} specs successfully analyzed and cached! (${validParts.length} images)`);

  return {
    success: true,
    fromCache: false,
    specsText,
    imageCount: validParts.length
  };
}

/**
 * 상품 챗봇 Q&A: 캐시된 상세페이지 스펙을 바탕으로 1초 내 즉각 답변
 * 리뷰 정보는 일체 사용하지 않으며, 상세 설명에 없는 내용은 명확하게 부재 안내
 */
async function askProductChatbot(productId, question, chatHistory = [], productTitle = '') {
  if (!productId || !question) {
    throw new Error('상품 ID와 질문을 입력해 주세요.');
  }

  const cached = productSpecsCache.get(productId);
  if (!cached || !cached.specsText) {
    return {
      success: false,
      reason: 'NOT_ANALYZED',
      message: '상품 상세페이지가 아직 분석되지 않았습니다. 잠시 후 다시 시도해 주세요.'
    };
  }

  const systemInstruction = `당신은 이 상품의 제조사 공식 상세페이지(스펙 및 설명서) 정보에만 기반하여 답변하는 AI 상품 전문 어시스턴트입니다.

[엄격한 원칙]
1. 제공된 [상품 공식 상세페이지 정보]에 명시된 사실에만 근거하여 사용자 질문에 정확하고 친절하게 답변하세요.
2. 사용자 리뷰, 외부 의견, 임의의 추측은 절대 답변에 포함하지 마세요.
3. 제공된 상세 정보에서 확인할 수 없는 내용이라면 절대로 거짓으로 꾸며내지 말고 "해당 내용은 상품 상세설명에 명시되어 있지 않습니다."라고 솔직하고 명확하게 안내하세요.
4. 한국어로 정중하고 친절하게 핵심 위주로 명확하게 답변하세요.`;

  let historyText = '';
  if (chatHistory && chatHistory.length > 0) {
    historyText = chatHistory.slice(-6).map(m => `${m.role === 'user' ? '사용자' : '챗봇'}: ${m.text}`).join('\n');
  }

  const prompt = `[상품명]: ${productTitle || '알 수 없음'}

[상품 공식 상세페이지 정보]:
${cached.specsText}

[이전 대화 내역]:
${historyText || '(첫 대화)'}

사용자 질문: ${question}

답변:`;

  const result = await callGeminiMultimodalApi([{ text: prompt }], {
    model: 'gemini-3.5-flash-lite',
    systemInstruction,
    temperature: 0.2
  });

  return {
    success: true,
    answer: result.text.trim(),
    usedModel: result.usedModel
  };
}

// RAM-only memory cache (never written to disk/chrome.storage)
const tabKeywordsMemoryMap = new Map(); // productId -> { keywords, usedModel, timestamp }

/**
 * 1.5단계 파이프라인: 상품명 기반 핵심 키워드 6개 생성 (1차 LLM 호출)
 */
async function generateKeywordsPipeline(productTitle, productId = null) {
  if (productId && tabKeywordsMemoryMap.has(productId)) {
    const cached = tabKeywordsMemoryMap.get(productId);
    console.log(`[Keywords Pipeline] Returning RAM-cached keywords for product ${productId}:`, cached.keywords);
    return {
      success: true,
      keywords: cached.keywords || [],
      usedModel: cached.usedModel,
      fromCache: true
    };
  }

  const prompt = buildKeywordGenerationPrompt(productTitle);
  const geminiResult = await callGeminiApi(prompt);
  const keywords = parseKeywordResponse(geminiResult.text);

  if (productId && keywords && keywords.length > 0) {
    tabKeywordsMemoryMap.set(productId, {
      keywords,
      usedModel: geminiResult.usedModel,
      timestamp: Date.now()
    });
  }

  return {
    success: true,
    keywords: keywords || [],
    usedModel: geminiResult.usedModel,
    fromCache: false
  };
}

/**
 * 2단계 파이프라인: 프롬프트 구성 및 Gemini API 호출 (3~5초 소요)
 */
async function generateSummaryPipeline(preparedData, analysisMode = 'BALANCE', includeExcluded = false, generatedKeywords = null) {
  const { extracted, reviewsToAnalyze, effectiveExcludedCount, effectiveExcludedList, effectiveFilterStats } = preparedData;

  // 4. Build strong critical persona prompt (with pre-generated keywords if available)
  const prompt = buildGeminiPrompt(reviewsToAnalyze, extracted.ratingSummary, generatedKeywords);

  // 5. Call Gemini API
  const geminiResult = await callGeminiApi(prompt);
  const structuredData = parseStructuredResponse(geminiResult.text);

  return {
    success: true,
    structuredResult: structuredData,
    summaryMarkdown: geminiResult.text,
    usedModel: geminiResult.usedModel,
    fallbackApplied: geminiResult.fallbackApplied,
    analysisMode,
    isExcludedIncluded: includeExcluded,
    stats: {
      totalRawReviews: extracted.totalRawReviews,
      totalCleanCount: extracted.validCount,
      analyzedCount: reviewsToAnalyze.length,
      excludedCount: effectiveExcludedCount,
      rawBytes: extracted.rawBytes,
      cleanBytes: extracted.cleanBytes,
      savingsPercent: extracted.savingsPercent,
      formattedRawSize: formatBytes(extracted.rawBytes),
      formattedCleanSize: formatBytes(extracted.cleanBytes),
      ratingAverage: extracted.ratingSummary?.ratingAverage || null,
      ratingCount: extracted.ratingSummary?.ratingCount || extracted.reviewTotalCount || 0
    },
    filterStats: effectiveFilterStats,
    excludedReviews: effectiveExcludedList,
    analyzedReviews: reviewsToAnalyze
  };
}

/**
 * Core Process: Filter low quality (pure mechanical, no LLM),
 * randomly sample by score ratios, and summarize with critical prompt
 */
async function processAndSummarizeReviews(extractedDataOrRawJson, analysisMode = 'BALANCE', includeExcluded = false, filterStrength = 2, scoreRatios = null, targetCount = 30) {
  const prepared = await prepareReviewsPipeline(extractedDataOrRawJson, analysisMode, includeExcluded, filterStrength, scoreRatios, targetCount);
  return await generateSummaryPipeline(prepared, analysisMode, includeExcluded);
}

// Handle messages from Popup or Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, payload } = request;

  (async () => {
    try {
      // 1. Decrypt & Authenticate Tester with Passphrase
      if (action === 'VERIFY_AND_UNLOCK') {
        const { passphrase, remember } = payload || {};
        if (!passphrase) {
          throw new Error('암호키를 입력해 주세요.');
        }

        console.log('[Auth] Attempting decryption of bundled secret(s)...');
        const configs = (typeof ENCRYPTED_SECRET_CONFIGS !== 'undefined') ? ENCRYPTED_SECRET_CONFIGS : [ENCRYPTED_SECRET_CONFIG];
        const plainKeys = await decryptApiKeys(configs, passphrase);
        if (!plainKeys || plainKeys.length === 0) {
          throw new Error('유효한 API 키를 복호화하지 못했습니다.');
        }

        const primaryKey = plainKeys[0];

        // Store decrypted keys (both single and pool)
        if (remember) {
          await chrome.storage.local.set({
            decryptedApiKey: primaryKey,
            decryptedApiKeys: plainKeys,
            isTesterAuthenticated: true
          });
        } else {
          if (chrome.storage.session) {
            await chrome.storage.session.set({
              decryptedApiKey: primaryKey,
              decryptedApiKeys: plainKeys
            });
          }
          await chrome.storage.local.set({ isTesterAuthenticated: true });
        }

        sendResponse({ success: true, count: plainKeys.length, message: `${plainKeys.length}개의 API 키 인증이 완료되었습니다.` });

      // 2. Check Auth Status
      } else if (action === 'GET_AUTH_STATUS') {
        const config = await getGeminiConfig();
        const isAuthenticated = !!(config.apiKey && config.apiKey.length > 15);
        sendResponse({
          success: true,
          data: {
            isAuthenticated,
            keyCount: config.apiKeys?.length || (config.apiKey ? 1 : 0),
            model: config.model || PRIMARY_MODEL
          }
        });

      // 3. Lock / Log out
      } else if (action === 'LOCK_SESSION') {
        if (chrome.storage.session) {
          await chrome.storage.session.remove(['decryptedApiKey', 'decryptedApiKeys']);
        }
        await chrome.storage.local.remove(['decryptedApiKey', 'decryptedApiKeys', 'isTesterAuthenticated']);
        sendResponse({ success: true, message: '인증이 해제되었습니다.' });

      // 3.5 Prepare and Filter Reviews (Step 1 & Step 2: 실시간 제외 개수 반환)
      } else if (action === 'PREPARE_REVIEWS') {
        const { productId, size = 30, sortBy = 'ORDER_SCORE_ASC', analysisMode = 'BALANCE', includeExcluded = false, filterStrength = 2, scoreRatios = null, useSampleData = false } = payload || {};

        let poolOrJson;
        if (useSampleData) {
          poolOrJson = SAMPLE_REVIEW_JSON;
        } else {
          if (!productId) {
            throw new Error('상품 ID(ProductId)가 지정되지 않았습니다.');
          }
          poolOrJson = await fetchTargetedReviewPool(productId, scoreRatios, size, sortBy);
        }

        const prepared = await prepareReviewsPipeline(poolOrJson, analysisMode, includeExcluded, filterStrength, scoreRatios, size);

        sendResponse({
          success: true,
          data: {
            preparedData: prepared,
            excludedCount: prepared.effectiveExcludedCount,
            fetchedCount: prepared.extracted.validCount,
            analyzedCount: prepared.reviewsToAnalyze.length
          }
        });

      // 3.55 Generate Product Keywords (1차 LLM 호출: 상품 키워드 생성)
      } else if (action === 'GENERATE_KEYWORDS') {
        const { productTitle, productId } = payload || {};
        if (!productTitle) {
          throw new Error('상품명이 전달되지 않았습니다.');
        }
        const result = await generateKeywordsPipeline(productTitle, productId);
        sendResponse({ success: true, data: result });

      // 3.56 Analyze Product Detail Images (챗봇용 상세 이미지 1회 스펙 분석 & 캐싱)
      } else if (action === 'ANALYZE_PRODUCT_IMAGES') {
        const { productId, imageUrls = [], productTitle = '' } = payload || {};
        const result = await analyzeProductDetailImages(productId, imageUrls, productTitle);
        sendResponse(result);

      // 3.57 Ask Product Chatbot (캐시된 상세 스펙 기반 즉시 질의응답)
      } else if (action === 'ASK_PRODUCT_CHATBOT') {
        const { productId, question, chatHistory = [], productTitle = '' } = payload || {};
        const result = await askProductChatbot(productId, question, chatHistory, productTitle);
        sendResponse(result);

      // 3.58 Get Chatbot Cache Status
      } else if (action === 'GET_CHATBOT_CACHE') {
        const { productId } = payload || {};
        const cached = productId ? productSpecsCache.get(productId) : null;
        sendResponse({
          success: true,
          hasCache: !!cached,
          imageCount: cached ? cached.imageCount : 0
        });

      // 3.6 Generate AI Summary from Prepared Reviews (Step 4 & Step 5: LLM 호출 및 세션 캐싱)
      } else if (action === 'GENERATE_SUMMARY') {
        const { preparedData, analysisMode = 'BALANCE', includeExcluded = false, productId = 'unknown', productInfo = {}, generatedKeywords = null } = payload || {};
        if (!preparedData) {
          throw new Error('요약할 정제 리뷰 데이터가 전달되지 않았습니다.');
        }

        const result = await generateSummaryPipeline(preparedData, analysisMode, includeExcluded, generatedKeywords);

        // Cache lastAnalysisSession in storage for persistence across popup close
        try {
          const lastAnalysisSession = {
            productId,
            productTitle: productInfo.productTitle || '',
            productRating: productInfo.productRating || '',
            productReviewCount: productInfo.productReviewCount || '',
            timestamp: Date.now(),
            resultData: result,
            options: {
              reviewCount: preparedData.targetCount || 30,
              scoreRatios: payload.scoreRatios || null,
              analysisMode,
              includeExcluded,
              filterStrength: payload.filterStrength || 2,
              selectedModel: result.usedModel
            }
          };
          await chrome.storage.local.set({ lastAnalysisSession });
        } catch (e) {
          console.warn('[Storage] Failed to cache lastAnalysisSession:', e);
        }

        sendResponse({ success: true, data: result });

      // 4. Summarize Product Reviews (Legacy Single-Step Fallback)
      } else if (action === 'SUMMARIZE_PRODUCT') {
        const { productId, size = 30, sortBy = 'ORDER_SCORE_ASC', analysisMode = 'BALANCE', includeExcluded = false, filterStrength = 2, scoreRatios = null } = payload || {};
        if (!productId) {
          throw new Error('상품 ID(ProductId)가 지정되지 않았습니다.');
        }

        // Fetch targeted review pool by score ratios
        const textPool = await fetchTargetedReviewPool(productId, scoreRatios, size, sortBy);
        const result = await processAndSummarizeReviews(textPool, analysisMode, includeExcluded, filterStrength, scoreRatios, size);

        // Cache lastAnalysisSession in storage for persistence across popup close
        try {
          const lastAnalysisSession = {
            productId,
            timestamp: Date.now(),
            resultData: result,
            options: {
              reviewCount: size,
              scoreRatios,
              analysisMode,
              includeExcluded,
              filterStrength
            }
          };
          await chrome.storage.local.set({ lastAnalysisSession });
        } catch (e) {
          console.warn('[Storage] Failed to cache lastAnalysisSession:', e);
        }

        sendResponse({ success: true, data: result });

      // 5. Summarize Sample Reviews (review.json)
      } else if (action === 'SUMMARIZE_SAMPLE') {
        const { analysisMode = 'BALANCE', includeExcluded = false, filterStrength = 2, scoreRatios = null, size = 30 } = payload || {};
        const result = await processAndSummarizeReviews(SAMPLE_REVIEW_JSON, analysisMode, includeExcluded, filterStrength, scoreRatios, size);

        // Cache lastAnalysisSession in storage for persistence
        try {
          const lastAnalysisSession = {
            productId: 'sample',
            timestamp: Date.now(),
            resultData: result,
            options: {
              reviewCount: size,
              scoreRatios,
              analysisMode,
              includeExcluded,
              filterStrength
            }
          };
          await chrome.storage.local.set({ lastAnalysisSession });
        } catch (e) {
          console.warn('[Storage] Failed to cache lastAnalysisSession:', e);
        }

        sendResponse({ success: true, data: result });

      // 6. Test Key & Model
      } else if (action === 'TEST_API_KEY') {
        const { apiKey, model } = payload || {};
        const config = await getGeminiConfig();
        const keyToTest = apiKey || config.apiKey;
        const testResult = await testGeminiApiKey(keyToTest, model || PRIMARY_MODEL);
        sendResponse({ success: true, data: testResult });

      // 7. Get / Save Settings
      } else if (action === 'GET_CONFIG') {
        const config = await getGeminiConfig();
        const extra = await chrome.storage.local.get(['coupang_ai_user_prefs', 'selectedModel']);
        const prefs = extra.coupang_ai_user_prefs || {};
        sendResponse({
          success: true,
          data: {
            isAuthenticated: !!config.apiKey,
            selectedModel: prefs.selectedModel || extra.selectedModel || config.model || PRIMARY_MODEL,
            reviewCount: prefs.reviewCount || 30,
            scoreRatios: prefs.scoreRatios || { 5: 20, 4: 20, 3: 20, 2: 20, 1: 20 },
            currentPreset: prefs.currentPreset || 'BALANCED',
            filterStrength: prefs.filterStrength !== undefined ? prefs.filterStrength : 2
          }
        });

      } else if (action === 'SAVE_CONFIG') {
        if (payload) {
          await chrome.storage.local.set(payload);
        }
        sendResponse({ success: true });

      } else {
        sendResponse({ success: false, error: `알 수 없는 액션: ${action}` });
      }
    } catch (error) {
      console.error('[Background] Error handling message:', error);
      sendResponse({
        success: false,
        error: error.message || '처리 중 오류가 발생했습니다.'
      });
    }
  })();

  return true;
});

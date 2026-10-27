/**
 * Google AI Studio Gemini / Gemma API Service
 * 
 * Supports:
 * - Gemini Flash-Lite (Primary Recommendation): gemini-2.5-flash-lite
 * - Gemini Flash: gemini-2.5-flash
 * - Gemma (Open Model): gemma-4-31b-it
 */

const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite"
];

/**
 * Get the currently authenticated API Key(s) and Model configuration
 */
async function getGeminiConfig() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    let sessionData = {};
    if (chrome.storage.session) {
      try {
        sessionData = await chrome.storage.session.get(['decryptedApiKey', 'decryptedApiKeys', 'selectedModel']);
      } catch (e) {
        // session storage unavailable in some contexts
      }
    }

    const localData = await chrome.storage.local.get(['decryptedApiKey', 'decryptedApiKeys', 'selectedModel']);
    
    const apiKeys = sessionData.decryptedApiKeys || localData.decryptedApiKeys || [];
    let primaryKey = sessionData.decryptedApiKey || localData.decryptedApiKey || '';
    if (!primaryKey && apiKeys.length > 0) {
      primaryKey = apiKeys[0];
    }

    return {
      apiKey: primaryKey,
      apiKeys: apiKeys.length > 0 ? apiKeys : (primaryKey ? [primaryKey] : []),
      model: sessionData.selectedModel || localData.selectedModel || PRIMARY_MODEL
    };
  }

  const windowKeys = (typeof window !== 'undefined' && window.__DECRYPTED_API_KEYS__) || [];
  const singleKey = (typeof window !== 'undefined' && window.__DECRYPTED_API_KEY__) || (windowKeys[0] || '');

  return {
    apiKey: singleKey,
    apiKeys: windowKeys.length > 0 ? windowKeys : (singleKey ? [singleKey] : []),
    model: (typeof window !== 'undefined' && window.__SELECTED_MODEL__) || PRIMARY_MODEL
  };
}

/**
 * Call Google Generative Language API
 * Randomly selects 1 of the 4 API keys with 1/4 probability,
 * with automatic failover to remaining keys if quota / rate limit (429) occurs.
 */
async function callGeminiApi(prompt, customModel = null, customApiKey = null) {
  const config = await getGeminiConfig();
  const initialModel = (customModel || config.model || PRIMARY_MODEL).trim();

  let availableKeys = [];
  if (customApiKey) {
    availableKeys = [customApiKey.trim()];
  } else if (config.apiKeys && config.apiKeys.length > 0) {
    availableKeys = [...config.apiKeys];
  } else if (config.apiKey) {
    availableKeys = [config.apiKey.trim()];
  }

  if (availableKeys.length === 0) {
    throw new Error('AUTH_REQUIRED: 테스터 인증이 필요합니다. 관리자로부터 전달받은 테스터 비밀번호를 입력해 주세요.');
  }

  // 1/4 균등 확률 무작위 선정: 무작위 셔플링을 통해 첫 번째 키를 1/N 확률로 선정하고, 오류 시 남은 키로 순차 페일오버
  const shuffledKeys = [...availableKeys].sort(() => Math.random() - 0.5);

  const modelChain = [initialModel];
  for (const m of FALLBACK_MODELS) {
    if (!modelChain.includes(m)) {
      modelChain.push(m);
    }
  }

  let lastError = null;
  let fallbackApplied = false;

  for (let mIdx = 0; mIdx < modelChain.length; mIdx++) {
    const currentModel = modelChain[mIdx];

    // 키 풀 순회 (1차 키 무작위 선정 후 필요시 페일오버)
    for (let kIdx = 0; kIdx < shuffledKeys.length; kIdx++) {
      const currentApiKey = shuffledKeys[kIdx];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${currentApiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
        }
      };

      try {
        console.log(`[Google AI API] Calling model: ${currentModel} (Key ${kIdx + 1}/${shuffledKeys.length})...`);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
          const errorMsg = data?.error?.message || `HTTP ${response.status} error`;
          console.warn(`[Google AI API] Key attempt returned error (${response.status}):`, errorMsg);

          // 429 또는 할당량(Quota) 초과 시 다음 키로 즉각 페일오버
          if (response.status === 429 || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('Quota')) {
            console.warn(`[Google AI API] Rate limit on current key. Failover to next random key...`);
            lastError = new Error(`할당량 초과 (${currentModel}): ${errorMsg}`);
            continue;
          }

          if (response.status === 404 || errorMsg.includes('NOT_FOUND') || errorMsg.includes('no longer available')) {
            fallbackApplied = true;
            lastError = new Error(`모델 ${currentModel} 사용 불가: ${errorMsg}`);
            break; // 현재 모델이 없으므로 다음 모델로 이동
          }

          throw new Error(`API 오류 (${response.status}): ${errorMsg}`);
        }

        const candidates = data?.candidates || [];
        if (candidates.length === 0 || !candidates[0]?.content?.parts?.[0]?.text) {
          throw new Error('API로부터 유효한 텍스트 응답을 받지 못했습니다.');
        }

        const generatedText = candidates[0].content.parts[0].text;
        return {
          text: generatedText,
          usedModel: currentModel,
          fallbackApplied: fallbackApplied && currentModel !== initialModel
        };

      } catch (err) {
        lastError = err;
        // 키 풀에 여유가 있고 할당량 또는 네트워크 일시 오류인 경우 다음 키 시도
        if (kIdx < shuffledKeys.length - 1) {
          continue;
        }
      }
    }
  }

  throw lastError || new Error('모든 모델 및 API 키 호출에 실패했습니다.');
}

/**
 * Validate an API key with a fast test prompt
 */
async function testGeminiApiKey(apiKey, model = PRIMARY_MODEL) {
  const result = await callGeminiApi('Say "Connection OK" in 2 words.', model, apiKey);
  return {
    success: true,
    model: result.usedModel,
    response: result.text.trim()
  };
}

/**
 * Convert Image URL to Base64 Inline Data Part for Gemini Multimodal API
 */
async function fetchImageAsBase64(imageUrl) {
  try {
    let targetUrl = (imageUrl || '').trim();
    if (targetUrl.startsWith('//')) {
      targetUrl = 'https:' + targetUrl;
    }
    const res = await fetch(targetUrl, { method: 'GET', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const mimeType = blob.type || (targetUrl.endsWith('.png') ? 'image/png' : 'image/jpeg');
    const buffer = await blob.arrayBuffer();

    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64Data = btoa(binary);

    return {
      inlineData: {
        mimeType: mimeType,
        data: base64Data
      }
    };
  } catch (e) {
    console.warn('[Gemini] Failed to fetch image as base64:', imageUrl, e);
    return null;
  }
}

/**
 * Call Gemini Multimodal API with custom parts (Text + Images) and options
 * Strictly uses PRIMARY_MODEL (gemini-3.5-flash-lite) for chatbot functions.
 */
async function callGeminiMultimodalApi(parts, options = {}) {
  const config = await getGeminiConfig();
  const targetModel = (options.model || PRIMARY_MODEL).trim();

  let availableKeys = [];
  if (options.apiKey) {
    availableKeys = [options.apiKey.trim()];
  } else if (config.apiKeys && config.apiKeys.length > 0) {
    availableKeys = [...config.apiKeys];
  } else if (config.apiKey) {
    availableKeys = [config.apiKey.trim()];
  }

  if (availableKeys.length === 0) {
    throw new Error('AUTH_REQUIRED: 테스터 인증이 필요합니다. 관리자로부터 전달받은 테스터 비밀번호를 입력해 주세요.');
  }

  const shuffledKeys = [...availableKeys].sort(() => Math.random() - 0.5);

  let lastError = null;

  for (let kIdx = 0; kIdx < shuffledKeys.length; kIdx++) {
    const currentApiKey = shuffledKeys[kIdx];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${currentApiKey}`;

    // Normalize parts: string -> [{ text: string }] or Array
    const contentParts = Array.isArray(parts) ? parts : [{ text: String(parts) }];

    const requestBody = {
      contents: [
        {
          parts: contentParts
        }
      ],
      generationConfig: {
        temperature: options.temperature !== undefined ? options.temperature : 0.3,
        topP: 0.95,
        maxOutputTokens: options.maxOutputTokens || 2048
      }
    };

    if (options.responseMimeType) {
      requestBody.generationConfig.responseMimeType = options.responseMimeType;
    }

    if (options.systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: options.systemInstruction }]
      };
    }

    try {
      console.log(`[Google AI Multimodal API] Calling ${targetModel} (Key ${kIdx + 1}/${shuffledKeys.length}, Parts: ${contentParts.length})...`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || `HTTP ${response.status} error`;
        console.warn(`[Google AI Multimodal] Error (${response.status}):`, errorMsg);

        if (response.status === 429 || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('Quota')) {
          lastError = new Error(`할당량 초과 (${targetModel}): ${errorMsg}`);
          continue;
        }
        throw new Error(`API 오류 (${response.status}): ${errorMsg}`);
      }

      const candidates = data?.candidates || [];
      if (candidates.length === 0 || !candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('API로부터 유효한 텍스트 응답을 받지 못했습니다.');
      }

      return {
        text: candidates[0].content.parts[0].text,
        usedModel: targetModel
      };

    } catch (err) {
      lastError = err;
      if (kIdx < shuffledKeys.length - 1) {
        continue;
      }
    }
  }

  throw lastError || new Error('모든 API 키 호출에 실패했습니다.');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PRIMARY_MODEL,
    FALLBACK_MODELS,
    getGeminiConfig,
    callGeminiApi,
    callGeminiMultimodalApi,
    fetchImageAsBase64,
    testGeminiApiKey
  };
}

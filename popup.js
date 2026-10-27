/**
 * Popup Script for Coupang AI Review Summarizer
 * Implements Prototype UI Views (1_.png through 5_.png)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const isExtensionEnv = typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;

  // ----------------------------------------------------
  // Global State
  // ----------------------------------------------------
  const state = {
    currentView: 'MAIN', // 'MAIN' | 'PROGRESS' | 'RESULT' | 'EXCLUDED' | 'SETTINGS'
    viewHistory: [],
    productId: null,
    productTitle: '',
    productRating: 0,
    productReviewCount: 0,
    productImageUrl: '',
    isProductDetected: false,
    analysisMode: 'BALANCE', // 'BALANCE' | 'NEGATIVE' | 'LATEST'
    reviewCount: 30, // Strictly 10, 20, 30
    scoreRatios: { 5: 20, 4: 20, 3: 20, 2: 20, 1: 20 }, // 5~1 star percentage
    currentPreset: 'BALANCED', // 'BALANCED' | 'CRITICAL' | 'POLAR' | 'CUSTOM'
    filterStrength: 2, // 1 (안함), 2 (중간), 3 (강함)
    selectedModel: 'gemini-3.5-flash-lite',
    includeExcluded: false,
    selectedExcludedIndices: new Set(),
    analysisCancelRequested: false,
    currentResultData: null,
    generatedKeywords: null,
    selectedKeywordIndex: 0,
    currentTab: 'REVIEW', // 'REVIEW' | 'CHATBOT'
    chatbotState: {
      isAnalyzingSpecs: false,
      isSpecsAnalyzed: false,
      hasShownGreeting: false,
      specsText: null,
      imageCount: 0,
      chatHistory: [],
      isSendingQuestion: false
    }
  };

  // Star config for donut chart & legend
  const STAR_CONFIG = [
    { star: 5, color: '#16a34a', label: '★5' },
    { star: 4, color: '#2563eb', label: '★4' },
    { star: 3, color: '#d97706', label: '★3' },
    { star: 2, color: '#ea580c', label: '★2' },
    { star: 1, color: '#dc2626', label: '★1' }
  ];

  // ----------------------------------------------------
  // DOM Elements
  // ----------------------------------------------------
  // Header
  const headerBackBtn = document.getElementById('headerBackBtn');
  const headerBrandGroup = document.getElementById('headerBrandGroup');
  const headerTitle = document.getElementById('headerTitle');
  const headerSubtitle = document.getElementById('headerSubtitle');
  const headerSettingsBtn = document.getElementById('headerSettingsBtn');
  const headerCloseBtn = document.getElementById('headerCloseBtn');

  // App Tabs
  const appTabNav = document.getElementById('appTabNav');
  const tabReviewBtn = document.getElementById('tabReviewBtn');
  const tabChatbotBtn = document.getElementById('tabChatbotBtn');

  // Views
  const viewMain = document.getElementById('viewMain');
  const viewProgress = document.getElementById('viewProgress');
  const viewResult = document.getElementById('viewResult');
  const viewExcluded = document.getElementById('viewExcluded');
  const viewSettings = document.getElementById('viewSettings');
  const viewChatbot = document.getElementById('viewChatbot');

  // Footers
  const mainFooterBar = document.getElementById('mainFooterBar');
  const progressFooterBar = document.getElementById('progressFooterBar');
  const resultFooterBar = document.getElementById('resultFooterBar');
  const settingsFooterBar = document.getElementById('settingsFooterBar');
  const excludedFooterBar = document.getElementById('excludedFooterBar');
  const reSummarizeWithSelectedBtn = document.getElementById('reSummarizeWithSelectedBtn');
  const reSummarizeBtnText = document.getElementById('reSummarizeBtnText');
  const toggleOptionTitle = document.getElementById('toggleOptionTitle');
  const toggleOptionSub = document.getElementById('toggleOptionSub');

  // Main View Controls
  const sessionRestoreBanner = document.getElementById('sessionRestoreBanner');
  const restoreBannerTitle = document.getElementById('restoreBannerTitle');
  const restoreBannerSub = document.getElementById('restoreBannerSub');
  const restoreSessionBtn = document.getElementById('restoreSessionBtn');
  const productTitleEl = document.getElementById('productTitle');
  const productReviewCountText = document.getElementById('productReviewCountText');
  const productDetectDot = document.getElementById('productDetectDot');
  const productDetectLabel = document.getElementById('productDetectLabel');
  const productMetaEl = document.getElementById('productMeta');
  const productStarRatingEl = document.getElementById('productStarRating');
  const productMetaDot = document.getElementById('productMetaDot');
  const productImageEl = document.getElementById('productImage');
  const toggleCustomIdBtn = document.getElementById('toggleCustomIdBtn');
  const customIdBox = document.getElementById('customIdBox');
  const customProductIdInput = document.getElementById('customProductIdInput');
  const customIdPasteBtn = document.getElementById('customIdPasteBtn');
  const reviewCountBadge = document.getElementById('reviewCountBadge');
  const reviewCountSlider = document.getElementById('reviewCountSlider');
  const reviewCountMinusBtn = document.getElementById('reviewCountMinusBtn');
  const reviewCountPlusBtn = document.getElementById('reviewCountPlusBtn');
  const timeEstCaption = document.getElementById('timeEstCaption');
  const summarizeBtn = document.getElementById('summarizeBtn');

  // Donut Chart Controls
  const donutPresetChips = document.getElementById('donutPresetChips');
  const donutSvg = document.getElementById('donutSvg');
  const donutCenterCount = document.getElementById('donutCenterCount');
  const donutCenterSub = document.getElementById('donutCenterSub');
  const donutLegendGrid = document.getElementById('donutLegendGrid');

  // Filter Slider Controls (Non-LLM Mechanical Rule Filter)
  const filterStrengthSlider = document.getElementById('filterStrengthSlider');
  const filterStrengthBadge = document.getElementById('filterStrengthBadge');
  const filterStrengthDesc = document.getElementById('filterStrengthDesc');
  const filterStepLabels = document.getElementById('filterStepLabels');

  // Progress View Controls
  const progressBarFill = document.getElementById('progressBarFill');
  const progressStepFraction = document.getElementById('progressStepFraction');
  const progressPercentText = document.getElementById('progressPercentText');
  const stepItem1 = document.getElementById('stepItem1');
  const stepItem2 = document.getElementById('stepItem2');
  const stepItem3 = document.getElementById('stepItem3');
  const stepItem4 = document.getElementById('stepItem4');
  const step1Title = document.getElementById('step1Title');
  const step2Status = document.getElementById('step2Status');
  const cancelProgressBtn = document.getElementById('cancelProgressBtn');

  // Result View Controls
  const resultFilterStatTitle = document.getElementById('resultFilterStatTitle');
  const resultFilterStatSub = document.getElementById('resultFilterStatSub');
  const openExcludedBtn = document.getElementById('openExcludedBtn');
  const keywordChipsList = document.getElementById('keywordChipsList');
  const prosList = document.getElementById('prosList');
  const consList = document.getElementById('consList');
  const tokenSavingsFooter = document.getElementById('tokenSavingsFooter');
  const tokenSavingBadge = document.getElementById('tokenSavingBadge');
  const copyResultBtn = document.getElementById('copyResultBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  const reAnalyzeBtn = document.getElementById('reAnalyzeBtn');

  // Excluded View Controls
  const statSponsoredCount = document.getElementById('statSponsoredCount');
  const statEmojiCount = document.getElementById('statEmojiCount');
  const includeExcludedToggle = document.getElementById('includeExcludedToggle');
  const excludedCardsList = document.getElementById('excludedCardsList');
  const loadMoreExcludedBtn = document.getElementById('loadMoreExcludedBtn');

  // Settings View Controls
  const modelCardsGroup = document.getElementById('modelCardsGroup');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  // Auth Modal Elements
  const authModal = document.getElementById('authModal');
  const authForm = document.getElementById('authForm');
  const authPassphraseInput = document.getElementById('authPassphraseInput');
  const toggleAuthPassVisibility = document.getElementById('toggleAuthPassVisibility');
  const rememberAuthCheck = document.getElementById('rememberAuthCheck');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authErrorMsg = document.getElementById('authErrorMsg');

  // Keywords Preview Controls
  const keywordsPreviewCard = document.getElementById('keywordsPreviewCard');
  const keywordsPreviewChips = document.getElementById('keywordsPreviewChips');
  const keywordsPreviewStatus = document.getElementById('keywordsPreviewStatus');

  // Chatbot Controls
  const chatbotStatusBanner = document.getElementById('chatbotStatusBanner');
  const chatbotStatusDot = document.getElementById('chatbotStatusDot');
  const chatbotStatusText = document.getElementById('chatbotStatusText');
  const chatbotNoticeCard = document.getElementById('chatbotNoticeCard');
  const chatbotNoticeTitle = document.getElementById('chatbotNoticeTitle');
  const chatbotNoticeDesc = document.getElementById('chatbotNoticeDesc');
  const chatbotNoticeRetryBtn = document.getElementById('chatbotNoticeRetryBtn');
  const chatbotMessagesContainer = document.getElementById('chatbotMessagesContainer');
  const chatbotFooterBar = document.getElementById('chatbotFooterBar');
  const chatbotInputForm = document.getElementById('chatbotInputForm');
  const chatbotInputText = document.getElementById('chatbotInputText');
  const chatbotSendBtn = document.getElementById('chatbotSendBtn');

  // ----------------------------------------------------
  // 1. Initialization
  // ----------------------------------------------------
  await checkAuthStatus();
  await loadUserPreferences();
  await detectCoupangProductOnTab();
  await checkAndRestorePreviousSession();
  adjustPopupLayoutToScreen();

  // ----------------------------------------------------
  // Dynamic Screen & Viewport Layout Adaptor (세로 화면 / 유동 높이 조절)
  // ----------------------------------------------------
  function adjustPopupLayoutToScreen() {
    const availH = window.screen.availHeight || window.screen.height || 800;
    const availW = window.screen.availWidth || window.screen.width || 1200;
    // 세로 모니터 판별: 세로 해상도가 가로 해상도보다 크거나, 세로 가용 높이가 1000px 이상인 경우
    const isVertical = (window.screen.height > window.screen.width) || (availH >= 1100);

    if (isVertical) {
      document.body.classList.add('is-vertical-screen');
    } else {
      document.body.classList.remove('is-vertical-screen');
    }

    const headerEl = document.getElementById('appHeader');
    const tabNavEl = document.getElementById('appTabNav');
    const headerH = headerEl ? headerEl.offsetHeight : 62;
    const tabNavH = (tabNavEl && tabNavEl.style.display !== 'none') ? tabNavEl.offsetHeight : 0;

    let targetHeight = 600;

    if (isVertical || availH >= 950) {
      // 세로 화면인 경우 현재 활성화된 뷰의 실제 콘텐츠 높이를 측정하여 스크롤 없이 시원하게 표시
      const activePanel = document.querySelector('.view-panel[style*="display: block"]');
      let panelH = 550;
      if (state.currentView === 'CHATBOT') {
        panelH = Math.min(680, availH - headerH - tabNavH - 120);
      } else if (activePanel) {
        panelH = activePanel.scrollHeight;
      }

      // 하단 고정 버튼(sticky-footer ~70px) + 패딩(24px) 반영
      const neededHeight = headerH + tabNavH + panelH + 94;
      // 화면 최대 가용 높이(태스크바 등 60px 제외) 내에서 스크롤이 없도록 자동 조절
      targetHeight = Math.min(neededHeight, availH - 60);
      targetHeight = Math.max(600, targetHeight);
    } else {
      targetHeight = Math.min(600, availH - 50);
    }

    document.documentElement.style.height = `${targetHeight}px`;
    document.body.style.height = `${targetHeight}px`;
    const container = document.getElementById('appContainer');
    if (container) {
      container.style.height = `${targetHeight}px`;
    }
  }

  window.addEventListener('resize', adjustPopupLayoutToScreen);

  // ----------------------------------------------------
  // 2. View Navigation State Machine
  // ----------------------------------------------------
  function switchView(targetView, addToHistory = true) {
    if (targetView === 'MAIN') {
      // 초기 팝업 화면(MAIN)으로 갈 때는 뒤로가기 히스토리를 항상 초기화
      state.viewHistory = [];
    } else if (addToHistory && state.currentView !== targetView) {
      // PROGRESS(일시적 진행 화면)는 뒤로가기 히스토리 스택에 절대 쌓지 않음
      if (state.currentView !== 'PROGRESS') {
        state.viewHistory.push(state.currentView);
      }
    }
    state.currentView = targetView;

    // Hide all view panels
    viewMain.style.display = 'none';
    viewProgress.style.display = 'none';
    viewResult.style.display = 'none';
    viewExcluded.style.display = 'none';
    viewSettings.style.display = 'none';
    if (viewChatbot) viewChatbot.style.display = 'none';

    // Hide all footer bars
    mainFooterBar.style.display = 'none';
    progressFooterBar.style.display = 'none';
    resultFooterBar.style.display = 'none';
    settingsFooterBar.style.display = 'none';
    if (excludedFooterBar) excludedFooterBar.style.display = 'none';
    if (chatbotFooterBar) chatbotFooterBar.style.display = 'none';

    // Show tab nav on MAIN, CHATBOT, and RESULT views
    if (appTabNav) {
      if (targetView === 'MAIN' || targetView === 'CHATBOT' || targetView === 'RESULT') {
        appTabNav.style.display = 'flex';
      } else {
        appTabNav.style.display = 'none';
      }
    }

    // Configure header per view
    if (targetView === 'MAIN') {
      headerBackBtn.style.display = 'none';
      headerBrandGroup.style.display = 'flex';
      headerTitle.textContent = '리뷰 요약기';
      headerSubtitle.textContent = getModelDisplayName(state.selectedModel);
      headerSettingsBtn.style.display = 'flex';
      headerCloseBtn.style.display = 'flex';

      if (tabReviewBtn) tabReviewBtn.classList.add('active');
      if (tabChatbotBtn) tabChatbotBtn.classList.remove('active');
      state.currentTab = 'REVIEW';

      viewMain.style.display = 'block';
      mainFooterBar.style.display = 'block';

    } else if (targetView === 'CHATBOT') {
      headerBackBtn.style.display = 'none';
      headerBrandGroup.style.display = 'flex';
      headerTitle.textContent = '상품 챗봇 (Q&A)';
      headerSubtitle.textContent = 'Gemini 3.5 Flash-Lite';
      headerSettingsBtn.style.display = 'flex';
      headerCloseBtn.style.display = 'flex';

      if (tabReviewBtn) tabReviewBtn.classList.remove('active');
      if (tabChatbotBtn) tabChatbotBtn.classList.add('active');
      state.currentTab = 'CHATBOT';

      viewChatbot.style.display = 'block';
      chatbotFooterBar.style.display = 'block';

      initChatbotSession();

    } else if (targetView === 'PROGRESS') {
      headerBackBtn.style.display = 'none';
      headerBrandGroup.style.display = 'flex';
      headerTitle.textContent = '리뷰 분석 중';
      headerSubtitle.textContent = state.productTitle.substring(0, 24) + '...';
      headerSettingsBtn.style.display = 'none';
      headerCloseBtn.style.display = 'flex';

      viewProgress.style.display = 'block';
      progressFooterBar.style.display = 'block';

    } else if (targetView === 'RESULT') {
      headerBackBtn.style.display = 'flex';
      headerBrandGroup.style.display = 'flex';
      headerTitle.textContent = '리뷰 요약';
      headerSubtitle.textContent = state.productTitle.substring(0, 22) + '...';
      headerSettingsBtn.style.display = 'none';
      headerCloseBtn.style.display = 'flex';

      if (tabReviewBtn) tabReviewBtn.classList.add('active');
      if (tabChatbotBtn) tabChatbotBtn.classList.remove('active');
      state.currentTab = 'REVIEW';

      viewResult.style.display = 'block';
      resultFooterBar.style.display = 'flex';

    } else if (targetView === 'EXCLUDED') {
      headerBackBtn.style.display = 'flex';
      const excludedTotal = state.currentResultData?.stats?.excludedCount ?? state.currentResultData?.filterStats?.totalExcluded ?? 0;
      headerTitle.textContent = `제외된 리뷰 ${excludedTotal}개`;
      headerSubtitle.textContent = excludedTotal === 0 ? '모든 유효 리뷰가 요약에 반영되었어요' : '요약에 반영하지 않은 리뷰예요';
      headerSettingsBtn.style.display = 'none';
      headerCloseBtn.style.display = 'none';

      viewExcluded.style.display = 'block';
      if (excludedFooterBar && excludedTotal > 0) {
        excludedFooterBar.style.display = 'block';
        updateReSummarizeButton();
      }

    } else if (targetView === 'SETTINGS') {
      headerBackBtn.style.display = 'flex';
      headerBrandGroup.style.display = 'flex';
      headerTitle.textContent = '설정';
      headerSubtitle.textContent = '';
      headerSettingsBtn.style.display = 'none';
      headerCloseBtn.style.display = 'none';

      viewSettings.style.display = 'block';
      settingsFooterBar.style.display = 'block';
    }

    // Scroll to top of viewport (or scroll to bottom for CHATBOT)
    if (targetView === 'CHATBOT') {
      scrollChatToBottom(false);
    } else {
      const vp = document.getElementById('viewViewport');
      if (vp) vp.scrollTop = 0;
    }

    // 화면 높이에 맞게 뷰포트 및 팝업 크기 유동 동기화
    adjustPopupLayoutToScreen();
  }

  // Back button handler
  headerBackBtn.addEventListener('click', () => {
    if (state.currentView === 'RESULT') {
      // 리뷰 요약 페이지에서 뒤로가기 클릭 시 초기 팝업 화면(MAIN)으로 즉시 이동 (AI 재호출 방지)
      state.viewHistory = [];
      switchView('MAIN', false);
    } else if (state.currentView === 'EXCLUDED') {
      // 제외된 리뷰 페이지에서 뒤로가기 클릭 시 결과 화면(RESULT)으로 복귀
      switchView('RESULT', false);
    } else if (state.viewHistory.length > 0) {
      const prevView = state.viewHistory.pop();
      if (prevView === 'PROGRESS') {
        switchView('MAIN', false);
      } else {
        switchView(prevView, false);
      }
    } else {
      switchView('MAIN', false);
    }
  });

  // App Navigation Tabs (A안: 리뷰 요약 <-> 상품 챗봇)
  if (tabReviewBtn) {
    tabReviewBtn.addEventListener('click', () => {
      if (state.currentResultData) {
        switchView('RESULT');
      } else {
        switchView('MAIN');
      }
    });
  }
  if (tabChatbotBtn) {
    tabChatbotBtn.addEventListener('click', () => {
      switchView('CHATBOT');
    });
  }

  // Settings gear button
  headerSettingsBtn.addEventListener('click', () => {
    switchView('SETTINGS');
  });

  // Close button (popup or drawer)
  headerCloseBtn.addEventListener('click', () => {
    try {
      window.parent.postMessage({ action: 'CLOSE_COUPANG_AI_DRAWER' }, '*');
    } catch (e) {
      // ignore
    }
    if (isExtensionEnv && chrome.tabs) {
      window.close();
    }
  });

  function getModelDisplayName(modelKey) {
    if (modelKey && modelKey.includes('3.1')) return 'Gemini 3.1 Flash-Lite';
    return 'Gemini 3.5 Flash-Lite';
  }

  // ----------------------------------------------------
  // 3. Tester Authentication Flow
  // ----------------------------------------------------
  async function checkAuthStatus() {
    let isAuthenticated = false;

    if (isExtensionEnv) {
      try {
        const res = await chrome.runtime.sendMessage({ action: 'GET_AUTH_STATUS' });
        if (res && res.success && res.data) {
          isAuthenticated = res.data.isAuthenticated;
          if (res.data.model) {
            state.selectedModel = res.data.model;
            headerSubtitle.textContent = getModelDisplayName(state.selectedModel);
          }
        }
      } catch (e) {
        console.warn('Auth check error:', e);
      }
    } else {
      isAuthenticated = !!window.__DECRYPTED_API_KEY__;
    }

    if (isAuthenticated) {
      authModal.style.display = 'none';
    } else {
      authModal.style.display = 'flex';
      setTimeout(() => {
        try {
          authPassphraseInput.focus({ preventScroll: true });
        } catch (e) { }
      }, 100);
    }
  }

  // Password visibility toggle
  toggleAuthPassVisibility.addEventListener('click', () => {
    const isPass = authPassphraseInput.type === 'password';
    authPassphraseInput.type = isPass ? 'text' : 'password';
  });

  // Unlock submit
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passphrase = authPassphraseInput.value.trim();
    const remember = rememberAuthCheck.checked;

    if (!passphrase) {
      showAuthError('테스터 비밀번호를 입력해 주세요.');
      return;
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.innerHTML = '<span>⏳ 인증 및 복호화 확인 중...</span>';
    authErrorMsg.style.display = 'none';

    try {
      if (isExtensionEnv) {
        const response = await chrome.runtime.sendMessage({
          action: 'VERIFY_AND_UNLOCK',
          payload: { passphrase, remember }
        });

        authSubmitBtn.disabled = false;
        authSubmitBtn.innerHTML = '<span>잠금 해제 및 시작하기</span>';

        if (!response || !response.success) {
          throw new Error(response?.error || '비밀번호가 일치하지 않습니다.');
        }
      } else {
        // Standalone Web Crypto fallback
        const configs = (typeof ENCRYPTED_SECRET_CONFIGS !== 'undefined') ? ENCRYPTED_SECRET_CONFIGS : [ENCRYPTED_SECRET_CONFIG];
        const decryptedKeys = await decryptApiKeys(configs, passphrase);
        window.__DECRYPTED_API_KEYS__ = decryptedKeys;
        window.__DECRYPTED_API_KEY__ = decryptedKeys[0];
        authSubmitBtn.disabled = false;
        authSubmitBtn.innerHTML = '<span>잠금 해제 및 시작하기</span>';
      }

      authModal.style.display = 'none';
      authPassphraseInput.value = '';

    } catch (err) {
      authSubmitBtn.disabled = false;
      authSubmitBtn.innerHTML = '<span>잠금 해제 및 시작하기</span>';
      showAuthError(err.message || '비밀번호가 올바르지 않습니다.');
    }
  });

  function showAuthError(msg) {
    authErrorMsg.textContent = msg;
    authErrorMsg.style.display = 'block';
  }

  // ----------------------------------------------------
  // 4. Product Tab Detection
  // ----------------------------------------------------
  async function detectCoupangProductOnTab() {
    if (!isExtensionEnv || !chrome.tabs) {
      renderDetectedProduct();
      return;
    }

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.url) {
        state.productId = null;
        state.isProductDetected = false;
        renderDetectedProduct();
        return;
      }

      const url = activeTab.url;
      const match = url.match(/\/products\/([0-9]+)/) || url.match(/[?&]productId=([0-9]+)/);

      if (match) {
        const newId = match[1];
        if (state.productId && state.productId !== newId) {
          state.chatbotState.isSpecsAnalyzed = false;
          state.chatbotState.hasShownGreeting = false;
          state.chatbotState.chatHistory = [];
          isChatbotInitialized = false;
          if (chatbotMessagesContainer) {
            chatbotMessagesContainer.innerHTML = '<div class="chatbot-scroll-anchor" id="chatbotScrollAnchor"></div>';
          }
        }
        state.productId = newId;
        state.isProductDetected = true;
        if (activeTab.title && activeTab.title.includes('쿠팡!')) {
          const rawTitle = activeTab.title.replace(' - 쿠팡!', '').replace('쿠팡!', '').trim();
          if (rawTitle) state.productTitle = rawTitle;
        }

        // Try getting real in-page counts from content script
        try {
          chrome.tabs.sendMessage(activeTab.id, { action: 'GET_PAGE_PRODUCT_INFO' }, (res) => {
            if (res && res.success && res.data) {
              if (res.data.title) state.productTitle = res.data.title;
              if (res.data.reviewCount) state.productReviewCount = res.data.reviewCount;
              if (res.data.rating) state.productRating = res.data.rating;
              if (res.data.imageUrl) state.productImageUrl = res.data.imageUrl;
              if (Array.isArray(res.data.keywords) && res.data.keywords.length > 0) {
                state.generatedKeywords = res.data.keywords;
                console.log('[Popup] Restored keywords from tab memory:', state.generatedKeywords);
              }
              renderDetectedProduct();
            }
          });
        } catch (e) {
          // ignore
        }
      } else {
        state.productId = null;
        state.isProductDetected = false;
      }
    } catch (e) {
      console.warn('Tab detection error:', e);
      state.productId = null;
      state.isProductDetected = false;
    }

    renderDetectedProduct();
  }

  function renderDetectedProduct() {
    if (state.isProductDetected && state.productId) {
      if (productDetectDot) {
        productDetectDot.className = 'status-dot-green';
      }
      if (productDetectLabel) {
        productDetectLabel.className = 'detect-label';
        productDetectLabel.textContent = '쿠팡 상품 감지됨';
      }
      if (productTitleEl) {
        productTitleEl.textContent = state.productTitle || `쿠팡 상품 (ID: ${state.productId})`;
      }
      if (productMetaEl) {
        productMetaEl.style.display = 'flex';
      }
      if (productStarRatingEl) {
        if (state.productRating) {
          productStarRatingEl.style.display = 'inline';
          productStarRatingEl.textContent = `★ ${state.productRating.toFixed(1)}`;
        } else {
          productStarRatingEl.style.display = 'none';
        }
      }
      if (productMetaDot) {
        productMetaDot.style.display = (state.productRating && state.productReviewCount) ? 'inline' : 'none';
      }
      if (productReviewCountText) {
        productReviewCountText.textContent = `상품 ID: ${state.productId}`;
      }
      if (productImageEl && state.productImageUrl) {
        productImageEl.src = state.productImageUrl;
        productImageEl.style.display = 'block';
      }
      if (summarizeBtn) {
        summarizeBtn.disabled = false;
        summarizeBtn.title = '';
        const btnSpan = summarizeBtn.querySelector('span');
        if (btnSpan) btnSpan.textContent = '리뷰 요약하기';
      }

      // 상품 감지 성공 시 키워드 자동 생성
      triggerKeywordGeneration();

    } else {
      if (productDetectDot) {
        productDetectDot.className = 'status-dot-gray';
      }
      if (productDetectLabel) {
        productDetectLabel.className = 'detect-label gray';
        productDetectLabel.textContent = '상품 미감지';
      }
      if (productTitleEl) {
        productTitleEl.textContent = '상품을 찾을 수 없어요';
      }
      if (productMetaEl) {
        productMetaEl.style.display = 'flex';
      }
      if (productStarRatingEl) {
        productStarRatingEl.style.display = 'none';
      }
      if (productMetaDot) {
        productMetaDot.style.display = 'none';
      }
      if (productReviewCountText) {
        productReviewCountText.textContent = '쿠팡 상품 페이지에서 열거나, 아래 링크를 눌러 상품 ID를 직접 입력해 주세요.';
      }
      if (productImageEl) {
        productImageEl.style.display = 'none';
      }
      if (summarizeBtn) {
        summarizeBtn.disabled = true;
        summarizeBtn.title = '쿠팡 상품 페이지에서 이용 가능합니다.';
        const btnSpan = summarizeBtn.querySelector('span');
        if (btnSpan) btnSpan.textContent = '쿠팡 상품 페이지에서 이용 가능';
      }
      // 상품 미감지 시 키워드 카드 숨기기
      if (keywordsPreviewCard) keywordsPreviewCard.style.display = 'none';
    }

    adjustPopupLayoutToScreen();
  }

  // Keywords Preview on Landing Page
  async function triggerKeywordGeneration() {
    if (!state.productTitle) return;

    // 1. 이미 탭 메모리에서 복원되었거나 현재 상태에 키워드가 있다면 즉시 칩 렌더링하고 LLM 호출 건너뜀 (0ms, 0 토큰)
    if (state.generatedKeywords && state.generatedKeywords.length > 0) {
      if (keywordsPreviewCard) keywordsPreviewCard.style.display = '';
      if (keywordsPreviewStatus) keywordsPreviewStatus.textContent = `${state.generatedKeywords.length}개`;
      renderKeywordPreviewChips(state.generatedKeywords);
      return;
    }

    // Show card with loading state
    if (keywordsPreviewCard) keywordsPreviewCard.style.display = '';
    if (keywordsPreviewStatus) keywordsPreviewStatus.textContent = '생성 중...';
    adjustPopupLayoutToScreen();

    try {
      let keywords = null;
      if (isExtensionEnv) {
        const kwResponse = await chrome.runtime.sendMessage({
          action: 'GENERATE_KEYWORDS',
          payload: { productTitle: state.productTitle, productId: state.productId }
        });
        if (kwResponse && kwResponse.success && kwResponse.data && kwResponse.data.keywords) {
          keywords = kwResponse.data.keywords;
        }
      } else {
        await sleep(800);
        keywords = ['보습력', '흡수력', '가성비', '향/냄새', '용량', '자극/트러블'];
      }

      if (keywords && keywords.length > 0) {
        state.generatedKeywords = keywords;
        if (keywordsPreviewStatus) keywordsPreviewStatus.textContent = `${keywords.length}개 생성됨`;
        renderKeywordPreviewChips(keywords);

        // 2. 생성된 키워드를 현재 탭의 content.js 메모리에 저장 (탭이 닫힐 때까지 유지)
        if (isExtensionEnv && chrome.tabs) {
          try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.id) {
              chrome.tabs.sendMessage(activeTab.id, {
                action: 'STORE_TAB_KEYWORDS',
                payload: { keywords }
              });
            }
          } catch (e) {
            // ignore
          }
        }
      } else {
        if (keywordsPreviewStatus) keywordsPreviewStatus.textContent = '생성 실패';
        if (keywordsPreviewChips) keywordsPreviewChips.innerHTML = '<p style="font-size:11px;color:#94a3b8;margin:4px 0;">키워드를 생성하지 못했어요. 리뷰 요약을 직접 시작해 주세요.</p>';
        adjustPopupLayoutToScreen();
      }
    } catch (e) {
      console.warn('Keyword generation error:', e);
      if (keywordsPreviewStatus) keywordsPreviewStatus.textContent = '생성 실패';
      adjustPopupLayoutToScreen();
    }
  }

  function renderKeywordPreviewChips(keywords) {
    if (!keywordsPreviewChips) return;
    keywordsPreviewChips.innerHTML = keywords.map((kw, idx) => `
      <button class="keyword-preview-chip" data-keyword-index="${idx}" title="${escapeHtml(kw)} 키워드로 리뷰 분석">
        <span class="keyword-preview-word">${escapeHtml(kw)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    `).join('');

    adjustPopupLayoutToScreen();

    // 키워드 클릭 → 해당 키워드 기준 리뷰 분석 트리거
    keywordsPreviewChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.keyword-preview-chip');
      if (!chip) return;
      const idx = parseInt(chip.dataset.keywordIndex, 10);
      if (isNaN(idx) || !state.generatedKeywords || !state.generatedKeywords[idx]) return;

      if (!state.productId) {
        alert('쿠팡 상품 페이지에서 열어 주세요.');
        return;
      }

      state.selectedKeywordIndex = idx;
      startAnalysis(false);
    });
  }

  // Toggle Custom Product ID Box
  toggleCustomIdBtn.addEventListener('click', () => {
    const isOpen = customIdBox.style.display === 'block';
    customIdBox.style.display = isOpen ? 'none' : 'block';
    adjustPopupLayoutToScreen();
  });

  customIdPasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        customProductIdInput.value = text.trim();
        parseAndApplyCustomInput(text.trim());
      }
    } catch (e) {
      customProductIdInput.focus();
    }
  });

  customProductIdInput.addEventListener('change', () => {
    parseAndApplyCustomInput(customProductIdInput.value.trim());
  });

  function parseAndApplyCustomInput(val) {
    if (!val) return;
    const match = val.match(/\/products\/([0-9]+)/) || val.match(/[?&]productId=([0-9]+)/) || val.match(/^[0-9]+$/);
    if (match) {
      const newId = match[1] || match[0];
      if (state.productId !== newId) {
        state.chatbotState.isSpecsAnalyzed = false;
        state.chatbotState.hasShownGreeting = false;
        state.chatbotState.chatHistory = [];
        isChatbotInitialized = false;
        if (chatbotMessagesContainer) {
          chatbotMessagesContainer.innerHTML = '<div class="chatbot-scroll-anchor" id="chatbotScrollAnchor"></div>';
        }
      }
      state.productId = newId;
      state.isProductDetected = true;
      state.productTitle = `수동 지정 상품 (ID: ${state.productId})`;
      state.productReviewCount = 0;
      state.productRating = 0;
      state.generatedKeywords = null; // 상품 변경 시 키워드 리셋
      renderDetectedProduct();
    } else {
      alert('유효한 쿠팡 상품 URL 또는 상품 번호(ID)를 입력해 주세요.');
    }
  }

  // ----------------------------------------------------
  // 5. Interactive Donut Chart & Rating Selection (5~1 Stars)
  // ----------------------------------------------------
  function renderDonut() {
    renderDonutSvg();
    renderDonutLegend();
  }

  function renderDonutSvg() {
    if (!donutSvg) return;
    donutSvg.innerHTML = '';

    // Circle params: center (80, 80), r = 54
    const cx = 80;
    const cy = 80;
    const r = 54;
    const circumference = 2 * Math.PI * r; // ~339.292

    let cumulativePct = 0;
    let totalPct = 0;

    STAR_CONFIG.forEach(cfg => {
      const pct = state.scoreRatios[cfg.star] || 0;
      totalPct += pct;
      if (pct <= 0) return;

      const arcLength = (pct / 100) * circumference;
      const offset = (cumulativePct / 100) * circumference;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx.toString());
      circle.setAttribute('cy', cy.toString());
      circle.setAttribute('r', r.toString());
      circle.setAttribute('class', 'donut-segment');
      circle.setAttribute('stroke', cfg.color);
      circle.setAttribute('stroke-dasharray', `${arcLength} ${circumference}`);
      circle.setAttribute('stroke-dashoffset', (-offset).toString());
      circle.setAttribute('data-star', cfg.star.toString());

      const count = Math.round((state.reviewCount * pct) / 100);
      circle.innerHTML = `<title>${cfg.label} (${pct}%, 예상 ${count}개)</title>`;
      donutSvg.appendChild(circle);

      cumulativePct += pct;
    });

    // Center text info
    if (donutCenterCount) {
      donutCenterCount.textContent = `${state.reviewCount}개`;
    }
    if (donutCenterSub) {
      if (totalPct === 100) {
        donutCenterSub.textContent = '100% 분배';
        donutCenterSub.classList.remove('warning');
      } else {
        donutCenterSub.textContent = `${totalPct}% (조정 필요)`;
        donutCenterSub.classList.add('warning');
      }
    }
  }

  function renderDonutLegend() {
    if (!donutLegendGrid) return;
    donutLegendGrid.innerHTML = '';

    STAR_CONFIG.forEach(cfg => {
      const pct = state.scoreRatios[cfg.star] || 0;
      const count = Math.round((state.reviewCount * pct) / 100);

      const card = document.createElement('div');
      card.className = 'star-control-card';
      card.dataset.star = cfg.star;

      card.innerHTML = `
        <span class="star-label">${cfg.label}</span>
        <span class="star-count-caption">${count}개</span>
        <div class="star-stepper-row">
          <button class="star-step-btn minus-btn" data-star="${cfg.star}" ${pct <= 0 ? 'disabled' : ''} aria-label="${cfg.label} 감소">−</button>
          <span class="star-pct-val">${pct}%</span>
          <button class="star-step-btn plus-btn" data-star="${cfg.star}" ${pct >= 100 ? 'disabled' : ''} aria-label="${cfg.label} 증가">+</button>
        </div>
      `;

      donutLegendGrid.appendChild(card);
    });

    // Attach step button listeners
    donutLegendGrid.querySelectorAll('.star-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const star = parseInt(btn.dataset.star, 10);
        const isPlus = btn.classList.contains('plus-btn');
        adjustScoreRatio(star, isPlus ? 10 : -10);
      });
    });
  }

  // Adjust ratio with automatic 100% rebalancing
  function adjustScoreRatio(targetStar, delta) {
    const current = state.scoreRatios[targetStar] || 0;
    const newVal = Math.max(0, Math.min(100, current + delta));
    if (newVal === current) return;

    const actualDelta = newVal - current;
    state.scoreRatios[targetStar] = newVal;

    // Rebalance from other stars
    const otherStars = [1, 2, 3, 4, 5].filter(s => s !== targetStar);

    if (actualDelta > 0) {
      // Need to subtract actualDelta from other stars (from highest ratio)
      let remainingToSubtract = actualDelta;
      otherStars.sort((a, b) => (state.scoreRatios[b] || 0) - (state.scoreRatios[a] || 0));

      for (const s of otherStars) {
        if (remainingToSubtract <= 0) break;
        const avail = state.scoreRatios[s] || 0;
        const sub = Math.min(avail, remainingToSubtract);
        state.scoreRatios[s] -= sub;
        remainingToSubtract -= sub;
      }
    } else if (actualDelta < 0) {
      // Need to add abs(actualDelta) to other stars (to lowest ratio)
      let remainingToAdd = -actualDelta;
      otherStars.sort((a, b) => (state.scoreRatios[a] || 0) - (state.scoreRatios[b] || 0));

      for (const s of otherStars) {
        if (remainingToAdd <= 0) break;
        const room = 100 - (state.scoreRatios[s] || 0);
        const add = Math.min(room, remainingToAdd);
        state.scoreRatios[s] += add;
        remainingToAdd -= add;
      }
    }

    setPresetActive('CUSTOM');
    renderDonut();
    saveUserPreferences();
  }

  // Preset Handlers
  if (donutPresetChips) {
    donutPresetChips.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const preset = chip.dataset.preset;
        applyPreset(preset);
      });
    });
  }

  function applyPreset(preset) {
    state.currentPreset = preset;
    if (preset === 'BALANCED') {
      state.scoreRatios = { 5: 20, 4: 20, 3: 20, 2: 20, 1: 20 };
    } else if (preset === 'CRITICAL') {
      state.scoreRatios = { 5: 10, 4: 10, 3: 20, 2: 30, 1: 30 };
    }
    setPresetActive(preset);
    renderDonut();
    saveUserPreferences();
  }

  function setPresetActive(presetKey) {
    state.currentPreset = presetKey;
    if (!donutPresetChips) return;
    donutPresetChips.querySelectorAll('.preset-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.preset === presetKey);
    });
  }

  // Review Count Slider (Strictly 10, 20, 30)
  if (reviewCountSlider) {
    reviewCountSlider.addEventListener('input', (e) => {
      state.reviewCount = parseInt(e.target.value, 10);
      updateReviewCountUi();
      saveUserPreferences();
    });
  }

  if (reviewCountMinusBtn) {
    reviewCountMinusBtn.addEventListener('click', () => {
      if (state.reviewCount > 10) {
        state.reviewCount = Math.max(10, state.reviewCount - 10);
        if (reviewCountSlider) reviewCountSlider.value = state.reviewCount;
        updateReviewCountUi();
        saveUserPreferences();
      }
    });
  }

  if (reviewCountPlusBtn) {
    reviewCountPlusBtn.addEventListener('click', () => {
      if (state.reviewCount < 30) {
        state.reviewCount = Math.min(30, state.reviewCount + 10);
        if (reviewCountSlider) reviewCountSlider.value = state.reviewCount;
        updateReviewCountUi();
        saveUserPreferences();
      }
    });
  }

  function updateReviewCountUi() {
    if (reviewCountBadge) reviewCountBadge.textContent = `${state.reviewCount}개`;
    updateTimeCaption(state.reviewCount);
    renderDonut();
  }

  function updateTimeCaption(count) {
    if (!timeEstCaption) return;
    if (count <= 10) {
      timeEstCaption.textContent = '약 3초 · 빠르고 컴팩트하게 핵심 의견만 추출해요';
    } else if (count <= 20) {
      timeEstCaption.textContent = '약 5초 · 주요 장단점을 균형 있게 분석해요';
    } else {
      timeEstCaption.textContent = '약 8초 · 풍부한 표본으로 정밀한 결론을 도출해요';
    }
  }

  // ----------------------------------------------------
  // 5-1. Non-LLM Mechanical Filter Slider (1:안함, 2:중간, 3:강함)
  // ----------------------------------------------------
  function updateFilterStrengthUi(level) {
    state.filterStrength = parseInt(level, 10) || 2;
    if (filterStrengthSlider) filterStrengthSlider.value = state.filterStrength;

    // Update step labels active style
    if (filterStepLabels) {
      filterStepLabels.querySelectorAll('.step-label').forEach(lbl => {
        lbl.classList.toggle('active', parseInt(lbl.dataset.step, 10) === state.filterStrength);
      });
    }

    if (state.filterStrength === 1) {
      if (filterStrengthBadge) {
        filterStrengthBadge.textContent = '1단 (안함)';
        filterStrengthBadge.style.color = '#64748b';
        filterStrengthBadge.style.background = '#f1f5f9';
      }
      if (filterStrengthDesc) filterStrengthDesc.textContent = '필터링 없이 모든 리뷰를 요약에 반영해요';

    } else if (state.filterStrength === 2) {
      if (filterStrengthBadge) {
        filterStrengthBadge.textContent = '2단 (중간)';
        filterStrengthBadge.style.color = '#1e3a8a';
        filterStrengthBadge.style.background = '#eff6ff';
      }
      if (filterStrengthDesc) filterStrengthDesc.textContent = '협찬·제공 관련 단어 포함 리뷰를 제외해요';

    } else if (state.filterStrength === 3) {
      if (filterStrengthBadge) {
        filterStrengthBadge.textContent = '3단 (강함)';
        filterStrengthBadge.style.color = '#7c3aed';
        filterStrengthBadge.style.background = '#f5f3ff';
      }
      if (filterStrengthDesc) filterStrengthDesc.textContent = '협찬글, 다수 이모지(3개+) 포함 리뷰를 제외해요';
    }
  }

  if (filterStrengthSlider) {
    filterStrengthSlider.addEventListener('input', (e) => {
      updateFilterStrengthUi(e.target.value);
      saveUserPreferences();
    });
  }

  if (filterStepLabels) {
    filterStepLabels.querySelectorAll('.step-label').forEach(lbl => {
      lbl.addEventListener('click', () => {
        updateFilterStrengthUi(lbl.dataset.step);
        saveUserPreferences();
      });
    });
  }

  // ----------------------------------------------------
  // 6. Execution: 4-Stage Progress & Summarization
  // ----------------------------------------------------
  summarizeBtn.addEventListener('click', () => {
    if (!state.productId) {
      alert('쿠팡 상품 페이지로 이동하거나, [다른 상품 ID나 URL로 분석하기]를 통해 상품 ID를 직접 입력해 주세요.');
      if (customIdBox) customIdBox.style.display = 'block';
      if (customProductIdInput) customProductIdInput.focus();
      return;
    }
    startAnalysis(false);
  });
  reAnalyzeBtn.addEventListener('click', () => switchView('MAIN'));

  cancelProgressBtn.addEventListener('click', () => {
    state.analysisCancelRequested = true;
    switchView('MAIN');
  });

  const ICON_PENDING = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2"><circle cx="12" cy="12" r="9" /></svg>`;
  const ICON_ACTIVE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" stroke-width="2.5"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="#1e3a8a" /></svg>`;
  const ICON_DONE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="#1e3a8a" /><path d="m9 12 2 2 4-4" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;

  function setProgressUi(stepNumber, percent, stepText) {
    progressBarFill.style.width = `${percent}%`;
    progressPercentText.textContent = `${percent}%`;
    progressStepFraction.textContent = stepText;
  }

  function markStepPending(element, statusText = '대기') {
    if (!element) return;
    element.className = 'checklist-item pending';
    const iconBox = element.querySelector('.check-icon-box');
    if (iconBox) iconBox.innerHTML = ICON_PENDING;
    const statusEl = element.querySelector('.checklist-status');
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.className = 'checklist-status';
    }
  }

  function markStepActive(element, statusText = '진행 중') {
    if (!element) return;
    element.className = 'checklist-item active';
    const iconBox = element.querySelector('.check-icon-box');
    if (iconBox) iconBox.innerHTML = ICON_ACTIVE;
    const statusEl = element.querySelector('.checklist-status');
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.className = 'checklist-status text-blue';
    }
  }

  function markStepDone(element, statusText = '완료', isHighlight = false) {
    if (!element) return;
    element.className = 'checklist-item done';
    const iconBox = element.querySelector('.check-icon-box');
    if (iconBox) iconBox.innerHTML = ICON_DONE;
    const statusEl = element.querySelector('.checklist-status');
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.className = isHighlight ? 'checklist-status highlight' : 'checklist-status';
    }
  }

  async function startAnalysis(useSampleData = false) {
    state.analysisCancelRequested = false;
    switchView('PROGRESS');

    // 0. 초기화: 모든 단계를 대기/준비 상태로 깨끗하게 리셋
    step1Title.textContent = `리뷰 ${state.reviewCount}개 불러오기`;
    markStepActive(stepItem1, '불러오는 중...');
    markStepPending(stepItem2, '대기');
    markStepPending(stepItem3, '대기');
    markStepPending(stepItem4, '대기');
    setProgressUi(1, 20, '1 / 4단계');

    try {
      // Step 1: 쿠팡 API로부터 리뷰 수집 및 기계식 필터링 (초고속 준비 파이프라인)
      let prepResponse;
      if (isExtensionEnv) {
        prepResponse = await chrome.runtime.sendMessage({
          action: 'PREPARE_REVIEWS',
          payload: {
            productId: state.productId,
            size: state.reviewCount,
            scoreRatios: state.scoreRatios,
            analysisMode: state.analysisMode,
            includeExcluded: state.includeExcluded,
            filterStrength: state.filterStrength,
            useSampleData
          }
        });
      } else {
        // Standalone browser test fallback
        await sleep(500);
        prepResponse = {
          success: true,
          data: {
            preparedData: {},
            excludedCount: state.includeExcluded ? 0 : 7,
            fetchedCount: 40,
            analyzedCount: state.reviewCount
          }
        };
      }

      if (state.analysisCancelRequested) return;

      if (!prepResponse || !prepResponse.success || !prepResponse.data) {
        throw new Error(prepResponse?.error || '리뷰 수집 및 필터링 처리에 실패했습니다.');
      }

      // Step 1 완료
      markStepDone(stepItem1, '완료');
      setProgressUi(2, 45, '2 / 4단계');

      // Step 2: Quality Filtering 시각적 전환
      markStepActive(stepItem2, '걸러내는 중...');
      await sleep(350);
      if (state.analysisCancelRequested) return;

      // ★ 실제 필터링 제외 개수를 2단계에 즉시 반영! ★
      const excludedCount = prepResponse.data.excludedCount ?? 0;
      markStepDone(stepItem2, `${excludedCount}개 제외`, true);

      // Step 3: AI 요약 작성 시작 (메인 화면에서 미리 생성된 키워드 기반)
      setProgressUi(3, 70, '3 / 4단계');
      markStepActive(stepItem3, '작성 중...');

      // 메인 화면에서 미리 생성해둔 키워드를 사용
      const generatedKeywords = state.generatedKeywords || null;

      let response;
      if (isExtensionEnv) {
        response = await chrome.runtime.sendMessage({
          action: 'GENERATE_SUMMARY',
          payload: {
            preparedData: prepResponse.data.preparedData,
            productId: state.productId || 'custom',
            productInfo: {
              productTitle: state.productTitle,
              productRating: state.productRating,
              productReviewCount: state.productReviewCount
            },
            generatedKeywords,
            scoreRatios: state.scoreRatios,
            analysisMode: state.analysisMode,
            includeExcluded: state.includeExcluded,
            filterStrength: state.filterStrength
          }
        });
      } else {
        // Standalone browser test fallback
        await sleep(1200);
        response = {
          success: true,
          data: getMockResultData()
        };
      }

      if (state.analysisCancelRequested) return;

      if (!response || !response.success || !response.data) {
        throw new Error(response?.error || '리뷰 요약 처리에 실패했습니다.');
      }

      const resData = response.data;
      resData.generatedKeywords = generatedKeywords;
      state.currentResultData = resData;

      // Cache session for persistence across popup close
      try {
        const sessionToSave = {
          productId: state.productId || 'custom',
          productTitle: state.productTitle,
          productRating: state.productRating,
          productReviewCount: state.productReviewCount,
          timestamp: Date.now(),
          resultData: resData,
          options: {
            reviewCount: state.reviewCount,
            scoreRatios: state.scoreRatios,
            currentPreset: state.currentPreset,
            filterStrength: state.filterStrength,
            includeExcluded: state.includeExcluded,
            selectedModel: state.selectedModel
          }
        };
        if (isExtensionEnv) {
          await chrome.storage.local.set({ lastAnalysisSession: sessionToSave });
        } else {
          localStorage.setItem('coupang_ai_last_session', JSON.stringify(sessionToSave));
        }
      } catch (e) {
        console.warn('Session save error:', e);
      }

      // Step 3 & 4: AI 완료 및 최종 정리
      markStepDone(stepItem3, '완료');
      markStepDone(stepItem4, '완료');
      setProgressUi(4, 100, '4 / 4단계');
      await sleep(400);

      // Render Result View (Prototype 3_.png)
      logAnalyzedReviewsToConsole(resData);
      renderResultView(resData);
      switchView('RESULT');

    } catch (err) {
      if (state.analysisCancelRequested) return;
      alert('오류 발생: ' + err.message);
      switchView('MAIN');
    }
  }

  /**
   * F12 개발자 도구(Console)에서 요약에 사용된 리뷰 목록을 확인할 수 있도록 출력하고 전역 변수에 등록
   */
  function logAnalyzedReviewsToConsole(resData) {
    if (!resData) return;

    try {
      const analyzed = resData.analyzedReviews || [];
      const excluded = resData.excludedReviews || [];

      // 1. 팝업 콘솔 전역 변수 바인딩
      window.__ANALYZED_REVIEWS__ = analyzed;
      window.__EXCLUDED_REVIEWS__ = excluded;
      window.__LAST_RESULT__ = resData;

      // 별점별 분포 요약
      const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      analyzed.forEach(r => {
        const s = Math.round(r.rating || 5);
        if (starCounts[s] !== undefined) starCounts[s]++;
      });

      // 2. 팝업 콘솔에 테이블 출력
      console.group(
        `%c[쿠팡 AI 요약기] 📊 분석 완료: 총 ${analyzed.length}개 리뷰 무작위 추출됨 (제외 ${excluded.length}개)`,
        'background: #1e3a8a; color: #fff; font-weight: bold; font-size: 13px; padding: 4px 8px; border-radius: 4px;'
      );

      console.log(
        `%cℹ️ F12 콘솔 창에서 아래 전역 변수를 직접 입력하여 원본 전체 객체를 확인할 수 있습니다:\n` +
        `  • window.__ANALYZED_REVIEWS__ : 요약에 사용된 ${analyzed.length}개 리뷰 배열 (본문, 평점, ID)\n` +
        `  • window.__EXCLUDED_REVIEWS__ : 품질 필터로 제외된 ${excluded.length}개 리뷰 배열\n` +
        `  • window.__LAST_RESULT__       : AI 요약 전체 응답 객체`,
        'color: #0369a1; font-size: 11.5px; line-height: 1.6;'
      );

      console.log(
        `%c⭐ 분석된 별점 분포: ★5: ${starCounts[5]}개 | ★4: ${starCounts[4]}개 | ★3: ${starCounts[3]}개 | ★2: ${starCounts[2]}개 | ★1: ${starCounts[1]}개`,
        'font-weight: bold; color: #b45309;'
      );

      const tableData = analyzed.map((r, i) => ({
        '순서': i + 1,
        '별점': '★'.repeat(r.rating || 5) + ` (${r.rating || 5}점)`,
        '리뷰 본문 미리보기': (r.content || '').length > 65 ? (r.content || '').substring(0, 65) + '...' : (r.content || ''),
        '글자수': (r.content || '').length,
        '리뷰ID': r.reviewId || '-'
      }));
      console.table(tableData);

      if (excluded.length > 0) {
        console.groupCollapsed(`%c🚫 제외된 리뷰 목록 (${excluded.length}개)`, 'color: #ea580c; font-weight: bold;');
        const excludedTable = excluded.map((r, i) => ({
          '순서': i + 1,
          '별점': `★ ${r.rating || 5}`,
          '제외 사유': r.filterReason || r.filterCategory?.label || '품질 기준',
          '리뷰 본문 미리보기': (r.content || '').length > 60 ? (r.content || '').substring(0, 60) + '...' : (r.content || '')
        }));
        console.table(excludedTable);
        console.groupEnd();
      }

      console.groupEnd();

      // 3. 부모 쿠팡 페이지(쿠팡 탭 F12)로 안전하게 postMessage 전송
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            action: 'COUPANG_AI_LOG_REVIEWS',
            payload: {
              analyzed,
              excluded,
              starCounts
            }
          }, '*');
        }
      } catch (postErr) { }

    } catch (e) {
      console.warn('[Console Log Warning]:', e);
    }
  }

  // ----------------------------------------------------
  // 7. Render Result View (Prototype 3_.png)
  // ----------------------------------------------------
  function renderResultView(data) {
    const stats = data.stats || {};
    const structured = data.structuredResult || {};

    const analyzed = stats.analyzedCount || state.reviewCount;
    const excluded = stats.excludedCount || 0;
    const total = analyzed + excluded;

    if (excluded === 0) {
      resultFilterStatTitle.textContent = `${analyzed}개 분석 · 제외 리뷰 모두 포함됨 (0개 제외)`;
    } else {
      resultFilterStatTitle.textContent = `${total}개 중 ${analyzed}개 분석 · ${excluded}개 제외`;
    }

    let ratioLabel = '균형 분석';
    if (state.currentPreset === 'BALANCED') ratioLabel = '균형 (20% 균등)';
    else if (state.currentPreset === 'CRITICAL') ratioLabel = '불만 집중 (1·2점 60%)';
    else ratioLabel = `직접 지정 (★5~1: ${state.scoreRatios[5]}/${state.scoreRatios[4]}/${state.scoreRatios[3]}/${state.scoreRatios[2]}/${state.scoreRatios[1]}%)`;

    resultFilterStatSub.textContent = `${ratioLabel} · 무작위 추출 · 방금 전`;

    // Keyword-based analysis results
    const keywordAnalysis = structured.keywordAnalysis || [];
    const selectedIdx = state.selectedKeywordIndex || 0;

    const keywordDetailWrap = document.getElementById('keywordDetailWrap');
    const keywordPositiveDesc = document.getElementById('keywordPositiveDesc');
    const keywordNegativeDesc = document.getElementById('keywordNegativeDesc');

    // Render keyword chips in result view
    if (keywordChipsList) {
      keywordChipsList.innerHTML = keywordAnalysis.map((kw, idx) => `
        <span class="keyword-chip ${escapeHtml(kw.sentiment || 'neutral')}${idx === selectedIdx ? ' active' : ''}" data-keyword-index="${idx}">
          <span class="keyword-word">${escapeHtml(kw.word)}</span>
          <span class="keyword-pct">${kw.percentage}%</span>
        </span>
      `).join('');

      // Chip click handler — switch displayed keyword detail
      keywordChipsList.addEventListener('click', (e) => {
        const chip = e.target.closest('.keyword-chip');
        if (!chip) return;
        const idx = parseInt(chip.dataset.keywordIndex, 10);
        if (isNaN(idx) || !keywordAnalysis[idx]) return;

        keywordChipsList.querySelectorAll('.keyword-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        showKeywordDetail(keywordAnalysis[idx]);
      });
    }

    function showKeywordDetail(kw) {
      if (!keywordDetailWrap) return;
      keywordDetailWrap.style.display = '';
      if (keywordPositiveDesc) keywordPositiveDesc.textContent = kw.positiveSummary || '관련 긍정 리뷰가 없습니다.';
      if (keywordNegativeDesc) keywordNegativeDesc.textContent = kw.negativeSummary || '관련 부정 리뷰가 없습니다.';
    }

    // Show selected keyword's detail by default
    if (keywordAnalysis[selectedIdx]) {
      showKeywordDetail(keywordAnalysis[selectedIdx]);
    }

    // Pros (좋았던 점) — 기존 상세 리스트
    const pros = structured.positivePoints || [];
    prosList.innerHTML = pros.map(item => `
      <div class="metric-row">
        <div class="metric-header-line">
          <span class="metric-item-title">${escapeHtml(item.title)}</span>
          <span class="metric-item-pct pros-pct">${item.percentage}%</span>
        </div>
        <div class="metric-bar-track">
          <div class="metric-bar-fill pros-fill" style="width: ${item.percentage}%;"></div>
        </div>
        <p class="metric-desc">${escapeHtml(item.description)}</p>
      </div>
    `).join('');

    // Cons (아쉬웠던 점) — 기존 상세 리스트
    const cons = structured.negativePoints || [];
    consList.innerHTML = cons.map(item => `
      <div class="metric-row">
        <div class="metric-header-line">
          <span class="metric-item-title">${escapeHtml(item.title)}</span>
          <span class="metric-item-pct cons-pct">${item.percentage}%</span>
        </div>
        <div class="metric-bar-track">
          <div class="metric-bar-fill cons-fill" style="width: ${item.percentage}%;"></div>
        </div>
        <p class="metric-desc">${escapeHtml(item.description)}</p>
      </div>
    `).join('');

    if (tokenSavingsFooter) {
      tokenSavingsFooter.style.display = 'none';
    }

    // Excluded view data
    renderExcludedView(data);
  }

  // Copy result button
  copyResultBtn.addEventListener('click', async () => {
    if (!state.currentResultData) return;
    const structured = state.currentResultData.structuredResult || {};
    const keywords = structured.topKeywords || [];
    const pros = structured.positivePoints || [];
    const cons = structured.negativePoints || [];

    const kwText = keywords.map(k => `#${k.word}(${k.percentage}%)`).join(' ');
    const textToCopy = `[쿠팡 리뷰 요약: ${state.productTitle}]\n\n` +
      `🏷️ 많이 언급된 단어:\n${kwText || '데이터 없음'}\n\n` +
      `👍 좋았던 점:\n` + pros.map(p => `- ${p.title} (${p.percentage}%): ${p.description}`).join('\n') + `\n\n` +
      `⚠️ 아쉬웠던 점:\n` + cons.map(c => `- ${c.title} (${c.percentage}%): ${c.description}`).join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      copyBtnText.textContent = '복사됨!';
      setTimeout(() => { copyBtnText.textContent = '요약 복사'; }, 2000);
    } catch (e) {
      alert('복사되었습니다.');
    }
  });

  // Open Excluded Reviews View (Prototype 4_.png)
  openExcludedBtn.addEventListener('click', () => {
    switchView('EXCLUDED');
  });

  // ----------------------------------------------------
  // ----------------------------------------------------
  // 8. Render Excluded View & Partial Include Re-analysis
  // ----------------------------------------------------
  function updateReSummarizeButton() {
    if (!reSummarizeWithSelectedBtn || !reSummarizeBtnText) return;
    const count = state.selectedExcludedIndices.size;
    if (count === 0) {
      reSummarizeWithSelectedBtn.disabled = true;
      reSummarizeBtnText.textContent = '포함할 리뷰를 선택해 주세요';
    } else {
      reSummarizeWithSelectedBtn.disabled = false;
      reSummarizeBtnText.textContent = `선택한 리뷰 ${count}개 포함하여 다시 요약`;
    }
  }

  function renderExcludedView(data) {
    const filterStats = data.filterStats || { sponsored: 0, emoji_overload: 0, totalExcluded: 0 };
    if (statSponsoredCount) statSponsoredCount.textContent = filterStats.sponsored ?? 0;
    if (statEmojiCount) statEmojiCount.textContent = filterStats.emoji_overload ?? 0;

    const excludedList = Array.isArray(data.excludedReviews) ? data.excludedReviews : [];

    // Reset or keep valid selection indices
    const validIndices = new Set();
    state.selectedExcludedIndices.forEach(idx => {
      if (idx < excludedList.length) validIndices.add(idx);
    });
    state.selectedExcludedIndices = validIndices;

    // Toggle control state
    if (includeExcludedToggle) {
      includeExcludedToggle.disabled = (excludedList.length === 0);
      includeExcludedToggle.checked = (excludedList.length > 0 && state.selectedExcludedIndices.size === excludedList.length);
    }

    // Empty state when 0 reviews were excluded
    if (excludedList.length === 0) {
      let reasonMsg = '';
      if (state.includeExcluded || data.isExcludedIncluded) {
        reasonMsg = '제외된 리뷰를 모두 포함하여 분석했어요. 모든 리뷰가 요약에 반영되었습니다.';
      } else if (state.filterStrength === 1) {
        reasonMsg = '필터링 강도가 1단(안함)으로 설정되어 모든 리뷰를 요약에 포함했어요.';
      } else {
        reasonMsg = '체험단·협찬·다수 이모지 등 품질 기준에 걸린 제외 리뷰가 없어요.';
      }

      excludedCardsList.innerHTML = `
        <div class="card empty-excluded-card" style="text-align: center; padding: 42px 16px; color: #64748b; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; margin-top: 10px;">
          <div style="font-size: 32px; margin-bottom: 8px;">✨</div>
          <p style="font-weight: 600; font-size: 14px; margin-bottom: 6px; color: #1e293b;">제외된 리뷰가 없습니다</p>
          <p style="font-size: 12px; color: #64748b; line-height: 1.5;">${reasonMsg}</p>
        </div>
      `;
      if (loadMoreExcludedBtn && loadMoreExcludedBtn.parentElement) {
        loadMoreExcludedBtn.parentElement.style.display = 'none';
      }
      if (excludedFooterBar) excludedFooterBar.style.display = 'none';
      return;
    }

    if (loadMoreExcludedBtn && loadMoreExcludedBtn.parentElement) {
      loadMoreExcludedBtn.parentElement.style.display = 'flex';
    }
    if (excludedFooterBar) {
      excludedFooterBar.style.display = 'block';
    }

    excludedCardsList.innerHTML = excludedList.map((item, idx) => {
      const cat = item.filterCategory || { label: '체험단·협찬·제공' };
      let badgeClass = 'badge-tag orange';
      if (cat.label && cat.label.includes('이모지')) badgeClass = 'badge-tag gray';
      const isSelected = state.selectedExcludedIndices.has(idx);

      return `
        <div class="card excluded-item-card ${isSelected ? 'selected' : ''}" data-idx="${idx}">
          <div class="card-item-header">
            <span class="${badgeClass}">${escapeHtml(cat.label)}</span>
            <span class="item-rating">★ ${item.rating || 5}</span>
          </div>
          <p class="item-content-preview">${escapeHtml(item.content)}</p>
          <div class="item-footer-row">
            <span class="reason-caption">${escapeHtml(item.filterReason || '품질 필터에 의해 제외됨')}</span>
            <button class="pill-outline-btn include-single-btn ${isSelected ? 'selected' : ''}" data-idx="${idx}">
              ${isSelected ? '✓ 포함 선택됨' : '+ 포함하기'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach single include button click handlers
    excludedCardsList.querySelectorAll('.include-single-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        const card = btn.closest('.excluded-item-card');

        if (state.selectedExcludedIndices.has(idx)) {
          state.selectedExcludedIndices.delete(idx);
          btn.classList.remove('selected');
          btn.textContent = '+ 포함하기';
          if (card) card.classList.remove('selected');
        } else {
          state.selectedExcludedIndices.add(idx);
          btn.classList.add('selected');
          btn.textContent = '✓ 포함 선택됨';
          if (card) card.classList.add('selected');
        }

        if (includeExcludedToggle) {
          includeExcludedToggle.checked = (state.selectedExcludedIndices.size === excludedList.length && excludedList.length > 0);
        }
        updateReSummarizeButton();
      });
    });

    updateReSummarizeButton();
  }

  // Toggle "제외된 리뷰 전체 선택"
  if (includeExcludedToggle) {
    includeExcludedToggle.addEventListener('change', () => {
      const excludedList = Array.isArray(state.currentResultData?.excludedReviews) ? state.currentResultData.excludedReviews : [];
      if (includeExcludedToggle.checked) {
        // 전체 선택
        excludedList.forEach((_, idx) => state.selectedExcludedIndices.add(idx));
      } else {
        // 전체 해제
        state.selectedExcludedIndices.clear();
      }

      // 카드 DOM 업데이트
      excludedCardsList.querySelectorAll('.excluded-item-card').forEach(card => {
        const idx = parseInt(card.dataset.idx, 10);
        const btn = card.querySelector('.include-single-btn');
        const isSel = state.selectedExcludedIndices.has(idx);
        if (isSel) {
          card.classList.add('selected');
          if (btn) { btn.classList.add('selected'); btn.textContent = '✓ 포함 선택됨'; }
        } else {
          card.classList.remove('selected');
          if (btn) { btn.classList.remove('selected'); btn.textContent = '+ 포함하기'; }
        }
      });
      updateReSummarizeButton();
    });
  }

  // Handle "선택한 리뷰 N개 포함하여 다시 요약"
  if (reSummarizeWithSelectedBtn) {
    reSummarizeWithSelectedBtn.addEventListener('click', async () => {
      if (state.selectedExcludedIndices.size === 0) return;
      await startReAnalysisWithSelected();
    });
  }

  async function startReAnalysisWithSelected() {
    if (!state.currentResultData) return;

    const currentExcluded = Array.isArray(state.currentResultData.excludedReviews) ? state.currentResultData.excludedReviews : [];
    const currentAnalyzed = Array.isArray(state.currentResultData.analyzedReviews) ? state.currentResultData.analyzedReviews : [];

    const selectedReviews = [];
    const remainingExcluded = [];
    currentExcluded.forEach((rev, idx) => {
      if (state.selectedExcludedIndices.has(idx)) {
        selectedReviews.push(rev);
      } else {
        remainingExcluded.push(rev);
      }
    });

    if (selectedReviews.length === 0) return;

    // Combine existing analyzed reviews with manually approved selected reviews
    const combinedReviews = [...currentAnalyzed, ...selectedReviews];

    // Recalculate remaining excluded stats
    const remainingStats = { sponsored: 0, emoji_overload: 0, totalExcluded: remainingExcluded.length };
    remainingExcluded.forEach(r => {
      const cat = r.filterCategory?.label || '';
      if (cat.includes('이모지')) remainingStats.emoji_overload++;
      else remainingStats.sponsored++;
    });

    state.analysisCancelRequested = false;
    switchView('PROGRESS');

    // UI Feedback: Step 1, Step 2 visually show selection inclusion
    step1Title.textContent = `기존 분석 리뷰 ${currentAnalyzed.length}개 준비`;
    markStepDone(stepItem1, '완료');
    setProgressUi(2, 45, '2 / 4단계');

    markStepActive(stepItem2, '선택 리뷰 포함 중...');
    await sleep(350);
    if (state.analysisCancelRequested) return;

    markStepDone(stepItem2, `선택 ${selectedReviews.length}개 포함 (${remainingExcluded.length}개 제외)`, true);
    setProgressUi(3, 70, '3 / 4단계');
    markStepActive(stepItem3, 'AI 요약 다시 작성 중...');

    try {
      let response;
      if (isExtensionEnv) {
        response = await chrome.runtime.sendMessage({
          action: 'GENERATE_SUMMARY',
          payload: {
            preparedData: {
              extracted: state.currentResultData.stats || {},
              reviewsToAnalyze: combinedReviews,
              effectiveExcludedCount: remainingExcluded.length,
              effectiveExcludedList: remainingExcluded,
              effectiveFilterStats: remainingStats,
              targetCount: combinedReviews.length
            },
            productId: state.productId || 'custom',
            productInfo: {
              productTitle: state.productTitle,
              productRating: state.productRating,
              productReviewCount: state.productReviewCount
            },
            generatedKeywords: state.currentResultData.generatedKeywords || null,
            scoreRatios: state.scoreRatios,
            analysisMode: state.analysisMode,
            includeExcluded: remainingExcluded.length === 0,
            filterStrength: state.filterStrength
          }
        });
      } else {
        await sleep(1200);
        response = {
          success: true,
          data: getMockResultData()
        };
      }

      if (state.analysisCancelRequested) return;

      if (!response || !response.success || !response.data) {
        throw new Error(response?.error || '요약 재생성에 실패했습니다.');
      }

      const resData = response.data;
      resData.generatedKeywords = state.currentResultData.generatedKeywords || null;
      state.currentResultData = resData;
      state.selectedExcludedIndices.clear();

      // Cache updated session
      try {
        const sessionToSave = {
          productId: state.productId || 'custom',
          productTitle: state.productTitle,
          productRating: state.productRating,
          productReviewCount: state.productReviewCount,
          timestamp: Date.now(),
          resultData: resData,
          options: {
            reviewCount: combinedReviews.length,
            scoreRatios: state.scoreRatios,
            currentPreset: state.currentPreset,
            filterStrength: state.filterStrength,
            includeExcluded: remainingExcluded.length === 0,
            selectedModel: state.selectedModel
          }
        };
        if (isExtensionEnv) {
          await chrome.storage.local.set({ lastAnalysisSession: sessionToSave });
        } else {
          localStorage.setItem('coupang_ai_last_session', JSON.stringify(sessionToSave));
        }
      } catch (e) {
        console.warn('Session save error:', e);
      }

      // Step 3 & 4 완료
      markStepDone(stepItem3, '완료');
      markStepDone(stepItem4, '완료');
      setProgressUi(4, 100, '4 / 4단계');
      await sleep(400);

      logAnalyzedReviewsToConsole(resData);
      renderResultView(resData);
      switchView('RESULT');

    } catch (err) {
      if (state.analysisCancelRequested) return;
      alert('오류 발생: ' + err.message);
      switchView('EXCLUDED');
    }
  }

  loadMoreExcludedBtn.addEventListener('click', () => {
    alert('모든 제외된 리뷰가 표시되어 있습니다.');
  });

  // ----------------------------------------------------
  // 8. Session Restoration Functions (Requirement 1: 중도 이탈 복원)
  // ----------------------------------------------------
  async function checkAndRestorePreviousSession() {
    let lastSession = null;
    if (isExtensionEnv) {
      const stored = await chrome.storage.local.get(['lastAnalysisSession']);
      lastSession = stored?.lastAnalysisSession;
    } else {
      try {
        const raw = localStorage.getItem('coupang_ai_last_session');
        if (raw) lastSession = JSON.parse(raw);
      } catch (e) { }
    }

    if (!lastSession || !lastSession.resultData) {
      if (sessionRestoreBanner) sessionRestoreBanner.style.display = 'none';
      return;
    }

    const isCurrentProduct = (state.productId && state.productId === lastSession.productId);
    const isRecent = (Date.now() - (lastSession.timestamp || 0)) < 1000 * 60 * 60 * 24; // 24 hours

    if (isRecent && (isCurrentProduct || !state.productId)) {
      if (sessionRestoreBanner) {
        sessionRestoreBanner.style.display = 'flex';
        if (restoreBannerTitle) {
          restoreBannerTitle.textContent = isCurrentProduct
            ? '이 상품의 최근 분석 결과가 저장되어 있어요'
            : `최근 분석 결과: ${lastSession.productTitle || '저장된 상품'}`;
        }
        if (restoreBannerSub) {
          const timeText = formatRelativeTime(lastSession.timestamp);
          restoreBannerSub.textContent = `${lastSession.options?.reviewCount || 30}개 리뷰 요약 완료 · ${timeText}`;
        }
      }
    }
  }

  function formatRelativeTime(ts) {
    if (!ts) return '방금 전';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return '방금 전';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
    return `${Math.floor(diffSec / 3600)}시간 전`;
  }

  if (restoreSessionBtn) {
    restoreSessionBtn.addEventListener('click', async () => {
      let lastSession = null;
      if (isExtensionEnv) {
        const stored = await chrome.storage.local.get(['lastAnalysisSession']);
        lastSession = stored?.lastAnalysisSession;
      } else {
        try {
          const raw = localStorage.getItem('coupang_ai_last_session');
          if (raw) lastSession = JSON.parse(raw);
        } catch (e) { }
      }

      if (lastSession && lastSession.resultData) {
        state.currentResultData = lastSession.resultData;
        if (lastSession.options) {
          if (lastSession.options.reviewCount) state.reviewCount = lastSession.options.reviewCount;
          if (lastSession.options.scoreRatios) state.scoreRatios = lastSession.options.scoreRatios;
          if (lastSession.options.currentPreset) state.currentPreset = lastSession.options.currentPreset;
          if (lastSession.options.filterStrength !== undefined) state.filterStrength = lastSession.options.filterStrength;
          if (lastSession.options.includeExcluded !== undefined) state.includeExcluded = lastSession.options.includeExcluded;
        }
        logAnalyzedReviewsToConsole(lastSession.resultData);
        renderResultView(lastSession.resultData);
        switchView('RESULT');
      }
    });
  }

  // ----------------------------------------------------
  // 9. Persistent User Preferences & Settings View
  // ----------------------------------------------------
  async function saveUserPreferences() {
    const prefs = {
      reviewCount: state.reviewCount,
      scoreRatios: state.scoreRatios,
      currentPreset: state.currentPreset,
      filterStrength: state.filterStrength,
      selectedModel: state.selectedModel
    };

    if (isExtensionEnv && chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.set({ coupang_ai_user_prefs: prefs });
      } catch (e) {
        console.warn('[Prefs] Failed to save to storage:', e);
      }
    } else {
      try {
        localStorage.setItem('coupang_ai_user_prefs', JSON.stringify(prefs));
      } catch (e) { }
    }
  }

  async function loadUserPreferences() {
    let prefs = null;
    if (isExtensionEnv && chrome.storage && chrome.storage.local) {
      try {
        const res = await chrome.storage.local.get(['coupang_ai_user_prefs']);
        prefs = res.coupang_ai_user_prefs;
      } catch (e) {
        console.warn('[Prefs] Failed to load from storage:', e);
      }
    }
    if (!prefs) {
      try {
        const raw = localStorage.getItem('coupang_ai_user_prefs');
        if (raw) prefs = JSON.parse(raw);
      } catch (e) { }
    }

    if (prefs) {
      if (typeof prefs.reviewCount === 'number') {
        state.reviewCount = Math.min(30, Math.max(10, prefs.reviewCount));
      }
      if (typeof prefs.filterStrength === 'number') {
        state.filterStrength = Math.min(3, Math.max(1, prefs.filterStrength));
      }
      if (prefs.currentPreset) {
        state.currentPreset = prefs.currentPreset;
      }
      if (prefs.scoreRatios && typeof prefs.scoreRatios === 'object') {
        state.scoreRatios = {
          5: typeof prefs.scoreRatios[5] === 'number' ? prefs.scoreRatios[5] : 20,
          4: typeof prefs.scoreRatios[4] === 'number' ? prefs.scoreRatios[4] : 20,
          3: typeof prefs.scoreRatios[3] === 'number' ? prefs.scoreRatios[3] : 20,
          2: typeof prefs.scoreRatios[2] === 'number' ? prefs.scoreRatios[2] : 20,
          1: typeof prefs.scoreRatios[1] === 'number' ? prefs.scoreRatios[1] : 20
        };
      }
      if (prefs.selectedModel) {
        state.selectedModel = prefs.selectedModel;
      }
    }

    applyPreferencesToUi();
  }

  function applyPreferencesToUi() {
    // 1. Review Count
    if (reviewCountSlider) {
      reviewCountSlider.value = state.reviewCount;
    }
    updateReviewCountUi();

    // 2. Filter Strength
    updateFilterStrengthUi(state.filterStrength);

    // 3. Preset & Donut Chart
    setPresetActive(state.currentPreset);
    renderDonut();

    // 4. Model selection cards in Settings View
    if (modelCardsGroup) {
      modelCardsGroup.querySelectorAll('.model-select-card').forEach(card => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio && radio.value === state.selectedModel) {
          radio.checked = true;
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    }

    if (headerSubtitle) {
      headerSubtitle.textContent = getModelDisplayName(state.selectedModel);
    }
  }

  // Model selection radio cards
  if (modelCardsGroup) {
    modelCardsGroup.querySelectorAll('.model-select-card').forEach(card => {
      card.addEventListener('click', () => {
        modelCardsGroup.querySelectorAll('.model-select-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          state.selectedModel = radio.value;
          headerSubtitle.textContent = getModelDisplayName(state.selectedModel);
          saveUserPreferences();
        }
      });
    });
  }

  // Save Settings button
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
      await saveUserPreferences();
      alert('설정이 안전하게 저장되었습니다.');
      switchView('MAIN');
    });
  }

  // ----------------------------------------------------
  // 10. Product Chatbot Controller (A안: 상세 이미지 기반 Q&A)
  // ----------------------------------------------------
  let isChatbotInitialized = false;

  function renderAnalysisLoadingBubble(msg) {
    if (!chatbotMessagesContainer) return;
    let bubble = document.getElementById('chatbotAnalysisLoadingBubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'chatbotAnalysisLoadingBubble';
      bubble.className = 'chat-message bot chatbot-analysis-loading-bubble';
      bubble.innerHTML = `
        <div class="chat-avatar">AI</div>
        <div class="chat-bubble">
          <div class="typing-dots">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
          <span class="chatbot-analysis-status-msg" id="chatbotAnalysisStatusMsg">${escapeHtml(msg)}</span>
        </div>
      `;
      const anchor = document.getElementById('chatbotScrollAnchor');
      if (anchor && anchor.parentNode === chatbotMessagesContainer) {
        chatbotMessagesContainer.insertBefore(bubble, anchor);
      } else {
        chatbotMessagesContainer.appendChild(bubble);
      }
    } else {
      const msgEl = bubble.querySelector('#chatbotAnalysisStatusMsg');
      if (msgEl) msgEl.textContent = msg;
    }
    scrollChatToBottom(false);
  }

  function removeAnalysisLoadingBubble() {
    const bubble = document.getElementById('chatbotAnalysisLoadingBubble');
    if (bubble && bubble.parentNode) {
      bubble.parentNode.removeChild(bubble);
    }
  }

  async function initChatbotSession(forceRetry = false) {
    if (!state.isProductDetected || !state.productId) {
      if (chatbotNoticeCard) {
        chatbotNoticeCard.style.display = 'block';
        chatbotNoticeTitle.textContent = '상품 미감지';
        chatbotNoticeDesc.textContent = '쿠팡 상품 페이지에서 열거나, 먼저 상품 ID를 지정해 주세요.';
        chatbotNoticeRetryBtn.style.display = 'none';
      }
      if (chatbotMessagesContainer) chatbotMessagesContainer.style.display = 'none';
      if (chatbotInputText) chatbotInputText.disabled = true;
      if (chatbotSendBtn) chatbotSendBtn.disabled = true;
      if (chatbotStatusDot) chatbotStatusDot.className = 'status-dot-gray';
      if (chatbotStatusText) chatbotStatusText.textContent = '상품 정보 필요';
      removeAnalysisLoadingBubble();
      return;
    }

    if (forceRetry) {
      state.chatbotState.isSpecsAnalyzed = false;
      state.chatbotState.hasShownGreeting = false;
      state.chatbotState.chatHistory = [];
      isChatbotInitialized = false;
      if (chatbotMessagesContainer) {
        chatbotMessagesContainer.innerHTML = '<div class="chatbot-scroll-anchor" id="chatbotScrollAnchor"></div>';
      }
    }

    // 이미 분석이 완료되어 있다면 기존 상태 유지
    if (isChatbotInitialized && !forceRetry && state.chatbotState.isSpecsAnalyzed) {
      removeAnalysisLoadingBubble();
      if (!state.chatbotState.hasShownGreeting && (!state.chatbotState.chatHistory || state.chatbotState.chatHistory.length === 0)) {
        appendChatBubble('bot', `안녕하세요! 이 상품의 **상세 설명란 이미지(제조사 제공 정보 ${state.chatbotState.imageCount || 1}장)**를 분석했습니다. 실측 사이즈, 소재/성분, 사용 방법, 보관법, 주의사항 등 궁금한 점을 질문해 보세요!`);
        state.chatbotState.hasShownGreeting = true;
      }
      if (chatbotInputText) chatbotInputText.disabled = false;
      if (chatbotSendBtn) chatbotSendBtn.disabled = false;
      scrollChatToBottom(false);
      adjustPopupLayoutToScreen();
      return;
    }

    // Step 1: Active tab content script로부터 /q89/ 이미지 URL 파싱
    if (chatbotStatusDot) chatbotStatusDot.className = 'status-dot-pulse';
    if (chatbotStatusText) chatbotStatusText.textContent = '상세페이지 이미지 찾는 중...';
    if (chatbotNoticeCard) chatbotNoticeCard.style.display = 'none';
    if (chatbotMessagesContainer) chatbotMessagesContainer.style.display = 'flex';
    if (chatbotInputText) chatbotInputText.disabled = true;
    if (chatbotSendBtn) chatbotSendBtn.disabled = true;

    // 분석 진행 중 로딩 인디케이터 표시 (분석 완료 전에는 완료 인사말을 절대 출력하지 않음)
    renderAnalysisLoadingBubble('상세페이지 이미지를 확인하고 있습니다...');

    try {
      let imageUrls = [];

      if (isExtensionEnv && chrome.tabs) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
          const res = await new Promise(resolve => {
            chrome.tabs.sendMessage(activeTab.id, { action: 'GET_DETAIL_IMAGES' }, (r) => {
              resolve(r);
            });
            setTimeout(() => resolve(null), 3500);
          });
          if (res && res.success && Array.isArray(res.data?.imageUrls)) {
            imageUrls = res.data.imageUrls;
          }
        }
      } else {
        imageUrls = [
          "https://thumbnail.coupangcdn.com/thumbnails/remote/q89/image/retail/images/2026/06/02/17/9/479dfa5c-9dd1-40bd-836b-742f18b2becb.jpg"
        ];
      }

      console.log(`[Chatbot] Scraped ${imageUrls.length} detail images for product ${state.productId}`);

      // 이미지가 0개인 경우
      if (!imageUrls || imageUrls.length === 0) {
        removeAnalysisLoadingBubble();
        if (chatbotNoticeCard) {
          chatbotNoticeCard.style.display = 'block';
          chatbotNoticeTitle.textContent = '상세 이미지를 찾을 수 없어요';
          chatbotNoticeDesc.textContent = '이 상품 페이지에서 상세 설명란 이미지를 찾지 못했습니다. 상세 페이지를 직접 확인해주세요.';
          chatbotNoticeRetryBtn.style.display = 'inline-block';
        }
        if (chatbotMessagesContainer) chatbotMessagesContainer.style.display = 'none';
        if (chatbotStatusText) chatbotStatusText.textContent = '상세 이미지 없음';
        if (chatbotStatusDot) chatbotStatusDot.className = 'status-dot-gray';
        adjustPopupLayoutToScreen();
        return;
      }

      // Step 2: 백그라운드로 1회 이미지 스펙 분석 & 캐싱 요청
      if (chatbotStatusText) chatbotStatusText.textContent = `상세페이지 이미지 ${imageUrls.length}장 분석 중...`;
      renderAnalysisLoadingBubble(`상세페이지 이미지 ${imageUrls.length}장을 분석하고 있습니다...`);
      state.chatbotState.isAnalyzingSpecs = true;

      let analyzeRes;
      if (isExtensionEnv) {
        analyzeRes = await chrome.runtime.sendMessage({
          action: 'ANALYZE_PRODUCT_IMAGES',
          payload: {
            productId: state.productId,
            imageUrls,
            productTitle: state.productTitle
          }
        });
      } else {
        await sleep(1000);
        analyzeRes = { success: true, specsText: '모의 스펙 데이터입니다.', imageCount: imageUrls.length };
      }

      if (!analyzeRes || !analyzeRes.success) {
        throw new Error(analyzeRes?.message || '상세 이미지 분석에 실패했습니다.');
      }

      // 로딩 버블 제거
      removeAnalysisLoadingBubble();

      state.chatbotState.isSpecsAnalyzed = true;
      state.chatbotState.isAnalyzingSpecs = false;
      state.chatbotState.imageCount = analyzeRes.imageCount || imageUrls.length;
      isChatbotInitialized = true;

      if (chatbotStatusDot) chatbotStatusDot.className = 'status-dot-green';
      if (chatbotStatusText) chatbotStatusText.textContent = `상세페이지 분석 완료`;

      // ★ 분석이 완전히 끝난 이 시점에 비로소 첫 인사말 및 완료 메시지 출력!
      if (!state.chatbotState.hasShownGreeting) {
        appendChatBubble('bot', `안녕하세요! 이 상품의 **상세 설명란 이미지(제조사 제공 정보 ${state.chatbotState.imageCount}장)**를 분석했습니다. 실측 사이즈, 소재/성분, 사용 방법, 보관법, 주의사항 등 궁금한 점을 질문해 보세요!`);
        state.chatbotState.hasShownGreeting = true;
      }

      if (chatbotInputText) {
        chatbotInputText.disabled = false;
        try {
          chatbotInputText.focus({ preventScroll: true });
        } catch (e) {
          chatbotInputText.focus();
        }
      }
      if (chatbotSendBtn) chatbotSendBtn.disabled = false;
      scrollChatToBottom(false);
      adjustPopupLayoutToScreen();

    } catch (err) {
      console.warn('[Chatbot] Init error:', err);
      removeAnalysisLoadingBubble();
      if (chatbotStatusDot) chatbotStatusDot.className = 'status-dot-red';
      if (chatbotStatusText) chatbotStatusText.textContent = '분석 실패';
      if (chatbotNoticeCard) {
        chatbotNoticeCard.style.display = 'block';
        chatbotNoticeTitle.textContent = '분석 중 오류 발생';
        chatbotNoticeDesc.textContent = err.message || '상세 이미지를 분석하는 중 문제가 발생했습니다.';
        chatbotNoticeRetryBtn.style.display = 'inline-block';
      }
      if (chatbotInputText) chatbotInputText.disabled = true;
      if (chatbotSendBtn) chatbotSendBtn.disabled = true;
      adjustPopupLayoutToScreen();
    }
  }

  // Handle Chatbot Question Submit
  async function handleChatbotQuestionSubmit(e) {
    if (e) e.preventDefault();
    const question = chatbotInputText.value.trim();
    if (!question || state.chatbotState.isSendingQuestion) return;

    // 1. 사용자 질문 버블 추가 및 스크롤
    appendChatBubble('user', question);
    chatbotInputText.value = '';
    chatbotInputText.disabled = true;
    chatbotSendBtn.disabled = true;
    state.chatbotState.isSendingQuestion = true;

    // 2. 타이핑 로딩 버블 추가 및 스크롤
    const typingBubble = appendTypingIndicator();
    scrollChatToBottom(true);

    try {
      let res;
      if (isExtensionEnv) {
        res = await chrome.runtime.sendMessage({
          action: 'ASK_PRODUCT_CHATBOT',
          payload: {
            productId: state.productId,
            question,
            chatHistory: state.chatbotState.chatHistory,
            productTitle: state.productTitle
          }
        });
      } else {
        await sleep(800);
        res = { success: true, answer: '상세 이미지 분석 결과, 본 제품은 표준 규격 및 호환성을 만족합니다.' };
      }

      // 로딩 버블 제거
      if (typingBubble && typingBubble.parentNode) {
        typingBubble.parentNode.removeChild(typingBubble);
      }

      if (res && res.success && res.answer) {
        appendChatBubble('bot', res.answer);
        state.chatbotState.chatHistory.push(
          { role: 'user', text: question },
          { role: 'bot', text: res.answer }
        );
      } else {
        appendChatBubble('bot', res?.message || '답변을 생성하지 못했습니다. 잠시 후 다시 질문해 주세요.');
      }
    } catch (err) {
      if (typingBubble && typingBubble.parentNode) {
        typingBubble.parentNode.removeChild(typingBubble);
      }
      appendChatBubble('bot', `오류가 발생했습니다: ${err.message || '답변을 불러오지 못했습니다.'}`);
    } finally {
      state.chatbotState.isSendingQuestion = false;
      chatbotInputText.disabled = false;
      chatbotSendBtn.disabled = false;
      try {
        chatbotInputText.focus({ preventScroll: true });
      } catch (e) {
        chatbotInputText.focus();
      }
      scrollChatToBottom(true);
    }
  }

  function renderMarkdown(rawText) {
    if (!rawText) return '';
    let text = escapeHtml(rawText);
    // Bold: **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Bullet points: - or * or • at start of line
    text = text.replace(/^[ \t]*[-*•][ \t]+(.*)$/gm, '<li style="margin-left: 14px; list-style-type: disc; margin-bottom: 3px;">$1</li>');
    // Convert multiple sequential <li> into <ul>
    text = text.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul style="margin: 6px 0; padding-left: 4px;">$1</ul>');
    // Numbered lists: 1. or 2.
    text = text.replace(/^[ \t]*(\d+)\.[ \t]+(.*)$/gm, '<li style="margin-left: 14px; list-style-type: decimal; margin-bottom: 3px;">$1</li>');
    // Line breaks (except around <ul>/<li>)
    text = text.replace(/\n/g, '<br>');
    text = text.replace(/<\/ul><br>/g, '</ul>');
    text = text.replace(/<br><ul/g, '<ul');
    return text;
  }

  // Smoothly and reliably auto-scroll chatbot viewport to bottom
  function scrollChatToBottom(smooth = true) {
    const viewport = document.getElementById('viewViewport');
    if (!viewport) return;

    const performScroll = () => {
      try {
        const targetScrollTop = viewport.scrollHeight;
        if (typeof viewport.scrollTo === 'function') {
          viewport.scrollTo({
            top: targetScrollTop,
            behavior: smooth ? 'smooth' : 'auto'
          });
        } else {
          viewport.scrollTop = targetScrollTop;
        }
      } catch (err) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    };

    // 1st frame: immediate scroll
    performScroll();

    // 2nd frame: requestAnimationFrame after DOM tree insertion
    requestAnimationFrame(() => {
      performScroll();
    });

    // 3rd & 4th passes: after markdown styling, line wraps, dynamic element heights
    setTimeout(performScroll, 50);
    setTimeout(performScroll, 160);
    setTimeout(performScroll, 320);
  }

  function appendChatBubble(role, text) {
    if (!chatbotMessagesContainer) return null;
    const msgEl = document.createElement('div');
    msgEl.className = `chat-message ${role}`;
    if (role === 'bot') {
      const formatted = (typeof renderMarkdown === 'function') ? renderMarkdown(text) : escapeHtml(text).replace(/\n/g, '<br>');
      msgEl.innerHTML = `
        <div class="chat-avatar">AI</div>
        <div class="chat-bubble">${formatted}</div>
      `;
    } else {
      msgEl.innerHTML = `
        <div class="chat-bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
      `;
    }

    const anchor = document.getElementById('chatbotScrollAnchor');
    if (anchor && anchor.parentNode === chatbotMessagesContainer) {
      chatbotMessagesContainer.insertBefore(msgEl, anchor);
    } else {
      chatbotMessagesContainer.appendChild(msgEl);
    }

    scrollChatToBottom(true);
    return msgEl;
  }

  function appendTypingIndicator() {
    if (!chatbotMessagesContainer) return null;
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message bot typing-message';
    msgEl.innerHTML = `
      <div class="chat-avatar">AI</div>
      <div class="chat-bubble">
        <div class="typing-dots">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
    `;

    const anchor = document.getElementById('chatbotScrollAnchor');
    if (anchor && anchor.parentNode === chatbotMessagesContainer) {
      chatbotMessagesContainer.insertBefore(msgEl, anchor);
    } else {
      chatbotMessagesContainer.appendChild(msgEl);
    }

    scrollChatToBottom(true);
    return msgEl;
  }

  // Event Listeners for Chatbot
  if (chatbotInputForm) {
    chatbotInputForm.addEventListener('submit', handleChatbotQuestionSubmit);
  }

  if (chatbotInputText) {
    chatbotInputText.addEventListener('input', () => {
      if (chatbotSendBtn) {
        chatbotSendBtn.disabled = !chatbotInputText.value.trim() || state.chatbotState.isSendingQuestion;
      }
    });

    chatbotInputText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChatbotQuestionSubmit(e);
      }
    });
  }

  if (chatbotNoticeRetryBtn) {
    chatbotNoticeRetryBtn.addEventListener('click', () => {
      initChatbotSession(true);
    });
  }

  // ----------------------------------------------------
  // Helper Functions
  // ----------------------------------------------------
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getMockResultData() {
    return {
      stats: {
        analyzedCount: 41,
        excludedCount: 9,
        savingsPercent: "94.0",
        formattedRawSize: "24.8 KB",
        formattedCleanSize: "1.5 KB"
      },
      structuredResult: {
        topKeywords: [
          { word: "보습력", percentage: 78, sentiment: "neutral" },
          { word: "끈적임", percentage: 54, sentiment: "negative" },
          { word: "흡수력", percentage: 48, sentiment: "positive" },
          { word: "가성비", percentage: 42, sentiment: "positive" },
          { word: "향/냄새", percentage: 35, sentiment: "neutral" },
          { word: "용량", percentage: 20, sentiment: "negative" }
        ],
        positivePoints: [
          { title: "하나로 끝나는 편리함", percentage: 68, description: "세안·면도 후 이것 하나만 바르면 돼서 바쁜 아침에 편하다는 평이 가장 많아요." },
          { title: "끈적임 없는 산뜻한 흡수", percentage: 54, description: "젤 제형이라 빠르게 스며들고 번들거림이 적어요." },
          { title: "은은하고 무난한 향", percentage: 31, description: "진한 남성 화장품 향이 아니라 호불호가 적어요." }
        ],
        negativePoints: [
          { title: "건성 피부엔 보습 부족", percentage: 22, description: "겨울이나 건조한 피부는 크림을 따로 덧발라야 했다는 의견이 있어요." },
          { title: "생각보다 빨리 줄어드는 양", percentage: 12, description: "넉넉히 쓰면 한두 달이면 다 쓴다는 평이 있어요." },
          { title: "향이 금방 사라짐", percentage: 7, description: "향을 기대했다면 지속력이 짧게 느껴질 수 있어요." }
        ]
      },
      filterStats: { sponsored: 2, emoji_overload: 1, totalExcluded: 3 }
    };
  }

});

/**
 * Coupang In-Page Content Script
 * Implements Prototype UI 0___.png:
 * - Floating Pill Action Button at Bottom-Right: [Icon] 리뷰 요약 [실제 리뷰 수]
 * - Dynamic & Accurate Product Review Count Parsing (NOT a dummy number)
 * - Smooth Right Slide-In Side Panel / Drawer with Prototype UI (popup.html)
 */

(function () {
  if (window.__COUPANG_AI_REVIEW_INJECTED__) return;
  window.__COUPANG_AI_REVIEW_INJECTED__ = true;

  function getProductIdFromUrl() {
    const url = window.location.href;
    const match = url.match(/\/products\/([0-9]+)/) || url.match(/[?&]productId=([0-9]+)/);
    return match ? match[1] : null;
  }

  const productId = getProductIdFromUrl();
  if (!productId) {
    return;
  }

  console.log(`[Coupang AI Review Summarizer] Initialized for Product ID: ${productId}`);

  let cachedProductInfo = {
    productId,
    title: '',
    reviewCount: null, // null until resolved
    rating: 4.5,
    imageUrl: ''
  };

  /**
   * Scrape Product Metadata and REAL Review Count from Coupang Page DOM
   */
  function scrapePageProductInfo() {
    // 1. Scrape Title
    let title = '';
    const titleEl = document.querySelector('h1.prod-buy-header__title') ||
      document.querySelector('.prod-buy-header__title') ||
      document.querySelector('.prod-header__title');
    if (titleEl) {
      title = titleEl.textContent.trim();
    } else {
      title = document.title.replace(' - 쿠팡!', '').replace('쿠팡!', '').trim();
    }

    // 2. Scrape REAL Review Count (Must be actual review count of the current product page)
    let reviewCount = null;
    const countSelectors = [
      '.prod-buy-header__product-review-count',
      'span.count',
      '.prod-review__count',
      '.prod-star-rating__count',
      'a.prod-buy-header__product-review',
      'a[href*="#sdp-review"]',
      'span.rating-count',
      '.total-count'
    ];

    for (const sel of countSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        // Parse numbers with comma, e.g. "25,646", "25,646개 상품평", "(25,646)"
        const match = text.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)/);
        if (match) {
          const parsed = parseInt(match[1].replace(/,/g, ''), 10);
          if (!isNaN(parsed) && parsed >= 0) {
            reviewCount = parsed;
            break;
          }
        }
      }
    }

    // Check embedded JSON script if DOM element not hydrated yet
    if (reviewCount === null) {
      try {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const s of scripts) {
          const json = JSON.parse(s.textContent);
          if (json && json.aggregateRating && json.aggregateRating.reviewCount) {
            reviewCount = parseInt(json.aggregateRating.reviewCount, 10);
            break;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // 3. Scrape Rating
    let rating = 4.5;
    const starEl = document.querySelector('.rating-star-num') ||
      document.querySelector('.star-rating') ||
      document.querySelector('.prod-star-rating__rating-number');
    if (starEl) {
      const match = starEl.textContent.match(/[\d.]+/);
      if (match) rating = parseFloat(match[0]);
    }

    // 4. Scrape Thumbnail Image
    let imageUrl = '';
    const imgEl = document.querySelector('.prod-image__detail') ||
      document.querySelector('#repImageContainer img') ||
      document.querySelector('.prod-buy-header img');
    if (imgEl && imgEl.src) {
      imageUrl = imgEl.src;
    }

    cachedProductInfo = {
      productId,
      title: title || cachedProductInfo.title,
      reviewCount: (reviewCount !== null) ? reviewCount : cachedProductInfo.reviewCount,
      rating: rating || cachedProductInfo.rating,
      imageUrl: imageUrl || cachedProductInfo.imageUrl
    };

    return cachedProductInfo;
  }

  /**
   * Fetch Exact Review Count from Coupang Backend API as definitive source
   */
  async function fetchExactReviewCountFromApi() {
    try {
      const apiUrl = `https://www.coupang.com/next-api/review?productId=${productId}&page=1&size=1`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include'
      });

      if (response.ok) {
        const json = await response.json();
        const totalCount = json?.rData?.reviewTotalCount || json?.rData?.ratingSummaryTotal?.ratingCount;
        if (typeof totalCount === 'number') {
          cachedProductInfo.reviewCount = totalCount;
          updateFloatingButtonCount(totalCount);
          console.log(`[Coupang AI Review] Resolved real review count from API: ${totalCount}`);
          return totalCount;
        }
      }
    } catch (e) {
      console.warn('[Coupang AI Review] Failed to fetch review count from API:', e);
    }
    return null;
  }

  function updateFloatingButtonCount(count) {
    const badgeEl = document.getElementById('coupangAiPillCount');
    if (!badgeEl) return;

    if (count !== null && count !== undefined) {
      badgeEl.textContent = Number(count).toLocaleString();
    } else {
      badgeEl.textContent = '...';
    }
  }

  // Create In-Page DOM Elements (Prototype 0___.png)
  function injectPrototypeWidget() {
    scrapePageProductInfo();

    // 1. Floating Pill Button (Bottom Right)
    const floatingBtn = document.createElement('button');
    floatingBtn.className = 'coupang-ai-pill-btn';
    floatingBtn.id = 'coupangAiPillBtn';
    floatingBtn.setAttribute('title', 'AI 리뷰 요약 열기');
    floatingBtn.innerHTML = `
      <span class="coupang-ai-pill-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/>
        </svg>
      </span>
      <span class="coupang-ai-pill-label">리뷰 요약</span>

    `;
    document.body.appendChild(floatingBtn);

    // Initial badge update if already parsed from DOM
    if (cachedProductInfo.reviewCount !== null) {
      updateFloatingButtonCount(cachedProductInfo.reviewCount);
    } else {
      // Fetch exact count from API
      fetchExactReviewCountFromApi();
    }

    // 2. Drawer Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'coupang-ai-side-backdrop';
    backdrop.id = 'coupangAiSideBackdrop';
    document.body.appendChild(backdrop);

    // 3. Side Panel Drawer Container
    const drawer = document.createElement('div');
    drawer.className = 'coupang-ai-side-drawer';
    drawer.id = 'coupangAiSideDrawer';

    // Embed popup.html via iframe for 100% css isolation and perfect prototype view rendering
    const iframeUrl = chrome.runtime.getURL('popup.html');
    drawer.innerHTML = `
      <div class="coupang-ai-drawer-frame-wrap">
        <iframe class="coupang-ai-iframe" id="coupangAiIframe" src="${iframeUrl}" allow="clipboard-read; clipboard-write"></iframe>
      </div>
    `;
    document.body.appendChild(drawer);

    // Event Handlers
    let isOpen = false;

    function openDrawer() {
      isOpen = true;
      drawer.classList.add('open');
      backdrop.classList.add('visible');
      document.body.classList.add('coupang-ai-drawer-active');
    }

    function closeDrawer() {
      isOpen = false;
      drawer.classList.remove('open');
      backdrop.classList.remove('visible');
      document.body.classList.remove('coupang-ai-drawer-active');
    }

    floatingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    backdrop.addEventListener('click', () => {
      closeDrawer();
    });

    // Listen for commands from iframe or background
    window.addEventListener('message', (event) => {
      if (!event.data) return;
      if (event.data.action === 'CLOSE_COUPANG_AI_DRAWER') {
        closeDrawer();
      } else if (event.data.action === 'COUPANG_AI_LOG_REVIEWS') {
        const { analyzed = [], excluded = [], starCounts = {} } = event.data.payload || {};
        window.__ANALYZED_REVIEWS__ = analyzed;
        window.__EXCLUDED_REVIEWS__ = excluded;

        console.group(
          `%c[쿠팡 AI 요약기] 📊 분석 완료: 총 ${analyzed.length}개 리뷰 무작위 추출됨 (제외 ${excluded.length}개)`,
          'background: #1e3a8a; color: #fff; font-weight: bold; font-size: 13px; padding: 4px 8px; border-radius: 4px;'
        );
        console.log(
          `%cℹ️ F12 콘솔 창에서 window.__ANALYZED_REVIEWS__ 를 입력하면 원본 리뷰 전체 배열을 확인할 수 있습니다.`,
          'color: #0369a1; font-size: 11.5px;'
        );
        console.log(
          `%c⭐ 분석된 별점 분포: ★5: ${starCounts[5] || 0}개 | ★4: ${starCounts[4] || 0}개 | ★3: ${starCounts[3] || 0}개 | ★2: ${starCounts[2] || 0}개 | ★1: ${starCounts[1] || 0}개`,
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
      }
    });

    // Escape key closes drawer
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeDrawer();
      }
    });

    // Observe DOM changes to catch dynamically loaded review counts
    const observer = new MutationObserver(() => {
      if (cachedProductInfo.reviewCount === null) {
        const info = scrapePageProductInfo();
        if (info.reviewCount !== null) {
          updateFloatingButtonCount(info.reviewCount);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Polling retry for hydrated client-side rendering
    setTimeout(() => {
      scrapePageProductInfo();
      if (cachedProductInfo.reviewCount !== null) {
        updateFloatingButtonCount(cachedProductInfo.reviewCount);
      } else {
        fetchExactReviewCountFromApi();
      }
    }, 1500);
  }

  // Handle messages from Popup or Background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_PAGE_PRODUCT_INFO') {
      const info = scrapePageProductInfo();
      sendResponse({ success: true, data: info });
    }
  });

  // Inject when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPrototypeWidget);
  } else {
    injectPrototypeWidget();
  }

})();

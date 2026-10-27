(function () {
  const STORAGE_KEY = 'tvs_borgonovo_cart_v1';
  const BUYER_STORAGE_KEY = 'tvs_borgonovo_buyer_v1';
  const PROMO_STORAGE_KEY = 'tvs_borgonovo_promo_v1';

  const VALID_PROMOS = {
    quocnt: 0.2
  };

  // Ordered Category Definitions so products never mix Chảo -> Xoong -> Chảo -> Nồi
  const CATEGORY_META = [
    { id: 'Chảo chống dính Ý', icon: '🍳', title: 'Chảo chống dính Ý', subtitle: 'TVS Italy cao cấp • Đầy đủ kích thước ø16cm – ø28cm' },
    { id: 'Nồi & Xoong Ý', icon: '🍲', title: 'Nồi & Xoong Ý', subtitle: 'TVS Italy • Nồi kèm vung kính & xoong quánh chống dính / phủ gốm' },
    { id: 'Lọ & Hũ thủy tinh', icon: '🫙', title: 'Lọ & Hũ thủy tinh Ý', subtitle: 'Borgonovo Italy • Thủy tinh không chì an toàn thực phẩm' },
    { id: 'Bình giữ nhiệt', icon: '🌡️', title: 'Bình thủy giữ nhiệt Ý', subtitle: 'Giữ nhiệt nóng/lạnh 0.5L – 2.8L' },
    { id: 'Bộ cốc & Ly thủy tinh', icon: '🥂', title: 'Bộ cốc & Ly thủy tinh Ý', subtitle: 'Borgonovo Italy • Thủy tinh cao cấp trong suốt' },
    { id: 'Phụ kiện bàn ăn', icon: '🍊', title: 'Phụ kiện nhà bếp & Bàn ăn', subtitle: 'Borgonovo Italy' },
    { id: 'Vung kính', icon: '🛡️', title: 'Vung kính rời & Hàng tặng kèm', subtitle: 'Vung kính chịu nhiệt ø16cm – ø24cm' }
  ];

  const CATEGORY_ORDER_MAP = new Map(CATEGORY_META.map((c, idx) => [c.id, idx]));

  const DIAMETER_SIZES = ['ø14cm', 'ø16cm', 'ø18cm', 'ø20cm', 'ø22cm', 'ø24cm', 'ø26cm', 'ø28cm'];
  const CAPACITY_SIZES = ['420ml', '0.5L', '1L', '1.5L', '2L', '2.8L', '3.1L', '4.25L'];

  const products = Array.isArray(window.CATALOG_PRODUCTS) ? window.CATALOG_PRODUCTS : [];
  const productByCode = new Map(products.map((p) => [p.code, p]));

  // State
  let cart = loadCart(); // Map<code, qty>
  let buyerInfo = loadBuyerInfo();
  let promoCode = loadPromoCode();
  let activeCategory = 'ALL';
  let selectedSizes = new Set();   // Set<string> e.g. 'ø20cm', 'ø24cm'
  let selectedSeries = new Set();  // Set<string> e.g. 'Blackstone', 'Velvet'
  let searchQuery = '';
  let sortBy = 'category-asc';
  let onlyInCart = false;
  let activePhotoIndexByCode = new Map(); // code -> 0 or 1
  let currentLightboxProduct = null;

  const vndFormatter = new Intl.NumberFormat('vi-VN');

  function formatVND(amount) {
    return `${vndFormatter.format(Math.round(Number(amount) || 0))} ₫`;
  }

  function parseNumericSize(sizeStr) {
    if (!sizeStr) return 9999;
    const mCm = sizeStr.match(/(\d+(?:\.\d+)?)\s*cm/i);
    if (mCm) return parseFloat(mCm[1]);
    const mMl = sizeStr.match(/(\d+(?:\.\d+)?)\s*ml/i);
    if (mMl) return parseFloat(mMl[1]) / 1000;
    const mL = sizeStr.match(/(\d+(?:\.\d+)?)\s*L/i);
    if (mL) return parseFloat(mL[1]) * 100;
    return 9999;
  }

  function getDiscountRate() {
    return VALID_PROMOS[promoCode] || 0;
  }

  function getEffectivePrice(basePrice) {
    const rate = getDiscountRate();
    return rate > 0 ? Math.round(basePrice * (1 - rate)) : basePrice;
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      const map = new Map();
      for (const [k, v] of Object.entries(obj)) {
        const code = Number(k);
        const qty = Math.max(0, Math.floor(Number(v) || 0));
        if (qty > 0 && productByCode.has(code)) {
          map.set(code, qty);
        }
      }
      return map;
    } catch {
      return new Map();
    }
  }

  function saveCart() {
    try {
      const obj = {};
      for (const [code, qty] of cart.entries()) {
        if (qty > 0) obj[code] = qty;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore storage errors
    }
  }

  function loadBuyerInfo() {
    try {
      const raw = localStorage.getItem(BUYER_STORAGE_KEY);
      if (!raw) return { name: '', phone: '', note: '' };
      return { name: '', phone: '', note: '', ...JSON.parse(raw) };
    } catch {
      return { name: '', phone: '', note: '' };
    }
  }

  function saveBuyerInfo() {
    try {
      localStorage.setItem(BUYER_STORAGE_KEY, JSON.stringify(buyerInfo));
    } catch {
      // Ignore storage errors
    }
  }

  function loadPromoCode() {
    try {
      const saved = (localStorage.getItem(PROMO_STORAGE_KEY) || '').trim().toLowerCase();
      return VALID_PROMOS[saved] ? saved : '';
    } catch {
      return '';
    }
  }

  function savePromoCode() {
    try {
      if (promoCode) {
        localStorage.setItem(PROMO_STORAGE_KEY, promoCode);
      } else {
        localStorage.removeItem(PROMO_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  function applyPromoCode(rawInput) {
    const clean = String(rawInput || '').trim().toLowerCase();
    const statusEl = document.getElementById('promo-status');

    if (!clean) {
      promoCode = '';
      savePromoCode();
      syncPromoUI();
      renderCatalog();
      updateCartSummaryUI();
      renderCartModalContent();
      showToast('Đã gỡ mã giảm giá.');
      return;
    }

    if (VALID_PROMOS[clean]) {
      promoCode = clean;
      savePromoCode();
      syncPromoUI();
      renderCatalog();
      updateCartSummaryUI();
      renderCartModalContent();
      showToast(`🎉 Đã áp dụng mã ${clean.toUpperCase()}: Giảm thêm ${Math.round(VALID_PROMOS[clean] * 100)}%!`);
    } else {
      if (statusEl) {
        statusEl.textContent = 'Mã không hợp lệ';
        statusEl.classList.add('is-error');
      }
      showToast('Mã giảm giá không đúng.');
    }
  }

  function syncPromoUI() {
    const inputEl = document.getElementById('promo-code-input');
    const modalInputEl = document.getElementById('modal-promo-input');
    const clearBtn = document.getElementById('promo-clear-btn');
    const statusEl = document.getElementById('promo-status');
    const rate = getDiscountRate();

    if (inputEl && document.activeElement !== inputEl) {
      inputEl.value = promoCode;
    }
    if (modalInputEl && document.activeElement !== modalInputEl) {
      modalInputEl.value = promoCode;
    }
    if (clearBtn) {
      clearBtn.hidden = !promoCode;
    }
    if (statusEl) {
      statusEl.classList.remove('is-error');
      statusEl.textContent = rate > 0 ? `✓ Giảm ${Math.round(rate * 100)}%` : '';
    }
  }

  function createSvgPlaceholder(product) {
    const isLid = product.category === 'Vung kính';
    const iconSvg = isLid
      ? `<ellipse cx="200" cy="195" rx="105" ry="38" fill="none" stroke="#64748b" stroke-width="6"/><path d="M95 195 C95 140, 305 140, 305 195" fill="rgba(148,163,184,0.18)" stroke="#475569" stroke-width="5"/><rect x="182" y="128" width="36" height="14" rx="6" fill="#334155"/>`
      : `<rect x="145" y="125" width="48" height="95" rx="6" fill="rgba(148,163,184,0.2)" stroke="#475569" stroke-width="5"/><rect x="207" y="135" width="48" height="85" rx="6" fill="rgba(148,163,184,0.2)" stroke="#475569" stroke-width="5"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
      <rect width="400" height="400" fill="#f1f5f9"/>
      ${iconSvg}
      <text x="200" y="275" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="#334155">${escapeHtml(product.name)}</text>
      <text x="200" y="300" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#64748b">${escapeHtml(product.packSpec)}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function getProductImage(product, index = 0) {
    if (product.images && product.images.length > 0) {
      const safeIdx = Math.min(index, product.images.length - 1);
      return product.images[safeIdx];
    }
    return createSvgPlaceholder(product);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatSubtotalHtml(product, qty) {
    if (qty <= 0) return '';
    const effectivePrice = getEffectivePrice(product.price);
    const lineTotal = qty * effectivePrice;
    const boxes = product.packQty > 1
      ? ` (~${(qty / product.packQty).toFixed(qty % product.packQty === 0 ? 0 : 1)} thùng)`
      : '';
    return `Đã chọn: <strong>${qty} ${escapeHtml(product.unit)}${boxes}</strong> • <strong>${product.price > 0 ? formatVND(lineTotal) : '0 ₫'}</strong>`;
  }

  function setProductQty(code, newQty, showFeedback = false) {
    const product = productByCode.get(code);
    if (!product) return;
    const maxAllowed = product.stock > 0 ? product.stock : 999;
    const cleanQty = Math.max(0, Math.min(maxAllowed, Math.floor(Number(newQty) || 0)));

    if (cleanQty === 0) {
      cart.delete(code);
    } else {
      cart.set(code, cleanQty);
    }
    saveCart();
    updateSingleCardDOM(code);
    updateCartSummaryUI();
    if (showFeedback && cleanQty > 0) {
      showToast(`Đã chọn: ${product.name} (${cleanQty} ${product.unit})`);
    }
  }

  function updateSingleCardDOM(code) {
    const product = productByCode.get(code);
    if (!product) return;
    const card = document.querySelector(`.product-card[data-code="${code}"]`);
    if (!card) return;

    const qty = cart.get(code) || 0;
    card.classList.toggle('in-cart', qty > 0);

    const input = card.querySelector('.qty-input');
    if (input && document.activeElement !== input) {
      input.value = qty;
    }

    const minusBtn = card.querySelector('[data-action="dec"]');
    if (minusBtn) minusBtn.disabled = qty <= 0;

    const plusBtn = card.querySelector('[data-action="inc"]');
    if (plusBtn && product.stock > 0) {
      plusBtn.disabled = qty >= product.stock;
    }

    const subtotalEl = card.querySelector('.card-subtotal-text');
    if (subtotalEl) {
      subtotalEl.innerHTML = formatSubtotalHtml(product, qty);
    }
  }

  function compareProductsWithinCategory(a, b) {
    if (sortBy === 'price-asc') return a.price - b.price || parseNumericSize(a.size) - parseNumericSize(b.size) || a.code - b.code;
    if (sortBy === 'price-desc') return b.price - a.price || parseNumericSize(a.size) - parseNumericSize(b.size) || a.code - b.code;
    if (sortBy === 'stock-desc') return b.stock - a.stock || a.code - b.code;
    if (sortBy === 'size-asc') return parseNumericSize(a.size) - parseNumericSize(b.size) || a.series.localeCompare(b.series, 'vi') || a.code - b.code;
    if (sortBy === 'code-asc') return a.code - b.code;

    // Default ('category-asc'): group by Category -> Series -> Size (small to large) -> Code
    const catDiff = (CATEGORY_ORDER_MAP.get(a.category) ?? 99) - (CATEGORY_ORDER_MAP.get(b.category) ?? 99);
    if (catDiff !== 0) return catDiff;
    if (a.series !== b.series) {
      // Keep original series appearance order within the category, or alphabetical
      return a.code - b.code;
    }
    const sizeDiff = parseNumericSize(a.size) - parseNumericSize(b.size);
    if (sizeDiff !== 0) return sizeDiff;
    return a.code - b.code;
  }

  function getFilteredProducts() {
    const q = searchQuery.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (onlyInCart && !cart.has(p.code)) return false;
      if (activeCategory !== 'ALL' && p.category !== activeCategory) return false;
      if (selectedSizes.size > 0 && !selectedSizes.has(p.size)) return false;
      if (selectedSeries.size > 0 && !selectedSeries.has(p.series)) return false;
      if (q) {
        const hay = `${p.code} #${p.code} ${p.name} ${p.series} ${p.category} ${p.brand} ${p.note} ${p.size}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort(compareProductsWithinCategory);
    return filtered;
  }

  function renderSidebar() {
    // 1. Categories list
    const catContainer = document.getElementById('sidebar-category-list');
    if (catContainer) {
      const counts = new Map();
      for (const p of products) {
        counts.set(p.category, (counts.get(p.category) || 0) + 1);
      }

      const itemsHtml = [
        `<button type="button" class="sidebar-cat-btn" data-cat="ALL" aria-pressed="${activeCategory === 'ALL'}">
          <span>📋 Tất cả danh mục</span>
          <span class="sidebar-cat-count">${products.length}</span>
        </button>`,
        ...CATEGORY_META.map((c) => {
          const count = counts.get(c.id) || 0;
          if (count === 0) return '';
          return `<button type="button" class="sidebar-cat-btn" data-cat="${escapeHtml(c.id)}" aria-pressed="${activeCategory === c.id}">
            <span>${c.icon} ${escapeHtml(c.title)}</span>
            <span class="sidebar-cat-count">${count}</span>
          </button>`;
        })
      ].join('');

      catContainer.innerHTML = itemsHtml;
    }

    // 2. Sizes (Diameter & Capacity)
    const diamContainer = document.getElementById('sidebar-size-diameter');
    const capContainer = document.getElementById('sidebar-size-capacity');
    const clearSizeBtn = document.getElementById('clear-size-filter-btn');

    if (clearSizeBtn) {
      clearSizeBtn.hidden = selectedSizes.size === 0;
    }

    if (diamContainer) {
      diamContainer.innerHTML = DIAMETER_SIZES.map(
        (sz) => `<button type="button" class="filter-chip" data-size="${escapeHtml(sz)}" aria-pressed="${selectedSizes.has(sz)}">${escapeHtml(sz)}</button>`
      ).join('');
    }

    if (capContainer) {
      capContainer.innerHTML = CAPACITY_SIZES.map(
        (sz) => `<button type="button" class="filter-chip" data-size="${escapeHtml(sz)}" aria-pressed="${selectedSizes.has(sz)}">${escapeHtml(sz)}</button>`
      ).join('');
    }

    // 3. Brand / Series list (sorted by product count desc, then name)
    const seriesContainer = document.getElementById('sidebar-series-list');
    const clearSeriesBtn = document.getElementById('clear-series-filter-btn');

    if (clearSeriesBtn) {
      clearSeriesBtn.hidden = selectedSeries.size === 0;
    }

    if (seriesContainer) {
      const seriesCounts = new Map();
      const seriesBrand = new Map();
      for (const p of products) {
        seriesCounts.set(p.series, (seriesCounts.get(p.series) || 0) + 1);
        seriesBrand.set(p.series, p.brand);
      }

      const sortedSeries = Array.from(seriesCounts.entries()).sort((a, b) => {
        // Put TVS cookware lines first, then sort by count descending
        const brandA = seriesBrand.get(a[0]) === 'TVS Italy' ? 0 : 1;
        const brandB = seriesBrand.get(b[0]) === 'TVS Italy' ? 0 : 1;
        if (brandA !== brandB) return brandA - brandB;
        return b[1] - a[1] || a[0].localeCompare(b[0], 'vi');
      });

      seriesContainer.innerHTML = sortedSeries
        .map(([seriesName, count]) => {
          const isChecked = selectedSeries.has(seriesName);
          return `<button type="button" class="series-check-btn" data-series="${escapeHtml(seriesName)}" aria-pressed="${isChecked}">
            <span class="series-check-indicator">
              <span class="series-box" aria-hidden="true">✓</span>
              <span>${escapeHtml(seriesName)}</span>
            </span>
            <span class="sidebar-cat-count">${count}</span>
          </button>`;
        })
        .join('');
    }

    const resetAllBtn = document.getElementById('reset-all-filters-btn');
    const hasAnyFilter =
      activeCategory !== 'ALL' ||
      selectedSizes.size > 0 ||
      selectedSeries.size > 0 ||
      onlyInCart ||
      searchQuery.trim() !== '';
    if (resetAllBtn) {
      resetAllBtn.hidden = !hasAnyFilter;
    }
  }

  function renderActiveFilterTags(filteredCount) {
    const bar = document.getElementById('active-filters-bar');
    const tagsEl = document.getElementById('active-filter-tags');
    const countLabel = document.getElementById('showing-count');

    if (!bar || !tagsEl) return;

    const tags = [];
    if (activeCategory !== 'ALL') {
      tags.push(`<span class="active-tag">Danh mục: ${escapeHtml(activeCategory)} <button type="button" data-clear-type="cat" aria-label="Bỏ lọc danh mục">✕</button></span>`);
    }
    for (const sz of selectedSizes) {
      tags.push(`<span class="active-tag">Size: ${escapeHtml(sz)} <button type="button" data-clear-type="size" data-val="${escapeHtml(sz)}" aria-label="Bỏ lọc size ${escapeHtml(sz)}">✕</button></span>`);
    }
    for (const sr of selectedSeries) {
      tags.push(`<span class="active-tag">Dòng: ${escapeHtml(sr)} <button type="button" data-clear-type="series" data-val="${escapeHtml(sr)}" aria-label="Bỏ lọc dòng ${escapeHtml(sr)}">✕</button></span>`);
    }
    if (onlyInCart) {
      tags.push(`<span class="active-tag">Đang chọn trong giỏ <button type="button" data-clear-type="cart" aria-label="Bỏ lọc giỏ hàng">✕</button></span>`);
    }
    if (searchQuery.trim()) {
      tags.push(`<span class="active-tag">Từ khóa: "${escapeHtml(searchQuery.trim())}" <button type="button" data-clear-type="search" aria-label="Xóa từ khóa">✕</button></span>`);
    }

    if (tags.length > 0) {
      tags.push(`<button type="button" class="sidebar-clear-link" data-clear-type="all">Xóa tất cả bộ lọc</button>`);
    }

    bar.hidden = false;
    tagsEl.innerHTML = tags.join('');
    if (countLabel) {
      countLabel.textContent = `Hiển thị ${filteredCount}/${products.length} mặt hàng`;
    }
  }

  function renderProductCardHtml(p, globalCardIndex, rate, ratePercent) {
    const qty = cart.get(p.code) || 0;
    const photoIdx = activePhotoIndexByCode.get(p.code) || 0;
    const imgSrc = getProductImage(p, photoIdx);
    const hasTwoPhotos = p.images && p.images.length > 1;

    // Follow modern-web-guidance `optimize-image-priority`:
    // 1st visible image gets fetchpriority="high" (no loading="lazy").
    // Cards 2-4 omit fetchpriority and loading="lazy" (above the fold).
    // Cards 5+ get loading="lazy" alone (without fetchpriority="low").
    let imgPriorityAttrs = '';
    if (globalCardIndex === 0) {
      imgPriorityAttrs = 'fetchpriority="high"';
    } else if (globalCardIndex >= 4) {
      imgPriorityAttrs = 'loading="lazy"';
    }

    const stockClass = p.stock > 0 && p.stock <= 15 ? 'stock-pill low-stock' : 'stock-pill';
    const stockText = p.stock > 0 ? `Kho: ${p.stock}` : 'Hết';

    const effectivePrice = getEffectivePrice(p.price);
    let priceHtml = '';
    if (p.price > 0) {
      if (rate > 0) {
        priceHtml = `<div class="price-block">
          <span class="price-value">${formatVND(effectivePrice)}</span>
          <del class="price-old">${formatVND(p.price)}</del>
          <span class="discount-badge">-${ratePercent}%</span>
        </div>`;
      } else {
        priceHtml = `<div class="price-block">
          <span class="price-value">${formatVND(p.price)}</span>
          <span class="price-unit">/${escapeHtml(p.unit)}</span>
        </div>`;
      }
    } else {
      priceHtml = `<div class="price-gift">0 ₫ (Tặng kèm)</div>`;
    }

    const subtotalHtml = formatSubtotalHtml(p, qty);

    return `<article class="product-card ${qty > 0 ? 'in-cart' : ''}" data-code="${p.code}">
      <img
        src="${escapeHtml(imgSrc)}"
        alt="${escapeHtml(p.name)} - #${p.code}"
        width="400"
        height="400"
        ${imgPriorityAttrs}
        data-action="zoom"
      />
      <header>
        <div class="card-meta-row">
          <span class="code-badge">#${p.code}</span>
          <div class="spec-pill-group">
            <span class="spec-pill series-pill-accent">${escapeHtml(p.series)}</span>
            ${p.size ? `<span class="spec-pill">${escapeHtml(p.size)}</span>` : ''}
            ${p.packSpec ? `<span class="spec-pill">${escapeHtml(p.packSpec)}</span>` : ''}
          </div>
        </div>
        <h3>${escapeHtml(p.name)}</h3>
        ${
          hasTwoPhotos
            ? `<div class="photo-tools">
                <button type="button" class="photo-chip" data-action="switch-photo" data-photo-idx="0" aria-pressed="${photoIdx === 0}">Mặt trước</button>
                <button type="button" class="photo-chip" data-action="switch-photo" data-photo-idx="1" aria-pressed="${photoIdx === 1}">Mặt sau</button>
              </div>`
            : ''
        }
      </header>
      <div class="card-details">
        <div class="price-stock-row">
          ${priceHtml}
          <span class="${stockClass}">${escapeHtml(stockText)}</span>
        </div>
        ${p.note ? `<p class="note-callout">📌 ${escapeHtml(p.note)}</p>` : ''}
      </div>
      <footer>
        <div class="qty-control-row">
          <div class="qty-stepper" role="group" aria-label="Số lượng ${escapeHtml(p.name)}">
            <button type="button" class="qty-btn" data-action="dec" aria-label="Giảm" ${qty <= 0 ? 'disabled' : ''}>−</button>
            <input
              type="number"
              class="qty-input"
              min="0"
              max="${p.stock > 0 ? p.stock : 999}"
              value="${qty}"
              aria-label="Số lượng ${escapeHtml(p.name)}"
            />
            <button type="button" class="qty-btn" data-action="inc" aria-label="Tăng" ${p.stock > 0 && qty >= p.stock ? 'disabled' : ''}>+</button>
          </div>
          <div class="quick-qty-group">
            ${
              p.packQty > 1 && p.stock >= p.packQty
                ? `<button type="button" class="quick-qty-btn" data-action="add-pack" title="Thêm 1 thùng (${p.packQty} ${escapeHtml(p.unit)})">+1 Thùng (${p.packQty})</button>`
                : ''
            }
            ${
              p.stock > 0
                ? `<button type="button" class="quick-qty-btn" data-action="take-all" title="Lấy hết tồn kho (${p.stock})">Hết (${p.stock})</button>`
                : ''
            }
          </div>
        </div>
        <div class="card-Subtotal-bar">
          <span class="card-subtotal-text">${subtotalHtml}</span>
        </div>
      </footer>
    </article>`;
  }

  function renderCatalog() {
    const contentEl = document.getElementById('catalog-content');
    if (!contentEl) return;

    const list = getFilteredProducts();
    renderSidebar();
    renderActiveFilterTags(list.length);

    if (list.length === 0) {
      contentEl.innerHTML = `<div class="empty-state">
        <p><strong>Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại.</strong></p>
        <button type="button" class="btn btn-outline" id="reset-filters-btn">Xóa tất cả bộ lọc</button>
      </div>`;
      const resetBtn = document.getElementById('reset-filters-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
      }
      return;
    }

    const rate = getDiscountRate();
    const ratePercent = Math.round(rate * 100);
    let globalCardIdx = 0;

    // Group into clear Category sections so Chảo, Nồi & Xoong, Lọ, Bình, Cốc, Vung are always separated cleanly
    const byCategory = new Map();
    for (const p of list) {
      if (!byCategory.has(p.category)) {
        byCategory.set(p.category, []);
      }
      byCategory.get(p.category).push(p);
    }

    const sectionsHtml = CATEGORY_META.map((catMeta) => {
      const items = byCategory.get(catMeta.id);
      if (!items || items.length === 0) return '';

      const cardsHtml = items
        .map((p) => {
          const html = renderProductCardHtml(p, globalCardIdx, rate, ratePercent);
          globalCardIdx += 1;
          return html;
        })
        .join('');

      return `<section class="category-group" aria-label="${escapeHtml(catMeta.title)}">
        <div class="category-group-header">
          <h2 class="category-group-title">
            <span aria-hidden="true">${catMeta.icon}</span>
            <span>${escapeHtml(catMeta.title)} (${items.length})</span>
          </h2>
          <span class="category-group-subtitle">${escapeHtml(catMeta.subtitle)}</span>
        </div>
        <div class="catalog-grid">
          ${cardsHtml}
        </div>
      </section>`;
    }).join('');

    contentEl.innerHTML = sectionsHtml;
  }

  function calculateTotals() {
    let totalTypes = 0;
    let totalUnits = 0;
    let subtotalAmount = 0;

    for (const [code, qty] of cart.entries()) {
      const p = productByCode.get(code);
      if (!p || qty <= 0) continue;
      totalTypes += 1;
      totalUnits += qty;
      subtotalAmount += qty * p.price;
    }

    const rate = getDiscountRate();
    const discountAmount = rate > 0 ? Math.round(subtotalAmount * rate) : 0;
    const finalAmount = subtotalAmount - discountAmount;

    return { totalTypes, totalUnits, subtotalAmount, discountAmount, finalAmount, rate };
  }

  function updateCartSummaryUI() {
    const { totalTypes, totalUnits, finalAmount, rate } = calculateTotals();

    const headerCount = document.getElementById('header-cart-count');
    if (headerCount) headerCount.textContent = totalTypes;

    const headerTotal = document.getElementById('header-cart-total');
    if (headerTotal) headerTotal.textContent = formatVND(finalAmount);

    const stickyBar = document.getElementById('sticky-cart-bar');
    if (stickyBar) {
      stickyBar.hidden = totalTypes === 0;
    }

    const stickyTypes = document.getElementById('sticky-cart-types');
    if (stickyTypes) stickyTypes.textContent = totalTypes;

    const stickyUnits = document.getElementById('sticky-cart-units');
    if (stickyUnits) stickyUnits.textContent = vndFormatter.format(totalUnits);

    const stickyPrice = document.getElementById('sticky-cart-price');
    if (stickyPrice) stickyPrice.textContent = formatVND(finalAmount);

    const stickyPromoNote = document.getElementById('sticky-promo-note');
    if (stickyPromoNote) {
      stickyPromoNote.textContent = rate > 0
        ? `(Đã giảm ${Math.round(rate * 100)}% mã ${promoCode.toUpperCase()} • Chưa VAT & VC)`
        : '(Chưa VAT & VC)';
    }

    const onlyCartBtn = document.getElementById('toggle-only-cart-btn');
    if (onlyCartBtn) {
      onlyCartBtn.textContent = onlyInCart
        ? `Đang lọc: Đã chọn (${totalTypes})`
        : `Đã chọn (${totalTypes})`;
      onlyCartBtn.setAttribute('aria-pressed', String(onlyInCart));
    }
  }

  function renderCartModalContent() {
    const container = document.getElementById('cart-items-container');
    const summaryEl = document.getElementById('cart-modal-summary');
    const exportBtn = document.getElementById('modal-export-xlsx-btn');
    const copyBtn = document.getElementById('modal-copy-order-btn');
    const clearBtn = document.getElementById('modal-clear-cart-btn');

    if (!container) return;

    const items = getCartItemsList();
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <p><strong>Giỏ hàng đang trống.</strong></p>
      </div>`;
      if (summaryEl) summaryEl.innerHTML = `Tổng cộng: <strong>0 ₫</strong>`;
      if (exportBtn) exportBtn.disabled = true;
      if (copyBtn) copyBtn.disabled = true;
      if (clearBtn) clearBtn.disabled = true;
      return;
    }

    if (exportBtn) exportBtn.disabled = false;
    if (copyBtn) copyBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;

    const { totalUnits, subtotalAmount, discountAmount, finalAmount, rate } = calculateTotals();

    const rowsHtml = items
      .map((item, idx) => {
        const { product: p, qty } = item;
        const effectivePrice = getEffectivePrice(p.price);
        const lineTotal = qty * effectivePrice;
        const imgSrc = getProductImage(p, 0);
        const boxesStr = p.packQty > 1
          ? `${(qty / p.packQty).toFixed(qty % p.packQty === 0 ? 0 : 1)} thùng (${p.packSpec})`
          : p.packSpec;

        const unitPriceCell = p.price > 0
          ? (rate > 0
              ? `<div><strong>${formatVND(effectivePrice)}</strong></div><del class="price-old">${formatVND(p.price)}</del>`
              : formatVND(p.price))
          : '0 ₫ (Tặng)';

        return `<tr data-code="${p.code}">
          <td>${idx + 1}</td>
          <td><strong>#${p.code}</strong></td>
          <td>
            <div class="cart-item-cell">
              <img src="${escapeHtml(imgSrc)}" alt="" class="cart-thumb" loading="lazy" />
              <div>
                <div><strong>${escapeHtml(p.name)}</strong> ${p.size ? `<span class="spec-pill">${escapeHtml(p.size)}</span>` : ''}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary)">
                  Kho: ${p.stock} • ${escapeHtml(p.packSpec)}
                  ${p.note ? ` • <span style="color:#92400e;font-weight:600">${escapeHtml(p.note)}</span>` : ''}
                </div>
              </div>
            </div>
          </td>
          <td class="num-col">${unitPriceCell}</td>
          <td>
            <div class="qty-control-row">
              <div class="qty-stepper">
                <button type="button" class="qty-btn" data-cart-action="dec">−</button>
                <input type="number" class="qty-input" min="1" max="${p.stock > 0 ? p.stock : 999}" value="${qty}" data-cart-action="input" aria-label="Số lượng ${escapeHtml(p.name)}" />
                <button type="button" class="qty-btn" data-cart-action="inc">+</button>
              </div>
              ${
                p.stock > 0 && qty < p.stock
                  ? `<button type="button" class="quick-qty-btn" data-cart-action="max">Hết (${p.stock})</button>`
                  : ''
              }
            </div>
            <div style="font-size:0.74rem;color:var(--text-muted);margin-block-start:0.2rem">${escapeHtml(boxesStr)}</div>
          </td>
          <td class="num-col"><strong>${formatVND(lineTotal)}</strong></td>
          <td>
            <button type="button" class="btn btn-ghost" data-cart-action="remove" title="Xóa" aria-label="Xóa ${escapeHtml(p.name)}">✕</button>
          </td>
        </tr>`;
      })
      .join('');

    container.innerHTML = `<div class="cart-table-wrapper">
      <table class="cart-table">
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã</th>
            <th>Mặt hàng</th>
            <th class="num-col">Đơn giá</th>
            <th>Số lượng</th>
            <th class="num-col">Thành tiền</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

    if (summaryEl) {
      if (rate > 0) {
        summaryEl.innerHTML = `<strong>${items.length}</strong> mã (${vndFormatter.format(totalUnits)} SP) • Tạm tính: <del>${formatVND(subtotalAmount)}</del> • Mã <strong>${escapeHtml(promoCode.toUpperCase())} (-${Math.round(rate * 100)}%)</strong>: -${formatVND(discountAmount)} • Tổng: <strong style="font-size:1.15rem;color:var(--accent)">${formatVND(finalAmount)}</strong>`;
      } else {
        summaryEl.innerHTML = `<strong>${items.length}</strong> mã (${vndFormatter.format(totalUnits)} SP) • Tổng: <strong style="font-size:1.15rem;color:var(--accent)">${formatVND(finalAmount)}</strong> <span style="font-size:0.8rem;color:var(--text-secondary)">(Chưa VAT & VC)</span>`;
      }
    }
  }

  function getCartItemsList() {
    const list = [];
    for (const [code, qty] of cart.entries()) {
      const product = productByCode.get(code);
      if (product && qty > 0) {
        list.push({ product, qty });
      }
    }
    list.sort((a, b) => a.product.code - b.product.code);
    return list;
  }

  function handleExportExcel() {
    const items = getCartItemsList();
    if (items.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 sản phẩm để xuất Excel!');
      return;
    }

    syncBuyerInputs();
    const now = new Date();
    const dateSlug = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const safeBuyer = buyerInfo.name
      ? '-' + buyerInfo.name.trim().replace(/[^a-zA-Z0-9À-ỹ]+/g, '-')
      : '';
    const filename = `Don-Dat-Hang-Gia-Dung-Y${safeBuyer}-${dateSlug}.xlsx`;

    window.OrderExcelExporter.downloadOrderXlsx(
      {
        items,
        customerName: buyerInfo.name.trim(),
        customerPhone: buyerInfo.phone.trim(),
        customerNote: buyerInfo.note.trim(),
        promoCode,
        discountRate: getDiscountRate(),
        createdAt: now.toLocaleString('vi-VN')
      },
      filename
    );

    showToast(`Đã xuất file Excel: ${filename}`);
  }

  function handleCopyOrderText() {
    const items = getCartItemsList();
    if (items.length === 0) return;
    syncBuyerInputs();

    const { totalUnits, subtotalAmount, discountAmount, finalAmount, rate } = calculateTotals();
    const lines = [
      '📋 ĐƠN ĐẶT HÀNG THANH LÝ GIA DỤNG Ý',
      buyerInfo.name ? `👤 Khách hàng: ${buyerInfo.name}` : '',
      buyerInfo.phone ? `📞 SĐT: ${buyerInfo.phone}` : '',
      buyerInfo.note ? `📝 Ghi chú: ${buyerInfo.note}` : '',
      rate > 0 ? `🏷️ Mã giảm giá: ${promoCode.toUpperCase()} (-${Math.round(rate * 100)}%)` : '',
      '----------------------------------------'
    ].filter(Boolean);

    items.forEach((item, idx) => {
      const { product: p, qty } = item;
      const effectivePrice = getEffectivePrice(p.price);
      const lineTotal = qty * effectivePrice;
      lines.push(
        `${idx + 1}. [#${p.code}] ${p.name}: ${qty} ${p.unit} x ${formatVND(effectivePrice)} = ${formatVND(lineTotal)}${p.note ? ` (${p.note})` : ''}`
      );
    });

    lines.push('----------------------------------------');
    lines.push(`📦 Tổng: ${items.length} mã (${vndFormatter.format(totalUnits)} SP)`);
    if (rate > 0) {
      lines.push(`💵 Tạm tính: ${formatVND(subtotalAmount)}`);
      lines.push(`🏷️ Giảm ${Math.round(rate * 100)}% (${promoCode.toUpperCase()}): -${formatVND(discountAmount)}`);
    }
    lines.push(`💰 TỔNG CỘNG: ${formatVND(finalAmount)} (Chưa VAT & VC)`);

    navigator.clipboard.writeText(lines.join('\n')).then(
      () => showToast('Đã sao chép đơn hàng!'),
      () => showToast('Không thể sao chép tự động, vui lòng xuất file Excel.')
    );
  }

  function syncBuyerInputs() {
    const nameEl = document.getElementById('buyer-name');
    const phoneEl = document.getElementById('buyer-phone');
    const noteEl = document.getElementById('buyer-note');
    if (nameEl) buyerInfo.name = nameEl.value;
    if (phoneEl) buyerInfo.phone = phoneEl.value;
    if (noteEl) buyerInfo.note = noteEl.value;
    saveBuyerInfo();
  }

  function openLightbox(product) {
    const dialog = document.getElementById('lightbox-dialog');
    if (!dialog || !product) return;
    currentLightboxProduct = product;
    const photoIdx = activePhotoIndexByCode.get(product.code) || 0;
    updateLightboxView(photoIdx);
    dialog.showModal();
  }

  function updateLightboxView(photoIdx) {
    if (!currentLightboxProduct) return;
    const p = currentLightboxProduct;
    const imgEl = document.getElementById('lightbox-img');
    const titleEl = document.getElementById('lightbox-title');
    const metaEl = document.getElementById('lightbox-meta');
    const switchWrap = document.getElementById('lightbox-photo-switch');
    const effectivePrice = getEffectivePrice(p.price);

    if (imgEl) {
      imgEl.src = getProductImage(p, photoIdx);
      imgEl.alt = `${p.name} - #${p.code}`;
    }
    if (titleEl) {
      titleEl.textContent = `[#${p.code}] ${p.name}`;
    }
    if (metaEl) {
      metaEl.textContent = `${p.price > 0 ? formatVND(effectivePrice) + '/' + p.unit : 'Tặng kèm'} • Kho: ${p.stock} ${p.unit} • ${p.packSpec}`;
    }
    if (switchWrap) {
      if (p.images && p.images.length > 1) {
        switchWrap.innerHTML = `
          <button type="button" class="btn ${photoIdx === 0 ? 'btn-primary' : 'btn-outline'}" data-lb-idx="0">Mặt trước</button>
          <button type="button" class="btn ${photoIdx === 1 ? 'btn-primary' : 'btn-outline'}" data-lb-idx="1">Mặt sau</button>
        `;
      } else {
        switchWrap.innerHTML = '';
      }
    }
  }

  function resetFilters() {
    activeCategory = 'ALL';
    selectedSizes.clear();
    selectedSeries.clear();
    searchQuery = '';
    onlyInCart = false;
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    updateCartSummaryUI();
    renderCatalog();
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById('toast-msg');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  // Fallback for browsers without native <dialog closedby="any"> support
  // (MANDATORY per modern-web-guidance: light-dismiss-a-dialog)
  function attachDialogLightDismissFallback(dialog) {
    if (!dialog) return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    }
  }

  function init() {
    syncPromoUI();
    renderCatalog();
    updateCartSummaryUI();

    // Restore buyer inputs
    const nameEl = document.getElementById('buyer-name');
    const phoneEl = document.getElementById('buyer-phone');
    const noteEl = document.getElementById('buyer-note');
    if (nameEl) nameEl.value = buyerInfo.name || '';
    if (phoneEl) phoneEl.value = buyerInfo.phone || '';
    if (noteEl) noteEl.value = buyerInfo.note || '';

    [nameEl, phoneEl, noteEl].forEach((el) => {
      if (el) el.addEventListener('input', syncBuyerInputs);
    });

    // Promo code forms (toolbar & modal)
    const promoForm = document.getElementById('promo-form');
    const promoInput = document.getElementById('promo-code-input');
    const promoClearBtn = document.getElementById('promo-clear-btn');
    const promoStatus = document.getElementById('promo-status');

    if (promoForm && promoInput) {
      promoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        applyPromoCode(promoInput.value);
      });
      promoInput.addEventListener('input', () => {
        if (promoStatus && promoStatus.classList.contains('is-error')) {
          promoStatus.textContent = '';
          promoStatus.classList.remove('is-error');
        }
      });
    }

    if (promoClearBtn) {
      promoClearBtn.addEventListener('click', () => {
        applyPromoCode('');
      });
    }

    const modalPromoForm = document.getElementById('modal-promo-form');
    const modalPromoInput = document.getElementById('modal-promo-input');
    if (modalPromoForm && modalPromoInput) {
      modalPromoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        applyPromoCode(modalPromoInput.value);
      });
    }

    // Mobile sidebar toggle
    const mobileToggleBtn = document.getElementById('mobile-filter-toggle-btn');
    const sidebarEl = document.getElementById('catalog-sidebar');
    if (mobileToggleBtn && sidebarEl) {
      mobileToggleBtn.addEventListener('click', () => {
        const isOpen = sidebarEl.classList.toggle('is-open');
        mobileToggleBtn.setAttribute('aria-expanded', String(isOpen));
      });
    }

    // Sidebar interactions (Category, Size, Series)
    if (sidebarEl) {
      sidebarEl.addEventListener('click', (e) => {
        const catBtn = e.target.closest('[data-cat]');
        if (catBtn) {
          activeCategory = catBtn.dataset.cat || 'ALL';
          renderCatalog();
          return;
        }

        const sizeBtn = e.target.closest('[data-size]');
        if (sizeBtn) {
          const sz = sizeBtn.dataset.size;
          if (selectedSizes.has(sz)) {
            selectedSizes.delete(sz);
          } else {
            selectedSizes.add(sz);
          }
          renderCatalog();
          return;
        }

        const seriesBtn = e.target.closest('[data-series]');
        if (seriesBtn) {
          const sr = seriesBtn.dataset.series;
          if (selectedSeries.has(sr)) {
            selectedSeries.delete(sr);
          } else {
            selectedSeries.add(sr);
          }
          renderCatalog();
          return;
        }
      });
    }

    const clearSizeBtn = document.getElementById('clear-size-filter-btn');
    if (clearSizeBtn) {
      clearSizeBtn.addEventListener('click', () => {
        selectedSizes.clear();
        renderCatalog();
      });
    }

    const clearSeriesBtn = document.getElementById('clear-series-filter-btn');
    if (clearSeriesBtn) {
      clearSeriesBtn.addEventListener('click', () => {
        selectedSeries.clear();
        renderCatalog();
      });
    }

    const resetAllBtn = document.getElementById('reset-all-filters-btn');
    if (resetAllBtn) {
      resetAllBtn.addEventListener('click', resetFilters);
    }

    // Active filter tags bar removal
    const activeTagsEl = document.getElementById('active-filter-tags');
    if (activeTagsEl) {
      activeTagsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-clear-type]');
        if (!btn) return;
        const type = btn.dataset.clearType;
        const val = btn.dataset.val;
        if (type === 'cat') activeCategory = 'ALL';
        else if (type === 'size') selectedSizes.delete(val);
        else if (type === 'series') selectedSeries.delete(val);
        else if (type === 'cart') {
          onlyInCart = false;
          updateCartSummaryUI();
        } else if (type === 'search') {
          searchQuery = '';
          const searchInput = document.getElementById('search-input');
          if (searchInput) searchInput.value = '';
        } else if (type === 'all') {
          resetFilters();
          return;
        }
        renderCatalog();
      });
    }

    // Search & Sort
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderCatalog();
      });
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        renderCatalog();
      });
    }

    const onlyCartBtn = document.getElementById('toggle-only-cart-btn');
    if (onlyCartBtn) {
      onlyCartBtn.addEventListener('click', () => {
        onlyInCart = !onlyInCart;
        updateCartSummaryUI();
        renderCatalog();
      });
    }

    // Delegated events on Catalog Content
    const contentEl = document.getElementById('catalog-content');
    if (contentEl) {
      contentEl.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (!card) return;
        const code = Number(card.dataset.code);
        const product = productByCode.get(code);
        if (!product) return;

        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.action;
        const currentQty = cart.get(code) || 0;

        if (action === 'inc') {
          setProductQty(code, currentQty + 1);
        } else if (action === 'dec') {
          setProductQty(code, currentQty - 1);
        } else if (action === 'add-pack') {
          setProductQty(code, currentQty + product.packQty, true);
        } else if (action === 'take-all') {
          setProductQty(code, product.stock, true);
        } else if (action === 'switch-photo') {
          const idx = Number(actionEl.dataset.photoIdx) || 0;
          activePhotoIndexByCode.set(code, idx);
          const img = card.querySelector('img');
          if (img) img.src = getProductImage(product, idx);
          card.querySelectorAll('[data-action="switch-photo"]').forEach((b) => {
            b.setAttribute('aria-pressed', String(Number(b.dataset.photoIdx) === idx));
          });
        } else if (action === 'zoom') {
          openLightbox(product);
        }
      });

      contentEl.addEventListener('change', (e) => {
        if (!e.target.classList.contains('qty-input')) return;
        const card = e.target.closest('.product-card');
        if (!card) return;
        const code = Number(card.dataset.code);
        setProductQty(code, e.target.value, true);
        e.target.value = cart.get(code) || 0;
      });
    }

    // Cart Dialog & Lightbox Dialog setup
    const cartDialog = document.getElementById('cart-dialog');
    const lightboxDialog = document.getElementById('lightbox-dialog');
    attachDialogLightDismissFallback(cartDialog);
    attachDialogLightDismissFallback(lightboxDialog);

    const openCartBtns = [
      document.getElementById('open-cart-header-btn'),
      document.getElementById('open-cart-sticky-btn')
    ];
    openCartBtns.forEach((btn) => {
      if (btn && cartDialog) {
        btn.addEventListener('click', () => {
          syncPromoUI();
          renderCartModalContent();
          cartDialog.showModal();
        });
      }
    });

    // Quick Export buttons
    const quickExportBtns = [
      document.getElementById('quick-export-header-btn'),
      document.getElementById('quick-export-sticky-btn'),
      document.getElementById('modal-export-xlsx-btn')
    ];
    quickExportBtns.forEach((btn) => {
      if (btn) btn.addEventListener('click', handleExportExcel);
    });

    const copyBtn = document.getElementById('modal-copy-order-btn');
    if (copyBtn) copyBtn.addEventListener('click', handleCopyOrderText);

    const clearCartBtn = document.getElementById('modal-clear-cart-btn');
    if (clearCartBtn) {
      clearCartBtn.addEventListener('click', () => {
        if (cart.size === 0) return;
        cart.clear();
        saveCart();
        renderCatalog();
        updateCartSummaryUI();
        renderCartModalContent();
        showToast('Đã xóa giỏ hàng.');
      });
    }

    // Cart table interactions inside modal
    const cartItemsContainer = document.getElementById('cart-items-container');
    if (cartItemsContainer) {
      cartItemsContainer.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-code]');
        if (!row) return;
        const code = Number(row.dataset.code);
        const product = productByCode.get(code);
        if (!product) return;

        const btn = e.target.closest('[data-cart-action]');
        if (!btn) return;
        const act = btn.dataset.cartAction;
        const currentQty = cart.get(code) || 0;

        if (act === 'inc') {
          setProductQty(code, currentQty + 1);
          renderCartModalContent();
        } else if (act === 'dec') {
          setProductQty(code, currentQty - 1);
          renderCartModalContent();
        } else if (act === 'max') {
          setProductQty(code, product.stock);
          renderCartModalContent();
        } else if (act === 'remove') {
          setProductQty(code, 0);
          renderCartModalContent();
        }
      });

      cartItemsContainer.addEventListener('change', (e) => {
        if (e.target.dataset.cartAction !== 'input') return;
        const row = e.target.closest('tr[data-code]');
        if (!row) return;
        const code = Number(row.dataset.code);
        setProductQty(code, e.target.value);
        renderCartModalContent();
      });
    }

    // Lightbox photo switch
    const lbSwitch = document.getElementById('lightbox-photo-switch');
    if (lbSwitch) {
      lbSwitch.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-lb-idx]');
        if (!btn) return;
        updateLightboxView(Number(btn.dataset.lbIdx) || 0);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

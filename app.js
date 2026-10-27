(function () {
  const STORAGE_KEY = 'tvs_borgonovo_cart_v1';
  const BUYER_STORAGE_KEY = 'tvs_borgonovo_buyer_v1';

  const products = Array.isArray(window.CATALOG_PRODUCTS) ? window.CATALOG_PRODUCTS : [];
  const productByCode = new Map(products.map((p) => [p.code, p]));

  // State
  let cart = loadCart(); // Map<code, qty>
  let buyerInfo = loadBuyerInfo();
  let activeCategory = 'ALL';
  let activeSeries = 'ALL';
  let searchQuery = '';
  let sortBy = 'code-asc';
  let onlyInCart = false;
  let activePhotoIndexByCode = new Map(); // code -> 0 or 1
  let currentLightboxProduct = null;

  const vndFormatter = new Intl.NumberFormat('vi-VN');

  function formatVND(amount) {
    return `${vndFormatter.format(Number(amount) || 0)} ₫`;
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

  function createSvgPlaceholder(product) {
    const isLid = product.category === 'Vung kính';
    const iconSvg = isLid
      ? `<ellipse cx="200" cy="155" rx="105" ry="38" fill="none" stroke="#64748b" stroke-width="6"/><path d="M95 155 C95 100, 305 100, 305 155" fill="rgba(148,163,184,0.18)" stroke="#475569" stroke-width="5"/><rect x="182" y="88" width="36" height="14" rx="6" fill="#334155"/>`
      : `<rect x="145" y="85" width="48" height="95" rx="6" fill="rgba(148,163,184,0.2)" stroke="#475569" stroke-width="5"/><rect x="207" y="95" width="48" height="85" rx="6" fill="rgba(148,163,184,0.2)" stroke="#475569" stroke-width="5"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
      <rect width="400" height="300" fill="#f1f5f9"/>
      ${iconSvg}
      <text x="200" y="225" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="#334155">${escapeHtml(product.name)}</text>
      <text x="200" y="248" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#64748b">${escapeHtml(product.brand)} • Quy cách ${escapeHtml(product.packSpec)}</text>
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

  function setProductQty(code, newQty, showFeedback = false) {
    const product = productByCode.get(code);
    if (!product) return;
    let maxAllowed = product.stock > 0 ? product.stock : 999;
    let cleanQty = Math.max(0, Math.min(maxAllowed, Math.floor(Number(newQty) || 0)));

    if (cleanQty === 0) {
      cart.delete(code);
    } else {
      cart.set(code, cleanQty);
    }
    saveCart();
    updateSingleCardDOM(code);
    updateCartSummaryUI();
    if (showFeedback && cleanQty > 0) {
      showToast(`Đã cập nhật: ${product.name} (${cleanQty} ${product.unit})`);
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
      if (qty > 0) {
        const lineTotal = qty * product.price;
        const boxes = product.packQty > 1 ? ` (~${(qty / product.packQty).toFixed(qty % product.packQty === 0 ? 0 : 1)} thùng)` : '';
        subtotalEl.innerHTML = `Đã chọn: <strong>${qty} ${escapeHtml(product.unit)}${boxes}</strong> • <strong>${product.price > 0 ? formatVND(lineTotal) : '0 ₫ (Tặng/Kèm)'}</strong>`;
      } else {
        const lotTotal = product.stock * product.price;
        subtotalEl.innerHTML = product.price > 0
          ? `Giá trị cả lô (${product.stock} ${escapeHtml(product.unit)}): <strong>${formatVND(lotTotal)}</strong>`
          : `Mặt hàng tặng kèm / chưa tính giá lẻ`;
      }
    }
  }

  function getFilteredProducts() {
    const q = searchQuery.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (onlyInCart && !cart.has(p.code)) return false;
      if (activeCategory !== 'ALL' && p.category !== activeCategory) return false;
      if (activeSeries !== 'ALL' && p.series !== activeSeries) return false;
      if (q) {
        const hay = `${p.code} #${p.code} ${p.name} ${p.series} ${p.category} ${p.brand} ${p.note} ${p.size}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'price-asc') return a.price - b.price || a.code - b.code;
      if (sortBy === 'price-desc') return b.price - a.price || a.code - b.code;
      if (sortBy === 'stock-desc') return b.stock - a.stock || a.code - b.code;
      return a.code - b.code;
    });

    return filtered;
  }

  function renderCategoryTabs() {
    const container = document.getElementById('category-tabs');
    if (!container) return;

    const counts = new Map();
    for (const p of products) {
      counts.set(p.category, (counts.get(p.category) || 0) + 1);
    }

    const categories = [
      { id: 'ALL', label: `Tất cả (${products.length})` },
      ...Array.from(counts.entries()).map(([cat, count]) => ({
        id: cat,
        label: `${cat} (${count})`
      }))
    ];

    container.innerHTML = categories
      .map(
        (c) => `<button type="button" class="cat-tab" data-cat="${escapeHtml(c.id)}" aria-pressed="${activeCategory === c.id}">
          ${escapeHtml(c.label)}
        </button>`
      )
      .join('');
  }

  function populateSeriesFilter() {
    const select = document.getElementById('series-filter');
    if (!select) return;
    const seriesSet = new Set(products.map((p) => p.series));
    const sorted = Array.from(seriesSet).sort((a, b) => a.localeCompare(b, 'vi'));
    select.innerHTML = `<option value="ALL">Tất cả dòng sản phẩm (${sorted.length})</option>` +
      sorted.map((s) => `<option value="${escapeHtml(s)}">Dòng ${escapeHtml(s)}</option>`).join('');
  }

  function renderCatalogGrid() {
    const grid = document.getElementById('catalog-grid');
    const countLabel = document.getElementById('showing-count');
    if (!grid) return;

    const list = getFilteredProducts();
    if (countLabel) {
      countLabel.textContent = `Hiển thị ${list.length} / ${products.length} mặt hàng`;
    }

    if (list.length === 0) {
      grid.innerHTML = `<div class="empty-state">
        <p><strong>Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại.</strong></p>
        <button type="button" class="btn btn-outline" id="reset-filters-btn">Xóa bộ lọc tìm kiếm</button>
      </div>`;
      const resetBtn = document.getElementById('reset-filters-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
      }
      return;
    }

    grid.innerHTML = list
      .map((p, index) => {
        const qty = cart.get(p.code) || 0;
        const photoIdx = activePhotoIndexByCode.get(p.code) || 0;
        const imgSrc = getProductImage(p, photoIdx);
        const hasTwoPhotos = p.images && p.images.length > 1;

        // Follow modern-web-guidance `optimize-image-priority`:
        // 1st visible image gets fetchpriority="high" (no loading="lazy").
        // Cards 2-4 omit fetchpriority and loading="lazy" (above the fold).
        // Cards 5+ get loading="lazy" alone (without fetchpriority="low").
        let imgPriorityAttrs = '';
        if (index === 0) {
          imgPriorityAttrs = 'fetchpriority="high"';
        } else if (index >= 4) {
          imgPriorityAttrs = 'loading="lazy"';
        }

        const stockClass = p.stock > 0 && p.stock <= 15 ? 'stock-pill low-stock' : 'stock-pill';
        const stockText = p.stock > 0 ? `Tồn: ${p.stock} ${p.unit}` : 'Liên hệ tồn';

        const priceHtml = p.price > 0
          ? `<div><span class="price-value">${formatVND(p.price)}</span> <span class="price-unit">/ ${escapeHtml(p.unit)}</span></div>`
          : `<div class="price-gift">0 ₫ • Hàng tặng / Kèm theo</div>`;

        const lotTotal = p.stock * p.price;
        const boxes = p.packQty > 1 ? ` (~${(qty / p.packQty).toFixed(qty % p.packQty === 0 ? 0 : 1)} thùng)` : '';
        const subtotalHtml = qty > 0
          ? `Đã chọn: <strong>${qty} ${escapeHtml(p.unit)}${boxes}</strong> • <strong>${p.price > 0 ? formatVND(qty * p.price) : '0 ₫ (Tặng/Kèm)'}</strong>`
          : (p.price > 0
              ? `Giá trị cả lô (${p.stock} ${escapeHtml(p.unit)}): <strong>${formatVND(lotTotal)}</strong>`
              : `Mặt hàng tặng kèm / chưa tính giá lẻ`);

        // Follow modern-web-guidance `card`:
        // <article class="product-card"> with 4 direct children in source order:
        // 1. <img> (direct child, never wrapped in .media)
        // 2. <header>
        // 3. <div class="card-details">
        // 4. <footer>
        return `<article class="product-card ${qty > 0 ? 'in-cart' : ''}" data-code="${p.code}">
          <img
            src="${escapeHtml(imgSrc)}"
            alt="${escapeHtml(p.name)} - Mã #${p.code}"
            width="400"
            height="300"
            ${imgPriorityAttrs}
            data-action="zoom"
          />
          <header>
            <div class="card-meta-row">
              <span class="code-badge">Mã #${p.code}</span>
              <span class="series-badge">${escapeHtml(p.brand)} • ${escapeHtml(p.series)}</span>
            </div>
            <h3>${escapeHtml(p.name)}</h3>
            <div class="photo-tools">
              ${
                hasTwoPhotos
                  ? `<button type="button" class="photo-chip" data-action="switch-photo" data-photo-idx="0" aria-pressed="${photoIdx === 0}">Mặt trước</button>
                     <button type="button" class="photo-chip" data-action="switch-photo" data-photo-idx="1" aria-pressed="${photoIdx === 1}">Mặt sau</button>`
                  : ''
              }
              <button type="button" class="photo-chip" data-action="zoom">🔍 Phóng to</button>
              ${p.isVariantImage ? `<span class="variant-photo-tag" title="Ảnh chụp mẫu đại diện cùng dòng sản phẩm">Ảnh dòng ${escapeHtml(p.series)}</span>` : ''}
            </div>
          </header>
          <div class="card-details">
            <div class="price-stock-row">
              ${priceHtml}
              <span class="${stockClass}">${escapeHtml(stockText)}</span>
            </div>
            <dl class="spec-list">
              <dt>Phân loại:</dt>
              <dd>${escapeHtml(p.category)}</dd>
              ${p.size ? `<dt>Kích thước / DT:</dt><dd>${escapeHtml(p.size)}</dd>` : ''}
              <dt>Quy cách đóng:</dt>
              <dd>${escapeHtml(p.packSpec || 'Tiêu chuẩn')}</dd>
              ${p.features.length > 0 ? `<dt>Đặc điểm:</dt><dd>${escapeHtml(p.features.join(', '))}</dd>` : ''}
            </dl>
            ${p.note ? `<p class="note-callout">📌 Ghi chú: ${escapeHtml(p.note)}</p>` : ''}
          </div>
          <footer>
            <div class="qty-control-row">
              <div class="qty-stepper" role="group" aria-label="Chọn số lượng cho ${escapeHtml(p.name)}">
                <button type="button" class="qty-btn" data-action="dec" aria-label="Giảm số lượng" ${qty <= 0 ? 'disabled' : ''}>−</button>
                <input
                  type="number"
                  class="qty-input"
                  min="0"
                  max="${p.stock > 0 ? p.stock : 999}"
                  value="${qty}"
                  aria-label="Số lượng ${escapeHtml(p.name)}"
                />
                <button type="button" class="qty-btn" data-action="inc" aria-label="Tăng số lượng" ${p.stock > 0 && qty >= p.stock ? 'disabled' : ''}>+</button>
              </div>
              <div class="quick-qty-group">
                ${
                  p.packQty > 1 && p.stock >= p.packQty
                    ? `<button type="button" class="quick-qty-btn" data-action="add-pack" title="Cộng thêm 1 thùng (${p.packQty} ${escapeHtml(p.unit)})">+1 Thùng (${p.packQty})</button>`
                    : ''
                }
                ${
                  p.stock > 0
                    ? `<button type="button" class="quick-qty-btn" data-action="take-all" title="Lấy toàn bộ số lượng tồn kho (${p.stock} ${escapeHtml(p.unit)})">Lấy hết (${p.stock})</button>`
                    : ''
                }
              </div>
            </div>
            <div class="card-Subtotal-bar">
              <span class="card-subtotal-text">${subtotalHtml}</span>
            </div>
          </footer>
        </article>`;
      })
      .join('');
  }

  function updateCartSummaryUI() {
    let totalTypes = 0;
    let totalUnits = 0;
    let totalAmount = 0;

    for (const [code, qty] of cart.entries()) {
      const p = productByCode.get(code);
      if (!p || qty <= 0) continue;
      totalTypes += 1;
      totalUnits += qty;
      totalAmount += qty * p.price;
    }

    const headerCount = document.getElementById('header-cart-count');
    if (headerCount) headerCount.textContent = totalTypes;

    const headerTotal = document.getElementById('header-cart-total');
    if (headerTotal) headerTotal.textContent = formatVND(totalAmount);

    const stickyBar = document.getElementById('sticky-cart-bar');
    if (stickyBar) {
      stickyBar.hidden = totalTypes === 0;
    }

    const stickyTypes = document.getElementById('sticky-cart-types');
    if (stickyTypes) stickyTypes.textContent = totalTypes;

    const stickyUnits = document.getElementById('sticky-cart-units');
    if (stickyUnits) stickyUnits.textContent = vndFormatter.format(totalUnits);

    const stickyPrice = document.getElementById('sticky-cart-price');
    if (stickyPrice) stickyPrice.textContent = formatVND(totalAmount);

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
        <p><strong>Giỏ đặt hàng của bạn đang trống.</strong></p>
        <p>Hãy chọn số lượng hoặc bấm "Lấy hết" / "+1 Thùng" trên danh sách sản phẩm để tạo đơn hàng nhanh.</p>
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

    let totalUnits = 0;
    let totalAmount = 0;

    const rowsHtml = items
      .map((item, idx) => {
        const { product: p, qty } = item;
        const lineTotal = qty * p.price;
        totalUnits += qty;
        totalAmount += lineTotal;
        const imgSrc = getProductImage(p, 0);
        const boxesStr = p.packQty > 1
          ? `${(qty / p.packQty).toFixed(qty % p.packQty === 0 ? 0 : 1)} thùng (${p.packSpec})`
          : p.packSpec;

        return `<tr data-code="${p.code}">
          <td>${idx + 1}</td>
          <td><strong>#${p.code}</strong></td>
          <td>
            <div class="cart-item-cell">
              <img src="${escapeHtml(imgSrc)}" alt="" class="cart-thumb" loading="lazy" />
              <div>
                <div><strong>${escapeHtml(p.name)}</strong></div>
                <div style="font-size:0.76rem;color:var(--text-secondary)">
                  Tồn: ${p.stock} ${escapeHtml(p.unit)} • Quy cách: ${escapeHtml(p.packSpec)}
                  ${p.note ? ` • <span style="color:#92400e;font-weight:600">${escapeHtml(p.note)}</span>` : ''}
                </div>
              </div>
            </div>
          </td>
          <td class="num-col">${p.price > 0 ? formatVND(p.price) : '0 ₫ (Tặng)'}</td>
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
            <button type="button" class="btn btn-ghost" data-cart-action="remove" title="Xóa mặt hàng này" aria-label="Xóa ${escapeHtml(p.name)}">✕</button>
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
            <th>Số lượng đặt</th>
            <th class="num-col">Thành tiền</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

    if (summaryEl) {
      summaryEl.innerHTML = `Đã chọn <strong>${items.length}</strong> mã hàng (${vndFormatter.format(totalUnits)} sản phẩm) • Tổng tiền: <strong style="font-size:1.15rem;color:var(--accent)">${formatVND(totalAmount)}</strong> <span style="font-size:0.8rem;color:var(--text-secondary)">(Chưa gồm VAT & phí vận chuyển)</span>`;
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
      showToast('Giỏ hàng đang trống. Vui lòng chọn ít nhất 1 sản phẩm để xuất Excel!');
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

    let totalUnits = 0;
    let totalAmount = 0;
    const lines = [
      '📋 ĐƠN ĐẶT HÀNG THANH LÝ GIA DỤNG Ý (TVS & BORGONOVO)',
      buyerInfo.name ? `👤 Khách hàng: ${buyerInfo.name}` : '',
      buyerInfo.phone ? `📞 SĐT: ${buyerInfo.phone}` : '',
      buyerInfo.note ? `📝 Ghi chú: ${buyerInfo.note}` : '',
      '----------------------------------------'
    ].filter(Boolean);

    items.forEach((item, idx) => {
      const { product: p, qty } = item;
      const lineTotal = qty * p.price;
      totalUnits += qty;
      totalAmount += lineTotal;
      lines.push(
        `${idx + 1}. [Mã #${p.code}] ${p.name}: ${qty} ${p.unit} x ${formatVND(p.price)} = ${formatVND(lineTotal)}${p.note ? ` (${p.note})` : ''}`
      );
    });

    lines.push('----------------------------------------');
    lines.push(`📦 Tổng số mã: ${items.length} mặt hàng (${vndFormatter.format(totalUnits)} sản phẩm)`);
    lines.push(`💰 TỔNG CỘNG: ${formatVND(totalAmount)} (Chưa VAT & vận chuyển)`);

    navigator.clipboard.writeText(lines.join('\n')).then(
      () => showToast('Đã sao chép nội dung đơn hàng vào bộ nhớ tạm!'),
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

    if (imgEl) {
      imgEl.src = getProductImage(p, photoIdx);
      imgEl.alt = `${p.name} - Mã #${p.code}`;
    }
    if (titleEl) {
      titleEl.textContent = `[Mã #${p.code}] ${p.name}`;
    }
    if (metaEl) {
      metaEl.textContent = `${p.brand} • Giá thanh lý: ${p.price > 0 ? formatVND(p.price) + '/' + p.unit : 'Hàng tặng/Kèm'} • Tồn kho: ${p.stock} ${p.unit} • Quy cách: ${p.packSpec}`;
    }
    if (switchWrap) {
      if (p.images && p.images.length > 1) {
        switchWrap.innerHTML = `
          <button type="button" class="btn ${photoIdx === 0 ? 'btn-primary' : 'btn-outline'}" data-lb-idx="0">Ảnh mặt trước</button>
          <button type="button" class="btn ${photoIdx === 1 ? 'btn-primary' : 'btn-outline'}" data-lb-idx="1">Ảnh mặt sau / tem</button>
        `;
      } else {
        switchWrap.innerHTML = '';
      }
    }
  }

  function resetFilters() {
    activeCategory = 'ALL';
    activeSeries = 'ALL';
    searchQuery = '';
    onlyInCart = false;
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    const seriesSelect = document.getElementById('series-filter');
    if (seriesSelect) seriesSelect.value = 'ALL';
    renderCategoryTabs();
    updateCartSummaryUI();
    renderCatalogGrid();
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
    }, 2600);
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
    renderCategoryTabs();
    populateSeriesFilter();
    renderCatalogGrid();
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

    // Search & Filters
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderCatalogGrid();
      });
    }

    const seriesSelect = document.getElementById('series-filter');
    if (seriesSelect) {
      seriesSelect.addEventListener('change', (e) => {
        activeSeries = e.target.value;
        renderCatalogGrid();
      });
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        renderCatalogGrid();
      });
    }

    const catTabs = document.getElementById('category-tabs');
    if (catTabs) {
      catTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.cat-tab');
        if (!btn) return;
        activeCategory = btn.dataset.cat || 'ALL';
        renderCategoryTabs();
        renderCatalogGrid();
      });
    }

    const onlyCartBtn = document.getElementById('toggle-only-cart-btn');
    if (onlyCartBtn) {
      onlyCartBtn.addEventListener('click', () => {
        onlyInCart = !onlyInCart;
        updateCartSummaryUI();
        renderCatalogGrid();
      });
    }

    // Delegated events on Catalog Grid
    const grid = document.getElementById('catalog-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
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

      grid.addEventListener('change', (e) => {
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
        renderCatalogGrid();
        updateCartSummaryUI();
        renderCartModalContent();
        showToast('Đã xóa toàn bộ sản phẩm trong giỏ đặt hàng.');
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

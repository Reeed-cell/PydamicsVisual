// Public products catalog — read-only, no login needed. RLS on the
// products table only allows anonymous visitors to see in-stock
// items (out-of-stock items are only visible to logged-in staff),
// so this query is safe as-is with no extra filtering needed here.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

let allProducts = [];

async function loadProducts() {
  const grid = document.getElementById('products-grid');
  const empty = document.getElementById('products-empty');
  const loading = document.getElementById('products-loading');

  const { data, error } = await supabaseClient
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  loading.hidden = true;

  if (error) {
    grid.innerHTML = `<p class="dash-empty">Couldn't load products right now. Please try again shortly.</p>`;
    console.error('Products load failed:', error);
    return;
  }

  allProducts = data || [];

  if (allProducts.length === 0) {
    empty.hidden = false;
    document.getElementById('products-search').style.display = 'none';
    return;
  }

  renderProducts(allProducts);
}

function renderProducts(products) {
  const grid = document.getElementById('products-grid');
  const noMatch = document.getElementById('products-no-match');

  noMatch.hidden = products.length !== 0;

  grid.innerHTML = products.map(p => `
    <article class="product-card">
      <div class="product-card-top">
        <h3>${escapeHtml(p.name)}</h3>
        <span class="product-stock-badge ${p.in_stock ? 'product-stock-badge--in' : 'product-stock-badge--out'}">
          ${p.in_stock ? 'In stock' : 'Out of stock'}
        </span>
      </div>
      ${p.brand ? `<p class="product-brand">${escapeHtml(p.brand)}</p>` : ''}
      ${p.description ? `<p class="product-desc">${escapeHtml(p.description)}</p>` : ''}
      ${p.cost ? `<p class="product-cost">${escapeHtml(p.cost)}</p>` : ''}
    </article>
  `).join('');
}

const productsSearch = document.getElementById('products-search');
if (productsSearch) {
  productsSearch.addEventListener('input', () => {
    const q = productsSearch.value.trim().toLowerCase();
    if (!q) { renderProducts(allProducts); return; }
    const filtered = allProducts.filter(p =>
      p.name.toLowerCase().includes(q) || (p.brand && p.brand.toLowerCase().includes(q))
    );
    renderProducts(filtered);
  });
}

loadProducts();

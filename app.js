// ==========================================================
// Oriflame Sub-Dealer Stock Manager — app logic
// ==========================================================

const LOW_STOCK_THRESHOLD = 3;

let sb = null;
let isConnected = false;

let productsCache = [];  // [{id,name,image_url,quantity}]
let purchasesCache = []; // header rows, newest first
let salesCache = [];     // header rows, newest first

let editingProductId = null;
let editingPurchaseId = null;
let editingSaleId = null;

// when editing a bill that was already 'completed', these hold the
// original per-product quantities it used, so we can show correct
// "available stock" numbers while editing (old qty is being un-reserved)
let editingPurchaseOriginalQty = {};
let editingSaleOriginalQty = {};

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("puDate").valueAsDate = new Date();
  document.getElementById("saDate").valueAsDate = new Date();

  const configured = SUPABASE_URL && !SUPABASE_URL.includes("YOUR-PROJECT-ID") &&
                      SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("YOUR-ANON");

  if (!configured) {
    document.getElementById("setupBanner").style.display = "block";
    setConnStatus(false, "Not configured");
  } else {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    try {
      const { error } = await sb.from("products").select("id").limit(1);
      if (error) throw error;
      isConnected = true;
      setConnStatus(true, "Connected");
      await refreshAll();
    } catch (err) {
      console.error(err);
      document.getElementById("setupBanner").style.display = "block";
      document.getElementById("setupBanner").innerHTML =
        "Couldn't reach your Supabase database. Double check the URL/key in <code>config.js</code> and that you ran the latest <code>schema.sql</code>. Error: " + escapeHtml(err.message || String(err));
      setConnStatus(false, "Connection error");
    }
  }

  bindNav();
  bindProductModal();
  bindPurchaseModal();
  bindSaleModal();
  bindSearchFilters();
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeAllModals));
  document.querySelectorAll(".modal-backdrop").forEach(m => {
    m.addEventListener("click", (e) => { if (e.target === m) closeAllModals(); });
  });
});

function setConnStatus(ok, text) {
  document.getElementById("connStatusText").textContent = text;
  document.getElementById("connStatusDot").classList.toggle("off", !ok);
}

async function refreshAll() {
  await loadProducts();
  await loadPurchases();
  await loadSales();
  renderDashboard();
}

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function money(n) {
  const v = Number(n || 0);
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: v % 1 ? 2 : 0 });
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function toast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.toggle("error", !!isError);
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3200);
}
function closeAllModals() {
  document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("open"));
}
function openModal(id) { document.getElementById(id).classList.add("open"); }
function requireConnection() {
  if (!isConnected) { toast("Connect Supabase first — see the banner at the top", true); return false; }
  return true;
}
function isSameMonth(dateStr, ref) {
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}
function friendlyError(err) {
  // Postgres exceptions raised from our RPC functions arrive in err.message
  return (err && (err.message || err.error_description || err.hint)) || String(err);
}

// ---------------------------------------------------------
// Navigation (horizontal — top bar on desktop, bottom tabs on phone)
// ---------------------------------------------------------
function bindNav() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.getElementById("view-" + view).classList.add("active");
    });
  });
}

function bindSearchFilters() {
  document.getElementById("productSearch").addEventListener("input", renderProducts);
  document.getElementById("stockSearch").addEventListener("input", renderStock);
  document.getElementById("stockFilter").addEventListener("change", renderStock);
}

// ==========================================================
// PRODUCTS
// ==========================================================
async function loadProducts() {
  const { data, error } = await sb.from("products").select("*").order("name", { ascending: true });
  if (error) { toast("Couldn't load products: " + error.message, true); return; }
  productsCache = data || [];
  renderProducts();
  renderStock();
  fillProductDropdowns();
}

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const q = document.getElementById("productSearch").value.trim().toLowerCase();
  const list = productsCache.filter(p => p.name.toLowerCase().includes(q));

  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;"><strong>No products yet</strong>Add your first Oriflame product to start tracking stock.</div>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    const low = p.quantity <= LOW_STOCK_THRESHOLD;
    const photo = p.image_url
      ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 16l4.5-6 3 4 3-4L20 16"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>`;
    return `
    <div class="product-card" data-id="${p.id}">
      <div class="product-actions">
        <button class="icon-btn" data-action="edit-product" data-id="${p.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>
        <button class="icon-btn danger" data-action="delete-product" data-id="${p.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
        </button>
      </div>
      <div class="product-photo">${photo}</div>
      <div class="product-body">
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="qty-badge ${low ? "low" : ""}">${low ? "⚠ " : ""}${p.quantity} in stock</div>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll('[data-action="delete-product"]').forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteProduct(btn.dataset.id); });
  });
  grid.querySelectorAll('[data-action="edit-product"]').forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openProductModal(btn.dataset.id); });
  });
}

async function deleteProduct(id) {
  if (!requireConnection()) return;
  if (!confirm("Delete this product? This won't remove past bills, but it will disappear from your product list.")) return;
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) { toast("Couldn't delete: " + error.message, true); return; }
  toast("Product deleted");
  await loadProducts();
}

function openProductModal(id) {
  if (!requireConnection()) return;
  editingProductId = id || null;
  const form = document.getElementById("formProduct");
  form.reset();
  document.getElementById("pPhotoPreview").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 16l4.5-6 3 4 3-4L20 16"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>`;

  if (editingProductId) {
    const p = productsCache.find(p => p.id === editingProductId);
    if (!p) return;
    document.getElementById("productModalTitle").textContent = "Edit product";
    document.getElementById("pName").value = p.name;
    document.getElementById("pQtyField").style.display = "none"; // quantity is managed via purchases/sales
    document.getElementById("pPhotoHint").textContent = "Choose a new photo only if you want to replace the current one.";
    if (p.image_url) document.getElementById("pPhotoPreview").innerHTML = `<img src="${escapeHtml(p.image_url)}">`;
    document.getElementById("pSubmitBtn").textContent = "Save changes";
  } else {
    document.getElementById("productModalTitle").textContent = "Add product";
    document.getElementById("pQtyField").style.display = "";
    document.getElementById("pPhotoHint").textContent = 'Uploaded to your Supabase storage bucket "product-images".';
    document.getElementById("pSubmitBtn").textContent = "Save product";
  }
  openModal("modalProduct");
}

function bindProductModal() {
  document.getElementById("btnAddProduct").addEventListener("click", () => openProductModal(null));

  document.getElementById("pPhoto").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { document.getElementById("pPhotoPreview").innerHTML = `<img src="${reader.result}">`; };
    reader.readAsDataURL(file);
  });

  document.getElementById("formProduct").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireConnection()) return;
    const btn = document.getElementById("pSubmitBtn");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const name = document.getElementById("pName").value.trim();
      const file = document.getElementById("pPhoto").files[0];
      let image_url;

      if (file) {
        const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await sb.storage.from("product-images").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = sb.storage.from("product-images").getPublicUrl(path);
        image_url = pub.publicUrl;
      }

      if (editingProductId) {
        const update = { name };
        if (image_url) update.image_url = image_url;
        const { error } = await sb.from("products").update(update).eq("id", editingProductId);
        if (error) throw error;
        toast("Product updated");
      } else {
        const qty = parseInt(document.getElementById("pQty").value, 10) || 0;
        const { error } = await sb.from("products").insert({ name, quantity: qty, image_url: image_url || null });
        if (error) throw error;
        toast("Product added");
      }

      closeAllModals();
      await loadProducts();
    } catch (err) {
      toast("Couldn't save product: " + friendlyError(err), true);
    } finally {
      btn.disabled = false; btn.textContent = editingProductId ? "Save changes" : "Save product";
    }
  });
}

// ==========================================================
// STOCK
// ==========================================================
function renderStock() {
  const tbody = document.getElementById("stockTableBody");
  const q = document.getElementById("stockSearch").value.trim().toLowerCase();
  const filter = document.getElementById("stockFilter").value;

  let list = productsCache.filter(p => p.name.toLowerCase().includes(q));
  if (filter === "low") list = list.filter(p => p.quantity <= LOW_STOCK_THRESHOLD);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty"><strong>Nothing to show</strong>Try a different search or filter.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    const low = p.quantity <= LOW_STOCK_THRESHOLD;
    return `<tr>
      <td class="name-cell">
        ${p.image_url ? `<img class="row-thumb" src="${escapeHtml(p.image_url)}">` : ""}
        ${escapeHtml(p.name)}
      </td>
      <td class="num" style="${low ? "color:var(--bad); font-weight:700;" : ""}">${p.quantity}</td>
      <td><span class="pill ${low ? "low" : "ok"}">${low ? "⚠ Low stock" : "In stock"}</span></td>
    </tr>`;
  }).join("");
}

function fillProductDropdowns() {
  document.querySelectorAll(".product-select").forEach(sel => {
    const current = sel.value;
    sel.innerHTML = `<option value="">Select product…</option>` +
      productsCache.map(p => `<option value="${p.id}" data-name="${escapeHtml(p.name)}" data-qty="${p.quantity}">${escapeHtml(p.name)} (${p.quantity} left)</option>`).join("");
    if (current) sel.value = current;
  });
}

// ==========================================================
// PURCHASES
// ==========================================================
async function loadPurchases() {
  const { data, error } = await sb.from("purchases").select("*").order("purchase_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) { toast("Couldn't load purchases: " + error.message, true); return; }
  purchasesCache = data || [];
  renderPurchases();
}

function renderPurchases() {
  const tbody = document.getElementById("purchasesTableBody");
  if (!purchasesCache.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><strong>No purchase bills yet</strong>Add a bill when stock arrives from a dealer.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = purchasesCache.map(p => `
    <tr style="cursor:pointer;" data-action="view-purchase" data-id="${p.id}">
      <td>${escapeHtml(p.dealer_name)}</td>
      <td>${formatDate(p.purchase_date)}</td>
      <td><span class="pill ${p.payment_type}">${p.payment_type}</span></td>
      <td><span class="pill ${p.status}">${p.status === "draft" ? "Draft" : "Completed"}</span></td>
      <td class="num">${money(p.total_amount)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit-purchase" data-id="${p.id}" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
          <button class="icon-btn danger" data-action="delete-purchase" data-id="${p.id}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
        </div>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll('[data-action="view-purchase"]').forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      showBillDetail("purchase", row.dataset.id);
    });
  });
  tbody.querySelectorAll('[data-action="edit-purchase"]').forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openPurchaseModal(btn.dataset.id); });
  });
  tbody.querySelectorAll('[data-action="delete-purchase"]').forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteBill("purchase", btn.dataset.id); });
  });
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function openPurchaseModal(id) {
  if (!requireConnection()) return;
  if (!id && !productsCache.length) { toast("Add at least one product first", true); return; }

  editingPurchaseId = id || null;
  editingPurchaseOriginalQty = {};
  document.getElementById("formPurchase").reset();
  document.getElementById("puItems").innerHTML = "";

  if (editingPurchaseId) {
    const header = purchasesCache.find(p => p.id === editingPurchaseId);
    document.getElementById("purchaseModalTitle").textContent = "Edit purchase bill";
    document.getElementById("puDealer").value = header.dealer_name;
    document.getElementById("puDate").value = header.purchase_date;
    setPayToggle("purchase", header.payment_type);

    sb.from("purchase_items").select("*").eq("purchase_id", editingPurchaseId).then(({ data, error }) => {
      if (error) { toast("Couldn't load bill items: " + error.message, true); return; }
      (data || []).forEach(item => {
        if (header.status === "completed" && item.product_id) {
          editingPurchaseOriginalQty[item.product_id] = (editingPurchaseOriginalQty[item.product_id] || 0) + item.quantity;
        }
        addItemRow("purchase", item);
      });
      if (!data || !data.length) addItemRow("purchase");
      updateBillTotal("purchase");
    });
  } else {
    document.getElementById("purchaseModalTitle").textContent = "Add purchase bill";
    document.getElementById("puDate").valueAsDate = new Date();
    setPayToggle("purchase", "cash");
    addItemRow("purchase");
    updateBillTotal("purchase");
  }
  openModal("modalPurchase");
}

function bindPurchaseModal() {
  document.getElementById("btnAddPurchase").addEventListener("click", () => openPurchaseModal(null));
  document.getElementById("puAddItem").addEventListener("click", () => addItemRow("purchase"));
  document.querySelectorAll('#modalPurchase .pay-toggle button').forEach(b => {
    b.addEventListener("click", () => setPayToggle("purchase", b.dataset.pay));
  });
  document.getElementById("formPurchase").addEventListener("submit", (e) => { e.preventDefault(); saveBill("purchase", "completed"); });
  document.getElementById("puDraftBtn").addEventListener("click", () => saveBill("purchase", "draft"));
}

// ==========================================================
// SALES
// ==========================================================
async function loadSales() {
  const { data, error } = await sb.from("sales").select("*").order("sale_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) { toast("Couldn't load sales: " + error.message, true); return; }
  salesCache = data || [];
  renderSales();
}

function renderSales() {
  const tbody = document.getElementById("salesTableBody");
  if (!salesCache.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><strong>No sale bills yet</strong>Add a bill each time you sell to a customer.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = salesCache.map(s => `
    <tr style="cursor:pointer;" data-action="view-sale" data-id="${s.id}">
      <td>${escapeHtml(s.buyer_name)}</td>
      <td>${formatDate(s.sale_date)}</td>
      <td><span class="pill ${s.payment_type}">${s.payment_type}</span></td>
      <td><span class="pill ${s.status}">${s.status === "draft" ? "Draft" : "Completed"}</span></td>
      <td class="num">${money(s.total_amount)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit-sale" data-id="${s.id}" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
          <button class="icon-btn danger" data-action="delete-sale" data-id="${s.id}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
        </div>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll('[data-action="view-sale"]').forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      showBillDetail("sale", row.dataset.id);
    });
  });
  tbody.querySelectorAll('[data-action="edit-sale"]').forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openSaleModal(btn.dataset.id); });
  });
  tbody.querySelectorAll('[data-action="delete-sale"]').forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteBill("sale", btn.dataset.id); });
  });
}

function openSaleModal(id) {
  if (!requireConnection()) return;
  if (!id && !productsCache.length) { toast("Add at least one product first", true); return; }

  editingSaleId = id || null;
  editingSaleOriginalQty = {};
  document.getElementById("formSale").reset();
  document.getElementById("saItems").innerHTML = "";

  if (editingSaleId) {
    const header = salesCache.find(s => s.id === editingSaleId);
    document.getElementById("saleModalTitle").textContent = "Edit sale bill";
    document.getElementById("saBuyer").value = header.buyer_name;
    document.getElementById("saDate").value = header.sale_date;
    setPayToggle("sale", header.payment_type);

    sb.from("sale_items").select("*").eq("sale_id", editingSaleId).then(({ data, error }) => {
      if (error) { toast("Couldn't load bill items: " + error.message, true); return; }
      (data || []).forEach(item => {
        if (header.status === "completed" && item.product_id) {
          editingSaleOriginalQty[item.product_id] = (editingSaleOriginalQty[item.product_id] || 0) + item.quantity;
        }
        addItemRow("sale", item);
      });
      if (!data || !data.length) addItemRow("sale");
      updateBillTotal("sale");
    });
  } else {
    document.getElementById("saleModalTitle").textContent = "Add sale bill";
    document.getElementById("saDate").valueAsDate = new Date();
    setPayToggle("sale", "cash");
    addItemRow("sale");
    updateBillTotal("sale");
  }
  openModal("modalSale");
}

function bindSaleModal() {
  document.getElementById("btnAddSale").addEventListener("click", () => openSaleModal(null));
  document.getElementById("saAddItem").addEventListener("click", () => addItemRow("sale"));
  document.querySelectorAll('#modalSale .pay-toggle button').forEach(b => {
    b.addEventListener("click", () => setPayToggle("sale", b.dataset.pay));
  });
  document.getElementById("formSale").addEventListener("submit", (e) => { e.preventDefault(); saveBill("sale", "completed"); });
  document.getElementById("saDraftBtn").addEventListener("click", () => saveBill("sale", "draft"));
}

function setPayToggle(kind, type) {
  const prefix = kind === "purchase" ? "pu" : "sa";
  document.getElementById(prefix + "PayType").value = type;
  document.querySelectorAll(`#modal${cap(kind)} .pay-toggle button`).forEach(b => {
    b.classList.toggle("active", b.dataset.pay === type);
  });
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// -------- shared line-item row logic for Purchase & Sale --------
let itemRowSeq = 0;

// `existing` (optional): a saved purchase_items/sale_items row, when editing
function addItemRow(kind, existing) {
  const container = document.getElementById(kind === "purchase" ? "puItems" : "saItems");
  const rowId = "row" + (++itemRowSeq);
  const withStyle = kind === "sale";

  const row = document.createElement("div");
  row.className = "item-row" + (withStyle ? " has-style" : "");
  row.dataset.rowId = rowId;
  row.innerHTML = `
    <div>
      <label>Product</label>
      <select class="product-select" data-role="product"></select>
    </div>
    ${withStyle ? `<div><label>Style / shade</label><input type="text" data-role="style" placeholder="optional"></div>` : ""}
    <div><label>Qty</label><input type="number" data-role="qty" min="1" value="1"></div>
    <div><label>Unit price</label><input type="number" data-role="price" min="0" step="0.01" value="0"></div>
    <div><label>Amount</label><div class="item-amount" data-role="amount">₹0.00</div></div>
    <button type="button" class="item-remove" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    ${kind === "sale" ? `<div class="stock-warn" data-role="warn" style="display:none;"></div>` : ""}
  `;
  container.appendChild(row);
  fillProductDropdowns();

  if (existing) {
    row.querySelector('[data-role="product"]').value = existing.product_id || "";
    if (withStyle) row.querySelector('[data-role="style"]').value = existing.style || "";
    row.querySelector('[data-role="qty"]').value = existing.quantity;
    row.querySelector('[data-role="price"]').value = existing.unit_price;
  }

  row.querySelector('[data-role="qty"]').addEventListener("input", () => updateRowAmount(row, kind));
  row.querySelector('[data-role="price"]').addEventListener("input", () => updateRowAmount(row, kind));
  row.querySelector('[data-role="product"]').addEventListener("change", () => updateRowAmount(row, kind));
  row.querySelector(".item-remove").addEventListener("click", () => {
    row.remove();
    updateBillTotal(kind);
  });

  updateRowAmount(row, kind);
}

// how much of a product is available to sell right now, accounting for
// the fact that editing a completed sale will first un-reserve its old qty
function availableForSale(productId) {
  const p = productsCache.find(p => p.id === productId);
  const base = p ? p.quantity : 0;
  const reserved = editingSaleOriginalQty[productId] || 0;
  return base + reserved;
}

function updateRowAmount(row, kind) {
  const qty = parseFloat(row.querySelector('[data-role="qty"]').value) || 0;
  const price = parseFloat(row.querySelector('[data-role="price"]').value) || 0;
  const amount = qty * price;
  row.querySelector('[data-role="amount"]').textContent = money(amount);

  if (kind === "sale") {
    const productId = row.querySelector('[data-role="product"]').value;
    const qtyInput = row.querySelector('[data-role="qty"]');
    const warn = row.querySelector('[data-role="warn"]');
    if (productId) {
      const available = availableForSale(productId);
      qtyInput.max = available;
      if (available <= 0) {
        warn.style.display = "block";
        warn.textContent = "Out of stock — this product currently has 0 available.";
        qtyInput.classList.add("qty-invalid");
      } else if (qty > available) {
        warn.style.display = "block";
        warn.textContent = `Only ${available} left in stock.`;
        qtyInput.classList.add("qty-invalid");
      } else {
        warn.style.display = "none";
        qtyInput.classList.remove("qty-invalid");
      }
    } else {
      warn.style.display = "none";
      qtyInput.classList.remove("qty-invalid");
    }
  }

  updateBillTotal(kind);
}

function updateBillTotal(kind) {
  const container = document.getElementById(kind === "purchase" ? "puItems" : "saItems");
  let total = 0;
  container.querySelectorAll(".item-row").forEach(row => {
    const qty = parseFloat(row.querySelector('[data-role="qty"]').value) || 0;
    const price = parseFloat(row.querySelector('[data-role="price"]').value) || 0;
    total += qty * price;
  });
  document.getElementById(kind === "purchase" ? "puTotal" : "saTotal").textContent = money(total);
}

// status: 'draft' or 'completed'
async function saveBill(kind, status) {
  if (!requireConnection()) return;
  const isPurchase = kind === "purchase";
  const prefix = isPurchase ? "pu" : "sa";
  const container = document.getElementById(prefix + "Items");
  const rows = [...container.querySelectorAll(".item-row")];

  const items = [];
  for (const row of rows) {
    const sel = row.querySelector('[data-role="product"]');
    const productId = sel.value;
    if (!productId) continue;
    const opt = sel.selectedOptions[0];
    const qty = parseInt(row.querySelector('[data-role="qty"]').value, 10) || 0;
    const price = parseFloat(row.querySelector('[data-role="price"]').value) || 0;
    if (qty <= 0) continue;

    const item = {
      product_id: productId,
      product_name: opt ? opt.dataset.name : "",
      quantity: qty,
      unit_price: price,
      amount: qty * price
    };
    if (!isPurchase) item.style = row.querySelector('[data-role="style"]')?.value.trim() || "";
    items.push(item);
  }

  const nameField = isPurchase ? "puDealer" : "saBuyer";
  const dateField = isPurchase ? "puDate" : "saDate";
  const name = document.getElementById(nameField).value.trim();
  const date = document.getElementById(dateField).value;

  if (!name) { toast(isPurchase ? "Enter the dealer name" : "Enter the buyer name", true); return; }
  if (!date) { toast("Pick a date", true); return; }
  if (status === "completed" && !items.length) { toast("Add at least one product with a quantity", true); return; }

  const submitBtn = document.getElementById(prefix + "SubmitBtn");
  const draftBtn = document.getElementById(prefix + "DraftBtn");
  submitBtn.disabled = true; draftBtn.disabled = true;
  const busyBtn = status === "draft" ? draftBtn : submitBtn;
  const busyLabel = busyBtn.textContent;
  busyBtn.textContent = "Saving…";

  try {
    if (isPurchase) {
      const payType = document.getElementById("puPayType").value;
      if (editingPurchaseId) {
        const { error } = await sb.rpc("update_purchase", {
          p_purchase_id: editingPurchaseId, p_dealer_name: name, p_purchase_date: date,
          p_payment_type: payType, p_status: status, p_items: items
        });
        if (error) throw error;
      } else {
        const { error } = await sb.rpc("create_purchase", {
          p_dealer_name: name, p_purchase_date: date, p_payment_type: payType, p_status: status, p_items: items
        });
        if (error) throw error;
      }
    } else {
      const payType = document.getElementById("saPayType").value;
      if (editingSaleId) {
        const { error } = await sb.rpc("update_sale", {
          p_sale_id: editingSaleId, p_buyer_name: name, p_sale_date: date,
          p_payment_type: payType, p_status: status, p_items: items
        });
        if (error) throw error;
      } else {
        const { error } = await sb.rpc("create_sale", {
          p_buyer_name: name, p_sale_date: date, p_payment_type: payType, p_status: status, p_items: items
        });
        if (error) throw error;
      }
    }

    toast(status === "draft"
      ? "Saved as draft"
      : (isPurchase ? "Purchase bill saved" : "Sale bill saved"));
    closeAllModals();
    await refreshAll();
  } catch (err) {
    toast("Couldn't save bill: " + friendlyError(err), true);
  } finally {
    submitBtn.disabled = false; draftBtn.disabled = false;
    busyBtn.textContent = busyLabel;
  }
}

async function deleteBill(kind, id) {
  if (!requireConnection()) return;
  if (!confirm("Delete this bill? If it was completed, stock quantities will be adjusted back automatically.")) return;
  const fn = kind === "purchase" ? "delete_purchase" : "delete_sale";
  const arg = kind === "purchase" ? { p_purchase_id: id } : { p_sale_id: id };
  const { error } = await sb.rpc(fn, arg);
  if (error) { toast("Couldn't delete bill: " + friendlyError(error), true); return; }
  toast("Bill deleted");
  await refreshAll();
}

async function showBillDetail(kind, id) {
  const table = kind === "purchase" ? "purchase_items" : "sale_items";
  const fk = kind === "purchase" ? "purchase_id" : "sale_id";
  const header = (kind === "purchase" ? purchasesCache : salesCache).find(b => b.id === id);
  const { data: items, error } = await sb.from(table).select("*").eq(fk, id).order("created_at");
  if (error) { toast("Couldn't load bill: " + error.message, true); return; }

  document.getElementById("detailTitle").textContent =
    kind === "purchase" ? `Purchase — ${header.dealer_name}` : `Sale — ${header.buyer_name}`;

  document.getElementById("detailBody").innerHTML = `
    <div class="breakdown-row"><span>Date</span><strong>${formatDate(header.purchase_date || header.sale_date)}</strong></div>
    <div class="breakdown-row"><span>Payment</span><span class="pill ${header.payment_type}">${header.payment_type}</span></div>
    <div class="breakdown-row"><span>Status</span><span class="pill ${header.status}">${header.status === "draft" ? "Draft" : "Completed"}</span></div>
    <div class="table-wrap" style="margin-top:12px;">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Product</th>${kind === "sale" ? "<th>Style</th>" : ""}<th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${(items || []).map(i => `<tr>
              <td>${escapeHtml(i.product_name)}</td>
              ${kind === "sale" ? `<td>${escapeHtml(i.style || "—")}</td>` : ""}
              <td class="num">${i.quantity}</td>
              <td class="num">${money(i.unit_price)}</td>
              <td class="num">${money(i.amount)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="bill-total"><span>Total</span><span>${money(header.total_amount)}</span></div>
  `;

  document.getElementById("detailEditWrap").innerHTML = `<button class="btn block" id="detailEditBtn">Edit this bill</button>`;
  document.getElementById("detailEditBtn").addEventListener("click", () => {
    closeAllModals();
    if (kind === "purchase") openPurchaseModal(id); else openSaleModal(id);
  });

  openModal("modalDetail");
}

// ==========================================================
// DASHBOARD  (only 'completed' bills count toward totals & stock math)
// ==========================================================
function renderDashboard() {
  const now = new Date();
  document.getElementById("dashMonthLabel").textContent =
    now.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) + " at a glance";

  const completedSales = salesCache.filter(s => s.status === "completed");
  const completedPurchases = purchasesCache.filter(p => p.status === "completed");

  const monthSales = completedSales.filter(s => isSameMonth(s.sale_date, now));
  const monthPurchases = completedPurchases.filter(p => isSameMonth(p.purchase_date, now));

  const salesCash = sum(monthSales.filter(s => s.payment_type === "cash").map(s => s.total_amount));
  const salesCredit = sum(monthSales.filter(s => s.payment_type === "credit").map(s => s.total_amount));
  const purchaseCash = sum(monthPurchases.filter(p => p.payment_type === "cash").map(p => p.total_amount));
  const purchaseCredit = sum(monthPurchases.filter(p => p.payment_type === "credit").map(p => p.total_amount));

  document.getElementById("statSalesCash").textContent = money(salesCash);
  document.getElementById("statSalesCredit").textContent = money(salesCredit);
  document.getElementById("statPurchaseCash").textContent = money(purchaseCash);
  document.getElementById("statPurchaseCredit").textContent = money(purchaseCredit);

  document.getElementById("ovTotalSales").textContent = money(salesCash + salesCredit);
  document.getElementById("ovTotalPurchase").textContent = money(purchaseCash + purchaseCredit);
  document.getElementById("ovBillCount").textContent = String(monthSales.length + monthPurchases.length);
  document.getElementById("ovProductCount").textContent = String(productsCache.length);

  const low = productsCache.filter(p => p.quantity <= LOW_STOCK_THRESHOLD).sort((a, b) => a.quantity - b.quantity);
  const lowEl = document.getElementById("lowStockList");
  lowEl.innerHTML = low.length
    ? low.map(p => `<div class="breakdown-row"><span>${escapeHtml(p.name)}</span><span class="pill low">${p.quantity} left</span></div>`).join("")
    : `<div class="empty" style="padding:18px;"><strong>All good</strong>No products are running low.</div>`;

  const recent = [
    ...completedPurchases.slice(0, 5).map(p => ({ type: "Purchase", who: p.dealer_name, amount: p.total_amount, date: p.purchase_date, pay: p.payment_type })),
    ...completedSales.slice(0, 5).map(s => ({ type: "Sale", who: s.buyer_name, amount: s.total_amount, date: s.sale_date, pay: s.payment_type })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  const recEl = document.getElementById("recentActivity");
  recEl.innerHTML = recent.length
    ? recent.map(r => `<div class="breakdown-row">
        <span>${r.type} — ${escapeHtml(r.who)} <span class="pill ${r.pay}" style="margin-left:6px;">${r.pay}</span></span>
        <strong>${money(r.amount)}</strong>
      </div>`).join("")
    : `<div class="empty" style="padding:18px;"><strong>Nothing yet</strong>Completed purchases and sales will show up here.</div>`;
}

function sum(arr) { return arr.reduce((a, b) => a + Number(b || 0), 0); }

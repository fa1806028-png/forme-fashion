const productGrid = document.querySelector("#product-grid");
const resultCount = document.querySelector("#result-count");
const emptyState = document.querySelector("#empty-state");
const searchInput = document.querySelector("#search-input");
const bagDrawer = document.querySelector("#bag-drawer");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
const drawerContent = document.querySelector("#drawer-content");
const confirmation = document.querySelector("#order-confirmation");
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
let activeCategory = "all";
let products = [];
const productCatalog = new Map();
let cart = readCart();
let searchTimer;
let apiAvailable = true;

function readCart() {
  try {
    const stored = JSON.parse(localStorage.getItem("forme-cart") || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem("forme-cart", JSON.stringify(cart));
  updateBagCount();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatPrice(cents) {
  return currency.format(cents / 100);
}

function updateBagCount() {
  const count = Object.values(cart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
  document.querySelector("#bag-count").textContent = count;
  document.querySelector("#drawer-count").textContent = `(${count})`;
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (activeCategory !== "all") params.set("category", activeCategory);
  const query = searchInput.value.trim();
  if (query) params.set("q", query);
  resultCount.textContent = "Loading…";
  try {
    if (apiAvailable) {
      const response = await fetch(`/api/products?${params}`);
      if (response.ok) {
        products = (await response.json()).products;
      } else {
        apiAvailable = false;
      }
    }
    if (!apiAvailable) {
      const response = await fetch(new URL("products.json", document.baseURI));
      if (!response.ok) throw new Error("Could not load the collection.");
      const data = await response.json();
      products = data.products;
      if (activeCategory !== "all") {
        products = products.filter((product) => product.category === activeCategory || product.category === "unisex");
      }
      if (query) {
        const search = query.toLocaleLowerCase();
        products = products.filter((product) => `${product.name} ${product.type} ${product.color} ${product.category}`.toLocaleLowerCase().includes(search));
      }
    }
    products.forEach((product) => productCatalog.set(product.id, product));
    renderProducts();
  } catch {
    productGrid.innerHTML = '<p class="empty-state">The collection could not load. Refresh to try again.</p>';
    resultCount.textContent = "";
  }
}

function renderProducts() {
  resultCount.textContent = `${products.length} ${products.length === 1 ? "piece" : "pieces"}`;
  emptyState.hidden = products.length > 0;
  productGrid.innerHTML = products.map((product, index) => `
    <article class="product-card" style="animation-delay:${Math.min(index * 45, 180)}ms">
      <div class="product-image-wrap">
        <img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} in ${escapeHtml(product.color)}" loading="lazy" />
        ${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}
        <button class="add-button" type="button" data-add="${escapeHtml(product.id)}">Add to bag <span aria-hidden="true">+</span></button>
      </div>
      <div class="product-info">
        <div><h3 class="product-name">${escapeHtml(product.name)}</h3><p class="product-type">${escapeHtml(product.type)} · ${escapeHtml(product.color)}</p></div>
        <p class="product-price">${formatPrice(product.price)}</p>
      </div>
    </article>
  `).join("");
}

function setCategory(category) {
  activeCategory = category;
  document.querySelectorAll(".category-tab").forEach((tab) => {
    const selected = tab.dataset.category === category;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-pressed", String(selected));
  });
  loadProducts();
}

function openBag() {
  confirmation.hidden = true;
  drawerContent.hidden = false;
  renderCart();
  drawerBackdrop.hidden = false;
  bagDrawer.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => bagDrawer.classList.add("is-open"));
  document.body.classList.add("drawer-visible");
  document.querySelector("#close-bag").focus();
}

function closeBag() {
  bagDrawer.classList.remove("is-open");
  bagDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-visible");
  window.setTimeout(() => { drawerBackdrop.hidden = true; }, 280);
}

function renderCart() {
  const lines = Object.entries(cart)
    .map(([id, quantity]) => ({ product: productCatalog.get(id), id, quantity: Number(quantity) }))
    .filter((line) => line.product && line.quantity > 0);
  const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  if (!lines.length) {
    drawerContent.innerHTML = '<p class="cart-empty">Your bag is taking a slow morning. Add a piece you love and it will be waiting here.</p>';
    return;
  }
  drawerContent.innerHTML = `
    <div class="cart-lines">${lines.map(({ product, id, quantity }) => `
      <div class="cart-line">
        <img src="${escapeHtml(product.image)}" alt="" />
        <div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.color)} · ${formatPrice(product.price)}</p>
          <div class="quantity-control" aria-label="Quantity for ${escapeHtml(product.name)}">
            <button type="button" data-quantity="${escapeHtml(id)}" data-delta="-1" aria-label="Remove one">−</button>
            <span>${quantity}</span>
            <button type="button" data-quantity="${escapeHtml(id)}" data-delta="1" aria-label="Add one">+</button>
          </div>
        </div><span class="cart-line-price">${formatPrice(product.price * quantity)}</span>
      </div>`).join("")}</div>
    <div class="drawer-bottom">
      <div class="subtotal-row"><span>Subtotal</span><span>${formatPrice(total)}</span></div>
      <p class="shipping-note">${total >= 15000 ? "Your order ships free." : `Shipping is on us over $150. You're ${formatPrice(15000 - total)} away.`}</p>
      <form id="checkout-form" class="checkout-fields">
        <input name="name" autocomplete="name" placeholder="Full name" aria-label="Full name" required maxlength="120" />
        <input name="email" type="email" autocomplete="email" placeholder="Email address" aria-label="Email address" required maxlength="254" />
        <input name="address" autocomplete="street-address" placeholder="Delivery address" aria-label="Delivery address" required maxlength="300" />
        <button class="checkout-button" type="submit">${apiAvailable ? "Place order" : "Place demo order"} · ${formatPrice(total)}</button>
      </form><p class="checkout-error" id="checkout-error" role="alert"></p>
      ${apiAvailable ? "" : '<p class="shipping-note">Portfolio demo only: no payment is taken and this order is not saved.</p>'}
    </div>`;
}

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  const id = button.dataset.add;
  cart[id] = Math.min(Number(cart[id] || 0) + 1, 20);
  saveCart();
  button.innerHTML = 'Added <span aria-hidden="true">✓</span>';
  window.setTimeout(() => { button.innerHTML = 'Add to bag <span aria-hidden="true">+</span>'; }, 950);
});

drawerContent.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quantity]");
  if (!button) return;
  const id = button.dataset.quantity;
  const next = Number(cart[id] || 0) + Number(button.dataset.delta);
  if (next <= 0) delete cart[id];
  else cart[id] = Math.min(next, 20);
  saveCart();
  renderCart();
});

drawerContent.addEventListener("submit", async (event) => {
  if (event.target.id !== "checkout-form") return;
  event.preventDefault();
  const form = event.target;
  const submitButton = form.querySelector("button[type=submit]");
  const error = document.querySelector("#checkout-error");
  submitButton.disabled = true;
  submitButton.textContent = "Placing your order…";
  error.textContent = "";
  try {
    const items = Object.entries(cart).map(([id, quantity]) => ({ id, quantity: Number(quantity) }));
    const customer = Object.fromEntries(new FormData(form));
    let result;
    if (apiAvailable) {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer, items }) });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your order could not be placed.");
    } else {
      result = {
        orderId: `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        totalCents: items.reduce((sum, item) => sum + (productCatalog.get(item.id)?.price || 0) * item.quantity, 0),
      };
    }
    cart = {};
    saveCart();
    drawerContent.hidden = true;
    confirmation.hidden = false;
    confirmation.innerHTML = apiAvailable
      ? `<h3>That's a good choice.</h3><p>Your order is in. We'll send the details to ${escapeHtml(customer.email)}.</p><p class="confirmation-id">Order ${escapeHtml(result.orderId)} · ${formatPrice(result.totalCents)}</p>`
      : `<h3>That's a good choice.</h3><p>This is a portfolio demo, so no payment was taken and no order was saved.</p><p class="confirmation-id">Demo order ${escapeHtml(result.orderId)} · ${formatPrice(result.totalCents)}</p>`;
  } catch (requestError) {
    error.textContent = requestError.message;
    submitButton.disabled = false;
    submitButton.textContent = "Try again";
  }
});

document.querySelectorAll(".category-tab").forEach((tab) => tab.addEventListener("click", () => setCategory(tab.dataset.category)));
document.querySelectorAll("[data-nav-category]").forEach((link) => link.addEventListener("click", () => setCategory(link.dataset.navCategory)));
document.querySelectorAll("[data-category-link]").forEach((link) => link.addEventListener("click", () => setCategory(link.dataset.categoryLink)));
searchInput.addEventListener("input", () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(loadProducts, 180); });
document.querySelector("#open-bag").addEventListener("click", openBag);
document.querySelector("#close-bag").addEventListener("click", closeBag);
drawerBackdrop.addEventListener("click", closeBag);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && bagDrawer.classList.contains("is-open")) closeBag(); });
updateBagCount();
loadProducts();
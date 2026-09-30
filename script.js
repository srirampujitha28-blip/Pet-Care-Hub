const state = { data: null, category: "All", adminTab: "products", cart: JSON.parse(localStorage.getItem("pawprint-cart") || "{}"), wishlist: JSON.parse(localStorage.getItem("pawprint-wishlist") || "[]"), search: "", chatHistory: [], chatBusy: false };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = (value) => `$${Number(value).toFixed(2)}`;
const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const imageFallback = "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=800&q=80";
const chatPanel = $("#chatPanel");
document.body.append(chatPanel);

async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}
function setView(name) {
  const page = $(`[data-page="${name}"]`);
  if (!page) return;
  $$(".page").forEach((item) => item.classList.toggle("active", item === page));
  $$(".nav-link[data-view]").forEach((link) => link.classList.toggle("active", link.dataset.view === name));
  $("#pageTitle").textContent = ({ home: "Home", pets: "Pet profiles", products: "Pet products", grooming: "Grooming services", appointments: "Vet appointments", health: "Health & reminders", cart: "Cart", wishlist: "Wishlist", orders: "Orders", contact: "Contact", assistant: "Pet assistant", admin: "Admin dashboard" })[name] || name;
  $("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "cart") renderCart();
  if (name === "wishlist") renderWishlist();
  if (name === "orders") renderOrders();
  if (name === "admin") renderAdmin();
}
function petById(id) { return state.data.pets.find((pet) => pet.id === Number(id)); }
function renderPetCard(pet) {
  return `<article class="pet-card"><img class="pet-photo" src="${escapeHTML(pet.image || imageFallback)}" alt="${escapeHTML(pet.name)}" /><div class="pet-details"><div class="pet-title-line"><h3>${escapeHTML(pet.name)}</h3><span class="pet-kind">${escapeHTML(pet.species)}</span></div><p>${escapeHTML(pet.breed || "Mixed breed")} · ${escapeHTML(pet.age || "Age not set")}${pet.weight ? ` · ${escapeHTML(pet.weight)}` : ""}</p><span class="pet-health-line"><i class="health-dot"></i>${escapeHTML(pet.notes || "Looking healthy and happy")}</span></div><div class="pet-side"><span class="pet-next">${pet.next_visit ? `Next visit ${escapeHTML(pet.next_visit)}` : "Care profile"}</span><button data-pet-reminders="${pet.id}">Care details →</button></div></article>`;
}
function renderPets() {
  const pets = state.data.pets;
  $("#homePetGrid").innerHTML = pets.slice(0, 2).map(renderPetCard).join("") || emptyState("No pet profiles yet", "Add your first pet to get started.");
  $("#allPetGrid").innerHTML = pets.map(renderPetCard).join("") || emptyState("No pet profiles yet", "Add a pet profile to keep their care details together.");
  const options = pets.map((pet) => `<option value="${pet.id}">${escapeHTML(pet.name)}</option>`).join("");
  $("#appointmentPet").innerHTML = options || `<option value="">Add a pet profile first</option>`;
  $("#reminderPet").innerHTML = options || `<option value="">Add a pet profile first</option>`;
}
function productCard(product) {
  const saved = state.wishlist.includes(product.id);
  const inStock = product.stock > 0;
  return `<article class="product-card"><div class="product-photo-wrap"><img class="product-photo" src="${escapeHTML(product.image || imageFallback)}" alt="${escapeHTML(product.name)}" loading="lazy" onerror="this.onerror=null;this.src='${imageFallback}'" /><span class="product-badge">${inStock ? escapeHTML(product.badge || product.category) : "Out of stock"}</span><button class="wish-button ${saved ? "saved" : ""}" data-wish="${product.id}" aria-label="${saved ? "Remove from" : "Add to"} wishlist">${saved ? "♥" : "♡"}</button></div><div class="product-info"><span class="product-category">${escapeHTML(product.category)}</span><h3 class="product-name">${escapeHTML(product.name)}</h3><div class="rating">★★★★★ <span>${Number(product.rating).toFixed(1)} (${product.review_count})</span></div><div class="product-bottom"><span class="price">${money(product.price)}</span><button class="add-cart" data-add="${product.id}" aria-label="Add ${escapeHTML(product.name)} to cart" ${inStock ? "" : "disabled title=\"Out of stock\""}>${inStock ? "＋" : "×"}</button></div></div></article>`;
}
function renderProducts() {
  const categories = ["All", ...new Set(state.data.products.map((product) => product.category))];
  $("#categoryFilters").innerHTML = categories.map((category) => `<button class="category-chip ${state.category === category ? "active" : ""}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join("");
  let products = state.data.products.filter((product) => (state.category === "All" || product.category === state.category) && `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(state.search.toLowerCase()));
  const sort = $("#sortProducts").value;
  if (sort === "price-low") products.sort((a, b) => a.price - b.price);
  if (sort === "price-high") products.sort((a, b) => b.price - a.price);
  if (sort === "rating") products.sort((a, b) => b.rating - a.rating);
  $("#productResultCount").textContent = `${products.length} ${products.length === 1 ? "product" : "products"}${state.search ? ` matching “${state.search}”` : " for your good pal"}`;
  $("#productGrid").innerHTML = products.map(productCard).join("") || emptyState("No products found", "Try another search or choose a different category.");
  $("#homeProductGrid").innerHTML = state.data.products.slice(0, 4).map(productCard).join("");
}
function emptyState(title, detail) { return `<div class="empty-state"><strong>${escapeHTML(title)}</strong><p>${escapeHTML(detail)}</p></div>`; }
function renderHomePanels() {
  const next = state.data.appointments.find((item) => item.status !== "Cancelled" && item.status !== "Completed");
  $("#nextAppointment").innerHTML = next ? `<div class="visit-content"><div class="date-block"><strong>${new Date(`${next.date}T12:00:00`).getDate()}</strong><span>${new Date(`${next.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</span></div><div class="visit-info"><strong>${escapeHTML(next.service)} · ${escapeHTML(petById(next.pet_id)?.name || "Pet")}</strong><span>${escapeHTML(next.time)} · ${escapeHTML(next.status)}</span></div></div>` : emptyState("Nothing booked yet", "Your next visit will show up here.");
  const reminders = state.data.reminders.filter((item) => !item.done).slice(0, 2);
  $("#homeReminders").innerHTML = reminders.map((reminder) => `<div class="reminder-row"><span class="reminder-symbol">✚</span><span><strong>${escapeHTML(reminder.title)}</strong><small>${escapeHTML(petById(reminder.pet_id)?.name || "Pet")} · ${escapeHTML(reminder.kind)}</small></span><span class="due">${formatDue(reminder.due_date)}</span></div>`).join("") || emptyState("All caught up", "No upcoming reminders right now.");
}
function formatDue(date) { return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function renderAppointments() {
  const appointments = state.data.appointments;
  $("#appointmentList").innerHTML = appointments.length ? appointments.map((item) => `<div class="appointment-item"><div class="date-block"><strong>${new Date(`${item.date}T12:00:00`).getDate()}</strong><span>${new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</span></div><div class="appointment-item-info"><strong>${escapeHTML(item.service)} · ${escapeHTML(petById(item.pet_id)?.name || "Pet")}</strong><span>${escapeHTML(item.time)} · ${escapeHTML(item.status)}</span></div><span class="status-badge">${escapeHTML(item.status)}</span></div>`).join("") : emptyState("No appointments booked", "Choose a time and service to get started.");
}
function renderHealth() {
  $("#healthPetCards").innerHTML = state.data.pets.map((pet) => `<article class="health-pet-card"><img src="${escapeHTML(pet.image || imageFallback)}" alt="" /><div><strong>${escapeHTML(pet.name)}</strong><span>${escapeHTML(pet.species)} · ${escapeHTML(pet.breed || "Mixed breed")}</span></div></article>`).join("");
  const reminders = state.data.reminders;
  $("#remindersList").innerHTML = reminders.length ? reminders.map((item) => `<div class="reminder-list-item"><span class="round-icon ${item.done ? "mint" : "peach"}">${item.done ? "✓" : "✚"}</span><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(petById(item.pet_id)?.name || "Pet")} · ${escapeHTML(item.kind)}</small></span><time>${formatDue(item.due_date)}</time>${item.done ? `<span class="status-badge">Done</span>` : `<button class="check-button" data-reminder-done="${item.id}">Mark done</button>`}</div>`).join("") : emptyState("No reminders yet", "Add a reminder for medication, vaccinations, or a wellness visit.");
}
function persistLocal() { localStorage.setItem("pawprint-cart", JSON.stringify(state.cart)); localStorage.setItem("pawprint-wishlist", JSON.stringify(state.wishlist)); updateCounts(); }
function updateCounts() {
  const count = Object.values(state.cart).reduce((sum, quantity) => sum + quantity, 0);
  $("#cartNavCount").textContent = count; $("#shopCartCount").textContent = count;
  $(".nav-link[data-view='cart']").setAttribute("aria-label", `Cart, ${count} items`);
  $("#wishlistNavCount").textContent = state.wishlist.length;
  const cartButton = $(".topbar .top-user");
  if (cartButton) cartButton.dataset.cart = count;
}
function addToCart(id) { state.cart[id] = (state.cart[id] || 0) + 1; persistLocal(); toast("Added to your cart 🐾"); }
function toggleWishlist(id) { state.wishlist = state.wishlist.includes(id) ? state.wishlist.filter((item) => item !== id) : [...state.wishlist, id]; persistLocal(); renderProducts(); if ($("#page-wishlist").classList.contains("active")) renderWishlist(); }
function renderCart() {
  const entries = Object.entries(state.cart).map(([id, quantity]) => ({ product: state.data.products.find((product) => product.id === Number(id)), quantity })).filter((entry) => entry.product);
  const subtotal = entries.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0);
  $("#cartItems").innerHTML = entries.length ? entries.map(({ product, quantity }) => `<div class="cart-line"><img src="${escapeHTML(product.image)}" alt="" /><div><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.category)}</small></div><div class="quantity-control"><button data-quantity="${product.id}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${quantity}</span><button data-quantity="${product.id}" data-delta="1" aria-label="Increase quantity">＋</button></div><span class="line-total">${money(product.price * quantity)}</span><button class="remove-button" data-remove="${product.id}" aria-label="Remove ${escapeHTML(product.name)}">×</button></div>`).join("") : emptyState("Your cart is taking a nap", "Browse the shop to find something they'll love.");
  $("#cartSummary").innerHTML = `<h3>Order summary</h3><div class="summary-line"><span>Subtotal</span><span>${money(subtotal)}</span></div><div class="summary-line"><span>Delivery</span><span>${subtotal ? "Free" : money(0)}</span></div><div class="summary-line summary-total"><span>Total</span><span>${money(subtotal)}</span></div><button class="button button-dark full-button" id="checkoutButton" ${entries.length ? "" : "disabled"}>Place order <span>→</span></button><p class="muted" style="font-size:10px;text-align:center">Secure demo checkout · no payment collected</p>`;
}
function renderWishlist() {
  const products = state.data.products.filter((product) => state.wishlist.includes(product.id));
  $("#wishlistGrid").innerHTML = products.map(productCard).join("") || emptyState("Nothing saved just yet", "Tap the heart on a product to keep it here.");
}
async function renderOrders() {
  const orders = await api("orders");
  $("#ordersList").innerHTML = orders.length ? orders.map((order) => `<div class="order-row"><span class="order-icon">♧</span><div class="order-main"><strong>Order #${order.id} · ${order.items.map((item) => `${escapeHTML(item.name)} ×${item.quantity}`).join(", ")}</strong><span>${formatDue(order.created_at.slice(0, 10))} · ${escapeHTML(order.status)}</span></div><span class="order-total">${money(order.total)}</span><span class="status-badge">${escapeHTML(order.status)}</span></div>`).join("") : emptyState("No orders yet", "Your placed orders will appear here.");
}
function renderAdmin() {
  const orders = state.data.orders || [];
  const appointments = state.data.appointments;
  $("#adminStats").innerHTML = `<div class="admin-stat"><span>Products in catalog</span><strong>${state.data.products.length}</strong></div><div class="admin-stat"><span>Open orders</span><strong>${orders.filter((order) => order.status !== "Delivered" && order.status !== "Cancelled").length}</strong></div><div class="admin-stat"><span>Appointment requests</span><strong>${appointments.filter((item) => item.status === "Requested").length}</strong></div><div class="admin-stat"><span>Pet profiles</span><strong>${state.data.pets.length}</strong></div>`;
  $$(".admin-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.adminTab === state.adminTab));
  if (state.adminTab === "products") {
    $("#adminPanel").innerHTML = `<button class="button button-dark admin-add" id="adminAddProduct">＋ Add product</button><table class="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Rating</th><th></th></tr></thead><tbody>${state.data.products.map((product) => `<tr><td>${escapeHTML(product.name)}</td><td>${escapeHTML(product.category)}</td><td>${money(product.price)}</td><td>${product.stock}</td><td>★ ${product.rating}</td><td><button data-edit-product="${product.id}">Edit</button></td></tr>`).join("")}</tbody></table>`;
  } else if (state.adminTab === "orders") {
    $("#adminPanel").innerHTML = orders.length ? `<table class="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${orders.map((order) => `<tr><td>#${order.id}</td><td>${escapeHTML(order.customer)}</td><td>${formatDue(order.created_at.slice(0, 10))}</td><td>${money(order.total)}</td><td><select data-order-status="${order.id}">${["Processing", "Packed", "Shipped", "Delivered", "Cancelled"].map((status) => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}</select></td><td><button data-save-order="${order.id}">Save</button></td></tr>`).join("")}</tbody></table>` : emptyState("No orders to manage", "Orders placed by customers will show here.");
  } else {
    $("#adminPanel").innerHTML = appointments.length ? `<table class="admin-table"><thead><tr><th>Pet & service</th><th>Date</th><th>Time</th><th>Status</th><th></th></tr></thead><tbody>${appointments.map((item) => `<tr><td>${escapeHTML(petById(item.pet_id)?.name || "Pet")} · ${escapeHTML(item.service)}</td><td>${formatDue(item.date)}</td><td>${escapeHTML(item.time)}</td><td><select data-appointment-status="${item.id}">${["Requested", "Confirmed", "Completed", "Cancelled"].map((status) => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}</select></td><td><button data-save-appointment="${item.id}">Save</button></td></tr>`).join("")}</tbody></table>` : emptyState("No appointments", "New booking requests will appear here.");
  }
}
function renderAll() { renderPets(); renderProducts(); renderAppointments(); renderHealth(); renderHomePanels(); renderAdmin(); updateCounts(); }
async function refresh() { state.data = await api("data"); renderAll(); }

$("body").addEventListener("click", async (event) => {
  const target = event.target.closest("button,[data-view]");
  if (!target) return;
  if (target.dataset.view) { setView(target.dataset.view); return; }
  if (target.id === "menuToggle") { $("#sidebar").classList.toggle("open"); return; }
  if (target.dataset.category) { state.category = target.dataset.category; renderProducts(); return; }
  if (target.dataset.add) { addToCart(Number(target.dataset.add)); return; }
  if (target.dataset.wish) { toggleWishlist(Number(target.dataset.wish)); return; }
  if (target.dataset.quantity) { const id = target.dataset.quantity; state.cart[id] = (state.cart[id] || 0) + Number(target.dataset.delta); if (state.cart[id] <= 0) delete state.cart[id]; persistLocal(); renderCart(); return; }
  if (target.dataset.remove) { delete state.cart[target.dataset.remove]; persistLocal(); renderCart(); return; }
  if (target.dataset.petReminders) { setView("health"); return; }
  if (target.dataset.bookService) { $("#appointmentService").value = target.dataset.bookService; setView("appointments"); return; }
  if (target.id === "addPetButton") { $("#petDialog").showModal(); return; }
  if (target.id === "addReminderButton") { $("#reminderDialog").showModal(); return; }
  if (target.dataset.reminderDone) { try { await api(`reminders/${target.dataset.reminderDone}`, { method: "PATCH", body: JSON.stringify({ done: true }) }); await refresh(); toast("Reminder marked complete"); } catch (error) { toast(error.message); } return; }
  if (target.dataset.adminTab) { state.adminTab = target.dataset.adminTab; renderAdmin(); return; }
  if (target.id === "adminAddProduct") { showProductForm(); return; }
  if (target.dataset.editProduct) { showProductForm(state.data.products.find((item) => item.id === Number(target.dataset.editProduct))); return; }
  if (target.dataset.saveOrder) { try { await api(`orders/${target.dataset.saveOrder}`, { method: "PATCH", body: JSON.stringify({ status: $(`[data-order-status="${target.dataset.saveOrder}"]`).value }) }); await refresh(); toast("Order updated"); } catch (error) { toast(error.message); } return; }
  if (target.dataset.saveAppointment) { try { await api(`appointments/${target.dataset.saveAppointment}`, { method: "PATCH", body: JSON.stringify({ status: $(`[data-appointment-status="${target.dataset.saveAppointment}"]`).value }) }); await refresh(); toast("Appointment updated"); } catch (error) { toast(error.message); } return; }
  if (target.id === "checkoutButton") { checkout(); }
});
function showProductForm(product = null) {
  const name = prompt(product ? "Product name:" : "New product name:", product?.name || "");
  if (!name) return;
  const category = prompt("Category:", product?.category || "Toys & play"); if (!category) return;
  const price = Number(prompt("Price in USD:", product?.price || "18")); if (!Number.isFinite(price) || price < 0) return toast("Enter a valid price");
  const image = prompt("Product image URL:", product?.image || imageFallback) || imageFallback;
  const stock = Number(prompt("Stock quantity:", product?.stock ?? "10")); if (!Number.isInteger(stock) || stock < 0) return toast("Enter a valid stock quantity");
  const payload = { name, category, price, image, stock, rating: product?.rating || 4.8, review_count: product?.review_count || 0, description: product?.description || "A thoughtful pick for your pet." };
  api(product ? `products/${product.id}` : "products", { method: product ? "PUT" : "POST", body: JSON.stringify(payload) }).then(refresh).then(() => toast("Product saved")).catch((error) => toast(error.message));
}
async function checkout() {
  const items = Object.entries(state.cart).map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }));
  if (!items.length) return;
  try { await api("orders", { method: "POST", body: JSON.stringify({ customer: "Jamie Davis", items }) }); state.cart = {}; persistLocal(); await refresh(); renderCart(); toast("Order placed! It's a treat for both of you."); }
  catch (error) { toast(error.message); }
}
$("#sortProducts").addEventListener("change", renderProducts);
$("#globalSearch").addEventListener("input", (event) => { state.search = event.target.value.trim(); if (state.search && !$("#page-products").classList.contains("active")) setView("products"); renderProducts(); });
$("#globalSearch").addEventListener("keydown", (event) => { if (event.key === "Enter") setView("products"); });
document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#globalSearch").focus(); } });

$("#appointmentForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const payload = Object.fromEntries(new FormData(form)); payload.pet_id = Number(payload.pet_id); try { await api("appointments", { method: "POST", body: JSON.stringify(payload) }); form.reset(); $("#appointmentDate").min = new Date().toISOString().slice(0, 10); await refresh(); $("#appointmentMessage").textContent = "Request sent! We'll confirm your time shortly."; toast("Appointment request sent"); } catch (error) { $("#appointmentMessage").textContent = error.message; } });
$("#petForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const payload = Object.fromEntries(new FormData(form)); try { await api("pets", { method: "POST", body: JSON.stringify(payload) }); form.reset(); $("#petDialog").close(); await refresh(); toast("Pet profile added"); } catch (error) { toast(error.message); } });
$("#reminderForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const payload = Object.fromEntries(new FormData(form)); payload.pet_id = Number(payload.pet_id); try { await api("reminders", { method: "POST", body: JSON.stringify(payload) }); form.reset(); $("#reminderDialog").close(); await refresh(); toast("Care reminder saved"); } catch (error) { toast(error.message); } });
$("#contactForm").addEventListener("submit", (event) => { event.preventDefault(); $("#contactMessage").textContent = "Thanks for reaching out! Our team will be in touch soon."; event.currentTarget.reset(); toast("Message sent"); });
$("#chatForm").addEventListener("submit", (event) => { event.preventDefault(); sendChat($("#chatInput").value); });
$("#chatLauncher").addEventListener("click", () => setChatOpen(!chatPanel.classList.contains("open")));
function setChatOpen(open) {
  chatPanel.classList.toggle("open", open);
  chatPanel.setAttribute("aria-hidden", String(!open));
  $("#chatLauncher").setAttribute("aria-expanded", String(open));
  $("#chatLauncher").setAttribute("aria-label", open ? "Close pet assistant chat" : "Open pet assistant chat");
  $("#chatLauncher").innerHTML = open ? "<span class=\"launcher-sparkle\">×</span><span>Close chat</span>" : "<span class=\"launcher-sparkle\">✧</span><span>Ask Pawprint</span>";
  if (open) setTimeout(() => $("#chatInput").focus(), 80);
}
async function sendChat(message) {
  const clean = message.trim();
  if (!clean || state.chatBusy) return;
  setChatOpen(true);
  const messages = $("#chatMessages");
  const input = $("#chatInput");
  const sendButton = $("#chatForm .send-button");
  messages.insertAdjacentHTML("beforeend", `<div class="chat-bubble user-bubble">${escapeHTML(clean)}</div><div class="chat-bubble assistant-bubble typing-bubble" id="chatTyping">Pawprint is thinking...</div>`);
  input.value = "";
  input.disabled = true;
  sendButton.disabled = true;
  state.chatBusy = true;
  messages.scrollTop = messages.scrollHeight;
  try {
    const result = await api("chat", { method: "POST", body: JSON.stringify({ message: clean, history: state.chatHistory }) });
    state.chatHistory.push({ role: "user", content: clean }, { role: "assistant", content: result.reply });
    $("#chatTyping").remove();
    messages.insertAdjacentHTML("beforeend", `<div class="chat-bubble assistant-bubble">${escapeHTML(result.reply)}</div>`);
  } catch (error) {
    $("#chatTyping").remove();
    const text = error.message === "Failed to fetch" ? "The Pet Care Hub server is unavailable. Restart it and try again." : error.message;
    messages.insertAdjacentHTML("beforeend", `<div class="chat-bubble assistant-bubble chat-error">${escapeHTML(text)}</div>`);
  } finally {
    state.chatBusy = false;
    input.disabled = false;
    sendButton.disabled = false;
    messages.scrollTop = messages.scrollHeight;
    input.focus();
  }
}
$$(".suggestion-chip").forEach((button) => button.addEventListener("click", () => sendChat(button.textContent)));

(async function init() {
  $("#appointmentDate").min = new Date().toISOString().slice(0, 10);
  try { await refresh(); } catch (error) { toast("Could not connect to the local server. Start it with python server.py"); console.error(error); }
})();

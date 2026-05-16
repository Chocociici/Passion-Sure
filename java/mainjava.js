
    const API_BASE = '/api';
    let currentUser = null;
    let cart = [];

    // Helper fetch
    async function apiCall(endpoint, options = {}) {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            ...options,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        return res.json();
    }

    async function checkAuth() {
        try {
            const data = await apiCall('/me');
            if (data.user) { currentUser = data.user; updateAuthUI(); }
            else { currentUser = null; updateAuthUI(); }
            await loadCart();
            renderCurrentPage();
        } catch(e) { console.error(e); }
    }

    async function loadCart() {
        if (!currentUser) { cart = []; updateCartBadge(); return; }
        const data = await apiCall('/cart');
        if (data.items) cart = data.items;
        updateCartBadge();
    }

    function updateCartBadge() {
        const count = cart.reduce((sum, i) => sum + i.quantity, 0);
        document.getElementById('cartCount').innerText = count;
    }

    async function addToCart(productId) {
        if (!currentUser) { alert('Войдите в аккаунт'); return; }
        const res = await apiCall('/cart/add', { method: 'POST', body: { productId, quantity: 1 } });
        if (res.success) { await loadCart(); alert('Товар добавлен в корзину'); renderCurrentPage(); }
        else alert(res.error);
    }

    async function removeFromCart(productId) {
        const res = await apiCall('/cart/remove', { method: 'POST', body: { productId } });
        if (res.success) { await loadCart(); renderCurrentPage(); }
    }

    async function checkout() {
        if (cart.length === 0) return alert('Корзина пуста');
        const res = await apiCall('/cart/checkout', { method: 'POST' });
        if (res.success) { alert('Покупка совершена! Спасибо.'); await loadCart(); renderCurrentPage(); }
        else alert(res.error);
    }

    // Страницы
    async function renderHome() {
        return `<h2 class="section-title">Эксклюзивный итальянский парк</h2><div class="swiper mySwiper"><div class="swiper-wrapper">
            ${['Ferrari Daytona SP3','Lamborghini Revuelto','Maserati GranTurismo','Pagani Huayra R'].map((name,i)=>`<div class="swiper-slide"><div class="car-card-slide" style="position:relative;"><img style="width:100%;height:480px;object-fit:cover;" src="https://placehold.co/800x500/2a2a2a/d4af37?text=${name.replace(/ /g,'+')}"><div class="car-info"><h3>${name}</h3><p>Итальянская страсть</p></div></div></div>`).join('')}
        </div><div class="swiper-pagination"></div><div class="swiper-button-next"></div><div class="swiper-button-prev"></div></div><div class="comments-section"><h3>Отзывы</h3><div id="commentsArea"></div></div>`;
    }

    async function renderProducts() {
        const productsData = await apiCall('/products');
        const products = productsData.products || [];
        let html = `<h2 class="section-title">Оригинальные товары</h2><div class="catalog-grid">`;
        for (let p of products) {
            const inCart = cart.find(i => i.product_id === p.id);
            html += `<div class="product-card"><div class="product-img">${p.icon || '🛒'}</div><div class="product-info"><h3>${p.name}</h3><p class="price">${p.price} €</p><p class="${p.stock > 0 ? 'in-stock' : 'out-of-stock'}">${p.stock > 0 ? `В наличии: ${p.stock}` : 'Нет в наличии'}</p>${p.stock > 0 ? `<button class="btn-primary add-to-cart" data-id="${p.id}">В корзину</button>` : '<button disabled class="btn-outline">Нет в наличии</button>'}${inCart ? `<button class="btn-outline remove-from-cart" data-id="${p.id}" style="margin-left:0.5rem;">Убрать</button>` : ''}</div></div>`;
        }
        html += `</div>${currentUser && cart.length > 0 ? `<div style="margin-top:1rem;"><button id="checkoutBtn" class="btn-primary">Оформить заказ (${cart.reduce((s,i)=>s+i.quantity,0)} товаров)</button></div>` : ''}`;
        return html;
    }

    async function renderProfile() {
        if (!currentUser) return `<div style="padding:3rem;text-align:center;"><h2>Войдите в аккаунт</h2><button id="forceLoginBtn" class="btn-primary">Вход</button></div>`;
        const isAdmin = currentUser.role === 'admin';
        let ordersHtml = '';
        try {
            const ordersData = await apiCall('/orders');
            if (ordersData.orders && ordersData.orders.length) {
                ordersHtml = `<h3>История покупок</h3><ul>${ordersData.orders.map(o => `<li>Заказ #${o.id} - ${o.total} € (${new Date(o.date).toLocaleString()})</li>`).join('')}</ul>`;
            } else ordersHtml = '<p>Пока нет заказов.</p>';
        } catch(e) {}
        let adminPanel = '';
        if (isAdmin) {
            const products = await apiCall('/products');
            adminPanel = `<div class="admin-form"><h3>Админ-панель: управление товарами</h3>
            <div><input type="text" id="adminName" placeholder="Название товара"><input type="text" id="adminPrice" placeholder="Цена €"><input type="text" id="adminStock" placeholder="Количество"><input type="text" id="adminIcon" placeholder="Иконка (эмодзи)"><button id="addProductBtn" class="btn-primary">Добавить товар</button></div>
            <div id="adminProductList">${(products.products || []).map(p => `<div style="display:flex;justify-content:space-between;margin:0.5rem 0;"><span>${p.name} - ${p.price}€ (stock:${p.stock})</span><button class="delete-btn" data-id="${p.id}">Удалить</button></div>`).join('')}</div></div>`;
        }
        return `<h2 class="section-title">Личный кабинет: ${currentUser.username}</h2><div><h3>Корзина</h3><div id="cartItems"></div></div>${ordersHtml}${adminPanel}`;
    }

    function updateAuthUI() {
        const authDiv = document.getElementById('authHeader');
        const userDiv = document.getElementById('userInfo');
        if (currentUser) {
            authDiv.style.display = 'none';
            userDiv.style.display = 'flex';
            document.getElementById('usernameDisplay').innerText = currentUser.username;
        } else {
            authDiv.style.display = 'flex';
            userDiv.style.display = 'none';
        }
    }

    let activePage = 'home';
    async function renderCurrentPage() {
        const container = document.getElementById('dynamicContent');
        if (activePage === 'home') container.innerHTML = await renderHome();
        else if (activePage === 'products') container.innerHTML = await renderProducts();
        else if (activePage === 'profile') container.innerHTML = await renderProfile();
        if (activePage === 'home') {
            new Swiper('.mySwiper', { loop: true, navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' }, pagination: { el: '.swiper-pagination' } });
            const comments = await apiCall('/comments');
            document.getElementById('commentsArea').innerHTML = (comments.comments || []).map(c => `<div class="comment-item"><strong>${c.username}</strong><br>${c.text}</div>`).join('');
        }
        document.querySelectorAll('.add-to-cart').forEach(btn => btn.addEventListener('click', (e) => addToCart(parseInt(btn.dataset.id))));
        document.querySelectorAll('.remove-from-cart').forEach(btn => btn.addEventListener('click', (e) => removeFromCart(parseInt(btn.dataset.id))));
        const checkoutBtn = document.getElementById('checkoutBtn'); if (checkoutBtn) checkoutBtn.onclick = checkout;
        const addBtn = document.getElementById('addProductBtn'); if (addBtn) addBtn.onclick = async () => {
            const name = document.getElementById('adminName').value, price = parseFloat(document.getElementById('adminPrice').value), stock = parseInt(document.getElementById('adminStock').value), icon = document.getElementById('adminIcon').value;
            if (!name || isNaN(price)) return alert('Заполните поля');
            const res = await apiCall('/admin/products', { method: 'POST', body: { name, price, stock, icon } });
            if (res.success) { alert('Товар добавлен'); renderCurrentPage(); } else alert(res.error);
        };
        document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', async (e) => {
            const id = parseInt(btn.dataset.id);
            const res = await apiCall(`/admin/products/${id}`, { method: 'DELETE' });
            if (res.success) renderCurrentPage(); else alert('Ошибка');
        }));
        const cartContainer = document.getElementById('cartItems');
        if (cartContainer && currentUser) {
            cartContainer.innerHTML = cart.length === 0 ? '<p>Корзина пуста</p>' : cart.map(i => `<div style="display:flex;justify-content:space-between;">${i.name} x${i.quantity} - ${i.price*i.quantity}€ <button class="btn-outline remove-cart-item" data-id="${i.product_id}">Удалить</button></div>`).join('');
            document.querySelectorAll('.remove-cart-item').forEach(btn => btn.addEventListener('click', () => removeFromCart(parseInt(btn.dataset.id))));
        }
        const forceBtn = document.getElementById('forceLoginBtn'); if (forceBtn) forceBtn.onclick = () => openModal('login');
    }

    // Auth modal
    const modal = document.getElementById('authModal');
    let authMode = 'login';
    function openModal(mode) { authMode = mode; document.getElementById('modalTitle').innerText = mode === 'login' ? 'Вход' : 'Регистрация'; document.getElementById('extraRegFields').style.display = mode === 'register' ? 'block' : 'none'; modal.style.display = 'flex'; }
    document.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
    document.getElementById('submitAuthBtn').onclick = async () => {
        const email = document.getElementById('authEmail').value, username = document.getElementById('authUsername').value, password = document.getElementById('authPassword').value;
        if (authMode === 'register') {
            const confirm = document.getElementById('confirmPassword').value;
            if (password !== confirm) return alert('Пароли не совпадают');
            const res = await apiCall('/register', { method: 'POST', body: { email, username, password } });
            if (res.success) { alert('Регистрация успешна! Войдите'); openModal('login'); }
            else alert(res.error);
        } else {
            const res = await apiCall('/login', { method: 'POST', body: { login: email || username, password } });
            if (res.success) { modal.style.display = 'none'; await checkAuth(); }
            else alert('Неверные данные');
        }
    };
    document.getElementById('loginBtn').onclick = () => openModal('login');
    document.getElementById('registerBtn').onclick = () => openModal('register');
    document.getElementById('logoutBtn').onclick = async () => { await apiCall('/logout', { method: 'POST' }); checkAuth(); };
    document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', (e) => { activePage = link.dataset.page; renderCurrentPage(); document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active')); link.classList.add('active'); }));
    checkAuth();

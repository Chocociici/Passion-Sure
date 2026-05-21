const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));
app.use(session({ secret: 'passion_sure_key', resave: false, saveUninitialized: false, cookie: { maxAge: 86400000 } }));

const db = new sqlite3.Database('./passion.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        email TEXT,
        phone TEXT,
        avatar TEXT,
        rating REAL DEFAULT 0,
        reviews_count INTEGER DEFAULT 0
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        stock INTEGER,
        images TEXT,
        description TEXT,
        category TEXT,
        seller_id INTEGER
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS cart (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        product_id INTEGER,
        quantity INTEGER
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        total REAL,
        date TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER,
        user_id INTEGER,
        rating INTEGER,
        comment TEXT,
        date TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user INTEGER,
        to_user INTEGER,
        product_id INTEGER,
        message TEXT,
        date TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS promotions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        discount INTEGER,
        end_date TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        description TEXT,
        image TEXT
    )`);
    
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (id, username, password, role, email, phone, rating) VALUES (1, 'admin', ?, 'admin', 'admin@passion.com', '+79991234567', 5.0)`, [adminHash]);
    
    const sellerHash = bcrypt.hashSync('seller123', 10);
    db.run(`INSERT OR IGNORE INTO users (id, username, password, role, email, phone, rating) VALUES (2, 'FerrariDealer', ?, 'seller', 'ferrari@passion.com', '+79991112233', 4.8)`, [sellerHash]);
    
    db.run(`DELETE FROM products`);
    const products = [
        { name: 'Ferrari SF90 Stradale', price: 489000, stock: 3, images: 'https://www.amalgamcollection.com/cdn/shop/files/DSCF0853WIDEEDIT_2000x850_crop_center.jpg,https://www.ferrari.com/static/cms/images/sf90-stradale-2.jpg', description: 'Гибридный суперкар. 1000 л.с., разгон до 100 за 2.5 сек.', category: 'Суперкары', seller_id: 2 },
        { name: 'Lamborghini Revuelto', price: 600000, stock: 2, images: 'https://hips.hearstapps.com/hmg-prod/images/2024-lamborghini-revuelto-lightning-lap-2025-378-67ae462c26ed6.jpg', description: 'Первый V12 гибрид Lamborghini. 1015 л.с.', category: 'Суперкары', seller_id: 2 },
        { name: 'Maserati MC20', price: 210000, stock: 5, images: 'https://avatars.mds.yandex.net/get-vertis-journal/4220003/Maserati-GranTurismo-110-ANNIVERSARIO-Rame-Folgore-2-2048x1152.webp', description: 'Итальянская элегантность', category: 'Спорткары', seller_id: 2 }
    ];
    products.forEach(p => {
        db.run(`INSERT INTO products (name, price, stock, images, description, category, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [p.name, p.price, p.stock, p.images, p.description, p.category, p.seller_id]);
    });
    
    db.run(`DELETE FROM promotions`);
    const promotions = [
        { title: '🔥 Скидка 20% на обслуживание', description: 'При покупке любого автомобиля', discount: 20, end_date: '2024-12-31' },
        { title: 'Trade-in с доплатой от 10%', description: 'Обменяйте свой автомобиль', discount: 10, end_date: '2024-06-30' }
    ];
    promotions.forEach(p => { db.run(`INSERT INTO promotions (title, description, discount, end_date) VALUES (?, ?, ?, ?)`, [p.title, p.description, p.discount, p.end_date]); });
    
    db.run(`DELETE FROM services`);
    const services = [
        { name: 'Диагностика', price: 100, description: 'Полная компьютерная диагностика', image: '🔧' },
        { name: 'Чип-тюнинг', price: 1500, description: 'Увеличение мощности до 30%', image: '⚡' },
        { name: 'Детейлинг', price: 800, description: 'Полная полировка и керамика', image: '✨' }
    ];
    services.forEach(s => { db.run(`INSERT INTO services (name, price, description, image) VALUES (?, ?, ?, ?)`, [s.name, s.price, s.description, s.image]); });
});

// ============= API =============

app.post('/api/register', (req, res) => {
    const { username, password, email, phone } = req.body;
    if (!username || !password) return res.json({ error: 'Заполните поля' });
    const hashed = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO users (username, password, role, email, phone) VALUES (?, ?, 'user', ?, ?)`, [username, hashed, email || '', phone || ''], function(err) {
        if (err) return res.json({ error: 'Пользователь существует' });
        res.json({ success: true });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password)) return res.json({ error: 'Неверные данные' });
        req.session.userId = user.id;
        req.session.user = { id: user.id, username: user.username, role: user.role };
        res.json({ success: true });
    });
});

app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    db.get(`SELECT id, username, role, email, phone, rating, reviews_count FROM users WHERE id = ?`, [req.session.userId], (err, user) => res.json({ user }));
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/products', (req, res) => { db.all(`SELECT * FROM products`, (err, products) => res.json({ products: products || [] })); });
app.get('/api/products/:id', (req, res) => { db.get(`SELECT * FROM products WHERE id = ?`, [req.params.id], (err, product) => res.json({ product })); });
app.get('/api/my-products', (req, res) => {
    if (!req.session.userId) return res.json({ products: [] });
    db.all(`SELECT * FROM products WHERE seller_id = ?`, [req.session.userId], (err, products) => res.json({ products: products || [] }));
});
app.get('/api/categories', (req, res) => { db.all(`SELECT DISTINCT category FROM products`, (err, cats) => res.json({ categories: cats.map(c => c.category) })); });

app.get('/api/cart', (req, res) => {
    if (!req.session.userId) return res.json({ items: [] });
    db.all(`SELECT cart.*, products.name, products.price, products.images FROM cart JOIN products ON cart.product_id = products.id WHERE cart.user_id = ?`, [req.session.userId], (err, items) => res.json({ items: items || [] }));
});

app.post('/api/cart/add', (req, res) => {
    if (!req.session.userId) return res.json({ error: 'Не авторизован' });
    const { productId, quantity } = req.body;
    db.get(`SELECT stock FROM products WHERE id = ?`, [productId], (err, prod) => {
        if (!prod || prod.stock < quantity) return res.json({ error: 'Нет на складе' });
        db.get(`SELECT * FROM cart WHERE user_id = ? AND product_id = ?`, [req.session.userId, productId], (err, row) => {
            if (row) db.run(`UPDATE cart SET quantity = quantity + ? WHERE id = ?`, [quantity, row.id]);
            else db.run(`INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)`, [req.session.userId, productId, quantity]);
            res.json({ success: true });
        });
    });
});

app.post('/api/cart/remove', (req, res) => {
    if (!req.session.userId) return res.json({ error: 'Не авторизован' });
    db.run(`DELETE FROM cart WHERE user_id = ? AND product_id = ?`, [req.session.userId, req.body.productId], () => res.json({ success: true }));
});

app.post('/api/cart/checkout', (req, res) => {
    if (!req.session.userId) return res.json({ error: 'Не авторизован' });
    db.all(`SELECT cart.product_id, cart.quantity, products.price FROM cart JOIN products ON cart.product_id = products.id WHERE cart.user_id = ?`, [req.session.userId], (err, items) => {
        if (items.length === 0) return res.json({ error: 'Корзина пуста' });
        let total = items.reduce((s, i) => s + i.price * i.quantity, 0);
        const date = new Date().toISOString();
        db.run(`INSERT INTO orders (user_id, total, date) VALUES (?, ?, ?)`, [req.session.userId, total, date], function(err) {
            items.forEach(item => {
                db.run(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.quantity, item.product_id]);
            });
            db.run(`DELETE FROM cart WHERE user_id = ?`, [req.session.userId]);
            res.json({ success: true });
        });
    });
});

app.get('/api/orders', (req, res) => {
    if (!req.session.userId) return res.json({ orders: [] });
    db.all(`SELECT * FROM orders WHERE user_id = ? ORDER BY date DESC`, [req.session.userId], (err, orders) => res.json({ orders: orders || [] }));
});

app.post('/api/messages/send', (req, res) => {
    if (!req.session.userId) return res.json({ error: 'Не авторизован' });
    const { to_user, product_id, message } = req.body;
    db.run(`INSERT INTO messages (from_user, to_user, product_id, message, date) VALUES (?, ?, ?, ?, ?)`, [req.session.userId, to_user, product_id || null, message, new Date().toISOString()], () => res.json({ success: true }));
});

app.get('/api/messages/:userId', (req, res) => {
    if (!req.session.userId) return res.json({ messages: [] });
    db.all(`SELECT m.*, u.username as from_name FROM messages m JOIN users u ON m.from_user = u.id WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?) ORDER BY date ASC`, [req.session.userId, req.params.userId, req.params.userId, req.session.userId], (err, messages) => res.json({ messages: messages || [] }));
});

app.get('/api/sellers', (req, res) => {
    db.all(`SELECT id, username, email, phone, rating, reviews_count FROM users WHERE role != 'admin' AND id != ?`, [req.session.userId || 0], (err, sellers) => res.json({ sellers: sellers || [] }));
});

app.get('/api/seller/:id', (req, res) => {
    db.get(`SELECT id, username, email, phone, rating, reviews_count FROM users WHERE id = ?`, [req.params.id], (err, seller) => res.json({ seller }));
});

app.post('/api/reviews/add', (req, res) => {
    if (!req.session.userId) return res.json({ error: 'Не авторизован' });
    const { seller_id, rating, comment } = req.body;
    db.run(`INSERT INTO reviews (seller_id, user_id, rating, comment, date) VALUES (?, ?, ?, ?, ?)`, [seller_id, req.session.userId, rating, comment, new Date().toISOString()], function(err) {
        if (err) return res.json({ error: err.message });
        db.get(`SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE seller_id = ?`, [seller_id], (err, stats) => {
            db.run(`UPDATE users SET rating = ?, reviews_count = ? WHERE id = ?`, [stats.avg_rating || 0, stats.count || 0, seller_id]);
            res.json({ success: true });
        });
    });
});

app.get('/api/reviews/:sellerId', (req, res) => {
    db.all(`SELECT r.*, u.username as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.seller_id = ? ORDER BY r.date DESC`, [req.params.sellerId], (err, reviews) => res.json({ reviews: reviews || [] }));
});

app.get('/api/promotions', (req, res) => { db.all(`SELECT * FROM promotions`, (err, promos) => res.json({ promotions: promos || [] })); });
app.get('/api/services', (req, res) => { db.all(`SELECT * FROM services`, (err, services) => res.json({ services: services || [] })); });

app.post('/api/products/add', (req, res) => {
    if (!req.session.userId) return res.json({ error: 'Не авторизован' });
    const { name, price, stock, images, description, category } = req.body;
    
    console.log('📦 Получен запрос на добавление товара:', { name, price, stock, category, images, description });
    
    if (!name || !price || isNaN(price)) {
        return res.json({ error: 'Название и цена обязательны' });
    }
    
    db.run(`INSERT INTO products (name, price, stock, images, description, category, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [name, price, stock || 1, images || '', description || '', category || 'Другое', req.session.userId], 
        function(err) {
            if (err) {
                console.error('❌ Ошибка БД:', err);
                return res.json({ error: err.message });
            }
            console.log('✅ Товар добавлен, ID:', this.lastID);
            res.json({ success: true, id: this.lastID });
        });
});

app.delete('/api/products/:id', (req, res) => {
    if (!req.session.userId) return res.json({ error: 'Не авторизован' });
    db.run(`DELETE FROM products WHERE id = ? AND seller_id = ?`, [req.params.id, req.session.userId], function(err) {
        if (err) return res.json({ error: err.message });
        res.json({ success: true });
    });
});

// ============= АДМИН-ПАНЕЛЬ (ДОБАВЛЕНА) =============
app.get('/admin', (req, res) => {
    // Проверяем, авторизован ли пользователь и является ли он админом
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Доступ запрещён</title>
            <style>body{background:#0a0a0a;color:white;text-align:center;padding:50px;font-family:Arial;}</style>
            </head>
            <body>
                <h1>⛔ Доступ запрещён</h1>
                <p>Эта страница доступна только администраторам.</p>
                <a href="/" style="color:#d4af37;">Вернуться на главную</a>
            </body>
            </html>
        `);
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Админ-панель | Passion Sure</title>
            <meta charset="UTF-8">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Inter', Arial, sans-serif; background: #0a0a0a; color: #eaeaea; padding: 2rem; }
                .container { max-width: 1200px; margin: 0 auto; }
                h1 { color: #d4af37; margin-bottom: 1rem; }
                .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap: 1rem; margin-bottom: 2rem; }
                .card { background: #1a1a1a; padding: 1.5rem; border-radius: 1rem; border: 1px solid #333; }
                .card h3 { color: #d4af37; margin-bottom: 0.5rem; }
                .card .number { font-size: 2rem; font-weight: bold; }
                table { width: 100%; border-collapse: collapse; background: #111; border-radius: 1rem; overflow: hidden; }
                th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #333; }
                th { background: #1a1a1a; color: #d4af37; }
                .btn { padding: 0.3rem 0.8rem; border-radius: 0.5rem; cursor: pointer; border: none; margin: 0 0.2rem; }
                .btn-success { background: #27ae60; color: white; }
                .btn-danger { background: #c0392b; color: white; }
                .btn-warning { background: #e67e22; color: white; }
                .form-section { background: #1a1a1a; padding: 1.5rem; border-radius: 1rem; margin-bottom: 2rem; }
                input, textarea, select { width: 100%; padding: 0.5rem; margin: 0.5rem 0; background: #222; border: 1px solid #444; color: white; border-radius: 0.5rem; }
                .nav { margin-bottom: 2rem; }
                .nav a { color: #d4af37; text-decoration: none; margin-right: 1rem; }
                h3 { margin: 1rem 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="nav">
                    <a href="/">← На главную</a>
                    <a href="/admin">Админ-панель</a>
                </div>
                <h1>👑 Админ-панель Passion Sure</h1>
                
                <div class="stats" id="stats"></div>
                
                <div class="form-section">
                    <h3>➕ Добавить товар</h3>
                    <input type="text" id="prodName" placeholder="Название товара">
                    <input type="number" id="prodPrice" placeholder="Цена €">
                    <input type="number" id="prodStock" placeholder="Количество на складе" value="1">
                    <input type="text" id="prodCategory" placeholder="Категория (Суперкары, Спорткары, Аксессуары)">
                    <input type="text" id="prodImage" placeholder="URL картинки (можно несколько через запятую)">
                    <textarea id="prodDesc" placeholder="Описание товара" rows="3"></textarea>
                    <button onclick="addProduct()" class="btn" style="background:#d4af37; color:#000;">➕ Добавить товар</button>
                </div>
                
                <h3>📦 Управление товарами</h3>
                <div id="productsList">Загрузка...</div>
            </div>
            
            <script>
                async function apiCall(endpoint, options = {}) {
                    const res = await fetch(\`/api\${endpoint}\`, {
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        ...options,
                        body: options.body ? JSON.stringify(options.body) : undefined
                    });
                    return res.json();
                }
                
                async function loadStats() {
                    const products = await apiCall('/products');
                    document.getElementById('stats').innerHTML = \`
                        <div class="card"><h3>📦 Товары</h3><div class="number">\${products.products?.length || 0}</div></div>
                        <div class="card"><h3>👥 Пользователи</h3><div class="number">0</div></div>
                        <div class="card"><h3>💰 Заказы</h3><div class="number">0</div></div>
                    \`;
                }
                
                async function loadProducts() {
                    const data = await apiCall('/products');
                    const products = data.products || [];
                    if (products.length === 0) {
                        document.getElementById('productsList').innerHTML = '<p style="text-align:center; padding:2rem;">📭 Нет товаров. Добавьте первый!</p>';
                        return;
                    }
                    document.getElementById('productsList').innerHTML = \`
                        <table>
                            <thead>
                                <tr><th>ID</th><th>Фото</th><th>Название</th><th>Категория</th><th>Цена €</th><th>Склад</th><th>Действия</th></tr>
                            </thead>
                            <tbody>
                                \${products.map(p => \`
                                    <tr>
                                        <td>\${p.id}</td>
                                        <td><img src="\${p.images?.split(',')[0] || ''}" style="width:50px;height:50px;object-fit:cover;border-radius:0.5rem;" onerror="this.style.display='none'"></td>
                                        <td><input type="text" id="name_\${p.id}" value="\${p.name.replace(/"/g, '&quot;')}" style="background:#222; color:white; width:100%; padding:0.3rem; border-radius:0.3rem;"></td>
                                        <td><input type="text" id="category_\${p.id}" value="\${p.category || ''}" style="background:#222; color:white; width:100%; padding:0.3rem; border-radius:0.3rem;"></td>
                                        <td><input type="number" id="price_\${p.id}" value="\${p.price}" style="background:#222; color:white; width:100px; padding:0.3rem; border-radius:0.3rem;"></td>
                                        <td><input type="number" id="stock_\${p.id}" value="\${p.stock}" style="background:#222; color:white; width:80px; padding:0.3rem; border-radius:0.3rem;"></td>
                                        <td>
                                            <button class="btn btn-success" onclick="updateProduct(\${p.id})">💾 Сохранить</button>
                                            <button class="btn btn-danger" onclick="deleteProduct(\${p.id})">🗑 Удалить</button>
                                        </td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                }
                
                async function addProduct() {
                    const name = document.getElementById('prodName').value;
                    const price = parseFloat(document.getElementById('prodPrice').value);
                    const stock = parseInt(document.getElementById('prodStock').value) || 1;
                    const category = document.getElementById('prodCategory').value;
                    const images = document.getElementById('prodImage').value;
                    const description = document.getElementById('prodDesc').value;
                    
                    if (!name || isNaN(price)) {
                        alert('❌ Заполните название и цену');
                        return;
                    }
                    
                    const res = await apiCall('/products/add', { 
                        method: 'POST', 
                        body: { name, price, stock, category, images, description } 
                    });
                    
                    if (res.success) {
                        alert('✅ Товар добавлен!');
                        document.getElementById('prodName').value = '';
                        document.getElementById('prodPrice').value = '';
                        document.getElementById('prodCategory').value = '';
                        document.getElementById('prodImage').value = '';
                        document.getElementById('prodDesc').value = '';
                        loadProducts();
                        loadStats();
                    } else {
                        alert('❌ Ошибка: ' + (res.error || 'Неизвестная ошибка'));
                    }
                }
                
                async function updateProduct(id) {
                    const name = document.getElementById(\`name_\${id}\`).value;
                    const price = parseFloat(document.getElementById(\`price_\${id}\`).value);
                    const stock = parseInt(document.getElementById(\`stock_\${id}\`).value);
                    const category = document.getElementById(\`category_\${id}\`).value;
                    
                    const res = await apiCall(\`/admin/products/\${id}\`, { 
                        method: 'PUT', 
                        body: { name, price, stock, category } 
                    });
                    
                    if (res.success) {
                        alert('✅ Товар обновлён');
                        loadProducts();
                    } else {
                        alert('❌ Ошибка обновления');
                    }
                }
                
                async function deleteProduct(id) {
                    if (confirm('🗑 Удалить товар навсегда?')) {
                        const res = await apiCall(\`/products/\${id}\`, { method: 'DELETE' });
                        if (res.success) {
                            alert('✅ Товар удалён');
                            loadProducts();
                            loadStats();
                        } else {
                            alert('❌ Ошибка удаления');
                        }
                    }
                }
                
                loadStats();
                loadProducts();
            </script>
        </body>
        </html>
    `);
});

// ============= ДОПОЛНИТЕЛЬНЫЕ API ДЛЯ АДМИН-ПАНЕЛИ =============
app.put('/api/admin/products/:id', (req, res) => {
    if (req.session.user?.role !== 'admin') return res.json({ error: 'Нет прав' });
    const { name, price, stock, category } = req.body;
    db.run(`UPDATE products SET name = ?, price = ?, stock = ?, category = ? WHERE id = ?`, 
        [name, price, stock, category, req.params.id], 
        function(err) {
            res.json({ success: !err });
        });
});

app.listen(3000, () => console.log('🚀 Сервер на http://localhost:3000\n👑 Админ: admin / admin123\n👤 Продавец: FerrariDealer / seller123'));
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const app = express();

// ========== ГЛАВНОЕ: раздаём все файлы из папки с проектом ==========
app.use(express.json());
app.use(express.static(path.join(__dirname, '/'))); // ЭТО РАЗДАЁТ HTML, CSS, JS
app.use(session({ secret: 'passion_sure_key', resave: false, saveUninitialized: false, cookie: { maxAge: 86400000 } }));

const db = new sqlite3.Database('./passion.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        email TEXT,
        phone TEXT
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
    
    // Админ
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (id, username, password, role, email, phone) VALUES (1, 'admin', ?, 'admin', 'admin@passion.com', '+79991234567')`, [adminHash]);
    
    // Тестовые товары, если таблица пустая
    db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO products (name, price, stock, images, description, category, seller_id) VALUES 
                ('Ferrari SF90 Stradale', 489000, 3, 'https://www.amalgamcollection.com/cdn/shop/files/DSCF0853WIDEEDIT_2000x850_crop_center.jpg', 'Гибридный суперкар 1000 л.с.', 'Суперкары', 1),
                ('Lamborghini Revuelto', 600000, 2, 'https://hips.hearstapps.com/hmg-prod/images/2024-lamborghini-revuelto-lightning-lap-2025-378-67ae462c26ed6.jpg', 'Первый V12 гибрид', 'Суперкары', 1),
                ('Maserati MC20', 210000, 5, 'https://avatars.mds.yandex.net/get-vertis-journal/4220003/Maserati-GranTurismo-110-ANNIVERSARIO-Rame-Folgore-2-2048x1152.webp', 'Итальянская элегантность', 'Спорткары', 1)
            `);
        }
    });
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
    db.get(`SELECT id, username, role, email, phone FROM users WHERE id = ?`, [req.session.userId], (err, user) => res.json({ user }));
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/products', (req, res) => { db.all(`SELECT * FROM products`, (err, products) => res.json({ products: products || [] })); });
app.get('/api/products/:id', (req, res) => { db.get(`SELECT * FROM products WHERE id = ?`, [req.params.id], (err, product) => res.json({ product })); });

// Корзина
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

// ============= АДМИН-ПАНЕЛЬ (HTML страница) =============
app.get('/admin', (req, res) => {
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
                body { font-family: Arial, sans-serif; background: #0a0a0a; color: #eaeaea; padding: 2rem; }
                .container { max-width: 1200px; margin: 0 auto; }
                h1 { color: #d4af37; margin-bottom: 2rem; }
                .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap: 1rem; margin-bottom: 2rem; }
                .card { background: #1a1a1a; padding: 1.5rem; border-radius: 1rem; }
                .card h3 { color: #d4af37; margin-bottom: 0.5rem; }
                .card .number { font-size: 2rem; font-weight: bold; }
                table { width: 100%; border-collapse: collapse; background: #111; border-radius: 1rem; overflow: hidden; }
                th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #333; }
                th { background: #1a1a1a; color: #d4af37; }
                .btn { padding: 0.3rem 0.8rem; border-radius: 0.5rem; cursor: pointer; border: none; }
                .btn-danger { background: #c0392b; color: white; }
                .form-section { background: #1a1a1a; padding: 1.5rem; border-radius: 1rem; margin-bottom: 2rem; }
                input, textarea { width: 100%; padding: 0.5rem; margin: 0.5rem 0; background: #222; border: 1px solid #444; color: white; border-radius: 0.5rem; }
                .nav { margin-bottom: 2rem; }
                .nav a { color: #d4af37; text-decoration: none; margin-right: 1rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="nav"><a href="/">← На главную</a> <a href="/admin">Админ-панель</a></div>
                <h1>👑 Админ-панель Passion Sure</h1>
                <div class="stats" id="stats"></div>
                <div class="form-section">
                    <h3>➕ Добавить товар</h3>
                    <input type="text" id="prodName" placeholder="Название">
                    <input type="number" id="prodPrice" placeholder="Цена €">
                    <input type="number" id="prodStock" placeholder="Количество">
                    <input type="text" id="prodCategory" placeholder="Категория">
                    <input type="text" id="prodImage" placeholder="URL картинки">
                    <textarea id="prodDesc" placeholder="Описание"></textarea>
                    <button onclick="addProduct()" class="btn" style="background:#d4af37; color:#000;">➕ Добавить</button>
                </div>
                <h3>📦 Управление товарами</h3>
                <div id="productsList"></div>
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
                    document.getElementById('stats').innerHTML = \`<div class="card"><h3>Товары</h3><div class="number">\${products.products?.length || 0}</div></div>\`;
                }
                async function loadProducts() {
                    const data = await apiCall('/products');
                    const products = data.products || [];
                    document.getElementById('productsList').innerHTML = \`<table><thead><tr><th>ID</th><th>Фото</th><th>Название</th><th>Цена</th><th>Склад</th><th>Действия</th></tr></thead><tbody>\${products.map(p => \`<tr><td>\${p.id}</td><td><img src="\${p.images?.split(',')[0] || ''}" style="width:50px;height:50px;object-fit:cover;" onerror="this.style.display='none'"></td><td><input type="text" id="name_\${p.id}" value="\${p.name.replace(/"/g, '&quot;')}" style="background:#222; color:white; width:100%;"></td><td><input type="number" id="price_\${p.id}" value="\${p.price}" style="background:#222; color:white; width:100px;"></td><td><input type="number" id="stock_\${p.id}" value="\${p.stock}" style="background:#222; color:white; width:80px;"></td><td><button class="btn" style="background:#3498db;" onclick="updateProduct(\${p.id})">Сохранить</button> <button class="btn btn-danger" onclick="deleteProduct(\${p.id})">Удалить</button></td></tr>\`).join('')}</tbody></table>\`;
                }
                async function addProduct() {
                    const name = document.getElementById('prodName').value;
                    const price = parseFloat(document.getElementById('prodPrice').value);
                    const stock = parseInt(document.getElementById('prodStock').value);
                    const category = document.getElementById('prodCategory').value;
                    const images = document.getElementById('prodImage').value;
                    const description = document.getElementById('prodDesc').value;
                    if (!name || isNaN(price)) return alert('Заполните название и цену');
                    const res = await apiCall('/admin/products', { method: 'POST', body: { name, price, stock, category, images, description } });
                    if (res.success) { alert('Товар добавлен!'); loadProducts(); loadStats(); }
                    else alert('Ошибка');
                }
                async function updateProduct(id) {
                    const name = document.getElementById(\`name_\${id}\`).value;
                    const price = parseFloat(document.getElementById(\`price_\${id}\`).value);
                    const stock = parseInt(document.getElementById(\`stock_\${id}\`).value);
                    const res = await apiCall(\`/admin/products/\${id}\`, { method: 'PUT', body: { name, price, stock } });
                    if (res.success) { alert('Обновлено!'); loadProducts(); }
                    else alert('Ошибка');
                }
                async function deleteProduct(id) {
                    if (confirm('Удалить товар?')) {
                        const res = await apiCall(\`/admin/products/\${id}\`, { method: 'DELETE' });
                        if (res.success) { alert('Удалено!'); loadProducts(); loadStats(); }
                        else alert('Ошибка');
                    }
                }
                loadStats(); loadProducts();
            </script>
        </body>
        </html>
    `);
});

// ============= API для админ-панели =============
app.post('/api/admin/products', (req, res) => {
    if (req.session.user?.role !== 'admin') return res.json({ error: 'Нет прав' });
    const { name, price, stock, images, description, category } = req.body;
    db.run(`INSERT INTO products (name, price, stock, images, description, category, seller_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [name, price, stock || 1, images || '', description || '', category || 'Другое', req.session.userId], 
        function(err) { res.json({ success: !err }); });
});

app.put('/api/admin/products/:id', (req, res) => {
    if (req.session.user?.role !== 'admin') return res.json({ error: 'Нет прав' });
    const { name, price, stock } = req.body;
    db.run(`UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?`, [name, price, stock, req.params.id], function(err) {
        res.json({ success: !err });
    });
});

app.delete('/api/admin/products/:id', (req, res) => {
    if (req.session.user?.role !== 'admin') return res.json({ error: 'Нет прав' });
    db.run(`DELETE FROM products WHERE id = ?`, [req.params.id], function(err) {
        res.json({ success: !err });
    });
});

// ============= ЗАПУСК СЕРВЕРА =============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`👑 Админ: admin / admin123`);
});
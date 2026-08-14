require('dotenv').config();
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const db = mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, waitForConnections: true, connectionLimit: 10 });
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-development-secret';
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const tokenFor = user => jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '8h' });
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Login required.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ message: 'Session expired. Please login again.' }); }
};
const accountNo = () => `SB${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ message: 'Name, valid email and 6+ character password are required.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.execute('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)', [name.trim(), email.toLowerCase().trim(), hash]);
    const user = { id: result.insertId, name: name.trim(), email: email.toLowerCase().trim() };
    res.status(201).json({ token: tokenFor(user), user });
  } catch (error) {
    console.error('REGISTER ERROR:', error);
    res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: error.code === 'ER_DUP_ENTRY' ? 'Email is already registered.' : 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.execute('SELECT id,name,email,password_hash FROM users WHERE email=?', [email?.toLowerCase().trim() || '']);
  if (!rows.length || !(await bcrypt.compare(password || '', rows[0].password_hash))) return res.status(401).json({ message: 'Invalid email or password.' });
  const user = rows[0]; res.json({ token: tokenFor(user), user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/dashboard', auth, async (req, res) => {
  const [accounts] = await db.execute('SELECT * FROM accounts WHERE user_id=? ORDER BY created_at DESC', [req.user.id]);
  const [transactions] = await db.execute(`SELECT t.*, a.account_number FROM transactions t JOIN accounts a ON t.account_id=a.id WHERE a.user_id=? ORDER BY t.created_at DESC LIMIT 10`, [req.user.id]);
  res.json({ accounts, transactions, totalBalance: accounts.reduce((sum, a) => sum + Number(a.balance), 0) });
});

app.post('/api/accounts', auth, async (req, res) => {
  const { accountType, openingBalance = 0 } = req.body; const balance = Number(openingBalance);
  if (!['Savings', 'Current'].includes(accountType) || balance < 0) return res.status(400).json({ message: 'Enter valid account information.' });
  const number = accountNo(); const connection = await db.getConnection();
  try { await connection.beginTransaction(); const [r] = await connection.execute('INSERT INTO accounts (user_id,account_number,account_type,balance) VALUES (?,?,?,?)', [req.user.id, number, accountType, balance]); if (balance > 0) await connection.execute("INSERT INTO transactions (account_id,type,amount,note) VALUES (?, 'Deposit', ?, 'Opening balance')", [r.insertId, balance]); await connection.commit(); res.status(201).json({ message: 'Bank account created.' }); }
  catch { await connection.rollback(); res.status(500).json({ message: 'Could not create account.' }); } finally { connection.release(); }
});


app.post('/api/accounts/:id/transaction', auth, async (req, res) => {
  const { type, amount, note = '' } = req.body; const value = Number(amount); const id = Number(req.params.id);
  if (!['Deposit', 'Withdraw'].includes(type) || !Number.isFinite(value) || value <= 0) return res.status(400).json({ message: 'Enter a valid transaction amount.' });
  const connection = await db.getConnection();
  try { await connection.beginTransaction(); const [rows] = await connection.execute('SELECT * FROM accounts WHERE id=? AND user_id=? FOR UPDATE', [id, req.user.id]); if (!rows.length) throw new Error('Account not found.'); const account = rows[0]; if (type === 'Withdraw' && Number(account.balance) < value) throw new Error('Insufficient balance.'); const updated = type === 'Deposit' ? Number(account.balance) + value : Number(account.balance) - value; await connection.execute('UPDATE accounts SET balance=? WHERE id=?', [updated, id]); await connection.execute('INSERT INTO transactions (account_id,type,amount,note) VALUES (?,?,?,?)', [id, type, value, note.trim()]); await connection.commit(); res.json({ message: `${type} successful.` }); }
  catch (error) { await connection.rollback(); res.status(400).json({ message: error.message || 'Transaction failed.' }); } finally { connection.release(); }
});

app.delete('/api/accounts/:id', auth, async (req, res) => { const [r] = await db.execute('DELETE FROM accounts WHERE id=? AND user_id=?', [req.params.id, req.user.id]); if (!r.affectedRows) return res.status(404).json({ message: 'Account not found.' }); res.json({ message: 'Account deleted.' }); });
app.get('/api/accounts/search', auth, async (req, res) => { const query = `%${req.query.q || ''}%`; const [rows] = await db.execute('SELECT * FROM accounts WHERE user_id=? AND (account_number LIKE ? OR account_type LIKE ?)', [req.user.id, query, query]); res.json(rows); });
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 5000, () => console.log(`SecureBank running on port ${process.env.PORT || 5000}`));
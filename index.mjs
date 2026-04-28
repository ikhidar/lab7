import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import session from 'express-session';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET || 'cst336 csumb',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'lab7',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('Connected to MySQL');
    conn.release();
  } catch (err) {
    console.error('DB Connection Error:', err);
  }
})();

app.get('/setupDB', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin (
        adminId INT AUTO_INCREMENT PRIMARY KEY,
        firstName VARCHAR(50),
        lastName VARCHAR(50),
        username VARCHAR(50) UNIQUE,
        password VARCHAR(255)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS authors (
        authorId INT AUTO_INCREMENT PRIMARY KEY,
        firstName VARCHAR(50),
        lastName VARCHAR(50),
        dob DATE,
        dod DATE,
        sex VARCHAR(10),
        profession VARCHAR(50),
        country VARCHAR(50),
        portrait TEXT,
        biography TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotes (
        quoteId INT AUTO_INCREMENT PRIMARY KEY,
        quote TEXT,
        authorId INT,
        category VARCHAR(50)
      )
    `);

    await pool.query(`DELETE FROM admin WHERE username = ?`, ['admin']);

    const hashedPassword = await bcrypt.hash('s3cr3t', 10);

    await pool.query(
      `INSERT INTO admin (firstName, lastName, username, password)
       VALUES (?, ?, ?, ?)`,
      ['Admin', 'User', 'admin', hashedPassword]
    );

    res.send('Database setup complete!');
  } catch (err) {
    console.error(err);
    res.send(err.message);
  }
});

app.get('/', (req, res) => {
  res.render('login.ejs', { error: null });
});

app.get('/profile', isAuthenticated, (req, res) => {
  res.render('profile.ejs', { fullName: req.session.fullName });
});

app.get('/home', isAuthenticated, (req, res) => {
  res.render('home.ejs', { fullName: req.session.fullName });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.post('/login', async (req, res) => {
  try {
    const username = req.body.username;
    const password = req.body.password;

    const sql = `SELECT * FROM admin WHERE username = ?`;
    const [rows] = await pool.query(sql, [username]);

    if (rows.length === 0) {
      return res.render('login.ejs', { error: 'Wrong credentials' });
    }

    const match = await bcrypt.compare(password, rows[0].password);

    if (!match) {
      return res.render('login.ejs', { error: 'Wrong credentials' });
    }

    req.session.userAuthenticated = true;
    req.session.fullName = `${rows[0].firstName} ${rows[0].lastName}`;
    res.redirect('/home');
  } catch (err) {
    console.error(err);
    res.render('login.ejs', { error: 'Login error' });
  }
});

app.get('/authors', isAuthenticated, async (req, res) => {
  try {
    const sql = `SELECT authorId, firstName, lastName FROM authors ORDER BY lastName`;
    const [rows] = await pool.query(sql);
    res.render('authors.ejs', { rows });
  } catch (err) {
    console.error(err);
    res.send('Error loading authors');
  }
});

app.get('/editAuthor', isAuthenticated, async (req, res) => {
  try {
    const authorId = req.query.authorId;
    const sql = `SELECT * FROM authors WHERE authorId = ?`;
    const [authorInfo] = await pool.query(sql, [authorId]);

    if (authorInfo.length === 0) {
      return res.redirect('/authors');
    }

    if (authorInfo[0].dob) {
      authorInfo[0].dob = authorInfo[0].dob.toISOString().slice(0, 10);
    }

    if (authorInfo[0].dod) {
      authorInfo[0].dod = authorInfo[0].dod.toISOString().slice(0, 10);
    }

    res.render('editAuthor.ejs', { authorInfo });
  } catch (err) {
    console.error(err);
    res.send('Error loading author');
  }
});

app.post('/editAuthor', isAuthenticated, async (req, res) => {
  try {
    const {
      authorId,
      firstName,
      lastName,
      country,
      dob,
      dod,
      profession,
      biography,
      sex,
      portrait
    } = req.body;

    const sql = `UPDATE authors
                 SET firstName = ?, lastName = ?, country = ?, dob = ?, dod = ?, profession = ?, biography = ?, sex = ?, portrait = ?
                 WHERE authorId = ?`;

    await pool.query(sql, [
      firstName,
      lastName,
      country,
      dob || null,
      dod || null,
      profession,
      biography,
      sex || null,
      portrait || null,
      authorId
    ]);

    res.redirect('/authors');
  } catch (err) {
    console.error(err);
    res.send('Error updating author');
  }
});

app.get('/addAuthor', isAuthenticated, (req, res) => {
  res.render('newAuthor.ejs');
});

app.post('/addAuthor', isAuthenticated, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      country,
      profession,
      dob,
      dod,
      sex,
      biography,
      portrait
    } = req.body;

    const sql = `INSERT INTO authors
                 (firstName, lastName, country, profession, dob, dod, sex, biography, portrait)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await pool.query(sql, [
      firstName,
      lastName,
      country,
      profession,
      dob || null,
      dod || null,
      sex || null,
      biography,
      portrait || null
    ]);

    res.redirect('/authors');
  } catch (err) {
    console.error(err);
    res.send('Error adding author');
  }
});

app.get('/quotes', isAuthenticated, async (req, res) => {
  try {
    const sql = `SELECT quoteId, quote FROM quotes ORDER BY quote`;
    const [rows] = await pool.query(sql);
    res.render('quotes.ejs', { rows });
  } catch (err) {
    console.error(err);
    res.send('Error loading quotes');
  }
});

app.get('/editQuote', isAuthenticated, async (req, res) => {
  try {
    const quoteId = req.query.quoteId;

    const sql = `SELECT * FROM quotes WHERE quoteId = ?`;
    const authorsSql = `SELECT authorId, firstName, lastName FROM authors ORDER BY lastName`;

    const [quoteInfo] = await pool.query(sql, [quoteId]);
    const [authors] = await pool.query(authorsSql);

    if (quoteInfo.length === 0) {
      return res.redirect('/quotes');
    }

    res.render('editQuote.ejs', { quoteInfo, authors });
  } catch (err) {
    console.error(err);
    res.send('Error loading quote');
  }
});

app.post('/editQuote', isAuthenticated, async (req, res) => {
  try {
    const { quoteId, quote, authorId, category } = req.body;

    const sql = `UPDATE quotes SET quote = ?, authorId = ?, category = ? WHERE quoteId = ?`;
    await pool.query(sql, [quote, authorId, category || null, quoteId]);

    res.redirect('/quotes');
  } catch (err) {
    console.error(err);
    res.send('Error updating quote');
  }
});

app.get('/addQuote', isAuthenticated, async (req, res) => {
  try {
    const sql = `SELECT authorId, firstName, lastName FROM authors ORDER BY lastName`;
    const [rows] = await pool.query(sql);
    res.render('newQuote.ejs', { rows });
  } catch (err) {
    console.error(err);
    res.send('Error loading quote form');
  }
});

app.post('/addQuote', isAuthenticated, async (req, res) => {
  try {
    const { quote, authorId, category } = req.body;

    const sql = `INSERT INTO quotes (quote, authorId, category)
                 VALUES (?, ?, ?)`;

    await pool.query(sql, [quote, authorId, category]);
    res.redirect('/quotes');
  } catch (err) {
    console.error(err);
    res.send('Error adding quote');
  }
});

app.get('/deleteAuthor', isAuthenticated, async (req, res) => {
  try {
    const authorId = req.query.authorId;
    await pool.query(`DELETE FROM quotes WHERE authorId = ?`, [authorId]);
    await pool.query(`DELETE FROM authors WHERE authorId = ?`, [authorId]);
    res.redirect('/authors');
  } catch (err) {
    console.error(err);
    res.send('Error deleting author');
  }
});

app.get('/deleteQuote', isAuthenticated, async (req, res) => {
  try {
    const quoteId = req.query.quoteId;
    const sql = `DELETE FROM quotes WHERE quoteId = ?`;
    await pool.query(sql, [quoteId]);
    res.redirect('/quotes');
  } catch (err) {
    console.error(err);
    res.send('Error deleting quote');
  }
});

app.get('/dbTest', async (req, res) => {
  try {
    const sql = 'SELECT CURDATE() AS today';
    const [rows] = await pool.query(sql);
    res.send(rows);
  } catch (err) {
    console.error(err);
    res.send('DB test failed');
  }
});

function isAuthenticated(req, res, next) {
  if (req.session.userAuthenticated) {
    next();
  } else {
    res.redirect('/');
  }
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});
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

// ✅ USE DATABASE_URL (THIS IS THE FIX)
const pool = mysql.createPool(process.env.DATABASE_URL);

// Test connection
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('Connected to MySQL');
    conn.release();
  } catch (err) {
    console.error('DB Connection Error:', err);
  }
})();

// Setup database
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

// Test DB
app.get('/dbTest', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT CURDATE() AS today, CURRENT_USER() AS user, DATABASE() AS db'
    );
    res.send(rows);
  } catch (err) {
    console.error(err);
    res.send(err.message);
  }
});

app.get('/', (req, res) => {
  res.render('login.ejs', { error: null });
});

app.get('/login', (req, res) => {
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
    const { username, password } = req.body;

    const [rows] = await pool.query(
      `SELECT * FROM admin WHERE username = ?`,
      [username]
    );

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
    res.render('login.ejs', { error: err.message });
  }
});

app.get('/authors', isAuthenticated, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT authorId, firstName, lastName FROM authors ORDER BY lastName`
  );
  res.render('authors.ejs', { rows });
});

app.get('/addAuthor', isAuthenticated, (req, res) => {
  res.render('newAuthor.ejs');
});

app.post('/addAuthor', isAuthenticated, async (req, res) => {
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

  await pool.query(
    `INSERT INTO authors
     (firstName, lastName, country, profession, dob, dod, sex, biography, portrait)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      firstName,
      lastName,
      country,
      profession,
      dob || null,
      dod || null,
      sex || null,
      biography,
      portrait || null
    ]
  );

  res.redirect('/authors');
});

app.get('/quotes', isAuthenticated, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT quoteId, quote FROM quotes ORDER BY quote`
  );
  res.render('quotes.ejs', { rows });
});

app.get('/addQuote', isAuthenticated, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT authorId, firstName, lastName FROM authors ORDER BY lastName`
  );
  res.render('newQuote.ejs', { rows });
});

app.post('/addQuote', isAuthenticated, async (req, res) => {
  const { quote, authorId, category } = req.body;

  await pool.query(
    `INSERT INTO quotes (quote, authorId, category)
     VALUES (?, ?, ?)`,
    [quote, authorId, category]
  );

  res.redirect('/quotes');
});

app.get('/deleteAuthor', isAuthenticated, async (req, res) => {
  const authorId = req.query.authorId;

  await pool.query(`DELETE FROM quotes WHERE authorId = ?`, [authorId]);
  await pool.query(`DELETE FROM authors WHERE authorId = ?`, [authorId]);

  res.redirect('/authors');
});

app.get('/deleteQuote', isAuthenticated, async (req, res) => {
  const quoteId = req.query.quoteId;

  await pool.query(`DELETE FROM quotes WHERE quoteId = ?`, [quoteId]);

  res.redirect('/quotes');
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
  console.log(`Server running on port ${PORT}`);
});
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import session from 'express-session';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);
app.use(session({
  secret: 'cst336 csumb',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '1234',
  database: 'lab7',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("Connected to MySQL");
    conn.release();
  } catch (err) {
    console.error("DB Connection Error:", err);
  }
})();

app.get('/', (req, res) => {
  res.render('login.ejs');
});

app.get('/profile', isAuthenticated, (req, res) => {
  res.render('profile.ejs', { "fullName": req.session.fullName });
});

app.get('/home', isAuthenticated, (req, res) => {
  res.render('home.ejs');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.post('/login', async (req, res) => {
  let username = req.body.username;
  let password = req.body.password;
  let hashedPassword = "";

  let sql = `SELECT * FROM admin WHERE username = ?`;

  const [rows] = await pool.query(sql, [username]);

  if (rows.length > 0) {
    hashedPassword = rows[0].password;
  }

  const match = await bcrypt.compare(password, hashedPassword);

  if (match) {
    req.session.userAuthenticated = true;
    req.session.fullName = rows[0].firstName + " " + rows[0].lastName;
    res.render('home.ejs');
  } else {
    res.render('login.ejs', { "error": "Wrong credentials" });
  }
});

app.get('/authors', isAuthenticated, async (req, res) => {
  let sql = `SELECT authorId, firstName, lastName
             FROM authors
             ORDER BY lastName`;

  const [rows] = await pool.query(sql);
  res.render('authors.ejs', { rows });
});

app.get('/editAuthor', isAuthenticated, async (req, res) => {
  let authorId = req.query.authorId;

  let sql = `SELECT * FROM authors WHERE authorId = ?`;
  const [authorInfo] = await pool.query(sql, [authorId]);

  if (authorInfo[0].dob) {
    authorInfo[0].dob = authorInfo[0].dob.toISOString().slice(0, 10);
  }
  if (authorInfo[0].dod) {
    authorInfo[0].dod = authorInfo[0].dod.toISOString().slice(0, 10);
  }

  res.render('editAuthor.ejs', { authorInfo });
});

app.post('/editAuthor', isAuthenticated, async (req, res) => {
  let { authorId, firstName, lastName, country, dob, dod, profession, biography } = req.body;

  let sql = `UPDATE authors
             SET firstName = ?, lastName = ?, country = ?, dob = ?, dod = ?, profession = ?, biography = ?
             WHERE authorId = ?`;

  await pool.query(sql, [firstName, lastName, country, dob, dod, profession, biography, authorId]);

  res.redirect('/authors');
});

app.get('/addAuthor', isAuthenticated, (req, res) => {
  res.render('newAuthor.ejs');
});

app.post('/addAuthor', isAuthenticated, async (req, res) => {
  let { firstName, lastName, country, profession, dob, dod, sex, biography } = req.body;

  let sql = `INSERT INTO authors
             (firstName, lastName, country, profession, dob, dod, sex, biography)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  await pool.query(sql, [firstName, lastName, country, profession, dob, dod, sex, biography]);

  res.redirect('/authors');
});

app.get('/quotes', isAuthenticated, async (req, res) => {
  let sql = `SELECT quoteId, quote FROM quotes ORDER BY quote`;
  const [rows] = await pool.query(sql);

  res.render('quotes.ejs', { rows });
});

app.get('/editQuote', isAuthenticated, async (req, res) => {
  let quoteId = req.query.quoteId;

  let sql = `SELECT * FROM quotes WHERE quoteId = ?`;
  let authorsSql = `SELECT authorId, firstName, lastName FROM authors ORDER BY lastName`;

  const [quoteInfo] = await pool.query(sql, [quoteId]);
  const [authors] = await pool.query(authorsSql);

  res.render('editQuote.ejs', { quoteInfo, authors });
});

app.post('/editQuote', isAuthenticated, async (req, res) => {
  let { quoteId, quote, authorId } = req.body;

  let sql = `UPDATE quotes SET quote = ?, authorId = ? WHERE quoteId = ?`;
  await pool.query(sql, [quote, authorId, quoteId]);

  res.redirect('/quotes');
});

app.get('/addQuote', isAuthenticated, async (req, res) => {
  let sql = `SELECT authorId, firstName, lastName FROM authors ORDER BY lastName`;
  const [rows] = await pool.query(sql);

  res.render('newQuote.ejs', { rows });
});

app.post('/addQuote', isAuthenticated, async (req, res) => {
  let { quote, authorId, category } = req.body;

  let sql = `INSERT INTO quotes (quote, authorId, category)
             VALUES (?, ?, ?)`;

  await pool.query(sql, [quote, authorId, category]);

  res.redirect('/quotes');
});

app.get('/deleteAuthor', isAuthenticated, async (req, res) => {
  let authorId = req.query.authorId;

  let sql = `DELETE FROM authors WHERE authorId = ?`;
  await pool.query(sql, [authorId]);

  res.redirect('/authors');
});

app.get('/deleteQuote', isAuthenticated, async (req, res) => {
  let quoteId = req.query.quoteId;

  let sql = `DELETE FROM quotes WHERE quoteId = ?`;
  await pool.query(sql, [quoteId]);

  res.redirect('/quotes');
});

app.get("/dbTest", async (req, res) => {
  let sql = "SELECT CURDATE()";
  const [rows] = await pool.query(sql);
  res.send(rows);
});

function isAuthenticated(req, res, next) {
  if (req.session.userAuthenticated) {
    next();
  } else {
    res.redirect("/");
  }
}

app.listen(3000, () => {
  console.log("Express server running on http://localhost:3000");
});
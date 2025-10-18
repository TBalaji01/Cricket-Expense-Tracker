const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

/*const pool = new Pool({
  user: "postgres",       // change to your postgres username
  host: "localhost",
  database: "sea_birds",  // your database name
  password: "your_password", // change to your postgres password
  port: 5432,
});*/

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/*app.use(express.static("public"));*/
app.use(express.static("."));

app.get("/players", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY player_id");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching players:", err);
    res.status(500).send("Database error");
  }
});

app.get("/expenses", async (req, res) => {

  try {
    const result = await pool.query("select to_char(expense_spent_date,'MM/DD/YYYY') as expensedate,to_char(expense_month_year, 'Mon YYYY') as monthyear,expense_description as desc,expense_amount as amount from expenses order by  expense_spent_date asc, expense_id asc");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching expenses:", err);
    res.status(500).send("Database error");
  }
});

app.get("/tournaments", async (req, res) => {
  try {
    const { isactive } = req.query; // e.g. /tournaments?isactive=true

    let query = `
      SELECT 
        tournament_id AS id,
        tournament_name AS name,
        tournament_entry_fee AS entryfees,
        tournament_amount_paid AS paid,
        tournament_amount_balance AS balance,
        tournament_amount_won AS prizewon,
        tournament_iscompleted AS iscompleted
      FROM tournaments
    `;

    if (isactive == "true") {
      query += " WHERE tournament_iscompleted = true";
    } else if (isactive == "false") {
      query += " WHERE tournament_iscompleted = false";
    }

    query += " ORDER BY 1 ASC";

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching tournaments:", err);
    res.status(500).send("Database error");
  }
});


// API: team summary
app.get("/team-summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        (SELECT SUM(expense_amount) FROM expenses) AS teamamount,
        (SELECT SUM(player_advance_amount) 
           FROM players WHERE player_advance_amount >= 0) AS teamdueamount,
        (SELECT STRING_AGG(player_name || ' ₹' || player_advance_amount, ', ') 
           FROM players WHERE player_advance_amount > 0) AS teamdueamountplayers,
        (SELECT -(SUM(player_advance_amount)) 
           FROM players WHERE player_advance_amount <= 0) AS playersdueamount,
        (SELECT STRING_AGG(player_name || ' ₹' || -(player_advance_amount), ', ') 
           FROM players WHERE player_advance_amount < 0) AS playersdueamountplayers
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching summary:", err);
    res.status(500).send("Database error");
  }
});

// Get all players
app.get("/api/players", async (req, res) => {
  try {
    const result = await pool.query("SELECT player_id, player_name, player_mobile_no, player_isactive FROM players ORDER BY player_name");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching players");
  }
});

// Add or Update player
app.post("/api/addplayer", async (req, res) => {
  try {
    const { player_id, player_name, player_mobile, player_isactive } = req.body;

    if (player_id) {
      // Update existing player
      await pool.query(
        "UPDATE players SET player_name = $1, player_mobile = $2, player_isactive = $3 WHERE player_id = $4",
        [player_name, player_mobile, player_isactive, player_id]
      );
      res.send("Player updated successfully");
    } else {
      // Insert new player
      await pool.query(
        "INSERT INTO players (player_name, player_mobile, player_isactive) VALUES ($1, $2, $3)",
        [player_name, player_mobile, player_isactive]
      );
      res.send("Player added successfully");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving player");
  }
});

app.get("/monthlycontribution", async (req, res) => {
  try {
    const query = `
      select 
        to_char(expense_month_year,'Month YYYY') as paidmonth,
        expense_amount as paidamount,
        to_char(expense_spent_date,'MM/DD/YYYY') paidon,
        player_name as paidname
      from expenses 
      inner join players on expense_payee_id = player_id 
        and expense_payee_type = 1 
        and expense_type = 1
      group by to_char(expense_month_year,'Month YYYY'), expense_amount, player_name ,paidon 
      order by min(expense_month_year),paidon asc;
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching monthly contribution:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



const port = 3000;
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});

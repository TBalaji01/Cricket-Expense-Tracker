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

app.get("/expenses", async (req, res) => {

  try {
    const result = await pool.query("select to_char(expense_spent_date,'MM/DD/YYYY') as expensedate,to_char(expense_month_year, 'Mon YYYY') as monthyear,expense_description as desc,expense_amount as amount from expenses order by  expense_spent_date asc, expense_id asc");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching expenses:", err);
    res.status(500).send("Database error");
  }
});

// Add new expense
app.post("/expenses", async (req, res) => {
  try {
    const { expense_payee_type, expense_payee_id, expense_amount, expense_spent_date,
            expense_month_year, expense_type, expense_description } = req.body;

    const query = `
      INSERT INTO expenses (
        expense_payee_type, expense_payee_id, expense_amount,
        expense_spent_date, expense_month_year, expense_type, expense_description
      ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `;
    const values = [expense_payee_type, expense_payee_id, expense_amount,
                    expense_spent_date, expense_month_year, expense_type, expense_description];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add expense" });
  }
});

// Update expense
app.put("/expenses/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { expense_payee_type, expense_payee_id, expense_amount, expense_spent_date,
            expense_month_year, expense_type, expense_description } = req.body;

    const query = `
      UPDATE expenses
      SET expense_payee_type=$1, expense_payee_id=$2, expense_amount=$3,
          expense_spent_date=$4, expense_month_year=$5, expense_type=$6, expense_description=$7
      WHERE expense_id=$8 RETURNING *
    `;
    const values = [expense_payee_type, expense_payee_id, expense_amount,
                    expense_spent_date, expense_month_year, expense_type, expense_description, id];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update expense" });
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
        tournament_description desc,
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

// POST - Add tournament
app.post("/tournaments", async (req, res) => {
  const { tournament_name, tournament_entry_fee, tournament_description, tournament_iscompleted } = req.body;
  await pool.query(
    `INSERT INTO tournaments (tournament_name, tournament_entry_fee, tournament_description, tournament_iscompleted)
     VALUES ($1, $2, $3, $4)`,
    [tournament_name, tournament_entry_fee, tournament_description, tournament_iscompleted]
  );
  res.sendStatus(201);
});

// PUT - Update tournament
app.put("/tournaments/:id", async (req, res) => {
  const { id } = req.params;
  const { tournament_name, tournament_entry_fee, tournament_description, tournament_iscompleted } = req.body;
  await pool.query(
    `UPDATE tournaments 
     SET tournament_name=$1, tournament_entry_fee=$2, tournament_description=$3, tournament_iscompleted=$4
     WHERE tournament_id=$5`,
    [tournament_name, tournament_entry_fee, tournament_description, tournament_iscompleted, id]
  );
  res.sendStatus(200);
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


// --- PLAYERS API ---

// Get all players
app.get("/players", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT player_id AS id, 
             player_name AS name, 
             player_mobile_no AS mobile, 
             COALESCE(TO_CHAR(player_last_paid_date, 'DD Mon YYYY'), '-') AS lastpaid, 
             COALESCE(player_advance_amount, 0) AS advance 
      FROM players 
      ORDER BY player_id,player_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching players:", err);
    res.status(500).send("Error fetching players");
  }
});

// Add new player
app.post("/players", async (req, res) => {
  const { name, mobile } = req.body;
  try {
    await pool.query(
      "INSERT INTO players (player_name, player_mobile_no) VALUES ($1, $2)",
      [name, mobile]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error adding player:", err);
    res.status(500).send("Error adding player");
  }
});

// Update player
app.put("/players/:id", async (req, res) => {
  const { id } = req.params;
  const { name, mobile } = req.body;
  try {
    await pool.query(
      "UPDATE players SET player_name=$1, player_mobile_no=$2 WHERE player_id=$3",
      [name, mobile, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating player:", err);
    res.status(500).send("Error updating player");
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});

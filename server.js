const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware must come before API routes
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Database connection
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
});

// Get all events
app.get("/api/events", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM events ORDER BY event_date ASC",
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not fetch events" });
  }
});

// Add a new event
app.post("/api/events", async (req, res) => {
  try {
    const {
      title,
      category,
      club,
      event_date,
      event_time,
      description,
      registration_link,
      club_info,
    } = req.body;

    const [result] = await db.query(
      `INSERT INTO events
            (title, category, club, event_date, event_time,
             description, registration_link, club_info)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        category,
        club,
        event_date,
        event_time,
        description,
        registration_link,
        club_info,
      ],
    );

    res.status(201).json({
      message: "Event added successfully",
      id: result.insertId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Could not add event",
    });
  }
});

// Register a student for an event
app.post("/api/registrations", async (req, res) => {
  const {
    eventId,
    name,
    email,
    phone,
    rollNumber,
    department,
    studyYear,
    teamName,
  } = req.body;

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO registrations
            (event_id, student_name, email, phone, roll_number,
             department, study_year, team_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        name,
        email,
        phone,
        rollNumber,
        department,
        studyYear,
        teamName || null,
      ],
    );

    await connection.query(
      `UPDATE events
             SET registration_count = registration_count + 1
             WHERE id = ?`,
      [eventId],
    );

    await connection.commit();

    res.status(201).json({
      message: "Registration successful",
      id: result.insertId,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);

    res.status(500).json({
      message: "Registration failed",
    });
  } finally {
    if (connection) connection.release();
  }
});

// Delete an event from MySQL
app.delete("/api/events/:id", async (req, res) => {
  try {
    const eventId = req.params.id;

    // Check whether students have registered
    const [registrations] = await db.query(
      "SELECT COUNT(*) AS total FROM registrations WHERE event_id = ?",
      [eventId],
    );

    if (registrations[0].total > 0) {
      return res.status(409).json({
        message: "Cannot delete an event with existing registrations.",
      });
    }

    const [result] = await db.query("DELETE FROM events WHERE id = ?", [
      eventId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Could not delete event",
    });
  }
});

// Start server
async function startServer() {
  try {
    const connection = await db.getConnection();
    console.log("MySQL Database Connected Successfully!");
    connection.release();

    app.listen(process.env.PORT || 3000, () => {
      console.log("EventHub server is running!");
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
}

startServer();

// Import required packages and modules
const express = require("express");
const { Client } = require("pg");
require("dotenv").config();

// Create an Express app
const app = express();
const port = process.env.PORT || 3003;
app.use(express.json());

//This code creates a new PostgreSQL client and connects to the database.
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Function to connect to the database
const connectToDatabase = async () => {
  try {
    await client.connect();
    console.log("Connected to the database");
  } catch (err) {
    console.error("Error connecting to the database:", err);
  }
};
// Endpoint to handle contact identification and inserting into database
app.post("/identify", async (req, res) => {
  try {
    console.log(req.body);
    const { email, phoneNumber } = req.body;

    if (!email) {
      return res.status(400).send({ error: "No email address provided" });
    }

    if (!phoneNumber) {
      return res.status(400).send({ error: "No phone number provided" });
    }
    // Check if the contact already exists in the database
    await client.query(`
      CREATE TABLE IF NOT EXISTS contact (
        id SERIAL PRIMARY KEY,
        phoneNumber TEXT,
        email TEXT,
        linkedId INT,
        linkPrecedence TEXT,
        createdAt TIMESTAMPTZ,
        updatedAt TIMESTAMPTZ,
        deletedAt TIMESTAMPTZ
      )
    `);
    // Check if the contact already exists in the database
    const existingContactWithSamePhoneAndEmail = await client.query(
      `SELECT * FROM contact WHERE phoneNumber = $1 AND email=$2`,
      [phoneNumber, email]
    );

    if (existingContactWithSamePhoneAndEmail.rows.length !== 0) {
      return res.status(409).send({ error: "Contact already exists" });
    }
    // Check if there is an existing contact with the same phone number or email
    const existingContactWithPhoneOrMail = await client.query(
      `SELECT * FROM contact WHERE email = $1 OR phoneNumber=$2`,
      [email, phoneNumber]
    );

    if (existingContactWithPhoneOrMail.rows.length === 0) {
      // If the contact doesn't exist, create a new contact and return the contact information.
      const primaryContact = {
        phoneNumber,
        email,
        linkedId: null,
        linkPrecedence: "primary",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const newContact = await client.query(
        `INSERT INTO contact (phoneNumber, email, linkedId, linkPrecedence, createdAt, updatedAt, deletedAt) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          primaryContact.phoneNumber,
          primaryContact.email,
          primaryContact.linkedId,
          primaryContact.linkPrecedence,
          primaryContact.createdAt,
          primaryContact.updatedAt,
          primaryContact.deletedAt,
        ]
      );

      const addedContact = await client.query(
        `SELECT * FROM contact WHERE email = $1 OR phoneNumber=$2`,
        [email, phoneNumber]
      );

      const contact = addedContact.rows[0]; // Get the first row

      const response = {
        contact: {
          primaryContactId: contact.id,
          emails: [contact.email],
          phoneNumbers: [contact.phonenumber],
          secondaryContactIds: [null],
        },
      };

      res.status(200).send(response);
    } else {
      // If the contact exists, create a secondary contact and update the response accordingly.
      const secondaryContact = {
        phoneNumber,
        email,
        linkedId:
          existingContactWithPhoneOrMail.rows[0].linkprecedence === "primary"
            ? existingContactWithPhoneOrMail.rows[0].id
            : existingContactWithPhoneOrMail.rows[0].linkedid,

        linkPrecedence: "secondary",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const secondaryContactQuery = await client.query(
        `INSERT INTO contact (phoneNumber, email, linkedId, linkPrecedence, createdAt, updatedAt, deletedAt) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          secondaryContact.phoneNumber,
          secondaryContact.email,
          secondaryContact.linkedId,
          secondaryContact.linkPrecedence,
          secondaryContact.createdAt,
          secondaryContact.updatedAt,
          secondaryContact.deletedAt,
        ]
      );
      // Fetch all contacts related to the same primary contact or linked contact
      const sameContact = await client.query(
        `SELECT * FROM contact WHERE linkedId = $1 OR (linkedId IS NULL AND id = $1 AND $1 IS NOT NULL)`,
        [secondaryContact.linkedId]
      );

      const contact = sameContact.rows; // Get all rows

      const response = {
        contact: {
          primaryContactId: 0,
          emails: [],
          phoneNumbers: [],
          secondaryContactIds: [],
        },
      };

      contact.forEach((con) => {
        if (con.linkprecedence === "primary") {
          response.contact.primaryContactId = con.id;
        }
        if (!response.contact.emails.includes(con.email)) {
          response.contact.emails.push(con.email);
        }
        if (!response.contact.phoneNumbers.includes(con.phonenumber)) {
          response.contact.phoneNumbers.push(con.phonenumber);
        }

        if (con.linkprecedence === "secondary") {
          response.contact.secondaryContactIds.push(con.id);
        }
      });

      res.status(200).send(response);
    }
  } catch (err) {
    console.error("Error executing query:", err);
    res.status(500).send("An error occurred");
  } finally {
  }
});

// Start the server and connect to the database
app.listen(port, () => {
  connectToDatabase();
  console.log(`Server is running on port ${port}`);
});

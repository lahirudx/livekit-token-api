const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors"); // Import CORS middleware
const { AccessToken } = require("livekit-server-sdk");
require("dotenv").config();

const app = express();
const port = 3000;

app.use(cors()); // Enable CORS
app.use(bodyParser.json());

app.post("/get-token", (req, res) => {
  const { username, room } = req.body;

  console.log("Received request:", { username, room });

  if (!username || !room) {
    console.error("Validation error: Missing username or room");
    return res.status(400).json({ error: "Username and room are required" });
  }

  try {
    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: username,
      }
    );

    token.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = token.toJwt();
    console.log("Generated token:", jwt);

    res.json({ token: jwt });
  } catch (error) {
    console.error("Error generating token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`LiveKit token server running at http://localhost:${port}`);
});

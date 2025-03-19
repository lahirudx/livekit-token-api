const express = require("express");
const bodyParser = require("body-parser");
const { AccessToken } = require("livekit-server-sdk");
require("dotenv").config();

const app = express();
const port = 3000;

app.use(bodyParser.json());

app.post("/get-token", (req, res) => {
  const { username, room } = req.body;

  if (!username || !room) {
    return res.status(400).json({ error: "Username and room are required" });
  }

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

  res.json({ token: token.toJwt() });
});

app.listen(port, () => {
  console.log(`LiveKit token server running at http://localhost:${port}`);
});

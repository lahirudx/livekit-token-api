const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors"); // Import CORS middleware
const { AccessToken, RoomServiceClient } = require("livekit-server-sdk");
const crypto = require("crypto"); // Built-in Node.js crypto module - no need to install
const WebSocket = require("ws");
const http = require("http");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const port = 3000;

// LiveKit room service client
const roomService = new RoomServiceClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

// In-memory storage for room mappings and connected clients
const roomMappings = new Map();
const connectedClients = new Set();

// Broadcast room updates to all connected clients
const broadcastRooms = async () => {
  try {
    // Get active rooms from LiveKit
    const liveKitRooms = await roomService.listRooms();

    // Filter out empty rooms and prepare room data
    const activeRooms = liveKitRooms
      .filter((room) => room.numParticipants > 0)
      .map((room) => ({
        roomId: room.name,
        displayName: roomMappings.get(room.name) || room.name,
        participantCount: room.numParticipants,
      }));

    // Remove mappings for rooms that no longer exist
    for (const [roomId] of roomMappings) {
      if (!liveKitRooms.find((room) => room.name === roomId)) {
        roomMappings.delete(roomId);
      }
    }

    // Broadcast to all connected clients
    const message = JSON.stringify({ type: "rooms", rooms: activeRooms });
    connectedClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } catch (error) {
    console.error("Error broadcasting rooms:", error);
  }
};

// WebSocket connection handling
wss.on("connection", (ws) => {
  console.log("Client connected");
  connectedClients.add(ws);

  // Send initial room list
  broadcastRooms();

  ws.on("close", () => {
    console.log("Client disconnected");
    connectedClients.delete(ws);
  });
});

// Set up periodic room updates
setInterval(broadcastRooms, 5000); // Update every 5 seconds

app.use(cors()); // Enable CORS
app.use(bodyParser.json());

// Generate random room ID
const generateRoomId = () => {
  return crypto.randomBytes(8).toString("hex");
};

// Get all available rooms
app.get("/rooms", async (req, res) => {
  try {
    const liveKitRooms = await roomService.listRooms();
    const activeRooms = liveKitRooms
      .filter((room) => room.numParticipants > 0)
      .map((room) => ({
        roomId: room.name,
        displayName: roomMappings.get(room.name) || room.name,
        participantCount: room.numParticipants,
      }));
    res.json({ rooms: activeRooms });
  } catch (error) {
    console.error("Error getting rooms:", error);
    res.status(500).json({ error: "Failed to get rooms" });
  }
});

app.post("/get-token", async (req, res) => {
  const { username, room, isHost } = req.body;

  console.log("Received request:", { username, room, isHost });

  if (!username) {
    console.error("Validation error: Missing username");
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    let roomId = room;

    // If user is host, create new room
    if (isHost) {
      roomId = generateRoomId();
      const displayName = `${username}'s stream`;
      roomMappings.set(roomId, displayName);

      // Create room in LiveKit
      await roomService.createRoom({
        name: roomId,
        emptyTimeout: 10 * 60, // 10 minutes
        maxParticipants: 20,
      });
    } else if (!roomId) {
      return res
        .status(400)
        .json({ error: "Room ID is required for non-host users" });
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
      room: roomId,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();
    console.log("Generated token:", jwt);

    // Trigger immediate room update broadcast
    broadcastRooms();

    res.json({
      token: jwt,
      room: roomId,
      displayName: roomMappings.get(roomId),
    });
  } catch (error) {
    console.error("Error generating token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/", (req, res) => {
  res.send("LiveKit token server is running!");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`LiveKit token server running at http://0.0.0.0:${port}`);
  console.log(`WebSocket server running at ws://0.0.0.0:${port}`);
  console.log(`Make sure this server is accessible from your device's network`);
});

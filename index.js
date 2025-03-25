const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { AccessToken, RoomServiceClient } = require("livekit-server-sdk");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const port = 3000;

// LiveKit room service client
const roomService = new RoomServiceClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

// In-memory storage for room mappings
const roomMappings = new Map();
const roomHosts = new Map(); // Track room hosts

app.use(cors());
app.use(bodyParser.json());

// Generate random room ID
const generateRoomId = () => {
  return crypto.randomBytes(8).toString("hex");
};

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
      roomHosts.set(roomId, username); // Store host information

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

    res.json({
      token: jwt,
      room: roomId,
      displayName: roomMappings.get(roomId),
      isHost: username === roomHosts.get(roomId),
    });
  } catch (error) {
    console.error("Error generating token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete room endpoint
app.delete("/rooms/:roomName", async (req, res) => {
  const { roomName } = req.params;
  const { username } = req.query;

  console.log(`DELETE room request for ${roomName} from ${username}`);

  try {
    // Force terminate the room
    console.log(`Terminating room: ${roomName}`);
    const terminateOptions = {
      room_name: roomName,
      force: true,
    };

    // Send API request to LiveKit to terminate the room
    const roomData = await roomService.terminateRoom(terminateOptions);
    console.log("Room terminated successfully:", roomData);

    res.status(200).json({ message: "Room terminated successfully" });
  } catch (error) {
    console.error("Error terminating room:", error);

    // Even if there's an error, attempt to delete any active connections
    try {
      await roomService.deleteRoom(roomName);
      console.log(`Room ${roomName} deleted from LiveKit API as fallback`);
    } catch (fallbackError) {
      console.error("Fallback deletion also failed:", fallbackError);
    }

    res
      .status(500)
      .json({ message: "Failed to terminate room", error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("LiveKit token server is running!");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`LiveKit token server running at http://0.0.0.0:${port}`);
  console.log(`Make sure this server is accessible from your device's network`);
});

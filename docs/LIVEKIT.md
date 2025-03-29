# LiveKit Server Integration

This document describes the LiveKit integration in the server component of the application.

## Overview

The application uses LiveKit for real-time audio/video streaming between users. The server handles token generation, room creation, and lifecycle management.

## Key Components

### LiveKitService

Located in `src/services/livekit.service.ts`, this singleton class manages all LiveKit-related functionality:

- Token generation
- Room creation and deletion
- Room listing
- Automatic cleanup of stale rooms

### SocketService

Located in `src/services/socket.service.ts`, this handles real-time communication:

- Room participant tracking
- Notifying users of joins/leaves
- Source participant management
- Room cleanup when source leaves

## Participant Roles

### Source Participant

- Creates and owns the room
- Identified by setting `isSource: true` when requesting a token
- Starting a stream automatically creates a new room
- When source leaves, all participants are disconnected and room is terminated

### Regular Participant

- Joins existing rooms
- Must provide a valid room ID to join
- Cannot create rooms
- Are disconnected when the source leaves

## Token Generation

```typescript
// Creating a token with publish permissions for all participants
token.addGrant({
  roomJoin: true,
  room: roomId,
  canPublish: true, // All participants can publish
  canSubscribe: true,
});
```

All participants can publish audio and video, but the client UI is configured to start with different media states based on role:
- Sources start with audio and video enabled
- Participants start with only video enabled (audio muted)

## Room Lifecycle

1. **Creation**: When a source requests a token, a new room is created
2. **Participation**: Users join with their tokens
3. **Termination**: Rooms are terminated when:
   - The source participant leaves
   - All participants leave (empty timeout is set to 0)
   - Server cleanup process runs for stale rooms

## Server Endpoints

### `/api/livekit/get-token`

- **Method**: POST
- **Auth**: Required
- **Body**: 
  ```json
  {
    "username": "user's display name",
    "room": "optional room ID for joining",
    "isSource": true/false
  }
  ```
- **Response**: 
  ```json
  {
    "token": "JWT token",
    "room": "room ID",
    "displayName": "room display name",
    "isSource": true/false
  }
  ```

### `/api/livekit/rooms`

- **Method**: GET
- **Auth**: Required
- **Response**: List of active rooms with participation counts

## Environment Variables

- `LIVEKIT_URL`: URL of the LiveKit server
- `LIVEKIT_API_KEY`: API key for the LiveKit server
- `LIVEKIT_API_SECRET`: API secret for authentication 
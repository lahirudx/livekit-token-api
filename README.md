# Wiink Server - LiveKit Backend

A Node.js backend server for the Wiink video streaming app, handling authentication, room management, and LiveKit integration.

## Features

- User authentication with JWT
- Invite code system for user registration
- LiveKit room management
- Token generation for video rooms
- MongoDB database integration
- RESTful API endpoints

## Tech Stack

- Node.js
- Express.js
- TypeScript
- Prisma ORM
- MongoDB
- LiveKit Server SDK
- JWT Authentication

## Prerequisites

- Node.js (v14 or higher)
- MongoDB instance
- LiveKit Cloud account
- npm or yarn

## Environment Setup

1. Create a `.env` file in the root directory with the following variables:
```
DATABASE_URL=your_mongodb_url
JWT_SECRET=your_jwt_secret
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=your_livekit_url
PORT=3000
```

## Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Push database schema
npm run prisma:push
```

## Development

```bash
# Start development server with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start
```

## Project Structure

```
node-server/
├── src/
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Express middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── types/          # TypeScript types
│   └── scripts/        # Utility scripts
├── prisma/             # Database schema
└── dist/              # Compiled JavaScript
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### LiveKit
- `POST /api/livekit/get-token` - Generate room token
- `DELETE /api/livekit/rooms/:roomName` - Terminate room

## Database Schema

### User
- id: String (ObjectId)
- email: String (unique)
- password: String
- createdAt: DateTime
- inviteCode: InviteCode (relation)

### InviteCode
- id: String (ObjectId)
- code: String (unique)
- isUsed: Boolean
- createdAt: DateTime
- userId: String (ObjectId, optional)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT License - see LICENSE file for details 
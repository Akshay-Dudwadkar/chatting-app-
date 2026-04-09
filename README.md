# WhatsApp-like Chat App

A responsive chat application with owner-managed users, real-time messaging, file sharing, voice calls, and admin controls.

## Features
- **WhatsApp-like UI**: Sidebar for user list (owner), chat window with message bubbles
- **Owner Dashboard**: Create users, change passwords, delete chat history
- **Real-time Chat**: Instant messaging with Socket.IO
- **File Sharing**: Send images and documents
- **Voice Calls**: WebRTC-based audio calls
- **Responsive Design**: Works on desktop and mobile
- **Session Management**: Secure login/logout

## Owner Capabilities
- Create new user accounts
- Change any user's password
- Delete chat history for any user
- Access all user chats

## User Capabilities
- Chat with owner only
- Send text messages, images, files
- Voice calls with owner
- Secure login required

## Run locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the app:
   ```bash
   npm start
   ```
3. Open in browser:
   ```
   http://localhost:3000
   ```

## Default accounts
- Owner: `owner` / `owner123`
- User: `alice` / `alice123`
- User: `bob` / `bob123`

## Optional MongoDB setup
To use MongoDB instead of local JSON files, set the following environment variables:

```bash
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.thdxhi0.mongodb.net
MONGO_DB_NAME=chatapp
```

If `MONGO_URI` is not provided, the app continues using local JSON storage.

## Notes
- Uploaded files are saved in `public/uploads`
- Local user data is stored in `data/users.json`
- Local chat history is stored in `data/chats.json`
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MONGO_URI = process.env.MONGO_URI || '';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'chatapp';
let useMongo = Boolean(MONGO_URI);
let mongoClient = null;
let usersCollection = null;
let chatsCollection = null;

const DATA_FOLDER = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_FOLDER, 'users.json');
const CHATS_FILE = path.join(DATA_FOLDER, 'chats.json');
const UPLOAD_FOLDER = path.join(__dirname, 'public', 'uploads');

const ensureFolder = (folder) => {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
};

ensureFolder(DATA_FOLDER);
ensureFolder(UPLOAD_FOLDER);

const defaultUsers = [
  { username: 'owner', password: 'owner123', isOwner: true }
];

const loadJson = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('Failed to parse JSON:', filePath, error);
    return fallback;
  }
};

const saveJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

let users = loadJson(USERS_FILE, defaultUsers);
let chats = loadJson(CHATS_FILE, { chats: {} });

const saveUsers = () => saveJson(USERS_FILE, users);
const saveChats = () => saveJson(CHATS_FILE, chats);

const initMongoDb = async () => {
  if (!useMongo) return;
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db(MONGO_DB_NAME);
  usersCollection = db.collection('users');
  chatsCollection = db.collection('chats');
  await usersCollection.createIndex({ username: 1 }, { unique: true });
  await chatsCollection.createIndex({ username: 1 }, { unique: true });

  const existingOwner = await usersCollection.findOne({ username: 'owner' });
  if (!existingOwner) {
    await usersCollection.insertMany(defaultUsers);
  } else {
    for (const user of defaultUsers) {
      await usersCollection.updateOne(
        { username: user.username },
        { $set: user },
        { upsert: true }
      );
    }
  }
};

const findUser = async (username) => {
  if (useMongo) {
    return usersCollection.findOne({ username });
  }
  return users.find((user) => user.username === username);
};

const getAllUsers = async () => {
  if (useMongo) {
    return usersCollection.find({ isOwner: false }).project({ username: 1, _id: 0 }).toArray();
  }
  return users.filter((user) => !user.isOwner).map(({ username }) => ({ username }));
};

const upsertUser = async (user) => {
  if (useMongo) {
    await usersCollection.updateOne({ username: user.username }, { $set: user }, { upsert: true });
    return;
  }
  const index = users.findIndex((item) => item.username === user.username);
  if (index >= 0) {
    users[index] = user;
  } else {
    users.push(user);
  }
  saveUsers();
};

const getChatForUser = async (username) => {
  if (useMongo) {
    let doc = await chatsCollection.findOne({ username });
    if (!doc) {
      await chatsCollection.insertOne({ username, messages: [] });
      return [];
    }
    return doc.messages || [];
  }
  if (!chats.chats[username]) chats.chats[username] = [];
  return chats.chats[username];
};

const saveChatForUser = async (username, messages) => {
  if (useMongo) {
    await chatsCollection.updateOne(
      { username },
      { $set: { messages } },
      { upsert: true }
    );
    return;
  }
  chats.chats[username] = messages;
  saveChats();
};

const clearChatForUser = async (username) => {
  if (useMongo) {
    await chatsCollection.updateOne(
      { username },
      { $set: { messages: [] } },
      { upsert: true }
    );
    return;
  }
  chats.chats[username] = [];
  saveChats();
};

const clearChatBetweenUsers = async (user1, user2) => {
  // For file-based storage, we need to clear messages between two users
  // Since chats are stored per user, we clear the chat for user1
  if (useMongo) {
    await chatsCollection.updateOne(
      { username: user1 },
      { $pull: { messages: { $or: [{ from: user2 }, { to: user2 }] } } }
    );
    return;
  }

  if (chats.chats[user1]) {
    chats.chats[user1] = chats.chats[user1].filter(msg =>
      !(msg.from === user2 || msg.to === user2)
    );
    saveChats();
  }
};

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_FOLDER));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: 'simple-chat-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 }
  })
);

const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = await findUser(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.user = { username: user.username, isOwner: !!user.isOwner, email: user.email || null };
  res.json({ success: true, user: req.session.user });
});

app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  res.json({ user: req.session.user });
});

// Allow current user to set their own email
app.put('/me/email', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const username = req.session.user.username;
  const user = await findUser(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.email = email;
  await upsertUser(user);
  // update session
  req.session.user.email = email;
  res.json({ success: true });
});

app.get('/users', requireAuth, async (req, res) => {
  if (!req.session.user.isOwner) {
    return res.status(403).json({ error: 'Only owner may access users' });
  }
  const users = await getAllUsers();
  res.json({ users });
});

app.post('/users', requireAuth, async (req, res) => {
  if (!req.session.user.isOwner) {
    return res.status(403).json({ error: 'Only owner may create new users' });
  }
  const { username, password, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const existingUser = await findUser(username);
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }
  await upsertUser({ username, password, isOwner: false, email: email || null });
  res.json({ success: true });
});

// Allow owner to set or update a user's email address
app.put('/users/:username/email', requireAuth, async (req, res) => {
  if (!req.session.user.isOwner) {
    return res.status(403).json({ error: 'Only owner may update user email' });
  }
  const username = req.params.username;
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const user = await findUser(username);
  if (!user || user.isOwner) return res.status(404).json({ error: 'User not found' });
  user.email = email;
  await upsertUser(user);
  res.json({ success: true });
});

// Send notification emails between users/owner and support owner broadcasts
app.post('/notify', requireAuth, async (req, res) => {
  const { to, subject, message, fromEmail, announcement } = req.body || {};
  const current = req.session.user;
  if (!to || !message) return res.status(400).json({ error: 'Recipient and message are required' });

  // Non-owner users can only notify the owner
  if (!current.isOwner && to !== 'owner') {
    return res.status(403).json({ error: 'Only owner may notify other users' });
  }

  const mailSubject = subject || `Notification from ${current.username}`;
  const text = `From: ${current.username}\n\n${message}` + (fromEmail ? `\n\nReply-to: ${fromEmail}` : '');
  const html = `<p><strong>From:</strong> ${current.username}</p><p>${message.replace(/\n/g, '<br/>')}</p>`;
  const messagePayload = {
    id: uuidv4(),
    from: current.username,
    type: announcement ? 'announcement' : 'text',
    text: message,
    timestamp: new Date().toISOString(),
    unread: true,
    permanent: announcement === true
  };

  let recipients = [];
  let storedUsernames = [];

  if (to === 'owner') {
    const ownerUser = await findUser('owner');
    if (ownerUser) {
      if (ownerUser.email) recipients.push(ownerUser.email);
      const ownerChat = await getChatForUser('owner');
      ownerChat.push(messagePayload);
      await saveChatForUser('owner', ownerChat);
      io.to(`room_owner`).emit('message', messagePayload);
      storedUsernames.push('owner');
    }
  } else if (to === 'all') {
    const allUsers = await getAllUsers();
    for (const user of allUsers) {
      const chatMessage = Object.assign({}, messagePayload, { id: uuidv4() });
      const userChat = await getChatForUser(user.username);
      userChat.push(chatMessage);
      await saveChatForUser(user.username, userChat);
      if (user.email) recipients.push(user.email);
      storedUsernames.push(user.username);
      io.to(`room_${user.username}`).emit('message', chatMessage);
    }
  } else {
    const target = await findUser(to);
    if (!target) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    if (target.email) recipients.push(target.email);
    storedUsernames.push(target.username);
    const chatMessage = messagePayload;
    const userChat = await getChatForUser(to);
    userChat.push(chatMessage);
    await saveChatForUser(to, userChat);
    io.to(`room_${to}`).emit('message', chatMessage);
  }

  if (storedUsernames.length === 0) {
    return res.status(404).json({ error: 'No valid recipient found' });
  }

  if (recipients.length === 0) {
    console.warn('Notification stored but no email configured for recipients:', to);
    return res.json({ success: true, emailSent: false });
  }

  try {
    for (const r of recipients) {
      await sendEmailNotification(r, mailSubject, text, html);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Failed to send notify emails:', err);
    return res.status(500).json({ error: 'Failed to send notification' });
  }
});

app.delete('/users/:username', requireAuth, async (req, res) => {
  if (!req.session.user.isOwner) {
    return res.status(403).json({ error: 'Only owner may delete users' });
  }
  const username = req.params.username;
  if (!username || username === 'owner') {
    return res.status(400).json({ error: 'Invalid username' });
  }

  const existing = await findUser(username);
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    if (useMongo) {
      await usersCollection.deleteOne({ username });
      await chatsCollection.deleteOne({ username });
    } else {
      users = users.filter(u => u.username !== username);
      saveUsers();
      if (chats.chats[username]) {
        delete chats.chats[username];
        saveChats();
      }
    }

    // Notify any connected sockets for that user and disconnect them
    for (const [uname, info] of onlineUsers.entries()) {
      if (uname === username && info && info.socketId) {
        try {
          const s = io.sockets.sockets.get(info.socketId);
          if (s) s.disconnect(true);
        } catch (e) { /* ignore */ }
        onlineUsers.delete(uname);
      }
    }

    // Inform owners/clients to refresh their lists
    io.emit('userDeleted', { username });

    return res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete user:', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.put('/users/:username/password', requireAuth, async (req, res) => {
  if (!req.session.user.isOwner) {
    return res.status(403).json({ error: 'Only owner may change user passwords' });
  }
  const username = req.params.username;
  const { password } = req.body;
  const user = await findUser(username);
  if (!user || user.isOwner) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  user.password = password;
  await upsertUser(user);
  res.json({ success: true });
});

app.get('/chat/:username', requireAuth, async (req, res) => {
  const partner = req.params.username;
  const current = req.session.user;
  let chatOwner = partner;

  if (!current.isOwner) {
    if (partner !== 'owner') {
      return res.status(403).json({ error: 'Users may only chat with owner' });
    }
    chatOwner = current.username;
  }

  const user = current.isOwner ? await findUser(partner) : await findUser(current.username);
  if (!user || (current.isOwner && user.isOwner)) {
    return res.status(404).json({ error: 'Chat partner not found' });
  }

  const chat = await getChatForUser(chatOwner);

  if (current.isOwner) {
    let updated = false;
    chat.forEach((message) => {
      if (message.from === partner && message.unread) {
        message.unread = false;
        updated = true;
      }
    });
    if (updated) await saveChatForUser(chatOwner, chat);
  } else {
    let updated = false;
    chat.forEach((message) => {
      if (message.from === 'owner' && message.unread) {
        message.unread = false;
        updated = true;
      }
    });
    if (updated) await saveChatForUser(chatOwner, chat);
  }

  res.json({ chat });
});

app.get('/chat-partners', requireAuth, async (req, res) => {
  const current = req.session.user;
  if (current.isOwner) {
    const partners = [];
    const users = await getAllUsers();
    for (const user of users) {
      const chat = await getChatForUser(user.username);
      const unreadCount = chat.filter((message) => message.from === user.username && message.unread).length;
      partners.push({ username: user.username, unreadCount });
    }
    return res.json({ partners });
  }

  const chat = await getChatForUser(current.username);
  const unreadCount = chat.filter((message) => message.from === 'owner' && message.unread).length;
  res.json({ partners: [{ username: 'owner', unreadCount }] });
});

app.delete('/chat/:username', requireAuth, async (req, res) => {
  const partner = req.params.username;
  if (!req.session.user.isOwner) {
    return res.status(403).json({ error: 'Only owner may delete chat permanently' });
  }
  const user = await findUser(partner);
  if (!user || user.isOwner) {
    return res.status(404).json({ error: 'User not found' });
  }
  await clearChatForUser(partner);
  io.to(`room_${partner}`).emit('chatCleared');
  res.json({ success: true });
});

// User can delete their own chat view
app.delete('/chat/:username/message/:messageId', requireAuth, async (req, res) => {
  const partner = req.params.username;
  const messageId = req.params.messageId;
  const current = req.session.user;
  let chatOwner = partner;
  const forEveryone = req.query.forEveryone === '1' || req.query.forEveryone === 'true';

  if (!current.isOwner) {
    if (partner !== 'owner') {
      return res.status(403).json({ error: 'Users may only delete messages in owner chat' });
    }
    chatOwner = current.username;
  }

  const user = current.isOwner ? await findUser(partner) : await findUser(current.username);
  if (!user || (current.isOwner && user.isOwner)) {
    return res.status(404).json({ error: 'Chat partner not found' });
  }

  const chat = await getChatForUser(chatOwner);
  const messageIndex = chat.findIndex(msg => msg.id === messageId);

  if (messageIndex === -1) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const original = chat[messageIndex];

  if (current.isOwner) {
    // Owner deletion: respect forEveryone to delete globally (affects both owner and user views)
    // We mark the message as deleted (keeps timeline but shows placeholder)
    chat[messageIndex] = Object.assign({}, original, {
      type: 'deleted',
      text: 'Message was deleted',
      unread: false
    });
    await saveChatForUser(chatOwner, chat);
    // inform everyone in that room that message was deleted
    io.to(`room_${chatOwner}`).emit('messageDeleted', { messageId, global: true });
    return res.json({ success: true });
  }

  // Non-owner 'delete for everyone': remove the message from this user's chat entirely
  if (forEveryone) {
    chat.splice(messageIndex, 1);
    await saveChatForUser(chatOwner, chat);
    const target = onlineUsers.get(current.username);
    if (target && target.socketId) {
      io.to(target.socketId).emit('messageDeleted', { messageId, global: false });
    }
    return res.json({ success: true });
  }

  // Non-owner normal delete: hide locally by marking hiddenFrom
  if (!original.hiddenFrom) original.hiddenFrom = [];
  if (!original.hiddenFrom.includes(current.username)) original.hiddenFrom.push(current.username);
  chat[messageIndex] = original;
  await saveChatForUser(chatOwner, chat);
  const target = onlineUsers.get(current.username);
  if (target && target.socketId) {
    io.to(target.socketId).emit('messageDeleted', { messageId, global: false });
  }

  return res.json({ success: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_FOLDER),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${uuidv4()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.originalname, mime: req.file.mimetype });
});

io.use((socket, next) => {
  const sessionID = socket.handshake.auth.sessionId;
  next();
});

const roomName = (username) => `room_${username}`;

const onlineUsers = new Map();

io.on('connection', async (socket) => {
  const { username, isOwner, partner } = socket.handshake.auth;
  if (!username) {
    socket.disconnect(true);
    return;
  }

  const user = await findUser(username);
  if (!user) {
    socket.disconnect(true);
    return;
  }

  if (!isOwner) {
    if (username !== partner) {
      socket.disconnect(true);
      return;
    }
  } else {
    // For owner sockets, partner may be provided (when owner opens a specific chat) or omitted.
    if (partner) {
      const partnerUser = await findUser(partner);
      if (!partnerUser || partner === 'owner') {
        socket.disconnect(true);
        return;
      }
    }
  }

  const room = partner ? roomName(partner) : null;
  if (room) socket.join(room);

  // If owner connected, join them into all user rooms so they receive live messages for all users
  if (isOwner) {
    try {
      const allUsers = await getAllUsers(); // only non-owner users
      for (const u of allUsers) {
        const r = roomName(u.username);
        socket.join(r);
        // notify the room that owner is online
        io.to(r).emit('userOnline', { username });
      }

      // Build unread summary and push unread messages to the owner socket
      const summary = [];
      for (const u of allUsers) {
        const chat = await getChatForUser(u.username);
        const unreadMsgs = chat.filter(m => m.from === u.username && m.unread);
        if (unreadMsgs.length > 0) {
          summary.push({ username: u.username, unreadCount: unreadMsgs.length });
          // emit unread messages to owner socket so they are notified immediately
          for (const msg of unreadMsgs) {
            // send historic flag so client can treat it as already-stored message
            const historic = Object.assign({}, msg, { historic: true });
            socket.emit('message', historic);
          }
        }
      }
      if (summary.length > 0) {
        socket.emit('unreadSummary', { partners: summary });
      }
    } catch (err) {
      console.error('Error while preparing owner rooms/unread summary:', err);
    }
  }

  // Track online status
  onlineUsers.set(username, { socketId: socket.id, partner, isOwner });
  if (room) {
    io.to(room).emit('userOnline', { username });
  }

  socket.on('disconnect', async () => {
    onlineUsers.delete(username);
    if (isOwner) {
      try {
        const allUsers = await getAllUsers();
        for (const u of allUsers) {
          io.to(roomName(u.username)).emit('userOffline', { username });
        }
      } catch (err) {
        console.error('Error emitting owner offline to rooms:', err);
      }
    } else if (room) {
      io.to(room).emit('userOffline', { username });
    }
  });

  socket.on('message', async (data) => {
    const now = new Date().toISOString();
    const message = {
      id: uuidv4(),
      from: username,
      type: data.type || 'text',
      text: data.text || '',
      url: data.url || null,
      filename: data.filename || null,
      mime: data.mime || null,
      timestamp: now,
      unread: true
    };
    const chat = await getChatForUser(partner);
    chat.push(message);
    await saveChatForUser(partner, chat);
    io.to(room).emit('message', message);

    // If owner sent a message to a user, send an email notification (if configured and user has email)
    try {
      if (message.from === 'owner') {
        const recipientUser = await findUser(partner);
        if (recipientUser && recipientUser.email) {
          const subject = `New message from owner`;
          const text = `You have a new message from owner:\n\n${message.text}`;
          const html = `<p>You have a new message from owner:</p><p>${message.text}</p>`;
          await sendEmailNotification(recipientUser.email, subject, text, html);
        }
      }
    } catch (err) {
      console.error('Error sending notification email:', err);
    }
  });

  socket.on('webrtc-offer', (payload) => {
    socket.to(room).emit('webrtc-offer', payload);
  });

  socket.on('webrtc-answer', (payload) => {
    socket.to(room).emit('webrtc-answer', payload);
  });

  socket.on('webrtc-ice-candidate', (payload) => {
    socket.to(room).emit('webrtc-ice-candidate', payload);
  });

  socket.on('typing', () => {
    socket.to(room).emit('typing', { username });
  });

  socket.on('stopTyping', () => {
    socket.to(room).emit('stopTyping', { username });
  });

  socket.on('reaction', async (data) => {
    const { messageId, emoji, action } = data;
    const chat = await getChatForUser(partner);
    const message = chat.find(m => m.id === messageId);
    if (!message) return;
    if (!message.reactions) message.reactions = {};
    if (action === 'add') {
      if (!message.reactions[emoji]) message.reactions[emoji] = [];
      if (!message.reactions[emoji].includes(username)) {
        message.reactions[emoji].push(username);
      }
    } else if (action === 'remove') {
      if (message.reactions[emoji]) {
        message.reactions[emoji] = message.reactions[emoji].filter(u => u !== username);
        if (message.reactions[emoji].length === 0) delete message.reactions[emoji];
      }
    }
    await saveChatForUser(partner, chat);
    io.to(room).emit('reaction', { messageId, emoji, username, action });
  });
});

const PORT = process.env.PORT || 3000;

// Configure email transporter (SMTP / Gmail). Set env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_SERVICE, EMAIL_FROM
let transporter = null;
try {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465,
      secure: process.env.SMTP_PORT ? process.env.SMTP_PORT === '465' : true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else if (process.env.EMAIL_SERVICE && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
} catch (err) {
  console.error('Failed to configure email transporter:', err);
  transporter = null;
}

const sendEmailNotification = async (to, subject, text, html) => {
  if (!transporter || !to) return;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html
    });
  } catch (err) {
    console.error('Failed to send notification email to', to, err);
  }
};

const startServer = async () => {
  if (useMongo) {
    try {
      await initMongoDb();
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('MongoDB connection failed, falling back to JSON storage:', error.message);
      useMongo = false;
    }
  }

  server.listen(PORT, () => {
    console.log(`Chat app running on http://localhost:${PORT}`);
  });
};

process.on('SIGINT', async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

startServer();

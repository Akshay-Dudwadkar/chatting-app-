const loginScreen = document.getElementById('login-screen');
const chatApp = document.getElementById('chat-app');
const chatMain = document.querySelector('.chat-area');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const userList = document.getElementById('user-list');
const sidebarTitle = document.getElementById('sidebar-title');
const ownerInfo = document.querySelector('.owner-info');
const ownerControls = document.querySelector('.owner-controls');
const chatPartnerName = document.getElementById('chat-partner-name');
const chatStatus = document.getElementById('chat-status');
const chatAvatarLetter = document.getElementById('chat-avatar-letter');
const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const callBtn = document.getElementById('call-btn');
const voiceRecordBtn = document.getElementById('voice-record-btn');
const createUserModal = document.getElementById('create-user-modal');
const manageUsersModal = document.getElementById('manage-users-modal');
const userActionsModal = document.getElementById('user-actions-modal');
const changePasswordModal = document.getElementById('change-password-modal');
const createUserForm = document.getElementById('create-user-form');
const manageUserList = document.getElementById('manage-user-list');
const changePasswordForm = document.getElementById('change-password-form');
const actionUsername = document.getElementById('action-username');
const changeUsername = document.getElementById('change-username');
const changePasswordBtn = document.getElementById('change-password-btn');
const deleteChatBtn = document.getElementById('delete-chat-btn');
const deleteUserBtn = document.getElementById('delete-user-btn');
const cancelCreateBtn = document.getElementById('cancel-create');
const closeManageBtn = document.getElementById('close-manage');
const closeActionsBtn = document.getElementById('close-actions');
const cancelChangeBtn = document.getElementById('cancel-change');
const searchBtn = document.getElementById('search-btn');
const messageSearch = document.getElementById('message-search');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const pinnedMessages = document.getElementById('pinned-messages');
const backToListBtn = document.getElementById('back-to-list-btn');
const replyPreview = document.getElementById('reply-preview');
const filePreview = document.getElementById('file-preview');
const emojiBtn = document.getElementById('emoji-btn');
// Sidebar control buttons
const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');
const createUserBtn = document.getElementById('create-user-menu-btn');
const manageUsersBtn = document.getElementById('manage-users-menu-btn');
const darkModeBtn = document.getElementById('dark-mode-menu-btn');
const darkModeIcon = document.getElementById('dark-mode-icon');
const logoutBtn = document.getElementById('logout-menu-btn');
const waModeBtn = document.getElementById('wa-mode-menu-btn');

if (menuBtn && menuDropdown) {
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
  });
  
  document.addEventListener('click', (e) => {
    if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
      menuDropdown.classList.add('hidden');
    }
  });
}

// WhatsApp-like mode toggle
const applyWAMode = (on) => {
  if (on) document.body.classList.add('wa-theme');
  else document.body.classList.remove('wa-theme');
  try { localStorage.setItem('waTheme', on ? '1' : '0'); } catch (e) {}
};

if (waModeBtn) {
  waModeBtn.addEventListener('click', () => {
    const isOn = document.body.classList.toggle('wa-theme');
    // reflect in menu (small visual feedback)
    waModeBtn.classList.toggle('menu-item--active', isOn);
    try { localStorage.setItem('waTheme', isOn ? '1' : '0'); } catch (e) {}
  });
  // initialize from localStorage
  try {
    const pref = localStorage.getItem('waTheme');
    if (pref === '1') applyWAMode(true);
  } catch (e) {}
}

// Emoji picker
const openEmojiPicker = (anchorEl) => {
  if (emojiPickerEl) { emojiPickerEl.remove(); emojiPickerEl = null; return; }
  const emojis = ['😀','😂','😊','😍','👍','🙏','🎉','😮','😢','🔥','✨','🤝'];
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';
  emojis.forEach((e) => {
    const b = document.createElement('button'); b.textContent = e;
    b.addEventListener('click', () => {
      messageInput.value = (messageInput.value + ' ' + e).trim();
      messageInput.focus();
      picker.remove(); emojiPickerEl = null;
    });
    picker.appendChild(b);
  });
  document.body.appendChild(picker);
  emojiPickerEl = picker;
  const rect = anchorEl.getBoundingClientRect();
  picker.style.right = (window.innerWidth - rect.right) + 'px';
  picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
};

if (emojiBtn) {
  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPicker(emojiBtn);
  });
}

let currentUser = null;
let selectedPartner = null;
let socket = null;
let mediaRecorder = null;
let recordedChunks = [];
let inactivityTimer = null;
let typingTimer = null;
let isTyping = false;
let isDarkMode = false;
let pinnedMessageIds = new Set();
let replyTo = null;
let pendingFile = null;
let emojiPickerEl = null;

const insertDateSeparatorIfNeeded = (timestamp) => {
  try {
    const date = new Date(timestamp);
    const dateKey = date.toDateString();
    const lastSep = messagesContainer.querySelector('.date-separator:last-of-type span');
    const lastKey = lastSep ? lastSep.dataset.dateKey : null;
    if (lastKey !== dateKey) {
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      const span = document.createElement('span');
      span.textContent = dateKey;
      span.dataset.dateKey = dateKey;
      sep.appendChild(span);
      messagesContainer.appendChild(sep);
    }
  } catch (e) { /* ignore */ }
};

const showReplyPreview = (message) => {
  if (!replyPreview) return;
  replyPreview.innerHTML = ` <div class="reply-text">Replying to <strong>${message.from}</strong>: ${String(message.text || message.filename || '')}</div><button class="reply-cancel">✕</button>`;
  replyPreview.querySelector('.reply-cancel').addEventListener('click', () => {
    replyTo = null;
    hideElement(replyPreview);
  });
  showElement(replyPreview);
};

const clearReplyPreview = () => {
  replyTo = null;
  if (replyPreview) replyPreview.innerHTML = '';
  hideElement(replyPreview);
};

const showMessageContextMenu = (x, y, message, messageDiv) => {
  // remove existing
  document.querySelectorAll('.message-context-menu').forEach((el) => el.remove());
  const menu = document.createElement('div');
  menu.className = 'message-context-menu';
  const copyBtn = document.createElement('button'); copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(message.text || message.filename || ''); } catch (e) {}
    menu.remove();
  });
  const replyBtn = document.createElement('button'); replyBtn.textContent = 'Reply';
  replyBtn.addEventListener('click', () => {
    replyTo = message; showReplyPreview(message); menu.remove();
  });
  const starBtn = document.createElement('button'); starBtn.textContent = pinnedMessageIds.has(message.id) ? 'Unstar' : 'Star';
  starBtn.addEventListener('click', () => { togglePinMessage(message.id); menu.remove(); });
  const delBtn = document.createElement('button'); delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', async () => { if (confirm('Delete this message?')) await deleteMessage(message.id, false); menu.remove(); });
  const delEveryoneBtn = document.createElement('button'); delEveryoneBtn.textContent = 'Delete for Everyone';
  delEveryoneBtn.addEventListener('click', async () => {
    if (!confirm('Delete this message for everyone?')) return;
    await deleteMessage(message.id, true);
    menu.remove();
  });
  menu.appendChild(copyBtn); menu.appendChild(replyBtn); menu.appendChild(starBtn); menu.appendChild(delBtn); menu.appendChild(delEveryoneBtn);
  document.body.appendChild(menu);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.addEventListener('click', () => menu.remove(), { once: true });
};

const api = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || response.statusText);
  }
  return response.json();
};

const showElement = (el) => el && el.classList.remove('hidden');
const hideElement = (el) => el && el.classList.add('hidden');

const formatTime = (timestamp) => {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '';
  }
};

const resetInactivityTimer = () => {
  // Inactivity logout disabled - users stay logged in
  // if (inactivityTimer) clearTimeout(inactivityTimer);
  // inactivityTimer = setTimeout(() => {
  //   logout();
  // }, 60000);
};

const logout = async () => {
  try {
    await api('/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout failed', error);
  }
  if (socket) socket.disconnect();
  selectedPartner = null;
  currentUser = null;
  hideElement(chatMain); // Hide chat area on logout
  if (inactivityTimer) clearTimeout(inactivityTimer);
  showLogin();
};

const showLogin = () => {
  showElement(loginScreen);
  hideElement(chatApp);
};

const showChatApp = () => {
  hideElement(loginScreen);
  showElement(chatApp);
  hideElement(chatMain); // Hide chat area initially

  if (currentUser?.isOwner) {
    sidebarTitle.textContent = 'Owner Dashboard';
    showElement(ownerInfo);
    showElement(ownerControls);
    document.body.classList.add('owner-mode');
  } else {
    sidebarTitle.textContent = 'Chat with Owner';
    hideElement(ownerInfo);
    hideElement(ownerControls);
    document.body.classList.remove('owner-mode');
  }

  renderSidebar();
  resetInactivityTimer();
  // Ensure socket connection exists for owner (so server can push unread summaries/messages)
  if (currentUser) connectSocket();
};

const setActiveSidebarItem = () => {
  document.querySelectorAll('.user-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.username === selectedPartner);
  });
};

const clearMessages = () => {
  messagesContainer.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">💬</div>
      <h2>Welcome to Chat App</h2>
      <p>Select a user from the sidebar to start a conversation.</p>
    </div>
  `;
};

const createSidebarItem = ({ username, label, unreadCount = 0, hasActions = false }) => {
  const item = document.createElement('div');
  item.className = 'user-item';
  item.dataset.username = username;
  item.innerHTML = `
    <div class="user-avatar">${username.charAt(0).toUpperCase()}</div>
    <div class="user-info">
      <h4>${username === 'owner' ? 'Owner' : username}</h4>
      <p>${label}</p>
    </div>
    ${unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : ''}
    ${hasActions ? `<button class="action-btn" title="Actions">⋯</button>` : ''}
  `;

  item.addEventListener('click', (event) => {
    if (event.target.closest('.action-btn')) return;
    selectPartner(username);
  });

  if (hasActions) {
    const actionButton = item.querySelector('.action-btn');
    if (actionButton) {
      actionButton.addEventListener('click', (event) => {
        event.stopPropagation();
        showUserActions(username);
      });
    }
  }

  return item;
};

const renderSidebar = async () => {
  if (!currentUser) return;
  userList.innerHTML = '';

  try {
    const data = await api('/chat-partners');
    if (!data.partners || data.partners.length === 0) {
      userList.innerHTML = '<p class="sidebar-empty">No users yet. Create a user to start chatting.</p>';
      selectedPartner = null;
      clearMessages();
      return;
    }

    if (currentUser.isOwner) {
      data.partners.forEach((partner) => {
        const item = createSidebarItem({
          username: partner.username,
          label: 'Click to manage',
          unreadCount: partner.unreadCount,
          hasActions: true
        });
        userList.appendChild(item);
      });
      // Auto-open first unread conversation for owner (so messages sent while owner was offline are visible)
      if (!selectedPartner) {
        const firstUnread = data.partners.find(p => p.unreadCount && p.unreadCount > 0);
        if (firstUnread) {
          // small delay to ensure UI is ready
          setTimeout(() => selectPartner(firstUnread.username), 120);
        }
      }
    } else {
      const partner = data.partners[0];
      const item = createSidebarItem({
        username: partner.username,
        label: 'Chat with owner',
        unreadCount: partner.unreadCount,
        hasActions: false
      });
      userList.appendChild(item);
    }

    // Don't automatically select partner on load - let user click to open chat
    setActiveSidebarItem();
  } catch (error) {
    console.error('Unable to load chat partners:', error);
    userList.innerHTML = '<p class="sidebar-empty">Unable to load users.</p>';
  }
};

const selectPartner = async (username) => {
  if (!username || username === selectedPartner) return;
  selectedPartner = username;
  setActiveSidebarItem();
  showElement(chatMain); // Show chat area when partner is selected
  chatPartnerName.textContent = username === 'owner' ? 'Owner' : username;
  chatStatus.textContent = 'Online';
  chatAvatarLetter.textContent = username.charAt(0).toUpperCase();
  messagesContainer.innerHTML = '';
  await loadChat(username);
  connectSocket();
  // If on narrow screens, open chat as a full page (hide sidebar)
  const layout = document.querySelector('.chat-layout');
  if (layout && window.innerWidth <= 1024) {
    layout.classList.add('conversation-full');
    if (backToListBtn) backToListBtn.classList.remove('hidden');
  }
};

if (backToListBtn) {
  backToListBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const layout = document.querySelector('.chat-layout');
    if (layout) layout.classList.remove('conversation-full');
    hideElement(chatMain);
    // keep selectedPartner but show sidebar for selection
    setActiveSidebarItem();
    backToListBtn.classList.add('hidden');
  });
}

// Keep layout responsive: when resizing, ensure mobile widths show full-chat if a partner is selected
const adjustLayoutForWidth = () => {
  const layout = document.querySelector('.chat-layout');
  if (!layout) return;
  if (window.innerWidth <= 1024 && selectedPartner) {
    layout.classList.add('conversation-full');
    if (backToListBtn) backToListBtn.classList.remove('hidden');
    showElement(chatMain);
  } else {
    layout.classList.remove('conversation-full');
    if (backToListBtn) backToListBtn.classList.add('hidden');
    // on wider screens keep chat area visible
    if (selectedPartner) showElement(chatMain);
  }
};

window.addEventListener('resize', adjustLayoutForWidth);
// run once at startup
setTimeout(adjustLayoutForWidth, 50);

const renderMessage = (message) => {
  // avoid rendering duplicates and respect per-user hidden flags
  if (!message || !message.id) return;
  if (message.hiddenFrom && currentUser && message.hiddenFrom.includes(currentUser.username)) return;
  if (messagesContainer.querySelector(`[data-message-id="${message.id}"]`)) return;
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${message.from === currentUser.username ? 'sent' : 'received'}`;
  messageDiv.dataset.messageId = message.id;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (message.type === 'deleted') {
    bubble.textContent = 'Message was deleted';
    bubble.classList.add('deleted-message');
  } else if (message.type === 'text') {
    bubble.textContent = message.text;
  } else if (message.type === 'image' || message.type === 'file') {
    const link = document.createElement('a');
    link.href = message.url;
    link.target = '_blank';
    link.download = message.filename || 'file';
    link.textContent = `${message.type === 'image' ? '🖼️' : '📎'} ${message.filename || message.url}`;
    bubble.appendChild(link);
  } else if (message.type === 'voice') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = message.url;
    audio.style.maxWidth = '240px';
    bubble.appendChild(audio);
  } else if (message.type === 'call') {
    bubble.textContent = `📞 ${message.text}`;
    bubble.style.fontStyle = 'italic';
    bubble.style.opacity = '0.8';
  }

  if (message.type !== 'deleted') {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'message-delete-btn';
    deleteButton.title = 'Delete this message';
    deleteButton.textContent = '🗑️';
    deleteButton.addEventListener('click', async () => {
      if (!confirm('Delete this message?')) return;
        await deleteMessage(message.id, false);
    });
    bubble.appendChild(deleteButton);

    const pinButton = document.createElement('button');
    pinButton.className = 'message-pin-btn pin-btn';
    pinButton.title = pinnedMessageIds.has(message.id) ? 'Unpin message' : 'Pin message';
    pinButton.textContent = pinnedMessageIds.has(message.id) ? '📌' : '📍';
    pinButton.addEventListener('click', () => togglePinMessage(message.id));
    bubble.appendChild(pinButton);

    const reactionButton = document.createElement('button');
    reactionButton.className = 'message-reaction-btn';
    reactionButton.title = 'Add reaction';
    reactionButton.textContent = '😊';
    reactionButton.addEventListener('click', () => showReactionPicker(message.id));
    bubble.appendChild(reactionButton);
    const replyButton = document.createElement('button');
    replyButton.className = 'message-reply-btn';
    replyButton.title = 'Reply';
    replyButton.textContent = '↩️';
    replyButton.addEventListener('click', () => {
      replyTo = message;
      showReplyPreview(message);
    });
    bubble.appendChild(replyButton);
  }

  const reactionsDiv = document.createElement('div');
  reactionsDiv.className = 'message-reactions';
  if (message.reactions) {
    Object.entries(message.reactions).forEach(([emoji, users]) => {
      const reactionSpan = document.createElement('span');
      reactionSpan.className = 'reaction';
      reactionSpan.textContent = `${emoji} ${users.length}`;
      reactionSpan.addEventListener('click', () => toggleReaction(message.id, emoji));
      reactionsDiv.appendChild(reactionSpan);
    });
  }

  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = formatTime(message.timestamp);
  // delivery/read status for sent messages
  if (message.from === currentUser.username) {
    const statusEl = document.createElement('span');
    const status = message.status || 'sent'; // possible: sent, delivered, read
    statusEl.className = `message-status ${status}`;
    let svg = '';
    if (status === 'sent') {
      svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (status === 'delivered') {
      svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/><polyline points="22 6 11 17 6 12"/></svg>';
    } else if (status === 'read') {
      svg = '<svg viewBox="0 0 24 24" fill="none" stroke="#34B7F1" stroke-width="2"><polyline points="20 6 9 17 4 12"/><polyline points="22 6 11 17 6 12"/></svg>';
    }
    statusEl.innerHTML = svg;
    bubble.appendChild(statusEl);
  }

  messageDiv.appendChild(bubble);
  messageDiv.appendChild(reactionsDiv);
  messageDiv.appendChild(time);
  messagesContainer.appendChild(messageDiv);
  // context menu on right-click / long-press
  messageDiv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMessageContextMenu(e.clientX, e.clientY, message, messageDiv);
  });
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

const showReactionPicker = (messageId) => {
  const emojis = ['👍', '❤️', '😂', '😢', '😮', '🎉', '🔥', '✨'];
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  emojis.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      toggleReaction(messageId, emoji);
      picker.remove();
    });
    picker.appendChild(btn);
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => picker.remove());
  picker.appendChild(closeBtn);
  document.body.appendChild(picker);
};

const toggleReaction = (messageId, emoji) => {
  if (!socket) return;
  const messageDiv = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageDiv) return;
  const reactionsDiv = messageDiv.querySelector('.message-reactions');
  const existing = reactionsDiv
    ? Array.from(reactionsDiv.children).find((span) => span.textContent.startsWith(emoji))
    : null;
  const action = existing ? 'remove' : 'add';
  socket.emit('reaction', { messageId, emoji, action });
};

const updateReactionDisplay = (messageId, emoji, action) => {
  const messageDiv = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageDiv) return;
  let reactionsDiv = messageDiv.querySelector('.message-reactions');
  if (!reactionsDiv) {
    reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'message-reactions';
    messageDiv.insertBefore(reactionsDiv, messageDiv.lastElementChild);
  }
  const existing = Array.from(reactionsDiv.children).find((span) => span.textContent.startsWith(emoji));
  if (action === 'add') {
    if (existing) {
      const count = parseInt(existing.textContent.split(' ')[1], 10) + 1;
      existing.textContent = `${emoji} ${count}`;
    } else {
      const reactionSpan = document.createElement('span');
      reactionSpan.className = 'reaction';
      reactionSpan.textContent = `${emoji} 1`;
      reactionSpan.addEventListener('click', () => toggleReaction(messageId, emoji));
      reactionsDiv.appendChild(reactionSpan);
    }
  } else {
    if (existing) {
      const count = parseInt(existing.textContent.split(' ')[1], 10) - 1;
      if (count > 0) {
        existing.textContent = `${emoji} ${count}`;
      } else {
        existing.remove();
      }
    }
  }
};

const loadChat = async (username) => {
  if (!username) return;
  try {
    const data = await api(`/chat/${username}`);
    messagesContainer.innerHTML = '';
    if (!data.chat || data.chat.length === 0) {
      clearMessages();
    } else {
      // render messages with date separators
      let lastDateKey = null;
      data.chat.forEach((msg) => {
        const msgDateKey = new Date(msg.timestamp).toDateString();
        if (msgDateKey !== lastDateKey) {
          const sep = document.createElement('div');
          sep.className = 'date-separator';
          const span = document.createElement('span');
          span.textContent = msgDateKey;
          span.dataset.dateKey = msgDateKey;
          sep.appendChild(span);
          messagesContainer.appendChild(sep);
          lastDateKey = msgDateKey;
        }
        renderMessage(msg);
      });
    }
    updatePinnedMessages();
    await renderSidebar();
  } catch (error) {
    console.error('Failed to load chat:', error);
    clearMessages();
  }
};

const getSocketPartner = () => (currentUser.isOwner ? selectedPartner : currentUser.username);

const connectSocket = () => {
  if (!currentUser || !selectedPartner) return;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io({
    auth: {
      username: currentUser.username,
      isOwner: currentUser.isOwner,
      partner: getSocketPartner()
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection failed:', error);
  });

  socket.on('unreadSummary', (data) => {
    // data.partners = [{ username, unreadCount }]
    console.log('unreadSummary received', data);
    // re-render sidebar to reflect unread counts
    renderSidebar();
  });

  socket.on('message', (message) => {
    insertDateSeparatorIfNeeded(message.timestamp);
    renderMessage(message);
    renderSidebar();
  });

  socket.on('messageDeleted', (payload) => {
    const { messageId, global } = payload || {};
    const messageDiv = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageDiv) return;
    const bubble = messageDiv.querySelector('.message-bubble');
    if (!bubble) return;
    if (global) {
      bubble.textContent = 'Message was deleted';
      bubble.classList.add('deleted-message');
    } else {
      // per-user hide: remove message from this user's view
      messageDiv.remove();
    }
    updatePinnedMessages();
  });

  socket.on('typing', ({ username }) => {
    if (username !== currentUser.username) {
      showTypingIndicator(username);
    }
  });

  socket.on('stopTyping', ({ username }) => {
    if (username !== currentUser.username) {
      hideTypingIndicator();
    }
  });

  socket.on('reaction', ({ messageId, emoji, action }) => {
    updateReactionDisplay(messageId, emoji, action);
  });

  socket.on('userOnline', ({ username }) => {
    if (username !== currentUser.username) {
      updateUserStatus(username, 'Online');
    }
  });

  socket.on('userOffline', ({ username }) => {
    if (username !== currentUser.username) {
      updateUserStatus(username, 'Offline');
    }
  });

  socket.on('userDeleted', ({ username }) => {
    // refresh UI when a user is removed
    renderSidebar();
    if (currentUser.isOwner) loadUsers();
    if (selectedPartner === username) {
      selectedPartner = null; clearMessages();
    }
  });
};

const showTypingIndicator = (username) => {
  chatStatus.textContent = `${username} is typing...`;
};

const hideTypingIndicator = () => {
  chatStatus.textContent = 'Online';
};

const updateUserStatus = (username, status) => {
  if (selectedPartner === username) {
    chatStatus.textContent = status;
  }
};

const togglePinMessage = (messageId) => {
  if (pinnedMessageIds.has(messageId)) {
    pinnedMessageIds.delete(messageId);
  } else {
    pinnedMessageIds.add(messageId);
  }
  updatePinnedMessages();
};

const updatePinnedMessages = () => {
  pinnedMessages.innerHTML = '';
  if (pinnedMessageIds.size === 0) {
    hideElement(pinnedMessages);
    return;
  }

  showElement(pinnedMessages);
  const title = document.createElement('h4');
  title.textContent = 'Pinned Messages';
  pinnedMessages.appendChild(title);

  Array.from(messagesContainer.querySelectorAll('.message')).forEach((messageDiv) => {
    const messageId = messageDiv.dataset.messageId;
    if (!pinnedMessageIds.has(messageId)) return;

    const bubble = messageDiv.querySelector('.message-bubble');
    const time = messageDiv.querySelector('.message-time');
    const pinnedDiv = document.createElement('div');
    pinnedDiv.className = 'pinned-message';
    pinnedDiv.textContent = `${bubble?.textContent || 'Message'} - ${time?.textContent || ''}`;
    pinnedDiv.addEventListener('click', () => {
      messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    pinnedMessages.appendChild(pinnedDiv);
  });
};

const deleteMessage = async (messageId, forEveryone = false) => {
  if (!selectedPartner) return;
  const chatPath = currentUser.isOwner ? selectedPartner : 'owner';
  try {
    await api(`/chat/${chatPath}/message/${messageId}?forEveryone=${forEveryone ? '1' : '0'}`, { method: 'DELETE' });
    const messageDiv = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageDiv) return;
    const bubble = messageDiv.querySelector('.message-bubble');
    if (!bubble) return;
    if (currentUser.isOwner) {
      bubble.textContent = 'Message was deleted';
      bubble.classList.add('deleted-message');
    } else {
      // For non-owner deletions we remove the message from view (delete-for-me semantics)
      messageDiv.remove();
    }
    updatePinnedMessages();
    await renderSidebar();
  } catch (error) {
    alert('Could not delete message: ' + error.message);
  }
};

const startVoiceRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) recordedChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', blob, `voice-${Date.now()}.webm`);
      const upload = await api('/upload', { method: 'POST', body: formData });
      if (socket) {
        socket.emit('message', {
          type: 'voice',
          url: upload.url,
          filename: upload.filename,
          mime: upload.mime,
          text: ''
        });
      }
    };

    mediaRecorder.start();
    voiceRecordBtn.textContent = '⏹️';
  } catch (error) {
    console.error('Voice recording failed:', error);
    alert('Unable to access microphone.');
  }
};

const stopVoiceRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    voiceRecordBtn.textContent = '🎤';
  }
};

const loadUsers = async () => {
  try {
    const data = await api('/users');
    manageUserList.innerHTML = '';
    data.users.forEach((user) => {
      const item = document.createElement('div');
      item.className = 'user-item';
      item.innerHTML = `
        <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
        <div class="user-info">
          <h4>${user.username}</h4>
        </div>
      `;
      item.addEventListener('click', () => showUserActions(user.username));
      manageUserList.appendChild(item);
    });
  } catch (error) {
    console.error('Failed to load users list:', error);
  }
};

const showUserActions = (username) => {
  actionUsername.textContent = username;
  changeUsername.textContent = username;
  showElement(userActionsModal);
};

const removeUserChat = async (username) => {
  if (!confirm(`Delete chat history with ${username}? This cannot be undone.`)) return;
  try {
    await api(`/chat/${username}`, { method: 'DELETE' });
    hideElement(userActionsModal);
    if (selectedPartner === username) {
      selectedPartner = null;
      clearMessages();
    }
    renderSidebar();
  } catch (error) {
    alert('Unable to delete chat history: ' + error.message);
  }
};

const changePassword = async (event) => {
  event.preventDefault();
  const password = document.getElementById('change-password-input').value.trim();
  const username = changeUsername.textContent;
  if (!password) return;
  try {
    await api(`/users/${username}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    hideElement(changePasswordModal);
    changePasswordForm.reset();
  } catch (error) {
    alert('Unable to update password: ' + error.message);
  }
};

const loadSession = async () => {
  try {
    const data = await api('/me');
    if (!data.user) {
      showLogin();
      return;
    }
    currentUser = data.user;
    showChatApp();
    if (currentUser.isOwner) loadUsers();
  } catch (error) {
    showLogin();
  }
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  loginError.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  try {
    const data = await api('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!data.user) {
      throw new Error('Login failed');
    }
    currentUser = data.user;
    showChatApp();
    if (currentUser.isOwner) loadUsers();
  } catch (error) {
    loginError.textContent = error.message || 'Login failed. Please try again.';
  }
});

logoutBtn.addEventListener('click', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  await logout();
});

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!selectedPartner || !socket) return;
  const text = messageInput.value.trim();

  const sendMessage = async () => {
    // send pending file first
    if (pendingFile) {
      const formData = new FormData();
      formData.append('file', pendingFile);
      try {
        const upload = await api('/upload', { method: 'POST', body: formData });
        const type = pendingFile.type.startsWith('image/') ? 'image' : 'file';
        const payload = { type, url: upload.url, filename: upload.filename, mime: upload.mime, text: '' };
        if (replyTo) payload.reply_to = replyTo.id;
        socket.emit('message', payload);
      } catch (error) {
        alert('Failed to upload file: ' + error.message);
      } finally {
        pendingFile = null;
        fileInput.value = '';
        hideElement(filePreview);
      }
    }

    if (text) {
      const payload = { type: 'text', text };
      if (replyTo) payload.reply_to = replyTo.id;
      socket.emit('message', payload);
      messageInput.value = '';
    }

    clearReplyPreview();
    stopTyping();
  };

  sendMessage();
});

fileInput.addEventListener('change', (event) => {
  event.preventDefault();
  event.stopPropagation();
  const file = fileInput.files[0];
  if (!file) return;
  pendingFile = file;
  // show preview
  if (filePreview) {
    filePreview.innerHTML = '';
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.name;
    filePreview.appendChild(name);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      pendingFile = null;
      fileInput.value = '';
      hideElement(filePreview);
    });
    filePreview.appendChild(removeBtn);
    showElement(filePreview);
  }
});

callBtn.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  alert('Voice call feature is not available in this version.');
});

voiceRecordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
  resetInactivityTimer();
});

if (createUserForm) {
  createUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('Create User form submitted');
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value.trim();
    console.log('Username:', username, 'Password length:', password.length);
    
    if (!username || !password) {
      alert('Please enter both username and password');
      return;
    }
    
    try {
      console.log('Sending POST request to /users with username:', username);
      const response = await api('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      console.log('User created successfully:', response);
      hideElement(createUserModal);
      createUserForm.reset();
      await renderSidebar();
      await loadUsers();
      alert('User created successfully!');
    } catch (error) {
      console.error('Failed to create user:', error);
      alert('Failed to create user: ' + error.message);
    }
  });
} else {
  console.warn('Create User form not found');
}

changePasswordBtn.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  hideElement(userActionsModal);
  showElement(changePasswordModal);
});

deleteChatBtn.addEventListener('click', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  await removeUserChat(actionUsername.textContent);
});

cancelCreateBtn.addEventListener('click', () => {
  console.log('Cancel Create button clicked');
  hideElement(createUserModal);
});
closeManageBtn.addEventListener('click', () => hideElement(manageUsersModal));
closeActionsBtn.addEventListener('click', () => hideElement(userActionsModal));
cancelChangeBtn.addEventListener('click', () => hideElement(changePasswordModal));
changePasswordForm.addEventListener('submit', changePassword);

if (deleteUserBtn) {
  deleteUserBtn.addEventListener('click', async (event) => {
    event.preventDefault(); event.stopPropagation();
    const username = actionUsername.textContent;
    if (!username) return;
    if (!confirm(`Delete user ${username}? This will remove the user and their chat history.`)) return;
    try {
      await api(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      hideElement(userActionsModal);
      await renderSidebar();
      await loadUsers();
      if (selectedPartner === username) {
        selectedPartner = null; clearMessages();
      }
      alert('User deleted');
    } catch (err) {
      alert('Unable to delete user: ' + err.message);
    }
  });
}

const stopTyping = () => {
  if (isTyping && socket) {
    socket.emit('stopTyping');
    isTyping = false;
  }
  if (typingTimer) clearTimeout(typingTimer);
};

messageInput.addEventListener('input', () => {
  if (!socket || !selectedPartner) return;
  if (!isTyping) {
    socket.emit('typing');
    isTyping = true;
  }
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => stopTyping(), 1500);
});

messageInput.addEventListener('blur', stopTyping);

const toggleDarkMode = () => {
  isDarkMode = !isDarkMode;
  document.body.classList.toggle('dark-mode', isDarkMode);
  if (darkModeIcon) {
    darkModeIcon.textContent = isDarkMode ? '☀️' : '🌙';
  }
  localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false');
  console.log('Dark Mode:', isDarkMode);
};

const loadDarkModePreference = () => {
  const saved = localStorage.getItem('darkMode');
  if (saved === 'true') {
    isDarkMode = true;
    document.body.classList.add('dark-mode');
    if (darkModeIcon) {
      darkModeIcon.textContent = '☀️';
    }
    console.log('Dark Mode loaded from storage: true');
  } else {
    isDarkMode = false;
    if (darkModeIcon) {
      darkModeIcon.textContent = '🌙';
    }
    console.log('Dark Mode loaded from storage: false');
  }
};

const updateSearchResults = () => {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    hideElement(searchResults);
    return;
  }

  const messages = Array.from(messagesContainer.querySelectorAll('.message'));
  searchResults.innerHTML = '';
  const matches = messages.filter((messageDiv) => {
    const text = messageDiv.querySelector('.message-bubble')?.textContent?.toLowerCase() || '';
    return text.includes(query);
  });

  if (matches.length === 0) {
    hideElement(searchResults);
    return;
  }

  matches.forEach((messageDiv) => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    const bubble = messageDiv.querySelector('.message-bubble');
    const time = messageDiv.querySelector('.message-time');
    item.textContent = `${bubble?.textContent || 'Message'} — ${time?.textContent || ''}`;
    item.addEventListener('click', () => {
      messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    searchResults.appendChild(item);
  });
  showElement(searchResults);
};

searchBtn.addEventListener('click', () => {
  const isVisible = !messageSearch.classList.contains('hidden');
  if (isVisible) {
    hideElement(messageSearch);
    hideElement(searchResults);
    searchInput.value = '';
  } else {
    showElement(messageSearch);
    searchInput.focus();
  }
});

searchInput.addEventListener('input', updateSearchResults);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideElement(messageSearch);
    hideElement(searchResults);
    searchInput.value = '';
  }
});

['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach((eventName) => {
  document.addEventListener(eventName, resetInactivityTimer, true);
});

window.addEventListener('beforeunload', () => {
  if (socket) socket.disconnect();
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (typingTimer) clearTimeout(typingTimer);
});

// Sidebar control button event listeners
if (createUserBtn) {
  createUserBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuDropdown) menuDropdown.classList.add('hidden');
    showElement(createUserModal);
  });
} else {
  console.warn('Create User button not found');
}
if (manageUsersBtn) {
  manageUsersBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuDropdown) menuDropdown.classList.add('hidden');
    showElement(manageUsersModal);
    loadUsers();
  });
}
if (darkModeBtn) {
  darkModeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuDropdown) menuDropdown.classList.add('hidden');
    toggleDarkMode();
  });
} else {
  console.warn('Dark Mode button not found');
}

loadDarkModePreference();
loadSession();
 
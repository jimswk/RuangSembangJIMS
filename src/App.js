import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Pastikan anda menggantikan nilai di bawah dengan URL dan kunci projek Supabase anda
const supabaseUrl = 'https://dboxazfwgecvarghssty.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib3hhemZ3Z2VjdmFyZ2hzc3R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MzUzNDIsImV4cCI6MjA3MDIxMTM0Mn0.KJdFxShrWwV4Vqgf4In9DXLKJWUmHYOrw-X5C8O-YGE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Komponen Modal untuk paparan alert
const Modal = ({ children, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 transform transition-all duration-300 scale-95 hover:scale-100">
        <div className="relative">
          {children}
          <button
            onClick={onClose}
            className="absolute top-0 right-0 -mt-2 -mr-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// Komponen utama aplikasi
const App = () => {
  // States autentikasi
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login', 'register', 'forgot'

  // States aplikasi chat
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);

  // States UI
  const [theme, setTheme] = useState('light');
  const [fontSize, setFontSize] = useState(16);
  const [activeTab, setActiveTab] = useState('channels'); // 'channels' or 'dms'
  const [selectedDMUser, setSelectedDMUser] = useState(null);

  // States fungsi chat
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);
  const [messageInfo, setMessageInfo] = useState(null);
  const [showMessageInfoModal, setShowMessageInfoModal] = useState(false);

  // Ref untuk auto-scroll
  const chatWindowRef = useRef(null);
  const prevMessageCount = useRef(0);

  // Listener autentikasi Supabase
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsAdmin(session.user.email?.endsWith('@imi.gov.my') || false);
      }
      setIsAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Listener untuk semua pengguna (untuk DM)
  useEffect(() => {
    if (isAuthReady && user) {
      const fetchUsers = async () => {
        const { data, error } = await supabase.from('users').select('*');
        if (error) console.error(error);
        setUsers(data || []);
      };
      
      fetchUsers();

      // Realtime listener untuk jadual users
      const userSubscription = supabase
        .channel('public:users')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
          fetchUsers();
        })
        .subscribe();

      return () => supabase.removeChannel(userSubscription);
    }
  }, [isAuthReady, user]);

  // Listener untuk saluran
  useEffect(() => {
    if (isAuthReady && user) {
      const fetchChannels = async () => {
        const { data, error } = await supabase.from('channels').select('*');
        if (error) console.error(error);
        setChannels(data || []);
      };
      
      fetchChannels();

      // Realtime listener untuk jadual channels
      const channelSubscription = supabase
        .channel('public:channels')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, payload => {
          fetchChannels();
        })
        .subscribe();

      return () => supabase.removeChannel(channelSubscription);
    }
  }, [isAuthReady, user]);

  // Listener untuk mesej dalam saluran atau DM yang dipilih
  useEffect(() => {
    setMessages([]);
    if (user && isAuthReady) {
      const fetchMessages = async () => {
        let query = supabase.from('messages').select('*').order('created_at', { ascending: true });
        
        if (activeTab === 'channels' && selectedChannel) {
          query = query.eq('channel_id', selectedChannel.id);
        } else if (activeTab === 'dms' && selectedDMUser) {
          const chatId = [user.id, selectedDMUser.id].sort().join('_');
          query = query.eq('dm_chat_id', chatId);
        } else {
          return;
        }

        const { data, error } = await query;
        if (error) console.error(error);
        setMessages(data || []);
      };

      fetchMessages();

      // Realtime listener untuk mesej
      let messageSubscription;
      if (activeTab === 'channels' && selectedChannel) {
        messageSubscription = supabase
          .channel('messages_channel')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${selectedChannel.id}` }, payload => {
            fetchMessages();
          })
          .subscribe();
      } else if (activeTab === 'dms' && selectedDMUser) {
        const chatId = [user.id, selectedDMUser.id].sort().join('_');
        messageSubscription = supabase
          .channel('messages_dm')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `dm_chat_id=eq.${chatId}` }, payload => {
            fetchMessages();
          })
          .subscribe();
      }

      return () => {
        if (messageSubscription) {
          supabase.removeChannel(messageSubscription);
        }
      };
    }
  }, [selectedChannel, selectedDMUser, activeTab, isAuthReady, user]);

  // Kesan untuk notifikasi mesej baharu dan auto-scroll
  useEffect(() => {
    if (messages.length > prevMessageCount.current && chatWindowRef.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.sender_id !== user?.id) {
        showNotification(`Mesej baru dari ${lastMessage.sender_name} di ${selectedChannel?.name || selectedDMUser?.display_name}`);
      }
    }
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
    prevMessageCount.current = messages.length;
  }, [messages, selectedChannel, selectedDMUser, user]);

  // Kesan untuk tema dan saiz fon
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') || 'light';
    const storedFontSize = localStorage.getItem('fontSize') || 16;
    setTheme(storedTheme);
    setFontSize(parseInt(storedFontSize));
    document.documentElement.className = storedTheme;
  }, []);

  // Listener untuk mesej yang dipin
  useEffect(() => {
    if (selectedChannel && user) {
      const fetchPinnedMessages = async () => {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('channel_id', selectedChannel.id)
          .eq('pinned', true);

        if (error) console.error(error);
        setPinnedMessages(data || []);
      };
      
      fetchPinnedMessages();
      
      const pinSubscription = supabase
        .channel('pinned_messages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${selectedChannel.id}` }, payload => {
          fetchPinnedMessages();
        })
        .subscribe();

      return () => supabase.removeChannel(pinSubscription);

    } else {
      setPinnedMessages([]);
    }
  }, [selectedChannel, user]);

  // Fungsi autentikasi
  const handleAuth = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        
        // Simpan data pengguna ke jadual 'users'
        const role = email.endsWith('@imi.gov.my') ? 'admin' : 'user';
        await supabase.from('users').insert({
          id: data.user.id,
          email: data.user.email,
          display_name: data.user.email?.split('@')[0],
          role,
          created_at: new Date()
        });
        showNotification('Pendaftaran berjaya! Sila semak email anda untuk pengesahan.');
      } else if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showNotification('Login berjaya! Selamat kembali.');
      } else if (authMode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        showNotification('Pautan tetapan semula kata laluan telah dihantar ke email anda.');
      }
      setIsAuthModalOpen(false);
    } catch (error) {
      showNotification(`Ralat: ${error.message}`);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      showNotification('Anda telah log keluar.');
      setSelectedChannel(null);
      setSelectedDMUser(null);
    } catch (error) {
      showNotification(`Ralat: ${error.message}`);
    }
  };

  const handleDeleteMessage = (msg) => {
    setMessageToDelete(msg);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (messageToDelete && user) {
      try {
        const { error } = await supabase.from('messages').delete().eq('id', messageToDelete.id);
        if (error) throw error;
        showNotification('Mesej telah dipadam.');
      } catch (error) {
        showNotification(`Ralat memadam mesej: ${error.message}`);
      }
      setMessageToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const handlePinMessage = async (msg) => {
    if (activeTab !== 'channels') {
      showNotification('Pin hanya tersedia di saluran.');
      return;
    }
    try {
      const { error } = await supabase
        .from('messages')
        .update({ pinned: !msg.pinned })
        .eq('id', msg.id);
      if (error) throw error;
    } catch (error) {
      showNotification(`Ralat memin mesej: ${error.message}`);
    }
  };

  const handleStarMessage = async (msg) => {
    if (!user) return;
    const currentStarredBy = msg.starred_by || [];
    const isStarred = currentStarredBy.includes(user.id);
    const newStarredBy = isStarred
      ? currentStarredBy.filter(id => id !== user.id)
      : [...currentStarredBy, user.id];
    
    try {
      const { error } = await supabase
        .from('messages')
        .update({ starred_by: newStarredBy })
        .eq('id', msg.id);
      if (error) throw error;
    } catch (error) {
      showNotification(`Ralat menanda bintang mesej: ${error.message}`);
    }
  };

  // Fungsi chat
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || (!selectedChannel && !selectedDMUser) || !user) return;

    const messageData = {
      sender_id: user.id,
      sender_name: users.find(u => u.id === user.id)?.display_name || user.email?.split('@')[0],
      text: input,
      image_url: null,
      replied_to: replyingTo ? {
        id: replyingTo.id,
        sender_name: replyingTo.senderName,
        text: replyingTo.text
      } : null,
      reactions: {},
      edited: false
    };

    try {
      if (editingMessage) {
        await supabase
          .from('messages')
          .update({ text: input, edited: true })
          .eq('id', editingMessage.id);
        setEditingMessage(null);
      } else {
        if (activeTab === 'channels' && selectedChannel) {
          await supabase.from('messages').insert([{ ...messageData, channel_id: selectedChannel.id }]);
        } else if (activeTab === 'dms' && selectedDMUser) {
          const chatId = [user.id, selectedDMUser.id].sort().join('_');
          await supabase.from('messages').insert([{ ...messageData, dm_chat_id: chatId }]);
        }
      }

      setInput('');
      setReplyingTo(null);
    } catch (error) {
      showNotification(`Ralat menghantar mesej: ${error.message}`);
    }
  };

  // Fungsi cipta saluran (hanya untuk admin)
  const createChannel = async (e) => {
    e.preventDefault();
    const channelName = e.target.channelName.value;
    const channelDesc = e.target.channelDesc.value;

    if (!isAdmin) {
      showNotification('Hanya admin boleh mencipta saluran.');
      return;
    }
    if (!channelName.trim() || !channelDesc.trim()) {
      showNotification('Nama saluran dan deskripsi tidak boleh kosong.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('channels')
        .insert([{
          name: channelName,
          description: channelDesc,
          creator_id: user.id
        }])
        .select();

      if (error) throw error;

      await supabase.from('messages').insert([{
        sender_id: 'system',
        sender_name: 'Sistem',
        text: `Saluran "${channelName}" telah dicipta. Deskripsi: "${channelDesc}".`,
        channel_id: data[0].id,
      }]);
      showNotification('Saluran baru berjaya dicipta.');
      setShowChannelModal(false);
    } catch (error) {
      console.error('Error creating channel:', error.message);
      showNotification(`Ralat: ${error.message}`);
    }
  };

  const showNotification = (msg) => {
    setModalMessage(msg);
    setShowModal(true);
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.className = newTheme;
  };

  const handleFontSizeChange = (newSize) => {
    setFontSize(newSize);
    localStorage.setItem('fontSize', newSize);
  };

  const handleSelectDMUser = async (dmUser) => {
    if (dmUser.id === user.id) {
      showNotification('Anda tidak boleh menghantar DM kepada diri sendiri.');
      return;
    }
    setActiveTab('dms');
    setSelectedDMUser(dmUser);
    setSelectedChannel(null);

    // Cipta private chat jika belum wujud
    const chatId = [user.id, dmUser.id].sort().join('_');
    const { data } = await supabase.from('private_chats').select('id').eq('id', chatId);
    if (!data || data.length === 0) {
      await supabase.from('private_chats').insert({ id: chatId });
    }
  };

  const handleSelectChannel = (channel) => {
    setActiveTab('channels');
    setSelectedChannel(channel);
    setSelectedDMUser(null);
  };

  const handleForwardMessage = (msg) => {
    setMessageToForward(msg);
    setShowForwardModal(true);
  };

  const performForward = async (targetId, type) => {
    if (!messageToForward || !user) return;

    const messageData = {
      sender_id: user.id,
      sender_name: users.find(u => u.id === user.id)?.display_name || user.email?.split('@')[0],
      text: `(Maju dari ${messageToForward.sender_name}): ${messageToForward.text}`,
      image_url: null,
      replied_to: null,
      reactions: {},
      edited: false
    };

    try {
      if (type === 'channel') {
        await supabase.from('messages').insert([{ ...messageData, channel_id: targetId }]);
      } else if (type === 'dm') {
        const chatId = [user.id, targetId].sort().join('_');
        await supabase.from('messages').insert([{ ...messageData, dm_chat_id: chatId }]);
      }
      showNotification('Mesej berjaya dimajukan!');
      setShowForwardModal(false);
      setMessageToForward(null);
    } catch (error) {
      showNotification(`Ralat memajukan mesej: ${error.message}`);
    }
  };

  const handleEditMessage = (msg) => {
    setEditingMessage(msg);
    setInput(msg.text);
    setReplyingTo(null);
  };

  const handleReact = async (msg, emoji) => {
    const currentReactions = msg.reactions || {};
    const newReactions = { ...currentReactions };
    newReactions[emoji] = (newReactions[emoji] || 0) + 1;
    
    try {
      const { error } = await supabase
        .from('messages')
        .update({ reactions: newReactions })
        .eq('id', msg.id);
      if (error) throw error;
    } catch (error) {
      showNotification(`Ralat menambah reaksi: ${error.message}`);
    }
  };
  
  // Modal autentikasi
  const AuthModal = () => (
    <Modal onClose={() => setIsAuthModalOpen(false)}>
      <h2 className="text-2xl font-bold mb-4 text-center text-gray-900 dark:text-white">
        {authMode === 'login' && 'Log Masuk'}
        {authMode === 'register' && 'Daftar Akaun'}
        {authMode === 'forgot' && 'Lupa Kata Laluan'}
      </h2>
      <form onSubmit={handleAuth} className="space-y-4">
        <div>
          <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Alamat Email</label>
          <input
            type="email"
            name="email"
            className="w-full px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        {authMode !== 'forgot' && (
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Kata Laluan</label>
            <input
              type="password"
              name="password"
              className="w-full px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        )}
        <button
          type="submit"
          className="w-full py-3 rounded-xl text-white font-bold bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          {authMode === 'login' && 'Log Masuk'}
          {authMode === 'register' && 'Daftar'}
          {authMode === 'forgot' && 'Hantar Pautan Tetapan Semula'}
        </button>
      </form>
      <div className="mt-4 text-center">
        {authMode === 'login' && (
          <>
            <button onClick={() => setAuthMode('register')} className="text-sm text-blue-500 hover:underline">
              Belum ada akaun? Daftar
            </button>
            <span className="mx-2 text-gray-400">|</span>
            <button onClick={() => setAuthMode('forgot')} className="text-sm text-blue-500 hover:underline">
              Lupa Kata Laluan?
            </button>
          </>
        )}
        {authMode !== 'login' && (
          <button onClick={() => setAuthMode('login')} className="text-sm text-blue-500 hover:underline">
            Kembali ke Log Masuk
          </button>
        )}
      </div>
    </Modal>
  );

  const DeleteConfirmModal = () => (
    <Modal onClose={() => setShowDeleteConfirm(false)}>
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Padam Mesej</h3>
        <p className="text-gray-600 dark:text-gray-300">Adakah anda pasti mahu memadam mesej ini?</p>
        <div className="mt-6 flex justify-center space-x-4">
          <button
            onClick={confirmDelete}
            className="px-6 py-2 rounded-xl text-white font-bold bg-red-600 hover:bg-red-700 transition-colors"
          >
            Padam
          </button>
          <button
            onClick={() => {
              setMessageToDelete(null);
              setShowDeleteConfirm(false);
            }}
            className="px-6 py-2 rounded-xl text-gray-900 dark:text-white font-bold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Batal
          </button>
        </div>
      </div>
    </Modal>
  );

  const ForwardModal = () => (
    <Modal onClose={() => setShowForwardModal(false)}>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 text-center">Majukan Mesej</h3>
      <p className="text-gray-600 dark:text-gray-300 mb-4">Pilih saluran atau pengguna untuk memajukan mesej ini:</p>

      <div className="space-y-2">
        <h4 className="font-semibold">Saluran</h4>
        {channels.map(channel => (
          <button
            key={channel.id}
            onClick={() => performForward(channel.id, 'channel')}
            className="w-full text-left p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            # {channel.name}
          </button>
        ))}

        <h4 className="font-semibold mt-4">Pengguna</h4>
        {users.filter(u => u.id !== user.id).map(dmUser => (
          <button
            key={dmUser.id}
            onClick={() => performForward(dmUser.id, 'dm')}
            className="w-full text-left p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {dmUser.display_name}
          </button>
        ))}
      </div>
    </Modal>
  );

  const MessageInfoModal = () => (
    <Modal onClose={() => setShowMessageInfoModal(false)}>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 text-center">Maklumat Mesej</h3>
      {messageInfo && (
        <div className="space-y-2 text-gray-700 dark:text-gray-300">
          <p><strong>ID Mesej:</strong> {messageInfo.id}</p>
          <p><strong>Pengirim:</strong> {messageInfo.sender_name}</p>
          <p><strong>Waktu:</strong> {new Date(messageInfo.created_at).toLocaleString()}</p>
          {messageInfo.edited && <p className="text-sm text-blue-500">Mesej ini telah disunting.</p>}
          {messageInfo.replied_to && (
            <p><strong>Balas kepada:</strong> {messageInfo.replied_to.sender_name}</p>
          )}
          {Object.keys(messageInfo.reactions || {}).length > 0 && (
            <div>
              <strong>Reaksi:</strong>
              <div className="flex space-x-2 mt-1">
                {Object.entries(messageInfo.reactions).map(([emoji, count]) => (
                  <span key={emoji} className="bg-gray-200 dark:bg-gray-700 rounded-full px-2 py-1 text-sm">{emoji} {count}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );

  const ReactionPicker = ({ msg, onReact, onClose }) => {
    const emojis = ['🤣', '🤫', '🙈', '👎', '👏', '🙏', '💖', '👍'];
    return (
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-white dark:bg-gray-700 rounded-full shadow-lg flex space-x-2">
        {emojis.map(emoji => (
          <button
            key={emoji}
            onClick={() => { onReact(msg, emoji); onClose(); }}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  };

  // UI utama aplikasi chat
  const ChatAppUI = () => (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-inter">
      {/* Sidebar untuk saluran dan DM */}
      <div className="flex flex-col w-1/4 min-w-[250px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold text-blue-600">JIMS Chat</h1>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">Selamat datang, {users.find(u => u.id === user.id)?.display_name || user?.email?.split('@')[0]} ({isAdmin ? 'Admin' : 'Pengguna Biasa'})</p>
          <p className="text-xs mt-1 text-gray-400 dark:text-gray-500 truncate">UserID: {user?.id}</p>
        </div>

        {/* Tabs untuk saluran dan DM */}
        <div className="flex justify-around p-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => handleSelectChannel(null)}
            className={`flex-1 p-2 font-semibold text-center rounded-xl transition-colors ${activeTab === 'channels' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
          >
            Saluran
          </button>
          <button
            onClick={() => handleSelectDMUser(null)}
            className={`flex-1 p-2 font-semibold text-center rounded-xl transition-colors ${activeTab === 'dms' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
          >
            Mesej Peribadi
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'channels' && (
            channels.map((channel) => (
              <div
                key={channel.id}
                onClick={() => handleSelectChannel(channel)}
                className={`p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  selectedChannel?.id === channel.id ? 'bg-blue-100 dark:bg-blue-900 border-l-4 border-blue-600' : ''
                }`}
              >
                <h3 className="text-lg font-semibold">{channel.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{channel.description}</p>
              </div>
            ))
          )}
          {activeTab === 'dms' && (
            users.filter(u => u.id !== user.id).map((dmUser) => (
              <div
                key={dmUser.id}
                onClick={() => handleSelectDMUser(dmUser)}
                className={`p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  selectedDMUser?.id === dmUser.id ? 'bg-blue-100 dark:bg-blue-900 border-l-4 border-blue-600' : ''
                }`}
              >
                <h3 className="text-lg font-semibold">{dmUser.display_name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{dmUser.email}</p>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col space-y-2">
          {isAdmin && (
            <button
              onClick={() => setShowChannelModal(true)}
              className="w-full py-2 px-4 rounded-xl text-white font-semibold bg-green-600 hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Cipta Saluran</span>
            </button>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full py-2 px-4 rounded-xl text-white font-semibold bg-gray-500 hover:bg-gray-600 transition-colors flex items-center justify-center space-x-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.39a2 2 0 0 0 .73 2.73l.15.08a2 2 0 0 1 1 1.73v.55a2 2 0 0 1-1 1.73l-.15.08a2 2 0 0 0-.73 2.73l.22.39a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.73v-.55a2 2 0 0 1 1-1.73l.15-.08a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <span>Tetapan</span>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full py-2 px-4 rounded-xl text-white font-semibold bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            <span>Log Keluar</span>
          </button>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {selectedChannel || selectedDMUser ? (
          <>
            {/* Chat header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
              <h2 className="text-xl font-bold">{selectedChannel?.name || selectedDMUser?.display_name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedChannel?.description || selectedDMUser?.email}</p>
              {activeTab === 'channels' && pinnedMessages.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-800 rounded-xl flex items-center space-x-2 text-sm text-gray-800 dark:text-gray-200">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L10 12L2 14L12 16L14 24L16 14L24 12L14 10L12 2Z"/></svg>
                  <span className="font-semibold">Mesej yang Dipin:</span>
                  <span className="truncate">{pinnedMessages[0].text}</span>
                </div>
              )}
            </div>

            {/* Message area */}
            <div ref={chatWindowRef} className="flex-1 overflow-y-auto p-4 space-y-4" style={{ fontSize: `${fontSize}px` }}>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  user={user}
                  onReply={setReplyingTo}
                  onDelete={() => handleDeleteMessage(msg)}
                  onEdit={() => handleEditMessage(msg)}
                  onForward={() => handleForwardMessage(msg)}
                  onInfo={() => { setMessageInfo(msg); setShowMessageInfoModal(true); }}
                  onPin={() => handlePinMessage(msg)}
                  onStar={() => handleStarMessage(msg)}
                  onReact={handleReact}
                  activeTab={activeTab}
                  selectedChannel={selectedChannel}
                  selectedDMUser={selectedDMUser}
                  users={users}
                />
              ))}
            </div>

            {/* Message input box */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              {replyingTo && (
                <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded-t-xl mb-2 relative">
                  <p className="text-sm font-semibold text-blue-600 dark:text-blue-300">Balas kepada {replyingTo.sender_name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{replyingTo.text}</p>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="absolute top-1 right-1 text-gray-500 hover:text-red-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              )}
              {editingMessage && (
                <div className="bg-blue-200 dark:bg-blue-700 p-2 rounded-t-xl mb-2 relative">
                  <p className="text-sm font-semibold text-white">Menyunting mesej...</p>
                  <button
                    onClick={() => { setEditingMessage(null); setInput(''); }}
                    className="absolute top-1 right-1 text-white hover:text-red-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              )}
              <form onSubmit={sendMessage} className="flex space-x-2 items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Hantar mesej..."
                  style={{ fontSize: `${fontSize}px` }}
                />
                <button
                  type="submit"
                  className={`bg-blue-600 text-white p-3 rounded-xl shadow-lg transition-colors ${editingMessage ? 'hover:bg-green-700' : 'hover:bg-blue-700'}`}
                >
                  {editingMessage ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"/><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-gray-500 dark:text-gray-400">
            <div>
              <p className="text-xl font-bold mb-2">Pilih saluran atau pengguna untuk mula bersembang.</p>
              <p className="text-md">Gunakan panel di sebelah kiri untuk memilih saluran atau pengguna.</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal untuk mencipta saluran (admin sahaja) */}
      {showChannelModal && isAdmin && (
        <Modal onClose={() => setShowChannelModal(false)}>
          <h2 className="text-2xl font-bold mb-4 text-center text-gray-900 dark:text-white">Cipta Saluran Baru</h2>
          <form onSubmit={createChannel} className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Nama Saluran</label>
              <input type="text" name="channelName" className="w-full px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Deskripsi</label>
              <textarea name="channelDesc" className="w-full px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" required></textarea>
            </div>
            <button type="submit" className="w-full py-3 rounded-xl text-white font-bold bg-green-600 hover:bg-green-700 transition-colors">Cipta</button>
          </form>
        </Modal>
      )}

      {/* Modal tetapan */}
      {isSettingsOpen && (
        <Modal onClose={() => setIsSettingsOpen(false)}>
          <h2 className="text-2xl font-bold mb-4 text-center text-gray-900 dark:text-white">Tetapan</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tema</p>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`px-4 py-2 rounded-xl font-semibold transition-colors ${theme === 'light' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
                >
                  Mod Cerah
                </button>
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`px-4 py-2 rounded-xl font-semibold transition-colors ${theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
                >
                  Mod Gelap
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Saiz Teks</p>
              <input
                type="range"
                min="14"
                max="20"
                value={fontSize}
                onChange={(e) => handleFontSizeChange(e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <p className="text-center text-sm mt-1">{fontSize}px</p>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal notifikasi */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Notifikasi</h3>
            <p className="text-gray-600 dark:text-gray-300">{modalMessage}</p>
          </div>
        </Modal>
      )}

      {/* Modal pengesahan padam */}
      {showDeleteConfirm && <DeleteConfirmModal />}

      {/* Modal majukan mesej */}
      {showForwardModal && <ForwardModal />}

      {/* Modal info mesej */}
      {showMessageInfoModal && <MessageInfoModal />}
    </div>
  );

  // Komponen gelembung mesej
  const MessageBubble = ({ msg, user, onReply, onDelete, onEdit, onForward, onInfo, onPin, onStar, onReact, activeTab, users }) => {
    const isSender = msg.sender_id === user?.id;
    const [showContextMenu, setShowContextMenu] = useState(false);
    const contextMenuRef = useRef(null);
    const isStarred = msg.starred_by?.includes(user?.id);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const sender = users.find(u => u.id === msg.sender_id);
    const senderName = sender ? sender.display_name : 'Sistem';

    const handleContextMenu = (e) => {
      e.preventDefault();
      setShowContextMenu(true);
      setShowReactionPicker(false);
    };

    const toggleReactionPicker = (e) => {
      e.stopPropagation();
      setShowReactionPicker(!showReactionPicker);
    };

    const handleCopy = () => {
      const el = document.createElement('textarea');
      el.value = msg.text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showNotification('Mesej disalin ke papan keratan!');
      setShowContextMenu(false);
    };

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
          setShowContextMenu(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [contextMenuRef]);

    return (
      <div
        className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => onReact(msg, '👍')}
        onTouchStart={(e) => {
          const timer = setTimeout(() => handleContextMenu(e), 500);
          e.currentTarget.addEventListener('touchend', () => clearTimeout(timer), { once: true });
        }}
      >
        <div className={`flex flex-col max-w-[70%] ${isSender ? 'items-end' : 'items-start'}`}>
          {msg.replied_to && (
            <div className={`text-xs p-2 rounded-t-xl mb-1 ${isSender ? 'bg-blue-200 dark:bg-blue-700' : 'bg-gray-200 dark:bg-gray-700'}`}>
              <p className="font-semibold text-blue-600 dark:text-blue-300">Balas kepada {msg.replied_to.sender_name}</p>
              <p className="text-gray-600 dark:text-gray-300 truncate">{msg.replied_to.text}</p>
            </div>
          )}
          <div className={`p-4 rounded-3xl relative shadow-md transition-all duration-200
            ${isSender ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none'}
            ${msg.sender_id === 'system' ? 'bg-yellow-200 text-gray-800 dark:bg-yellow-800 dark:text-gray-200' : ''}`}>
            {msg.sender_id !== 'system' && (
              <p className={`font-semibold text-sm mb-1 ${isSender ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
                {senderName}
              </p>
            )}
            <p>{msg.text}</p>
            <div className="flex justify-end items-center text-xs text-opacity-80 mt-1">
              {msg.edited && <span className="italic mr-2 text-gray-300 dark:text-gray-500">(disunting)</span>}
              {isStarred && <span className="mr-1 text-yellow-400">★</span>}
              {msg.pinned && <span className="mr-1 text-red-500">📌</span>}
              <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
            </div>
            {Object.keys(msg.reactions || {}).length > 0 && (
              <div className="absolute -bottom-3 right-0 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full shadow-md text-xs">
                {Object.entries(msg.reactions).map(([emoji, count]) => (
                  <span key={emoji} className="mr-1">{emoji} {count}</span>
                ))}
              </div>
            )}
          </div>
          {/* Context Menu */}
          {showContextMenu && (
            <div ref={contextMenuRef} className="absolute z-10 bg-white dark:bg-gray-700 rounded-xl shadow-lg mt-1 overflow-hidden">
              <ul className="text-sm text-gray-700 dark:text-gray-200">
                <li onClick={() => { onReply(msg); setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">Balas</li>
                <li onClick={() => { handleCopy(); setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">Salin</li>
                <li onClick={() => { onForward(msg); setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">Majukan</li>
                <li onClick={() => { onInfo(); setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">Info Mesej</li>
                <li onClick={() => { onStar(msg); setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">{isStarred ? 'Unstar' : 'Star'}</li>
                <li onClick={toggleReactionPicker} className="relative px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                  React
                  {showReactionPicker && <ReactionPicker msg={msg} onReact={onReact} onClose={() => { setShowReactionPicker(false); setShowContextMenu(false); }} />}
                </li>
                {isSender && (
                  <>
                    <li onClick={() => { onEdit(msg); setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">Sunting</li>
                    <li onClick={() => { onDelete(msg); setShowContextMenu(false); }} className="px-4 py-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 cursor-pointer">Padam</li>
                  </>
                )}
                {activeTab === 'channels' && (
                  <li onClick={() => { onPin(msg); setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">{msg.pinned ? 'Unpin' : 'Pin'}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render UI berdasarkan status autentikasi
  if (!isAuthReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <div className="p-8 max-w-sm w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl text-center">
          <h1 className="text-3xl font-bold text-blue-600 mb-4">Selamat Datang ke JIMS Chat</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6">Sila log masuk untuk meneruskan.</p>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="w-full py-3 rounded-xl text-white font-bold bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            Mula
          </button>
        </div>
        {isAuthModalOpen && <AuthModal />}
      </div>
    );
  }

  return <ChatAppUI />;
};

export default App;

import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  signInWithCustomToken,
  signInAnonymously,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
} from 'firebase/firestore';

// IMPORTANT: Use the global variables for Firebase configuration and authentication
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Tailwind CSS is assumed to be available
// For lucide-react icons, we'll use inline SVGs as a fallback

// Komponen Modal yang bergaya sebagai pengganti alert()
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
  // State untuk autentikasi
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login', 'register', 'forgot'

  // State untuk aplikasi sembang
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // State untuk UI
  const [theme, setTheme] = useState('light');
  const [fontSize, setFontSize] = useState(16);

  // State untuk fitur chat
  const [replyingTo, setReplyingTo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);

  // Ref untuk auto-scroll dan mengesan mesej baru
  const chatWindowRef = useRef(null);
  const prevMessageCount = useRef(0);

  // Listener untuk status autentikasi
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase Auth error:", error);
      }
    };
    initAuth();

    const unsub = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        setIsAdmin(authUser.email?.endsWith('@imi.gov.my') || false); // Handle anonymous users
        // Simpan UID dan peran di Firestore saat login
        const userRef = doc(db, 'users', authUser.uid);
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
          const role = authUser.email?.endsWith('@imi.gov.my') ? 'admin' : 'user';
          await setDoc(userRef, {
            email: authUser.email,
            displayName: authUser.email?.split('@')[0] || `Pengguna ${authUser.uid.substring(0, 8)}`,
            role,
            createdAt: serverTimestamp(),
          });
        }
      }
      setIsAuthReady(true);
    });
    return unsub;
  }, []);

  // Listener untuk saluran (channels)
  useEffect(() => {
    if (isAuthReady && user) {
      const q = query(collection(db, 'channels'));
      const unsub = onSnapshot(q, (snapshot) => {
        setChannels(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      });
      return unsub;
    }
  }, [isAuthReady, user]);

  // Listener untuk mesej dalam saluran yang dipilih
  useEffect(() => {
    if (selectedChannel && isAuthReady && user) {
      const messagesRef = collection(db, 'channels', selectedChannel.id, 'messages');
      const q = query(messagesRef);
      const unsub = onSnapshot(q, (snapshot) => {
        setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return unsub;
    } else {
      setMessages([]);
    }
  }, [selectedChannel, isAuthReady, user]);

  // Efek untuk notifikasi mesej baru dan auto-scroll
  useEffect(() => {
    if (messages.length > prevMessageCount.current && chatWindowRef.current) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.senderId !== user?.uid) {
            showNotification(`Mesej baru dari ${lastMessage.senderName} di ${selectedChannel?.name}`);
        }
    }
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
    prevMessageCount.current = messages.length;
  }, [messages, selectedChannel, user]);

  // Efek untuk tema dan saiz teks
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') || 'light';
    const storedFontSize = localStorage.getItem('fontSize') || 16;
    setTheme(storedTheme);
    setFontSize(parseInt(storedFontSize));
    document.documentElement.className = storedTheme;
  }, []);

  // Fungsi autentikasi
  const handleAuth = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      if (authMode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userRef = doc(db, 'users', userCredential.user.uid);
        const role = email.endsWith('@imi.gov.my') ? 'admin' : 'user';
        await setDoc(userRef, {
          email,
          displayName: email.split('@')[0],
          role,
          createdAt: serverTimestamp()
        });
        showNotification('Pendaftaran berjaya! Selamat datang.');
      } else if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        showNotification('Login berjaya! Selamat kembali.');
      } else if (authMode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        showNotification('Pautan tetapan semula kata laluan telah dihantar ke email anda.');
      }
      setIsAuthModalOpen(false);
    } catch (error) {
      showNotification(`Ralat: ${error.message}`);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showNotification('Anda telah log keluar.');
      setSelectedChannel(null);
    } catch (error) {
      showNotification(`Ralat: ${error.message}`);
    }
  };
  
  const handleDeleteMessage = (msg) => {
    setMessageToDelete(msg);
    setShowDeleteConfirm(true);
  };
  
  const confirmDelete = async () => {
    if (messageToDelete && selectedChannel) {
      try {
        await deleteDoc(doc(db, 'channels', selectedChannel.id, 'messages', messageToDelete.id));
        showNotification('Mesej telah dipadam.');
      } catch (error) {
        showNotification(`Ralat memadam mesej: ${error.message}`);
      }
      setMessageToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  // Fungsi chat
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedChannel || !user) return;

    await addDoc(collection(db, 'channels', selectedChannel.id, 'messages'), {
      senderId: user.uid,
      senderName: user.email?.split('@')[0] || `Pengguna ${user.uid.substring(0, 8)}`,
      text: input,
      timestamp: serverTimestamp(),
      repliedTo: replyingTo ? {
        id: replyingTo.id,
        senderName: replyingTo.senderName,
        text: replyingTo.text
      } : null,
      reactions: {}
    });

    setInput('');
    setReplyingTo(null);
  };

  // Fungsi membuat saluran (hanya untuk admin)
  const createChannel = async (e) => {
    e.preventDefault();
    const channelName = e.target.channelName.value;
    const channelDesc = e.target.channelDesc.value;

    if (!channelName.trim()) {
      showNotification('Nama saluran tidak boleh kosong.');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'channels'), {
        name: channelName,
        description: channelDesc,
        creatorId: user.uid,
        createdAt: serverTimestamp()
      });
      // Tambah mesej notifikasi pertama dalam saluran baru
      await addDoc(collection(db, 'channels', docRef.id, 'messages'), {
        senderId: 'system',
        senderName: 'Sistem',
        text: `Saluran "${channelName}" telah dicipta. Deskripsi: "${channelDesc}".`,
        timestamp: serverTimestamp(),
      });
      showNotification('Saluran baru berjaya dicipta.');
      setShowChannelModal(false);
    } catch (error) {
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

  // Komponen untuk paparan autentikasi
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

  // Komponen paparan utama
  const ChatAppUI = () => (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-inter">
      {/* Sidebar untuk Senarai Saluran */}
      <div className="flex flex-col w-1/4 min-w-[250px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold text-blue-600">JIMS Chat</h1>
          <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">Selamat datang, {user?.email?.split('@')[0] || `Pengguna ${user?.uid?.substring(0, 8)}`} ({isAdmin ? 'Admin' : 'Pengguna Biasa'})</p>
          <p className="text-xs mt-1 text-gray-400 dark:text-gray-500 truncate">UserID: {user?.uid}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {channels.map((channel) => (
            <div
              key={channel.id}
              onClick={() => setSelectedChannel(channel)}
              className={`p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                selectedChannel?.id === channel.id ? 'bg-blue-100 dark:bg-blue-900 border-l-4 border-blue-600' : ''
              }`}
            >
              <h3 className="text-lg font-semibold">{channel.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{channel.description}</p>
            </div>
          ))}
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

      {/* Kawasan perbualan utama */}
      <div className="flex-1 flex flex-col">
        {selectedChannel ? (
          <>
            {/* Header chat */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
              <h2 className="text-xl font-bold">{selectedChannel.name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedChannel.description}</p>
            </div>
            
            {/* Ruang mesej */}
            <div ref={chatWindowRef} className="flex-1 overflow-y-auto p-4 space-y-4" style={{ fontSize: `${fontSize}px` }}>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  user={user}
                  onReply={setReplyingTo}
                  onDelete={() => handleDeleteMessage(msg)}
                  onReact={async (emoji) => {
                    const messageRef = doc(db, 'channels', selectedChannel.id, 'messages', msg.id);
                    const currentReactions = msg.reactions || {};
                    const newReactions = { ...currentReactions };
                    newReactions[emoji] = (newReactions[emoji] || 0) + 1;
                    await updateDoc(messageRef, { reactions: newReactions });
                  }}
                />
              ))}
            </div>

            {/* Kotak input mesej */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              {replyingTo && (
                <div className="bg-gray-200 dark:bg-gray-700 p-2 rounded-t-xl mb-2 relative">
                  <p className="text-sm font-semibold text-blue-600">Balas kepada {replyingTo.senderName}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{replyingTo.text}</p>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="absolute top-1 right-1 text-gray-500 hover:text-red-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              )}
              <form onSubmit={sendMessage} className="flex space-x-2">
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
                  className="bg-blue-600 text-white p-3 rounded-xl shadow-lg hover:bg-blue-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-gray-500 dark:text-gray-400">
            <div>
              <p className="text-xl font-bold mb-2">Pilih saluran untuk mula bersembang.</p>
              <p className="text-md">Gunakan panel di sebelah kiri untuk memilih saluran atau mencipta yang baru.</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal untuk Cipta Saluran (hanya admin) */}
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

      {/* Modal untuk Tetapan */}
      {isSettingsOpen && (
        <Modal onClose={() => setIsSettingsOpen(false)}>
          <h2 className="text-2xl font-bold mb-4 text-center text-gray-900 dark:text-white">Tetapan</h2>
          <div className="space-y-4">
            {/* Tukar Tema */}
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
            {/* Tukar Saiz Teks */}
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
      
      {/* Modal pengesahan padam mesej */}
      {showDeleteConfirm && <DeleteConfirmModal />}
    </div>
  );

  // Komponen bubble mesej
  const MessageBubble = ({ msg, user, onReply, onDelete, onReact }) => {
    const isSender = msg.senderId === user?.uid;
    const [showContextMenu, setShowContextMenu] = useState(false);
    const contextMenuRef = useRef(null);

    const handleContextMenu = (e) => {
      e.preventDefault();
      setShowContextMenu(true);
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
        onDoubleClick={() => onReact('👍')}
        onTouchStart={(e) => {
          // Touch long press detection
          const timer = setTimeout(() => handleContextMenu(e), 500);
          e.currentTarget.addEventListener('touchend', () => clearTimeout(timer), { once: true });
        }}
      >
        <div className={`flex flex-col max-w-[70%] ${isSender ? 'items-end' : 'items-start'}`}>
          {msg.repliedTo && (
            <div className={`text-xs p-2 rounded-t-xl mb-1 ${isSender ? 'bg-blue-200 dark:bg-blue-700' : 'bg-gray-200 dark:bg-gray-700'}`}>
              <p className="font-semibold text-blue-600 dark:text-blue-300">Balas kepada {msg.repliedTo.senderName}</p>
              <p className="text-gray-600 dark:text-gray-300 truncate">{msg.repliedTo.text}</p>
            </div>
          )}
          <div className={`p-4 rounded-3xl relative shadow-md transition-all duration-200
            ${isSender ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none'}
            ${msg.senderId === 'system' ? 'bg-yellow-200 text-gray-800 dark:bg-yellow-800 dark:text-gray-200' : ''}`}>
            {msg.senderId !== 'system' && (
              <p className={`font-semibold text-sm mb-1 ${isSender ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
                {msg.senderName}
              </p>
            )}
            <p>{msg.text}</p>
            <p className="text-right text-xs text-opacity-80 mt-1">{msg.timestamp?.toDate().toLocaleTimeString()}</p>
            {Object.keys(msg.reactions || {}).length > 0 && (
              <div className="absolute -bottom-3 right-0 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full shadow-md text-xs">
                {Object.entries(msg.reactions).map(([emoji, count]) => (
                  <span key={emoji} className="mr-1">{emoji} {count}</span>
                ))}
              </div>
            )}
          </div>
          {/* Konteks Menu */}
          {showContextMenu && (
            <div ref={contextMenuRef} className="absolute z-10 bg-white dark:bg-gray-700 rounded-xl shadow-lg mt-1 overflow-hidden">
              <ul className="text-sm text-gray-700 dark:text-gray-200">
                <li onClick={() => { onReply(msg); setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">Balas</li>
                <li onClick={() => { /* copy logic */ setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">Salin</li>
                <li onClick={() => { /* forward logic */ setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">Majukan</li>
                <li onClick={() => { onReact('👍'); setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">React 👍</li>
                {isSender && (
                  <>
                    <li onClick={() => { /* edit logic */ setShowContextMenu(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">Sunting</li>
                    <li onClick={() => { onDelete(msg); setShowContextMenu(false); }} className="px-4 py-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 cursor-pointer">Padam</li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Paparkan UI yang sesuai berdasarkan status autentikasi
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

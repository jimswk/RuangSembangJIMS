import { useState, useEffect, useRef } from 'react';

// Import modul Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, serverTimestamp, arrayUnion } from 'firebase/firestore';

// PENTING: Gunakan konfigurasi Firebase yang disediakan oleh pengguna
const firebaseConfig = {
    apiKey: "AIzaSyA_OzSlTUylaTIHn44br1QeOfFzXN7Wx9E",
    authDomain: "ruangsembangjims.firebaseapp.com",
    projectId: "ruangsembangjims",
    storageBucket: "ruangsembangjims.firebasestorage.app",
    messagingSenderId: "691618255078",
    appId: "1:691618255078:web:017c9188daa37626a62b27",
    measurementId: "G-55XLKBYFYB"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Hooks untuk persistensi tema dan saiz fon
const useDarkMode = () => {
    const [isDarkMode, setDarkMode] = useState(() => {
        const savedMode = localStorage.getItem('theme');
        return savedMode === 'dark' || (savedMode === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    const toggleDarkMode = () => setDarkMode(!isDarkMode);
    return [isDarkMode, toggleDarkMode];
};

const useFontSize = () => {
    const [fontSize, setFontSize] = useState(() => {
        const savedSize = localStorage.getItem('fontSize');
        return savedSize || '16px';
    });

    useEffect(() => {
        document.documentElement.style.fontSize = fontSize;
        localStorage.setItem('fontSize', fontSize);
    }, [fontSize]);

    return [fontSize, setFontSize];
};

// Komponen Toast Notification
const Toast = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
    };

    return (
        <div className={`fixed top-5 right-5 p-4 rounded-md shadow-lg text-white z-50 ${colors[type]}`}>
            {message}
        </div>
    );
};

// Komponen popup
const Modal = ({ title, children, onClose }) => {
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
            <div className="relative p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800 dark:text-white transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="mt-3 text-center">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                        {title}
                    </h3>
                    <div className="mt-2">
                        {children}
                    </div>
                    <div className="items-center px-4 py-3">
                        <button
                            id="ok-btn"
                            className="px-4 py-2 bg-indigo-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            onClick={onClose}
                        >
                            OK
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Komponen Utama Aplikasi
export default function App() {
    const [user, setUser] = useState(null);
    const [isAuthReady, setAuthReady] = useState(false);
    const [view, setView] = useState('login'); // 'login', 'register', 'forgot'
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [activeChannel, setActiveChannel] = useState(null);
    const [isDarkMode, toggleDarkMode] = useDarkMode();
    const [fontSize, setFontSize] = useFontSize();
    const [isSettingsOpen, setSettingsOpen] = useState(false);

    // Dapatkan token auth
    useEffect(() => {
        const initAuth = async () => {
            const firebaseConfig = JSON.parse(__firebase_config);
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const db = getFirestore(app);
            
            try {
                if (typeof __initial_auth_token !== 'undefined') {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Firebase auth error:", error);
            }
        };

        const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
            if (authUser) {
                // Simpan pengguna ke Firestore jika baru
                const userRef = doc(db, 'artifacts', appId, 'public', 'users', authUser.uid);
                const userSnap = await getDoc(userRef);
                if (!userSnap.exists()) {
                    await setDoc(userRef, {
                        uid: authUser.uid,
                        email: authUser.email,
                        displayName: authUser.email ? authUser.email.split('@')[0] : 'Pengguna',
                        createdAt: serverTimestamp(),
                        role: authUser.email && authUser.email.endsWith('@imi.gov.my') ? 'admin' : 'user'
                    });
                }
                setUser({
                    ...authUser,
                    role: authUser.email && authUser.email.endsWith('@imi.gov.my') ? 'admin' : 'user'
                });
                setLoading(false);
                setAuthReady(true);
            } else {
                setUser(null);
                setLoading(false);
                setAuthReady(true);
            }
        });

        if (typeof __initial_auth_token !== 'undefined' || typeof __firebase_config !== 'undefined') {
            initAuth();
        } else {
            console.log("Global variables not available, proceeding with local auth.");
            // Handle local auth if global vars are not available
        }
        
        return () => unsubscribe();
    }, []);

    if (loading) {
        return <div className="flex items-center justify-center min-h-screen dark:bg-gray-900 text-gray-800 dark:text-gray-200">Memuatkan...</div>;
    }

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setUser(null);
            showToast("Berjaya log keluar!", "success");
            setView('login');
        } catch (error) {
            showToast("Gagal log keluar: " + error.message, "error");
        }
    };

    if (!user) {
        return <AuthView setView={setView} view={view} showToast={showToast} />;
    }

    return (
        <div className={`flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200`} style={{ fontSize }}>
            <Sidebar
                user={user}
                activeChannel={activeChannel}
                setActiveChannel={setActiveChannel}
                handleLogout={handleLogout}
                showToast={showToast}
                setSettingsOpen={setSettingsOpen}
            />
            {activeChannel ? (
                <ChatWindow
                    user={user}
                    activeChannel={activeChannel}
                    showToast={showToast}
                />
            ) : (
                <div className="flex-1 flex items-center justify-center text-center p-4">
                    <div className="text-xl font-semibold text-gray-500 dark:text-gray-400">
                        Pilih saluran untuk mula bersembang.
                    </div>
                </div>
            )}
            {isSettingsOpen && (
                <SettingsModal
                    onClose={() => setSettingsOpen(false)}
                    isDarkMode={isDarkMode}
                    toggleDarkMode={toggleDarkMode}
                    fontSize={fontSize}
                    setFontSize={setFontSize}
                />
            )}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}

// Komponen Log Masuk / Daftar / Lupa Katalaluan
const AuthView = ({ setView, view, showToast }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("Berjaya log masuk!", "success");
        } catch (error) {
            showToast("Gagal log masuk: " + error.message, "error");
            setModal({ title: "Ralat Log Masuk", message: "E-mel atau kata laluan tidak sah." });
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            showToast("Berjaya mendaftar! Sila log masuk.", "success");
            setView('login');
        } catch (error) {
            showToast("Gagal mendaftar: " + error.message, "error");
            setModal({ title: "Ralat Pendaftaran", message: error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, email);
            showToast("E-mel penetapan kata laluan telah dihantar.", "success");
            setModal({ title: "Berjaya", message: "Sila semak peti masuk e-mel anda." });
        } catch (error) {
            showToast("Gagal menghantar e-mel: " + error.message, "error");
            setModal({ title: "Ralat", message: error.message });
        } finally {
            setLoading(false);
        }
    };

    const renderForm = () => {
        switch (view) {
            case 'register':
                return (
                    <form onSubmit={handleRegister} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mel" required className="w-full p-3 rounded-lg bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Kata Laluan" required className="w-full p-3 rounded-lg bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button type="submit" className="w-full p-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition" disabled={loading}>Daftar</button>
                    </form>
                );
            case 'forgot':
                return (
                    <form onSubmit={handleResetPassword} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mel" required className="w-full p-3 rounded-lg bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button type="submit" className="w-full p-3 rounded-lg bg-yellow-500 text-white font-semibold hover:bg-yellow-600 transition" disabled={loading}>Hantar E-mel</button>
                    </form>
                );
            default: // login
                return (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mel" required className="w-full p-3 rounded-lg bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Kata Laluan" required className="w-full p-3 rounded-lg bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button type="submit" className="w-full p-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition" disabled={loading}>Log Masuk</button>
                    </form>
                );
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
            <div className="w-full max-w-sm p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg transform transition-all hover:shadow-xl">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ruang Sembang JIMS</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        {view === 'login' && 'Sila log masuk ke akaun anda.'}
                        {view === 'register' && 'Daftar akaun baru untuk bermula.'}
                        {view === 'forgot' && 'Masukkan e-mel anda untuk menetapkan semula kata laluan.'}
                    </p>
                </div>
                {renderForm()}
                <div className="mt-6 text-center space-y-2">
                    {view !== 'login' && <button onClick={() => setView('login')} className="text-sm text-indigo-600 hover:underline">Log Masuk</button>}
                    {view !== 'register' && <button onClick={() => setView('register')} className="block text-sm text-indigo-600 hover:underline">Daftar Akaun</button>}
                    {view !== 'forgot' && <button onClick={() => setView('forgot')} className="block text-sm text-indigo-600 hover:underline">Lupa Kata Laluan?</button>}
                </div>
            </div>
            {modal && <Modal title={modal.title} onClose={() => setModal(null)}>{modal.message}</Modal>}
        </div>
    );
};

// Komponen Panel Sisi (Sidebar)
const Sidebar = ({ user, activeChannel, setActiveChannel, handleLogout, setSettingsOpen, showToast }) => {
    const [channels, setChannels] = useState([]);
    const [activeUsers, setActiveUsers] = useState([]);
    const [isCreateChannelOpen, setCreateChannelOpen] = useState(false);

    useEffect(() => {
        // Ambil senarai saluran
        const channelsRef = collection(db, 'artifacts', appId, 'public', 'data', 'channels');
        const unsubscribeChannels = onSnapshot(channelsRef, (snapshot) => {
            const fetchedChannels = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setChannels(fetchedChannels);
        }, (error) => console.error("Error fetching channels:", error));

        // Ambil senarai pengguna aktif
        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
        const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
            const fetchedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setActiveUsers(fetchedUsers);
        }, (error) => console.error("Error fetching users:", error));

        return () => {
            unsubscribeChannels();
            unsubscribeUsers();
        };
    }, []);

    return (
        <div className="flex flex-col w-full md:w-1/4 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700 mb-4">
                <div className="flex items-center">
                    <img src={`https://placehold.co/40x40/d1d5db/374151?text=${user.displayName.charAt(0).toUpperCase()}`} alt="User" className="w-10 h-10 rounded-full" />
                    <div className="ml-3">
                        <h2 className="font-semibold text-lg">{user.displayName}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.role === 'admin' ? 'Admin' : 'Pengguna Biasa'}</p>
                    </div>
                </div>
                <div className="flex space-x-2">
                    <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 12a2 2 0 110-4 2 2 0 010 4zm-9-6a2 2 0 114 0 2 2 0 01-4 0zm14 0a2 2 0 114 0 2 2 0 01-4 0z"></path></svg>
                    </button>
                    <button onClick={handleLogout} className="p-2 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900 transition">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M11 6a2 2 0 11-4 0 2 2 0 014 0zM14 9a2 2 0 11-4 0 2 2 0 014 0zM12 12a2 2 0 11-4 0 2 2 0 014 0zM9 15a2 2 0 11-4 0 2 2 0 014 0zM7 18a2 2 0 11-4 0 2 2 0 014 0zM4 9a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    </button>
                </div>
            </div>
            {user.role === 'admin' && (
                <div className="mb-4">
                    <button onClick={() => setCreateChannelOpen(true)} className="w-full p-3 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 transition flex items-center justify-center">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"></path></svg>
                        Buat Saluran Baru
                    </button>
                </div>
            )}
            <div className="flex-1 overflow-y-auto mb-4 custom-scrollbar">
                <h3 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase mb-2">Senarai Saluran</h3>
                <ul className="space-y-2">
                    {channels.map(channel => (
                        <li key={channel.id} onClick={() => setActiveChannel(channel)} className={`cursor-pointer p-3 rounded-lg transition ${activeChannel?.id === channel.id ? 'bg-indigo-100 dark:bg-indigo-700 text-indigo-800 dark:text-white font-semibold' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                            #{channel.name}
                        </li>
                    ))}
                </ul>
                <h3 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase mt-4 mb-2">Pengguna Aktif ({activeUsers.length})</h3>
                <ul className="space-y-2">
                    {activeUsers.map(u => (
                        <li key={u.id} className="flex items-center p-3 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                             <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                             {u.displayName}
                        </li>
                    ))}
                </ul>
            </div>
            {isCreateChannelOpen && <CreateChannelModal user={user} onClose={() => setCreateChannelOpen(false)} showToast={showToast} />}
        </div>
    );
};

// Komponen Ruang Sembang (ChatWindow)
const ChatWindow = ({ user, activeChannel, showToast }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const chatEndRef = useRef(null);
    const [replyTo, setReplyTo] = useState(null);
    const [isMenuOpen, setMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [selectedMessage, setSelectedMessage] = useState(null);

    useEffect(() => {
        // Ambil mesej dari saluran
        if (activeChannel) {
            const messagesRef = collection(db, 'artifacts', appId, 'public', 'data', 'channels', activeChannel.id, 'messages');
            const q = query(messagesRef);
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const sortedMessages = fetchedMessages.sort((a, b) => a.createdAt?.toMillis() - b.createdAt?.toMillis());
                setMessages(sortedMessages);
            }, (error) => console.error("Error fetching messages:", error));
            return () => unsubscribe();
        }
    }, [activeChannel]);

    useEffect(() => {
        // Autoscroll ke bawah bila ada mesej baru
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const messagesRef = collection(db, 'artifacts', appId, 'public', 'data', 'channels', activeChannel.id, 'messages');
        try {
            const messageData = {
                text: newMessage,
                sender: user.displayName,
                senderId: user.uid,
                createdAt: serverTimestamp(),
                replyTo: replyTo ? { text: replyTo.text, sender: replyTo.sender } : null
            };
            await addDoc(messagesRef, messageData);
            setNewMessage('');
            setReplyTo(null);
        } catch (error) => {
            showToast("Gagal hantar mesej: " + error.message, "error");
        }
    };

    const handleDeleteMessage = async (messageId) => {
        setMenuOpen(false);
        const messageRef = doc(db, 'artifacts', appId, 'public', 'data', 'channels', activeChannel.id, 'messages', messageId);
        try {
            await deleteDoc(messageRef);
            showToast("Mesej berjaya dipadam.", "success");
        } catch (error) {
            showToast("Gagal padam mesej: " + error.message, "error");
        }
    };

    const handleReplyClick = (message) => {
        setMenuOpen(false);
        setReplyTo(message);
    };
    
    const handleRightClick = (e, message) => {
        e.preventDefault();
        setMenuPosition({ x: e.clientX, y: e.clientY });
        setSelectedMessage(message);
        setMenuOpen(true);
    };

    return (
        <div className="flex flex-col flex-1 bg-gray-50 dark:bg-gray-900">
            {/* Header Sembang */}
            <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex-1">
                    <h3 className="font-bold text-lg">#{activeChannel.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Saluran ini diwujudkan oleh {activeChannel.creatorName}</p>
                </div>
            </div>
            {/* Kawasan Mesej */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {activeChannel.description && (
                    <div className="text-center text-gray-500 dark:text-gray-400 italic p-2 rounded-lg bg-gray-200 dark:bg-gray-700">
                        {activeChannel.description}
                    </div>
                )}
                {messages.map(msg => (
                    <div 
                        key={msg.id} 
                        className={`flex ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}
                        onContextMenu={(e) => handleRightClick(e, msg)}
                    >
                        <div className={`p-3 rounded-2xl max-w-sm relative group cursor-pointer ${
                            msg.senderId === user.uid ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none'
                        }`}>
                            {msg.replyTo && (
                                <div className={`text-sm opacity-75 italic mb-1 border-l-4 pl-2 ${msg.senderId === user.uid ? 'border-white' : 'border-indigo-600'}`}>
                                    Balas kepada {msg.replyTo.sender}: {msg.replyTo.text}
                                </div>
                            )}
                            <p className="font-semibold">{msg.sender}</p>
                            <p>{msg.text}</p>
                            <span className="text-xs opacity-50 block mt-1">
                                {msg.createdAt?.toDate().toLocaleTimeString()}
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={chatEndRef}></div>
            </div>
            {/* Menu Kontekstual */}
            {isMenuOpen && (
                <div 
                    className="fixed z-50 bg-white dark:bg-gray-700 rounded-lg shadow-xl py-2 w-48"
                    style={{ top: menuPosition.y, left: menuPosition.x }}
                    onMouseLeave={() => setMenuOpen(false)}
                >
                    <button onClick={() => handleReplyClick(selectedMessage)} className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600">
                        Balas
                    </button>
                    {selectedMessage.senderId === user.uid && (
                        <button onClick={() => handleDeleteMessage(selectedMessage.id)} className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 text-red-500">
                            Padam
                        </button>
                    )}
                </div>
            )}
            {/* Kotak Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                {replyTo && (
                    <div className="flex items-center justify-between p-2 mb-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                        <div className="flex-1">
                            <p className="text-sm italic text-gray-500 dark:text-gray-400">Membalas kepada {replyTo.sender}:</p>
                            <p className="text-sm truncate">{replyTo.text}</p>
                        </div>
                        <button onClick={() => setReplyTo(null)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"></path></svg>
                        </button>
                    </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Taip mesej..."
                        className="flex-1 p-3 rounded-l-2xl bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="submit" className="p-3 bg-indigo-600 text-white rounded-r-2xl font-semibold hover:bg-indigo-700 transition">
                        Hantar
                    </button>
                </form>
            </div>
        </div>
    );
};

// Modal Buat Saluran Baru (hanya untuk Admin)
const CreateChannelModal = ({ onClose, user, showToast }) => {
    const [channelName, setChannelName] = useState('');
    const [description, setDescription] = useState('');
    const [modal, setModal] = useState(null);

    const handleCreateChannel = async (e) => {
        e.preventDefault();
        if (!channelName.trim()) return;

        const channelsRef = collection(db, 'artifacts', appId, 'public', 'data', 'channels');
        try {
            await addDoc(channelsRef, {
                name: channelName,
                description: description,
                creatorId: user.uid,
                creatorName: user.displayName,
                createdAt: serverTimestamp(),
            });
            onClose();
            showToast(`Saluran #${channelName} berjaya dicipta!`, "success");
        } catch (error) {
            showToast("Gagal mencipta saluran: " + error.message, "error");
            setModal({ title: "Ralat", message: error.message });
        }
    };

    return (
        <Modal title="Buat Saluran Baru" onClose={onClose}>
            <form onSubmit={handleCreateChannel} className="space-y-4 text-left">
                <div>
                    <label className="block text-sm font-medium">Nama Saluran</label>
                    <input type="text" value={channelName} onChange={(e) => setChannelName(e.target.value)} required className="w-full p-2 mt-1 rounded-lg bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Deskripsi</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-2 mt-1 rounded-lg bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500">Batal</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Cipta</button>
                </div>
            </form>
            {modal && <Modal title={modal.title} onClose={() => setModal(null)}>{modal.message}</Modal>}
        </Modal>
    );
};

// Modal Tetapan
const SettingsModal = ({ onClose, isDarkMode, toggleDarkMode, fontSize, setFontSize }) => {
    const handleFontSizeChange = (e) => {
        setFontSize(e.target.value);
    };

    return (
        <Modal title="Tetapan" onClose={onClose}>
            <div className="space-y-4 text-left">
                <div className="flex items-center justify-between">
                    <span className="font-medium">Mod Gelap</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={isDarkMode} onChange={toggleDarkMode} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                </div>
                <div>
                    <label htmlFor="font-size" className="block text-sm font-medium mb-2">Saiz Teks</label>
                    <select id="font-size" value={fontSize} onChange={handleFontSizeChange} className="w-full p-2 rounded-lg bg-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="14px">Kecil</option>
                        <option value="16px">Sederhana</option>
                        <option value="18px">Besar</option>
                    </select>
                </div>
            </div>
        </Modal>
    );
};



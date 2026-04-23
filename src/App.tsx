/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Plus, 
  MessageSquare, 
  Settings, 
  LogOut, 
  User as UserIcon, 
  Lock, 
  Shield, 
  CreditCard, 
  Menu, 
  X,
  Zap,
  Sparkles,
  Bot
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  doc as firestoreDoc,
  updateDoc
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { User, Chat, Message } from './types';

// --- Initialization ---
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [view, setView] = useState<'chat' | 'auth' | 'admin' | 'subscription'>('auth');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFbUser(user);
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            setCurrentUser(userData);
            // Dynamic redirection based on status
            if (view === 'auth') {
              setView(userData.subscriptionActive ? 'chat' : 'subscription');
            }
          }
        } catch (err) {
          console.error("Auth status sync error:", err);
        }
      } else {
        setFbUser(null);
        setCurrentUser(null);
        setView('auth');
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, [view]); // Minimal safe dependency

  useEffect(() => {
    if (currentUser?.uid) {
      const q = query(collection(db, 'chats'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const chatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setChats(chatList);
      });
      return () => unsubscribe();
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentChatId) {
      const q = query(collection(db, 'chats', currentChatId, 'messages'), orderBy('createdAt', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setMessages(msgList);
      });
      return () => unsubscribe();
    } else {
      setMessages([]);
    }
  }, [currentChatId]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
        if (settingsDoc.exists()) {
          setSystemPrompt(settingsDoc.data().systemPrompt);
        } else {
          const defaultPrompt = "أنت PromptLogic، مساعد ذكي متطور مصمم لمساعدة المستخدمين في حل المشكلات المعقدة والبرمجة والرد على الاستفسارات بدقة واحترافية عالية. لغتك الأساسية هي العربية.";
          setSystemPrompt(defaultPrompt);
          await setDoc(doc(db, 'settings', 'global'), { systemPrompt: defaultPrompt });
        }
      } catch (err) {
        console.error("Settings fetch error:", err);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleGoogleAuth = async () => {
    if (isAuthProcessing) return;
    setIsAuthProcessing(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (!userDoc.exists()) {
        const userData: User = {
          uid: user.uid,
          username: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          isAdmin: false,
          subscriptionActive: false,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', user.uid), userData);
        setCurrentUser(userData);
      } else {
        setCurrentUser(userDoc.data() as User);
      }
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        alert("خطأ في الإعداد: يجب تفعيل وسيلة الدخول (Google) في لوحة تحكم Firebase.\n\nيرجى فتح الرابط التالي وتفعيل Google:\nhttps://console.firebase.google.com/project/gen-lang-client-0917459304/authentication/providers");
      } else {
        alert("Google Sign-In Failed: " + err.message);
      }
    } finally {
      setIsAuthProcessing(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Auth Triggered - Mode:", authMode);
    
    if (isAuthProcessing) return;
    
    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const username = authMode === 'signup' ? (form.elements.namedItem('username') as HTMLInputElement).value : '';

    if (!email || !password || (authMode === 'signup' && !username)) {
      alert("Please fill in all required fields.");
      return;
    }

    if (authMode === 'signup' && username.length < 3) {
      alert("Username must be at least 3 characters.");
      return;
    }

    setIsAuthProcessing(true);

    try {
      if (authMode === 'signup') {
        console.log("Creating user account...");
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const user = result.user;
        console.log("Account created in Auth. UID:", user.uid);

        const userData: User = {
          uid: user.uid,
          username,
          email,
          isAdmin: false,
          subscriptionActive: false,
          createdAt: new Date().toISOString() // Using ISO string for better client-side reliability during signup
        };

        console.log("Creating user document in Firestore...");
        await setDoc(doc(db, 'users', user.uid), userData);
        console.log("User document created successfully.");
        
        setCurrentUser(userData);
        setView('subscription');
      } else {
        console.log("Logging in...");
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user = result.user;
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setCurrentUser(userDoc.data() as User);
        } else {
          console.warn("User logged in but profile doc missing.");
          // Create a recovery doc if missing
          const recoverData: User = {
            uid: user.uid,
            username: user.email?.split('@')[0] || 'User',
            email: user.email || '',
            isAdmin: false,
            subscriptionActive: false,
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'users', user.uid), recoverData);
          setCurrentUser(recoverData);
        }
      }
    } catch (err: any) {
      console.error("Critical Auth Error:", err);
      let errorMsg = `خطأ في التوثيق: ${err.message}`;

      if (err.code === 'auth/operation-not-allowed') {
        errorMsg = "خطأ في الإعداد: يجب تفعيل وسيلة الدخول في لوحة تحكم Firebase.\n\nيرجى فتح الرابط التالي وتفعيل (Email/Password) أو (Google):\nhttps://console.firebase.google.com/project/gen-lang-client-0917459304/authentication/providers";
      } else if (err.code === 'auth/invalid-credential') {
        errorMsg = "بيانات الدخول غير صحيحة. يرجى التأكد من البريد الإلكتروني وكلمة المرور، أو محاولة إنشاء حساب جديد إذا لم تكن تملك واحداً.";
      } else if (err.code === 'auth/email-already-in-use') {
        errorMsg = "هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.";
      } else if (err.code === 'auth/weak-password') {
        errorMsg = "كلمة المرور ضعيفة جداً. يرجى اختيار كلمة مرور أطول وأكثر تعقيداً.";
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = "صيغة البريد الإلكتروني غير صحيحة.";
      }

      alert(errorMsg);
      setIsAuthProcessing(false);
    } finally {
      // Don't set isAuthProcessing(false) if we've successfully moved screens, 
      // but if error occurred, we already handled it in catch.
      // Actually, standard is to set it to false unless unmounted.
      setIsAuthProcessing(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setChats([]);
    setCurrentChatId(null);
    setMessages([]);
  };

  const newChat = async () => {
    if (!currentUser) return;
    try {
      const chatData = {
        userId: currentUser.uid,
        title: 'New Conversation',
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'chats'), chatData);
      setCurrentChatId(docRef.id);
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentUser || isLoading) return;
    if (!currentUser.subscriptionActive) {
      setView('subscription');
      return;
    }

    const userMsg = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      let chatId = currentChatId;
      
      // Auto-create chat if none selected
      if (!chatId) {
        const chatData = {
          userId: currentUser.uid,
          title: userMsg.substring(0, 30),
          createdAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, 'chats'), chatData);
        chatId = docRef.id;
        setCurrentChatId(chatId);
      }

      const messagesRef = collection(db, 'chats', chatId, 'messages');
      
      // Save User Message
      await addDoc(messagesRef, {
        chatId: chatId,
        role: 'user',
        content: userMsg,
        createdAt: serverTimestamp()
      });

      if (!ai) throw new Error("Gemini AI integration is not configured");

      // Generate AI Response
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: userMsg }] }
        ],
        config: {
          systemInstruction: systemPrompt
        }
      });

      const aiText = response.text || "Neural connection interrupted. Please try again.";
      
      // Save AI Message
      await addDoc(messagesRef, {
        chatId: chatId,
        role: 'assistant',
        content: aiText,
        createdAt: serverTimestamp()
      });

    } catch (err: any) {
      console.error("Message Send Error:", err);
      alert("Error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSystemPrompt = async () => {
    if (!currentUser?.isAdmin) return;
    try {
      await setDoc(doc(db, 'settings', 'global'), { systemPrompt });
      alert('Neural configuration updated.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDemoPayment = async () => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { subscriptionActive: true });
      setCurrentUser(prev => prev ? { ...prev, subscriptionActive: true } : null);
      setView('chat');
    } catch (err) {
      console.error(err);
    }
  };

  // --- Main Render ---

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans selection:bg-blue-500/30">
      
      {/* 1. LOADING VIEW */}
      {isAuthLoading && (
        <div className="h-screen flex items-center justify-center">
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} className="text-blue-500 font-black uppercase tracking-[0.4em] text-[10px]">
            SYNCHRONIZING NEURAL LINK...
          </motion.div>
        </div>
      )}

      {/* 2. AUTH VIEW */}
      {!isAuthLoading && view === 'auth' && (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#050505]">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0c0c0c] border border-[#1a1a1a] w-full max-w-sm p-10 shadow-2xl rounded-[2.5rem]">
            <div className="flex justify-center mb-8">
              <div className="bg-[#1a1a1a] p-5 rounded-3xl border border-blue-500/10">
                <Sparkles size={44} className="text-blue-500" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-center mb-2 tracking-tighter leading-none">PROMPT LOGIC</h2>
            <p className="text-[#666] text-center mb-10 text-xs font-bold uppercase tracking-widest">Intelligent Reasoning Hub</p>
            
            <form onSubmit={handleAuth} className="space-y-5">
              <div className="space-y-2 text-right" dir="rtl">
                <label className="text-[10px] uppercase tracking-widest text-[#444] font-black mr-2">البريد الإلكتروني</label>
                <input name="email" type="email" className="bg-[#080808] border border-[#1a1a1a] w-full rounded-2xl px-5 py-4 outline-none focus:border-blue-500/30 transition-all text-sm" placeholder="email@example.com" required />
              </div>
              {authMode === 'signup' && (
                <div className="space-y-2 text-right" dir="rtl">
                  <label className="text-[10px] uppercase tracking-widest text-[#444] font-black mr-2">اسم المستخدم</label>
                  <input name="username" type="text" className="bg-[#080808] border border-[#1a1a1a] w-full rounded-2xl px-5 py-4 outline-none focus:border-blue-500/30 transition-all text-sm" placeholder="Username" required />
                </div>
              )}
              <div className="space-y-2 text-right" dir="rtl">
                <label className="text-[10px] uppercase tracking-widest text-[#444] font-black mr-2">كلمة المرور</label>
                <input name="password" type="password" className="bg-[#080808] border border-[#1a1a1a] w-full rounded-2xl px-5 py-4 outline-none focus:border-blue-500/30 transition-all text-sm" placeholder="••••••••" required />
              </div>
              <button 
                type="submit" 
                disabled={isAuthProcessing}
                className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl mt-4 hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50 text-xs uppercase tracking-widest active:scale-95"
              >
                {isAuthProcessing ? 'Processing...' : (authMode === 'login' ? 'تـسـجـيـل الـدخـول' : 'إنـشـاء الـحـسـاب')}
              </button>
            </form>

            <div className="flex items-center my-8">
              <div className="flex-1 h-[1px] bg-[#1a1a1a]"></div>
              <span className="px-4 text-[10px] text-[#333] uppercase tracking-widest font-black">أو</span>
              <div className="flex-1 h-[1px] bg-[#1a1a1a]"></div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleAuth}
              disabled={isAuthProcessing}
              className="w-full bg-[#0c0c0c] border border-[#1a1a1a] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#121212] transition-all disabled:opacity-50 text-xs active:scale-95"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
              متابعة عبر جوجل
            </button>
            
            <div className="mt-10 text-center">
              <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-[#555] hover:text-blue-500 transition-all font-black text-[10px] uppercase tracking-[0.2em]">
                {authMode === 'login' ? "ليس لديك حساب؟ اشترك الآن" : "لديك حساب بالفعل؟ سجل دخولك"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 3. SUBSCRIPTION VIEW */}
      {!isAuthLoading && view === 'subscription' && (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#050505]">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#0c0c0c] border border-[#1a1a1a] max-w-lg w-full p-12 text-center rounded-[3rem] shadow-2xl">
            <div className="bg-blue-600/10 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-blue-600/20 shadow-inner">
              <Zap size={48} className="text-blue-500 fill-blue-500 animate-pulse" />
            </div>
            <h2 className="text-4xl font-black mb-4 tracking-tighter">وصول محدود</h2>
            <p className="text-[#666] mb-10 text-lg font-medium leading-relaxed">
              يرجى تفعيل اشتراكك لتتمكن من الوصول إلى كافة ميزات الذكاء الاصطناعي المتقدمة.
            </p>

            <div className="space-y-4">
              <button type="button" onClick={handleDemoPayment} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-[1.5rem] font-black flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-900/20 active:scale-95">
                <CreditCard size={20} />
                تفعيل الاشتراك الفوري
              </button>
              <button type="button" onClick={handleLogout} className="w-full py-4 text-[#444] hover:text-red-500 transition-all text-[10px] uppercase font-black tracking-widest">
                إلغاء العملية والعودة
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 4. ADMIN VIEW */}
      {!isAuthLoading && view === 'admin' && (
        <div className="h-screen flex flex-col p-8 bg-[#050505] text-[#e0e0e0] overflow-y-auto" dir="rtl">
          <div className="max-w-4xl mx-auto w-full">
            <h2 className="text-4xl font-black mb-8 tracking-tighter leading-tight bg-gradient-to-b from-white to-[#666] bg-clip-text text-transparent">لوحة إدارة النظام</h2>
            <div className="bg-[#0c0c0c] border border-[#1a1a1a] p-10 space-y-8 rounded-[2rem] shadow-2xl">
              <div>
                <h3 className="text-sm font-black text-blue-500 uppercase tracking-[0.3em] mb-4">التوجيهات البرمجية العامة</h3>
                <p className="text-[#666] mb-6 text-sm font-medium">قم بتحديث منطق السلوك العصبي للنظام لجميع المستخدمين.</p>
                <textarea 
                  value={systemPrompt} 
                  onChange={(e) => setSystemPrompt(e.target.value)} 
                  className="bg-[#050505] border border-[#1a1a1a] w-full h-80 rounded-2xl p-6 font-mono text-sm leading-relaxed outline-none focus:border-blue-500/30 transition-all custom-scrollbar text-right" 
                  placeholder="اكتب التعليمات هنا..." 
                />
              </div>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  saveSystemPrompt();
                }} 
                className="px-10 bg-blue-600 py-4 rounded-2xl font-black hover:bg-blue-500 text-white transition-all uppercase tracking-widest text-xs shadow-xl shadow-blue-900/20 active:scale-95"
              >
                حفظ التغييرات البرمجية
              </button>
            </div>
            <button 
              type="button"
              onClick={() => setView('chat')} 
              className="mt-10 text-[#666] hover:text-white flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-colors"
            >
              <span>← العودة إلى واجهة الدردشة</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. CHAT VIEW */}
      {!isAuthLoading && view === 'chat' && (
        <div className="flex h-screen overflow-hidden bg-[#050505] text-[#e0e0e0] selection:bg-blue-500/30">
          
          {/* SIDEBAR INLINED */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div 
                initial={{ x: 300, opacity: 0 }} 
                animate={{ x: 0, opacity: 1 }} 
                exit={{ x: 300, opacity: 0 }} 
                className="w-80 bg-[#0c0c0c]/80 backdrop-blur-xl border-r border-[#1a1a1a] flex flex-col h-full overflow-hidden z-20 shrink-0"
                dir="rtl"
              >
                <div className="p-8 border-b border-[#1a1a1a]">
                  <button 
                    type="button"
                    onClick={newChat} 
                    className="w-full py-4 px-6 bg-[#1a1a1a] hover:bg-[#222] text-white border border-[#2a2a2a] rounded-2xl flex items-center justify-center gap-3 text-xs font-black transition-all active:scale-95 uppercase tracking-widest"
                  >
                    <Plus size={18} />
                    محادثة جديدة
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <h3 className="text-[9px] uppercase tracking-[0.2em] text-[#444] font-black px-4 mb-6">الأرشيف الـعـصـبـي</h3>
                  <div className="space-y-1">
                    {chats.map(chat => (
                      <button 
                        key={chat.id} 
                        type="button"
                        onClick={() => setCurrentChatId(chat.id)} 
                        className={`w-full text-right p-4 rounded-2xl transition-all group flex flex-col gap-1.5 ${currentChatId === chat.id ? 'bg-[#121212] border border-[#222] shadow-inner' : 'hover:bg-[#0c0c0c]'}`}
                      >
                        <div className={`text-sm font-bold truncate transition-colors ${currentChatId === chat.id ? 'text-blue-500' : 'text-[#888] group-hover:text-white'}`}>{chat.title}</div>
                        <div className="text-[9px] text-[#333] uppercase font-bold tracking-[0.1em]">سجل محمي برمجياً</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-8 mt-auto border-t border-[#1a1a1a] bg-[#080808]/50">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-sm font-black shadow-2xl shadow-blue-900/40 text-white">
                      {currentUser?.username?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="text-xs font-black truncate">{currentUser?.username}</div>
                      <div className={`text-[9px] uppercase font-black tracking-[0.1em] mt-1 ${currentUser?.subscriptionActive ? 'text-blue-400' : 'text-[#444]'}`}>
                        {currentUser?.subscriptionActive ? 'LOGIC PRO' : 'FREE VERSION'}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {currentUser?.isAdmin && (
                      <button 
                        type="button"
                        onClick={() => setView('admin')} 
                        className="w-full py-3 bg-[#121212] border border-[#1a1a1a] rounded-xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-[#1a1a1a] hover:border-blue-500/30 transition-all flex items-center justify-center gap-3 text-blue-500"
                      >
                        <Shield size={14} />
                        النظام الأم
                      </button>
                    )}
                    <button 
                      type="button"
                      onClick={handleLogout} 
                      className="w-full py-3 text-[9px] bg-red-900/5 text-red-500/60 border border-red-900/10 rounded-xl hover:bg-red-900/10 hover:text-red-500 transition-all font-black uppercase tracking-[0.2em]"
                    >
                      فصل الاتصال
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 flex flex-col relative bg-[#050505] overflow-hidden">
            
            {/* NAV INLINED */}
            <nav className="h-20 bg-[#050505]/60 backdrop-blur-md flex items-center justify-between px-8 border-b border-[#1a1a1a] sticky top-0 z-10" dir="rtl">
              <div className="flex items-center gap-6">
                <button 
                  type="button"
                  onClick={() => setSidebarOpen(!sidebarOpen)} 
                  className="w-12 h-12 flex items-center justify-center bg-[#0c0c0c] border border-[#1a1a1a] rounded-2xl hover:bg-[#121212] transition-all group"
                >
                  <Menu size={20} className="text-[#444] group-hover:text-blue-500 transition-colors" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <h1 className="text-xs font-black tracking-[0.3em] uppercase text-white/50">PROMPT LOGIC AI</h1>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-[9px] bg-blue-500/5 text-blue-500/50 border border-blue-500/10 px-5 py-2 rounded-full font-black uppercase tracking-[0.3em] hidden md:block">
                  SECURED TERMINAL
                </div>
              </div>
            </nav>

            {/* DISPLAY INLINED */}
            <div className="flex-1 overflow-y-auto p-4 md:p-14 space-y-12 scroll-smooth custom-scrollbar" dir="rtl">
              {messages.length === 0 && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto py-24">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="w-32 h-32 bg-[#0c0c0c] border border-[#1a1a1a] rounded-[3rem] flex items-center justify-center mb-12 shadow-2xl relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-blue-600/5 group-hover:bg-blue-600/10 transition-colors"></div>
                    <Sparkles size={60} className="text-blue-500 relative z-10" />
                  </motion.div>
                  <motion.h2 
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                    className="text-5xl md:text-6xl font-black mb-8 tracking-tighter leading-tight bg-gradient-to-b from-white to-[#444] bg-clip-text text-transparent"
                  >
                    مرحباً بك في <br/>المستوى التالي
                  </motion.h2>
                  <motion.p 
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                    className="text-[#666] leading-relaxed text-xl max-w-lg font-medium"
                  >
                    محرك ذكاء اصطناعي مصمم للتعامل مع أعقد الأسئلة والمهام البرمجية والهندسية.
                  </motion.p>
                </div>
              )}
              {messages.map((msg, i) => (
                <motion.div 
                  key={msg.id || i} 
                  initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} 
                  className="flex gap-8 max-w-4xl mx-auto"
                >
                  <div className={`w-12 h-12 rounded-[1.25rem] shrink-0 flex items-center justify-center text-xs font-black shadow-2xl ${msg.role === 'user' ? 'bg-[#121212] border border-[#222] text-[#888]' : 'bg-[#1a1a1a] border border-blue-500/20 text-blue-500'}`}>
                    {msg.role === 'user' ? 'U' : <Sparkles size={20} />}
                  </div>
                  <div className={`flex-1 p-8 rounded-[2rem] transition-all ${msg.role === 'user' ? 'bg-[#0c0c0c] border border-[#1a1a1a] hover:border-blue-500/20' : 'bg-[#080808]/60 border border-[#1a1a1a] shadow-xl'}`}>
                    <p className="text-[16px] leading-[1.8] font-medium text-[#c0c0c0] whitespace-pre-wrap text-right">{msg.content}</p>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex gap-8 max-w-4xl mx-auto">
                  <div className="w-12 h-12 rounded-[1.25rem] bg-blue-600 shrink-0 flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
                    <Bot size={22} className="animate-spin-slow" />
                  </div>
                  <div className="bg-[#080808]/60 border border-[#1a1a1a] flex-1 p-8 rounded-[2rem]">
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }} className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"></span>
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]"></span>
                      <span className="text-sm text-blue-400 font-black uppercase tracking-[0.2em] mr-4">جاري تحليل البيانات...</span>
                    </motion.div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* INPUT INLINED - THIS FIXES FOCUS LOSS RE-RENDERS */}
            <div className="p-8 md:p-12 bg-[#050505]/95 backdrop-blur-2xl border-t border-[#1a1a1a]">
              <div className="max-w-4xl mx-auto relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 rounded-[2.5rem] blur opacity-0 group-focus-within:opacity-100 transition duration-1000"></div>
                <div className="relative">
                  <textarea 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)} 
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }} 
                    placeholder="أسأل عن أي شيء، أنا هنا لمساعدتك..." 
                    className="w-full bg-[#0c0c0c] border border-[#1a1a1a] rounded-[2.25rem] p-8 pr-24 text-base focus:outline-none focus:border-blue-500/40 resize-none h-32 placeholder:text-[#333] transition-all text-right font-medium leading-relaxed custom-scrollbar shadow-inner" 
                    dir="rtl"
                  />
                  <div className="absolute right-6 bottom-9">
                    <button 
                      type="button"
                      onClick={(e: any) => { e.preventDefault(); sendMessage(e); }} 
                      disabled={!input.trim() || isLoading} 
                      className="w-14 h-14 bg-blue-600 rounded-[1.5rem] hover:bg-blue-500 transition-all shadow-2xl shadow-blue-600/20 text-white disabled:opacity-10 flex items-center justify-center active:scale-95 group-hover:shadow-blue-500/20"
                    >
                      <Send size={24} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-8 hidden md:flex justify-center gap-14 text-[9px] text-[#222] font-black uppercase tracking-[0.4em]">
                <div className="flex items-center gap-2">PLATFORM: SYSTEM CORE</div>
                <div className="flex items-center gap-2">STATUS: STABLE</div>
                <div className="flex items-center gap-2">MODELS: MULTIMODAL</div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

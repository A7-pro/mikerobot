import React, { useState, useEffect } from 'react';
import { User } from '../types';
import MikeLogo from './Logo';
import { AI_NAME } from '../constants';


interface AuthFormProps {
  mode: 'login' | 'register';
  onAuth: (user: { email: string; username: string }) => void; 
  onToggleMode: () => void;
}

export default function AuthForm({ mode: initialMode, onAuth, onToggleMode }: AuthFormProps): JSX.Element {
  const [view, setView] = useState<'login' | 'register' | 'forgotPassword'>(initialMode);
  const [emailOrUsername, setEmailOrUsername] = useState(''); 
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(''); 
  const [error, setError] = useState('');

  // Forgot Password specific states
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('');


  useEffect(() => {
    setView(initialMode); // Sync internal view with prop mode when it changes
    setError('');
    setForgotPasswordMessage('');
    setForgotPasswordEmail('');
  }, [initialMode]);

  const clearFormFields = () => {
    setEmailOrUsername('');
    setPassword('');
    setDisplayName('');
    setForgotPasswordEmail('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!emailOrUsername.trim() || !password.trim()) {
      setError("الرجاء إدخال البريد الإلكتروني/اسم المستخدم وكلمة المرور.");
      return;
    }
    if (view === 'register' && !displayName.trim()) {
        setError("الرجاء إدخال اسم العرض (الاسم الذي سيظهر للآخرين).");
        return;
    }

    const storageKey = `mikeUser_${emailOrUsername.toLowerCase()}`; 

    if (view === 'register') {
      if (localStorage.getItem(storageKey)) {
        setError("هذا المعرف (بريد إلكتروني/اسم مستخدم) مسجل بالفعل. حاول تسجيل الدخول أو اختر معرفًا آخر.");
        return;
      }
      localStorage.setItem(storageKey, JSON.stringify({ id: emailOrUsername.toLowerCase(), username: displayName, email: emailOrUsername.toLowerCase(), password }));
      onAuth({ email: emailOrUsername.toLowerCase(), username: displayName });
      clearFormFields();
    } else { // Login mode
      const storedUserJson = localStorage.getItem(storageKey);
      if (!storedUserJson) {
        setError("المعرف (بريد إلكتروني/اسم مستخدم) غير موجود. هل أنت متأكد أنك سجلت؟");
        return;
      }
      const userData = JSON.parse(storedUserJson);
      if (userData.password !== password) {
        setError("كلمة المرور غير صحيحة.");
        return;
      }
      onAuth({ email: userData.email || userData.id, username: userData.username });
      clearFormFields();
    }
  };

  const handleForgotPasswordRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setForgotPasswordMessage('');
    if (!forgotPasswordEmail.trim()) {
      setForgotPasswordMessage("الرجاء إدخال البريد الإلكتروني المستخدم للتسجيل.");
      return;
    }
    // Simulate checking and "sending"
    // For security with real systems, always show a generic message.
    // Here, we can "check" localStorage for demo purposes but still show generic message.
    const userExists = localStorage.getItem(`mikeUser_${forgotPasswordEmail.toLowerCase()}`);
    
    // In a real app, you would trigger a backend API call here.
    // For this simulation:
    setForgotPasswordMessage("إذا كان هذا البريد الإلكتروني مسجلاً لدينا، فقد تم إرسال إرشادات إعادة تعيين كلمة المرور إليه. يرجى التحقق من بريدك الإلكتروني (بما في ذلك مجلد الرسائل غير المرغوب فيها).");
    // setForgotPasswordEmail(''); // Optionally clear the field
  };

  const handleMainModeToggle = () => {
    clearFormFields();
    setError('');
    setForgotPasswordMessage('');
    onToggleMode(); // This informs App.tsx to switch its 'authMode' state
  };


  if (view === 'forgotPassword') {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <MikeLogo iconOnly={true} size={40} className="mb-2" />
          <h2 className="text-2xl font-bold text-center text-slate-700 dark:text-slate-200">
            استعادة كلمة المرور
          </h2>
        </div>
        <form onSubmit={handleForgotPasswordRequest} className="space-y-5">
          <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
            أدخل عنوان بريدك الإلكتروني المسجل وسنرسل لك (نظريًا) تعليمات لإعادة تعيين كلمة المرور.
          </p>
          <div>
            <label
              htmlFor="forgotEmail"
              className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              البريد الإلكتروني
            </label>
            <input
              type="email"
              id="forgotEmail"
              value={forgotPasswordEmail}
              onChange={(e) => setForgotPasswordEmail(e.target.value)}
              className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 outline-none transition duration-150 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              placeholder="example@mail.com"
              required
            />
          </div>
          {forgotPasswordMessage && (
            <p className={`text-sm p-2 rounded-md text-center ${forgotPasswordMessage.includes("إرسال") ? "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30" : "text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30"}`}>
              {forgotPasswordMessage}
            </p>
          )}
          <button
            type="submit"
            className="w-full p-3 bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white rounded-lg font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-800 focus:ring-sky-500"
          >
            إرسال تعليمات الاستعادة
          </button>
        </form>
        <p className="mt-6 text-center text-sm">
          <button
            onClick={() => {
                setView('login'); 
                setError(''); 
                setForgotPasswordMessage('');
                clearFormFields();
            }}
            className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
          >
            العودة إلى تسجيل الدخول
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl">
      <div className="flex flex-col items-center mb-6">
        <MikeLogo iconOnly={true} size={40} className="mb-2" />
        <h2 className="text-2xl font-bold text-center text-slate-700 dark:text-slate-200">
          {view === 'login' ? `تسجيل الدخول إلى ${AI_NAME}` : `إنشاء حساب جديد في ${AI_NAME}`}
        </h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="emailOrUsername"
            className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1"
          >
            البريد الإلكتروني أو اسم المستخدم
          </label>
          <input
            type="text" 
            id="emailOrUsername"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 outline-none transition duration-150 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            placeholder="example@mail.com أو user123"
            aria-required="true"
          />
        </div>
         {view === 'register' && (
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              اسم العرض (سيظهر للآخرين)
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 outline-none transition duration-150 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              placeholder="مثال: أبو عبدالله"
              aria-required="true"
            />
          </div>
        )}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-600 dark:text-slate-300"
            >
                كلمة المرور
            </label>
            {view === 'login' && (
                <button
                type="button"
                onClick={() => {
                    setView('forgotPassword');
                    setError('');
                    setForgotPasswordMessage('');
                    clearFormFields();
                }}
                className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                >
                نسيت كلمة المرور؟
                </button>
            )}
          </div>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 outline-none transition duration-150 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100"
            placeholder="••••••••"
            aria-required="true"
          />
        </div>
        {error && <p className="text-sm text-red-500 dark:text-red-400 text-center bg-red-50 dark:bg-red-900/30 p-2 rounded-md">{error}</p>}
        <button
          type="submit"
          className="w-full p-3 bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white rounded-lg font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-800 focus:ring-sky-500"
        >
          {view === 'login' ? 'دخول' : 'تسجيل'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        <button
          onClick={handleMainModeToggle}
          className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
        >
          {view === 'login' ? 'ما عندك حساب؟ أنشئ واحد الآن' : 'عندك حساب؟ سجل دخولك'}
        </button>
      </p>
    </div>
  );
}
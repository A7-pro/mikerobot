
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, MessageSender, MessageType, GroundingChunk, User, UserProfile, PersonalityTemplate, GlobalAnnouncement } from './types';
import ChatMessageComponent from './components/ChatMessage';
import VoiceInputButton from './components/VoiceInputButton';
import { generateTextStream, generateImage, resetChat as resetGeminiChatSession, updateChatSystemInstruction } from './services/geminiService';
import { AI_NAME, CREATOR_NAME, CREATOR_LINK, INITIAL_GREETING, VOICE_COMMAND_START, SYSTEM_INSTRUCTION, MAX_CONVERSATIONS_TO_KEEP, PROFILE_PROMPT_MESSAGE, ADMIN_EMAIL } from './constants';
import AuthForm from './components/AuthForm';
import ConversationHistory from './components/ConversationHistory';
import MikeLogo from './components/Logo';
import AdminChoiceModal from './components/AdminChoiceModal';
import AdminPanel from './components/AdminPanel';


// Speech Recognition API Types (remains unchanged)
interface SpeechRecognitionAlternative { transcript: string; confidence: number; }
interface SpeechRecognitionResultItem { isFinal: boolean; readonly length: number; item(index: number): SpeechRecognitionAlternative; [index: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionResultList { readonly length: number; item(index: number): SpeechRecognitionResultItem; [index: number]: SpeechRecognitionResultItem; }
interface SpeechRecognitionEvent extends Event { readonly resultIndex: number; readonly results: SpeechRecognitionResultList; }
interface SpeechRecognitionErrorEvent extends Event { readonly error: string; readonly message: string; }
interface SpeechRecognitionInstance extends EventTarget { continuous: boolean; lang: string; interimResults: boolean; maxAlternatives: number; grammars: any; serviceURI?: string; onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => any) | null; onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => any) | null; onend: ((this: SpeechRecognitionInstance, ev: Event) => any) | null; start(): void; stop(): void; abort(): void; }
interface SpeechRecognitionConstructor { new(): SpeechRecognitionInstance; }
declare global { interface Window { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor; } }

const SpeechRecognitionAPIConstructor: SpeechRecognitionConstructor | undefined = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition: SpeechRecognitionInstance | null = null;

if (SpeechRecognitionAPIConstructor) {
  recognition = new SpeechRecognitionAPIConstructor();
  recognition.continuous = false;
  recognition.lang = 'ar-SA';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
} else {
  console.warn("Speech Recognition API not supported in this browser.");
}

interface Conversation {
  id: string;
  name: string;
  messages: ChatMessage[];
  lastUpdated: number;
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [apiKeyExists, setApiKeyExists] = useState<boolean>(false);
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Admin specific states
  const [showAdminChoiceModal, setShowAdminChoiceModal] = useState<boolean>(false);
  const [adminViewActive, setAdminViewActive] = useState<boolean>(false);
  
  // TTS State
  const [isTTSEnabled, setIsTTSEnabled] = useState<boolean>(false);
  const [speechSynthesisSupported, setSpeechSynthesisSupported] = useState<boolean>(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Global Announcement State
  const [globalAnnouncement, setGlobalAnnouncement] = useState<GlobalAnnouncement | null>(null);
  const [showAnnouncementBanner, setShowAnnouncementBanner] = useState<boolean>(false);


  const chatEndRef = useRef<HTMLDivElement>(null);

  // Check API Key & Speech Synthesis Support
  useEffect(() => {
    if (process.env.API_KEY && process.env.API_KEY !== "MISSING_API_KEY") {
      setApiKeyExists(true);
    } else {
      setApiKeyExists(false);
      setMessages(prev => {
        if (prev.some(m => m.id.startsWith('error-apikey'))) return prev;
        return [{
          id: `error-apikey-${Date.now()}`,
          sender: MessageSender.SYSTEM,
          type: MessageType.ERROR,
          text: "عفوًا، يبدو أن مفتاح الواجهة البرمجية (API Key) غير مهيأ. يرجى التأكد من تهيئته بشكل صحيح. لا يمكنني العمل بدون المفتاح.",
          timestamp: Date.now(),
        }, ...prev];
      });
    }
    if ('speechSynthesis' in window) {
        setSpeechSynthesisSupported(true);
        utteranceRef.current = new SpeechSynthesisUtterance();
        utteranceRef.current.lang = 'ar-SA'; // Default to Arabic
    } else {
        console.warn("Speech Synthesis API not supported in this browser.");
    }
  }, []);

  // Auth effect & Load user profile & Load Global Announcement
  useEffect(() => {
    const storedUserJson = localStorage.getItem('mikeCurrentUser');
    if (storedUserJson) {
      const storedUser: User = JSON.parse(storedUserJson);
      setCurrentUser(storedUser); 
      if (storedUser.email === ADMIN_EMAIL) {
        const adminChoiceMade = localStorage.getItem('mikeAdminChoiceMade');
        if (!adminChoiceMade) {
            setShowAdminChoiceModal(true);
        } else if (adminChoiceMade === 'admin') {
            setAdminViewActive(true);
        }
      }
      loadUserProfile(storedUser.id); 
      const ttsPref = localStorage.getItem(`mikeTTSEnabled_${storedUser.id}`);
      if (ttsPref) setIsTTSEnabled(JSON.parse(ttsPref));

      // Load global announcement
      const announcementJson = localStorage.getItem('mikeGlobalAnnouncement');
      if (announcementJson) {
        const announcement: GlobalAnnouncement = JSON.parse(announcementJson);
        const dismissedAnnouncementsJson = localStorage.getItem(`mikeDismissedAnnouncements_${storedUser.id}`);
        const dismissedAnnouncements: string[] = dismissedAnnouncementsJson ? JSON.parse(dismissedAnnouncementsJson) : [];
        if (announcement.id && !dismissedAnnouncements.includes(announcement.id)) {
          setGlobalAnnouncement(announcement);
          setShowAnnouncementBanner(true);
        }
      }

    }
  }, []);

  // Update dynamic system instruction based on user profile
  useEffect(() => {
    let profileInfoBlock = "";
    if (userProfile) {
      const { displayName, age, nationality } = userProfile;
      if (displayName || age || nationality) {
        profileInfoBlock = "معلومات المستخدم الحالية التي يمكنك استخدامها لتخصيص الحوار:\n";
        if (displayName) profileInfoBlock += `- الاسم الذي يفضله المستخدم: ${displayName}\n`;
        if (age) profileInfoBlock += `- العمر: ${age}\n`;
        if (nationality) profileInfoBlock += `- الجنسية: ${nationality}\n`;
        profileInfoBlock += "استخدم هذه المعلومات بشكل طبيعي ولطيف في ردودك عند الحاجة. إذا لم تكن المعلومة متوفرة، لا تشر إليها.\n---\n";
      }
    }
    const newDynamicInstruction = SYSTEM_INSTRUCTION.replace("{USER_PROFILE_INFO_BLOCK}", profileInfoBlock);
    updateChatSystemInstruction(newDynamicInstruction);
  }, [userProfile]);


  useEffect(() => {
    if (currentUser && apiKeyExists && !showAdminChoiceModal && !adminViewActive) {
      loadConversations(currentUser.id);
      const lastActiveId = localStorage.getItem(`mikeLastActiveConv_${currentUser.id}`);
      if (lastActiveId) {
        loadConversation(lastActiveId, true); 
      } else {
        startNewConversation(true); 
      }
       if (!userProfile?.displayName && !userProfile?.age && !userProfile?.nationality) {
        setTimeout(() => {
          const currentProfile = JSON.parse(localStorage.getItem(`mikeUserProfile_${currentUser.id}`) || '{}');
          // Check if messages array is empty or only contains the initial greeting or an announcement
          const isChatEssentiallyEmpty = messages.length === 0 || 
                                      (messages.length === 1 && (messages[0].text === INITIAL_GREETING || messages[0].id === `announcement-${globalAnnouncement?.id}`));

          if (!currentProfile.displayName && !currentProfile.age && !currentProfile.nationality && isChatEssentiallyEmpty) {
            if (!messages.some(msg => msg.text === PROFILE_PROMPT_MESSAGE(currentUser.username))) {
                 addMessage(MessageSender.SYSTEM, MessageType.TEXT, PROFILE_PROMPT_MESSAGE(currentUser.username));
            }
          }
        }, 2000);
      }

    } else if (!currentUser) {
      setMessages([]);
      setConversations([]);
      setCurrentConversationId(null);
      setUserProfile(null);
      setShowAdminChoiceModal(false);
      setAdminViewActive(false);
      localStorage.removeItem('mikeAdminChoiceMade');
      setGlobalAnnouncement(null);
      setShowAnnouncementBanner(false);
    }
  }, [currentUser, apiKeyExists, showAdminChoiceModal, adminViewActive]); 
  
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (currentUser && currentConversationId && messages.length > 0 && !adminViewActive) {
      setConversations(prevConvs => {
        const convIndex = prevConvs.findIndex(c => c.id === currentConversationId);
        
        let updatedConversations = [...prevConvs];
        if (convIndex !== -1) {
          const currentConv = updatedConversations[convIndex];
          currentConv.messages = messages.filter(msg => !msg.id.startsWith('announcement-')); // Don't save announcement to conversation history
          currentConv.lastUpdated = Date.now();
          const firstMeaningfulMessage = currentConv.messages.find(m => m.sender === MessageSender.USER && m.text) || currentConv.messages.find(m => m.sender === MessageSender.AI && m.text && m.text !== INITIAL_GREETING);
          if (currentConv.name === "محادثة جديدة" && firstMeaningfulMessage && firstMeaningfulMessage.text) {
             currentConv.name = firstMeaningfulMessage.text.substring(0, 30) + (firstMeaningfulMessage.text.length > 30 ? "..." : "");
          }
        } else {
          // This case might occur if currentConversationId was set but the conversation object wasn't created yet.
          // This is typically handled by startNewConversation or loadConversation.
          // However, if it somehow happens, let's create it.
          const existing = prevConvs.find(c => c.id === currentConversationId);
          if (!existing) {
             let newName = "محادثة جديدة";
             const firstMeaningfulMessage = messages.find(m => m.sender === MessageSender.USER && m.text) || messages.find(m => m.sender === MessageSender.AI && m.text && m.text !== INITIAL_GREETING);
             if (firstMeaningfulMessage && firstMeaningfulMessage.text) {
                newName = firstMeaningfulMessage.text.substring(0, 30) + (firstMeaningfulMessage.text.length > 30 ? "..." : "");
             }
              const newConv: Conversation = {
                id: currentConversationId,
                name: newName,
                messages: messages.filter(msg => !msg.id.startsWith('announcement-')),
                lastUpdated: Date.now()
              };
              updatedConversations.push(newConv);
          }
        }
        updatedConversations.sort((a, b) => b.lastUpdated - a.lastUpdated);
        if (updatedConversations.length > MAX_CONVERSATIONS_TO_KEEP) {
          updatedConversations = updatedConversations.slice(0, MAX_CONVERSATIONS_TO_KEEP);
        }
        localStorage.setItem(`mikeConversations_${currentUser.id}`, JSON.stringify(updatedConversations));
        return updatedConversations;
      });
    }
  }, [messages, currentConversationId, currentUser, adminViewActive]);


  const loadUserProfile = (userId: string) => {
    const storedProfile = localStorage.getItem(`mikeUserProfile_${userId}`);
    if (storedProfile) {
      setUserProfile(JSON.parse(storedProfile));
    } else {
      setUserProfile(null);
    }
  };

  const saveUserProfile = (profile: UserProfile) => {
    if (currentUser) {
      setUserProfile(profile);
      localStorage.setItem(`mikeUserProfile_${currentUser.id}`, JSON.stringify(profile));
    }
  };

  const loadConversations = (userId: string) => {
    const storedConvs = localStorage.getItem(`mikeConversations_${userId}`);
    if (storedConvs) {
      const parsedConvs: Conversation[] = JSON.parse(storedConvs);
      parsedConvs.sort((a, b) => b.lastUpdated - a.lastUpdated);
      setConversations(parsedConvs);
      return parsedConvs;
    }
    setConversations([]);
    return [];
  };
  
  const speakMessage = (text: string) => {
    if (speechSynthesisSupported && utteranceRef.current && apiKeyExists) {
      window.speechSynthesis.cancel(); // Cancel any previous speech
      utteranceRef.current.text = text;
      // Basic language detection for TTS voice, could be more sophisticated
      utteranceRef.current.lang = /[a-zA-Z]/.test(text.substring(0, 50)) ? 'en-US' : 'ar-SA';
      window.speechSynthesis.speak(utteranceRef.current);
    }
  };

  const handleSpeakText = (text: string) => {
    if (!speechSynthesisSupported) {
        addMessage(MessageSender.SYSTEM, MessageType.ERROR, "عفوًا، خدمة نطق الكلام غير متاحة في متصفحك.");
        return;
    }
    if (!apiKeyExists) {
        addMessage(MessageSender.SYSTEM, MessageType.ERROR, "لا يمكن تشغيل الصوت بسبب عدم وجود مفتاح الواجهة (API Key).");
        return;
    }
    speakMessage(text);
  };

  const addMessage = (sender: MessageSender, type: MessageType, text?: string, imageUrl?: string, idOverride?: string, groundingChunks?: GroundingChunk[]): string => {
    const messageId = idOverride || `${sender}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setMessages(prev => {
        // If it's an announcement, add it to the top if not already there
        if (idOverride && idOverride.startsWith('announcement-')) {
            if (prev.some(msg => msg.id === idOverride)) return prev; // Already added
            return [{ id: messageId, sender, type, text, imageUrl, timestamp: Date.now(), groundingChunks }, ...prev];
        }

        const existingMessageIndex = prev.findIndex(msg => msg.id === messageId);
        let newMessages;
        if (existingMessageIndex !== -1) {
            newMessages = [...prev];
            const currentMsg = newMessages[existingMessageIndex];
            let newText = text !== undefined ? text : currentMsg.text;
            let newImageUrl = imageUrl !== undefined ? imageUrl : currentMsg.imageUrl;
            
            if (type === MessageType.IMAGE) {
                newText = text !== undefined ? text : currentMsg.text;
            } else { 
                 newText = text !== undefined ? text : currentMsg.text;
            }

            newMessages[existingMessageIndex] = {
                ...currentMsg,
                text: newText,
                imageUrl: newImageUrl,
                type: type, 
                timestamp: Date.now(),
                groundingChunks: groundingChunks !== undefined ? groundingChunks : currentMsg.groundingChunks,
            };
        } else {
            newMessages = [...prev, { id: messageId, sender, type, text, imageUrl, timestamp: Date.now(), groundingChunks }];
        }

        // Speak AI message if TTS is enabled
        const latestMessage = newMessages[newMessages.length - 1];
        if (latestMessage.id === messageId && sender === MessageSender.AI && type === MessageType.TEXT && text && isTTSEnabled) {
            speakMessage(text);
        }
        return newMessages;
    });
    return messageId;
  };
  
  const startNewConversation = (skipProfilePrompt = false) => {
    if (!currentUser) return;
    
    const profileInfoForSystem = userProfile ? 
        `معلومات المستخدم الحالية: الاسم: ${userProfile.displayName || 'غير محدد'}, العمر: ${userProfile.age || 'غير محدد'}, الجنسية: ${userProfile.nationality || 'غير محدد'}.\n---\n` 
        : "";
    const newDynamicInstruction = SYSTEM_INSTRUCTION.replace("{USER_PROFILE_INFO_BLOCK}", profileInfoForSystem);
    resetGeminiChatSession(newDynamicInstruction);

    const newConvId = `conv-${Date.now()}`;
    
    let initialMessages: ChatMessage[] = [];
    const initialMsgText = INITIAL_GREETING;
    const greetingMsg: ChatMessage = {
      id: `initial-${Date.now()}`,
      sender: MessageSender.AI,
      type: MessageType.TEXT,
      text: initialMsgText,
      timestamp: Date.now(),
    };
    initialMessages.push(greetingMsg);

    setMessages(initialMessages); 
    setCurrentConversationId(newConvId); 
        
    const newConversation: Conversation = {
      id: newConvId,
      name: "محادثة جديدة",
      messages: [greetingMsg], 
      lastUpdated: Date.now(),
    };

    setConversations(prevConvs => {
        let updated = [newConversation, ...prevConvs];
        updated.sort((a, b) => b.lastUpdated - a.lastUpdated);
        if (updated.length > MAX_CONVERSATIONS_TO_KEEP) {
            updated = updated.slice(0, MAX_CONVERSATIONS_TO_KEEP);
        }
        localStorage.setItem(`mikeConversations_${currentUser.id}`, JSON.stringify(updated));
        return updated;
    });
    localStorage.setItem(`mikeLastActiveConv_${currentUser.id}`, newConvId);
    setIsSidebarOpen(false);
  };

  const loadConversation = (convId: string, skipProfilePrompt = false) => {
    if (!currentUser) return;
    const conv = conversations.find(c => c.id === convId) || 
                 JSON.parse(localStorage.getItem(`mikeConversations_${currentUser.id}`) || '[]').find((c: Conversation) => c.id === convId);

    if (conv) {
      const profileInfoForSystem = userProfile ? 
        `معلومات المستخدم الحالية: الاسم: ${userProfile.displayName || 'غير محدد'}, العمر: ${userProfile.age || 'غير محدد'}, الجنسية: ${userProfile.nationality || 'غير محدد'}.\n---\n` 
        : "";
      const newDynamicInstruction = SYSTEM_INSTRUCTION.replace("{USER_PROFILE_INFO_BLOCK}", profileInfoForSystem);
      resetGeminiChatSession(newDynamicInstruction);
      
      let loadedMessages = conv.messages;
      // Check if announcement needs to be displayed for this loaded conversation
      if (globalAnnouncement && globalAnnouncement.id && showAnnouncementBanner) {
          const announcementMsg: ChatMessage = {
              id: `announcement-${globalAnnouncement.id}`,
              sender: MessageSender.SYSTEM,
              type: MessageType.TEXT,
              text: `📢 **إعلان:** ${globalAnnouncement.message}`,
              timestamp: globalAnnouncement.timestamp,
          };
          if (!loadedMessages.some(m => m.id === announcementMsg.id)) {
            loadedMessages = [announcementMsg, ...loadedMessages];
          }
      }
      setMessages(loadedMessages);
      setCurrentConversationId(conv.id);
      localStorage.setItem(`mikeLastActiveConv_${currentUser.id}`, convId);
    } else {
        startNewConversation(skipProfilePrompt);
    }
    setIsSidebarOpen(false);
  };

  const deleteConversation = (convId: string) => {
    if (!currentUser) return;
    setConversations(prev => {
        const updated = prev.filter(c => c.id !== convId);
        localStorage.setItem(`mikeConversations_${currentUser.id}`, JSON.stringify(updated));
        return updated;
    });
    if (currentConversationId === convId) {
        startNewConversation();
    }
  };

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || !apiKeyExists || !currentUser) return;

    addMessage(MessageSender.USER, MessageType.TEXT, text);
    setUserInput('');
    setIsLoading(true);
    
    const aiMessageId = addMessage(MessageSender.AI, MessageType.LOADING, "لحظات أفكر لك...", undefined);

    if (text.toLowerCase().includes("مين سواك") || text.toLowerCase().includes("who made you") || text.toLowerCase().includes("من صنعك")) {
      const creatorResponse = `مطوري هو ${CREATOR_NAME}، الله يعطيه العافية ويوفقه! هو اللي علمني كل شي.`;
      addMessage(MessageSender.AI, MessageType.TEXT, creatorResponse, undefined, aiMessageId);
      setIsLoading(false);
      return;
    }

    if (text.toLowerCase().includes("امسح الشات") || text.toLowerCase().includes("clear chat") || text.toLowerCase().includes("ابدأ من جديد")) {
        startNewConversation(); 
        setIsLoading(false);
        return;
    }

    const imageKeywords = ["ارسم", "صورة لـ", "صمم لي", "draw", "image of", "generate image", "create an image of"];
    const isImageRequest = imageKeywords.some(keyword => text.toLowerCase().startsWith(keyword) || text.toLowerCase().includes(keyword));

    if (isImageRequest) {
      let prompt = text;
      imageKeywords.forEach(keyword => { 
        const regex = new RegExp(`^${keyword}\\s*`, 'i'); 
        prompt = prompt.replace(regex, '');
        prompt = prompt.replace(new RegExp(keyword, 'gi'), ''); 
      });
      prompt = prompt.trim();
      
      const imageLoadingText = `أبشر! جاري رسم "${prompt || 'طلبك'}"...`;
      addMessage(MessageSender.AI, MessageType.LOADING, imageLoadingText, undefined, aiMessageId);

      const { imageUrl, error } = await generateImage(prompt || "صورة فنية مذهلة"); 
      if (imageUrl) {
        const imageReadyText = `تفضل، هذي الصورة طلبتها خصيصًا لك${prompt ? `: "${prompt}"` : ''}`;
        addMessage(MessageSender.AI, MessageType.IMAGE, imageReadyText, imageUrl, aiMessageId);
      } else {
        const imageErrorText = error || "ماقدرت أرسم الصورة، ممكن تجرب طلب ثاني؟";
        addMessage(MessageSender.AI, MessageType.ERROR, imageErrorText, undefined, aiMessageId);
      }
      setIsLoading(false);
    } else {
      let fullResponseText = "";
      let responseGroundingChunks : GroundingChunk[] | undefined = undefined;

      generateTextStream(
        text,
        (textChunk, isFinal, groundingChunks) => {
            if (!isFinal && textChunk) {
                fullResponseText += textChunk;
                if (groundingChunks) responseGroundingChunks = groundingChunks;
                addMessage(MessageSender.AI, MessageType.TEXT, fullResponseText, undefined, aiMessageId, responseGroundingChunks);
            } else if (isFinal) {
                const finalText = fullResponseText.trim().length > 0 ? fullResponseText 
                                : (responseGroundingChunks && responseGroundingChunks.length > 0 ? " " : "عفوًا، لم أجد ردًا مناسبًا أو أن الرد كان فارغًا.");
                addMessage(MessageSender.AI, MessageType.TEXT, finalText, undefined, aiMessageId, responseGroundingChunks);
                setIsLoading(false);
            }
        },
        (error) => {
            addMessage(MessageSender.AI, MessageType.ERROR, error, undefined, aiMessageId);
            setIsLoading(false);
        }
      );
    }
  }, [isLoading, apiKeyExists, currentUser, conversations, currentConversationId, userProfile, isTTSEnabled, speechSynthesisSupported]); 

  const toggleListen = useCallback(() => {
    if (!recognition || !apiKeyExists || !currentUser) {
        addMessage(MessageSender.SYSTEM, MessageType.ERROR, "عفوًا، خدمة التعرف على الصوت غير متاحة في متصفحك أو أن مفتاح الواجهة البرمجية غير مهيأ أو أنك لم تسجل الدخول.");
        return;
    }
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      addMessage(MessageSender.SYSTEM, MessageType.TEXT, VOICE_COMMAND_START);
      try {
        recognition.start();
      } catch (e) {
        console.error("Error starting speech recognition:", e);
        addMessage(MessageSender.SYSTEM, MessageType.ERROR, "لم أتمكن من بدء التعرف على الصوت. حاول مرة أخرى.");
        setIsListening(false);
      }
    }
  }, [isListening, apiKeyExists, currentUser]); 

  useEffect(() => {
    if (!recognition) return;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const spokenText = event.results[0][0].transcript;
      setUserInput(spokenText); 
      handleSendMessage(spokenText); 
      setIsListening(false);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error', event.error, event.message);
      let errorMsg = "حدث خطأ أثناء التعرف على الصوت.";
      if (event.error === 'no-speech') errorMsg = "لم أسمع أي صوت. حاول مرة أخرى.";
      else if (event.error === 'audio-capture') errorMsg = "مشكلة في الميكروفون. تأكد من أنه يعمل.";
      else if (event.error === 'not-allowed') errorMsg = "لم تسمح باستخدام الميكروفون.";
      else if (event.message && event.message !== event.error) errorMsg = `${errorMsg} (${event.message})`;
      addMessage(MessageSender.SYSTEM, MessageType.ERROR, errorMsg);
      setIsListening(false);
    };
    
    recognition.onend = () => {
        if (isListening) setIsListening(false); 
    };
  }, [handleSendMessage, isListening]);


  const handleAuth = (userFromAuth: { email: string; username: string }) => {
    const userIsAdmin = userFromAuth.email === ADMIN_EMAIL;
    const userToStore: User = { 
        id: userFromAuth.email, 
        username: userFromAuth.username, 
        email: userFromAuth.email,
        isAdmin: userIsAdmin 
    };
    localStorage.setItem('mikeCurrentUser', JSON.stringify(userToStore));
    setCurrentUser(userToStore);
    loadUserProfile(userToStore.id); 
    const ttsPref = localStorage.getItem(`mikeTTSEnabled_${userToStore.id}`);
    if (ttsPref) setIsTTSEnabled(JSON.parse(ttsPref));
    else setIsTTSEnabled(false); 
    
    if (userIsAdmin) {
      setShowAdminChoiceModal(true);
      localStorage.removeItem('mikeAdminChoiceMade'); 
    } else {
      setShowAdminChoiceModal(false);
      setAdminViewActive(false);
      localStorage.removeItem('mikeAdminChoiceMade');
    }
    // Check for global announcement for the newly logged-in user
    const announcementJson = localStorage.getItem('mikeGlobalAnnouncement');
    if (announcementJson) {
      const announcement: GlobalAnnouncement = JSON.parse(announcementJson);
      const dismissedAnnouncementsJson = localStorage.getItem(`mikeDismissedAnnouncements_${userToStore.id}`);
      const dismissedAnnouncements: string[] = dismissedAnnouncementsJson ? JSON.parse(dismissedAnnouncementsJson) : [];
      if (announcement.id && !dismissedAnnouncements.includes(announcement.id)) {
        setGlobalAnnouncement(announcement);
        setShowAnnouncementBanner(true);
        // Add announcement to messages if chat is active
        if (!showAdminChoiceModal && !adminViewActive) {
            addMessage(MessageSender.SYSTEM, MessageType.TEXT, `📢 **إعلان:** ${announcement.message}`, undefined, `announcement-${announcement.id}`);
        }
      } else {
        setGlobalAnnouncement(null);
        setShowAnnouncementBanner(false);
      }
    }
  };
  

  const handleLogout = () => {
    if (speechSynthesisSupported) window.speechSynthesis.cancel();
    if (currentUser) {
      localStorage.removeItem(`mikeLastActiveConv_${currentUser.id}`);
    }
    localStorage.removeItem('mikeCurrentUser');
    localStorage.removeItem('mikeAdminChoiceMade');
    setCurrentUser(null);
    setUserProfile(null); 
    setShowAdminChoiceModal(false);
    setAdminViewActive(false);
    resetGeminiChatSession(SYSTEM_INSTRUCTION.replace("{USER_PROFILE_INFO_BLOCK}", "")); 
    setGlobalAnnouncement(null);
    setShowAnnouncementBanner(false);
  };
  
  const handleEnterAdminPanel = () => {
    setAdminViewActive(true);
    setShowAdminChoiceModal(false);
    localStorage.setItem('mikeAdminChoiceMade', 'admin');
    setMessages([]); // Clear messages when entering admin panel
  };

  const handleEnterUserViewFromModal = () => {
    setAdminViewActive(false);
    setShowAdminChoiceModal(false);
    localStorage.setItem('mikeAdminChoiceMade', 'user');
    // Trigger conversation load or new conversation for user view
  };
  
  const handleSwitchToUserViewFromPanel = () => {
    setAdminViewActive(false);
    localStorage.setItem('mikeAdminChoiceMade', 'user');
    // App.tsx useEffect for currentUser will handle loading conversations
  };

  const toggleTTS = () => {
    if (!speechSynthesisSupported) {
        addMessage(MessageSender.SYSTEM, MessageType.ERROR, "عفوًا، خدمة نطق الكلام غير متاحة في متصفحك.");
        return;
    }
    if (!apiKeyExists) {
        addMessage(MessageSender.SYSTEM, MessageType.ERROR, "لا يمكن تشغيل الصوت بسبب عدم وجود مفتاح الواجهة (API Key).");
        return;
    }
    const newTTSEnabled = !isTTSEnabled;
    setIsTTSEnabled(newTTSEnabled);
    if (currentUser) {
        localStorage.setItem(`mikeTTSEnabled_${currentUser.id}`, JSON.stringify(newTTSEnabled));
    }
    if (!newTTSEnabled && speechSynthesisSupported) {
        window.speechSynthesis.cancel(); // Stop any ongoing speech
    }
  };

  const dismissAnnouncement = () => {
    if (currentUser && globalAnnouncement && globalAnnouncement.id) {
      const dismissedAnnouncementsJson = localStorage.getItem(`mikeDismissedAnnouncements_${currentUser.id}`);
      let dismissedAnnouncements: string[] = dismissedAnnouncementsJson ? JSON.parse(dismissedAnnouncementsJson) : [];
      if (!dismissedAnnouncements.includes(globalAnnouncement.id)) {
        dismissedAnnouncements.push(globalAnnouncement.id);
        localStorage.setItem(`mikeDismissedAnnouncements_${currentUser.id}`, JSON.stringify(dismissedAnnouncements));
      }
      // Remove the announcement message from the current view
      setMessages(prevMessages => prevMessages.filter(msg => msg.id !== `announcement-${globalAnnouncement.id}`));
    }
    setShowAnnouncementBanner(false);
    setGlobalAnnouncement(null);
  };


  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 dark:bg-slate-900 p-4">
        <div className="w-full max-w-md">
          <header className="text-center mb-8">
            <MikeLogo className="justify-center mb-3" size={48} />
            <p className="text-slate-600 dark:text-slate-300 mt-2 text-lg">سجل دخولك أو أنشئ حسابًا جديدًا للتحدث مع {AI_NAME}</p>
          </header>
          <AuthForm
            mode={authMode}
            onAuth={handleAuth}
            onToggleMode={() => setAuthMode(prev => prev === 'login' ? 'register' : 'login')}
          />
        </div>
         <footer className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
            تطوير <a href={CREATOR_LINK} target="_blank" rel="noopener noreferrer" className="underline hover:text-sky-500 dark:hover:text-sky-300">{CREATOR_NAME}</a>
        </footer>
      </div>
    );
  }

  if (currentUser && showAdminChoiceModal) {
    return (
      <AdminChoiceModal 
        user={currentUser}
        onEnterAdminPanel={handleEnterAdminPanel}
        onEnterUserView={handleEnterUserViewFromModal}
        onLogout={handleLogout}
      />
    );
  }

  if (currentUser && adminViewActive) {
    return (
      <AdminPanel 
        currentUserEmail={currentUser.email || currentUser.username}
        onSwitchToUserView={handleSwitchToUserViewFromPanel}
        onLogout={handleLogout}
      />
    );
  }


  return (
    <div className="flex h-full max-h-screen bg-slate-100 dark:bg-slate-900">
      <div className={`fixed inset-y-0 right-0 z-30 w-72 sm:w-80 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 transform transition-transform duration-300 ease-in-out shadow-lg ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} sm:relative sm:translate-x-0 sm:border-l-0 sm:border-r`}>
        <ConversationHistory
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={(id) => loadConversation(id)}
          onNewConversation={() => startNewConversation()}
          onDeleteConversation={deleteConversation}
          onLogout={handleLogout}
          currentUser={currentUser}
          userProfile={userProfile}
          onSaveProfile={saveUserProfile}
        />
      </div>

      <div className="flex flex-col flex-1 h-full max-h-screen">
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm sticky top-0 z-20">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
             <div className="flex items-center">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600 dark:text-slate-300 hover:text-sky-500 dark:hover:text-sky-400 sm:hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                </button>
                <div className="flex-1 text-center sm:text-right flex items-center sm:justify-start sm:ml-0 ml-auto"> 
                    <MikeLogo className="hidden sm:flex" iconOnly={true} size={28}/>
                    <h1 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-200 truncate sm:mr-3">
                        {currentConversationId && conversations.find(c=>c.id === currentConversationId)?.name || AI_NAME}
                    </h1>
                </div>
            </div>
            
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
                 {speechSynthesisSupported && apiKeyExists && (
                    <button
                        onClick={toggleTTS}
                        title={isTTSEnabled ? "إيقاف نطق الرسائل" : "تشغيل نطق الرسائل"}
                        className={`p-2 rounded-full transition-colors duration-200 ${
                            isTTSEnabled 
                                ? 'bg-green-100 dark:bg-green-700 text-green-600 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-600' 
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                        aria-pressed={isTTSEnabled}
                    >
                        {isTTSEnabled ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path d="M7.75 2.75a.75.75 0 0 0-1.5 0v1.5H4.25a.75.75 0 0 0 0 1.5h2V7.5a.75.75 0 0 0 1.5 0v-1.5h2a.75.75 0 0 0 0-1.5h-2V2.75Z" />
                                <path fillRule="evenodd" d="M5.057 9.22a.75.75 0 0 1 .671.966 5.5 5.5 0 0 0 8.544 0 .75.75 0 1 1 1.342-.638 7 7 0 0 1-11.228 0 .75.75 0 0 1 .671-.966ZM10 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm0-1.5a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM6.75 7.75a.75.75 0 0 0 0 1.5h1.273a.75.75 0 0 0 0-1.5H6.75ZM9.25 9.25a.75.75 0 0 0-.75.75v1.5a.75.75 0 0 0 1.5 0V10a.75.75 0 0 0-.75-.75Zm2.25.75a.75.75 0 0 1 .75-.75h1.273a.75.75 0 0 1 0 1.5H12.25a.75.75 0 0 1-.75-.75Z"/>
                                <path fillRule="evenodd" d="M13.125 3.022a.75.75 0 0 1-.22.52l-2.06 2.06a.75.75 0 0 1-1.061-1.061l2.061-2.06a.75.75 0 0 1 1.281.541ZM6.875 3.022a.75.75 0 0 0 .22.52l2.06 2.06A.75.75 0 1 0 10.216 4.54l-2.06-2.061a.75.75 0 0 0-1.28.542Z" clipRule="evenodd" />
                            </svg>

                        )}
                    </button>
                )}
                 {currentUser && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                        أهلًا بك، {userProfile?.displayName || currentUser.username}
                        {currentUser.isAdmin && <span className="text-sky-500 dark:text-sky-400 font-semibold"> (مطور)</span>}
                    </p>
                 )}
            </div>
          </div>
        </header>

        {showAnnouncementBanner && globalAnnouncement && (
          <div className="bg-sky-100 dark:bg-sky-700/50 border-b border-sky-200 dark:border-sky-600 p-3 text-sky-700 dark:text-sky-200 text-sm relative">
            <div className="max-w-3xl mx-auto flex justify-between items-center">
              <span>📢 **إعلان:** {globalAnnouncement.message}</span>
              <button 
                onClick={dismissAnnouncement}
                className="p-1 text-sky-600 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-600 rounded-full"
                aria-label="إغلاق الإعلان"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {!apiKeyExists && messages.some(m => m.id.startsWith('error-apikey')) && (
           <div className="p-3 sm:p-4 bg-red-50 dark:bg-red-900/50 border-l-4 border-red-500 dark:border-red-400 text-red-700 dark:text-red-200 m-4 rounded-md shadow">
              <p className="font-bold">تنبيه هام:</p>
              <p className="text-sm">مفتاح الواجهة البرمجية (API_KEY) غير موجود. لن يتمكن التطبيق من التواصل مع خدمات الذكاء الاصطناعي.</p>
              <p className="text-sm">إذا كنت المطور، يرجى التأكد من تعيين متغير البيئة `API_KEY` بشكل صحيح.</p>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 bg-sky-800 dark:bg-sky-950"> {/* NAVY BACKGROUND */}
          <div className="max-w-3xl mx-auto w-full">
            {messages.filter(msg => !msg.id.startsWith('announcement-') || msg.id === `announcement-${globalAnnouncement?.id}` && showAnnouncementBanner).map((msg) => (
              <ChatMessageComponent key={msg.id} message={msg} onSpeak={handleSpeakText} />
            ))}
          </div>
          <div ref={chatEndRef} />
        </main>

        <footer className="bg-white dark:bg-slate-800 p-3 sm:p-4 border-t border-slate-200 dark:border-slate-700 shadow-top sticky bottom-0">
          <div className="max-w-3xl mx-auto w-full">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(userInput);
              }}
              className="flex items-center space-x-2 sm:space-x-3 rtl:space-x-reverse"
            >
              <VoiceInputButton onToggleListen={toggleListen} isListening={isListening} disabled={isLoading || !apiKeyExists || !currentUser} />
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={isListening ? "جاري الاستماع..." : (isLoading ? `${AI_NAME} يفكر...` : "اكتب رسالتك أو سؤالك هنا...")}
                className="flex-1 p-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-sky-500 dark:focus:border-sky-400 outline-none transition duration-150 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm sm:text-base"
                disabled={isLoading || isListening || !apiKeyExists || !currentUser}
              />
              <button
                type="submit"
                disabled={isLoading || !userInput.trim() || !apiKeyExists || !currentUser}
                className="p-3 bg-green-500 text-white rounded-xl hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-slate-800 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150"
                aria-label="إرسال"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 sm:w-6 sm:h-6 transform rtl:scale-x-[-1]">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </form>
          </div>
        </footer>
      </div>
       {isSidebarOpen && (
            <div 
                className="fixed inset-0 bg-black/30 z-20 sm:hidden backdrop-blur-sm"
                onClick={() => setIsSidebarOpen(false)}
            ></div>
        )}
    </div>
  );
};

export default App;
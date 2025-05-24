
export enum MessageSender {
  USER = 'User',
  AI = 'Mike',
  SYSTEM = 'System'
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  ERROR = 'error',
  LOADING = 'loading'
}

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  timestamp: number;
  groundingChunks?: GroundingChunk[];
}

export interface GroundingChunkWeb {
  uri?: string;
  title: string;
}
    
export interface GroundingChunk {
  web: GroundingChunkWeb;
}
    
export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
}
    
export interface Candidate {
  groundingMetadata?: GroundingMetadata;
}

export interface GenerateContentResponsePart {
 text?: string;
}

export interface GenerateContentResponseData {
 text: string; 
 candidates?: Candidate[]; 
}

export interface UserProfile {
  displayName?: string;
  age?: number;
  nationality?: string;
}

export interface User {
  id: string; // Unique identifier for the user (e.g., email or a generated ID)
  username: string; // Display name or login identifier
  email?: string; // Actual email, used for admin check
  profile?: UserProfile; 
  isAdmin?: boolean; // Flag to indicate admin status
}

export interface PersonalityTemplate {
  id: string;
  name: string;
  prompt: string;
  isSystemDefault?: boolean; // Optional flag for the original system prompt
}

export interface GlobalAnnouncement {
  id: string;
  message: string;
  timestamp: number;
}

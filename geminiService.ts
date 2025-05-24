
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL, SYSTEM_INSTRUCTION } from '../constants';
import { GroundingChunk as LocalGroundingChunk } from "../types";

if (!process.env.API_KEY) {
  console.error("API_KEY environment variable is not set. Please ensure it is configured.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "MISSING_API_KEY" });

let chatSession: Chat | null = null;

const getInitialSystemInstruction = (): string => {
  const adminInstruction = localStorage.getItem('mikeAdminSystemInstruction');
  return adminInstruction || SYSTEM_INSTRUCTION.replace("{USER_PROFILE_INFO_BLOCK}", "");
}

let currentSystemInstruction: string = getInitialSystemInstruction();

// Listen for admin updates to system prompt
window.addEventListener('systemPromptAdminUpdate', ((event: CustomEvent) => {
  if (event.detail && typeof event.detail === 'string') {
    console.log("AdminPanel updated system prompt. Updating service...");
    updateChatSystemInstruction(event.detail);
  }
}) as EventListener);


export const updateChatSystemInstruction = (newInstruction: string): void => {
  const adminInstruction = localStorage.getItem('mikeAdminSystemInstruction');
  const instructionToUse = adminInstruction || newInstruction; // Prioritize admin's saved instruction

  // If a user profile block exists, it should be integrated into the instructionToUse
  // This assumes newInstruction might contain the profile block or is the base instruction
  // Let's ensure USER_PROFILE_INFO_BLOCK is correctly handled
  let finalInstruction = instructionToUse;
  if (!adminInstruction && newInstruction.includes("{USER_PROFILE_INFO_BLOCK}")) {
      // This means 'newInstruction' is likely the one from App.tsx with profile info
      finalInstruction = newInstruction;
  } else if (adminInstruction && newInstruction.includes("{USER_PROFILE_INFO_BLOCK}")) {
      // Admin instruction is base, newInstruction has profile. We need to merge.
      // Extract profile block from newInstruction
      const profileBlockMatch = newInstruction.match(/^(.*?)(\{USER_PROFILE_INFO_BLOCK\})(.*?)$/s);
      let profileBlockContent = "";
      if (profileBlockMatch) {
          // This is a simplified extraction. A more robust way might be needed.
          // For now, let's assume profile block is at the start of what App.tsx sends.
          const tempInstructionWithProfile = SYSTEM_INSTRUCTION.replace("{USER_PROFILE_INFO_BLOCK}", newInstruction.substring(0, newInstruction.indexOf("---") + 4));
          const profilePart = tempInstructionWithProfile.substring(0, tempInstructionWithProfile.indexOf("---") + 4);
          finalInstruction = adminInstruction.replace("{USER_PROFILE_INFO_BLOCK}", profilePart);
      } else {
         finalInstruction = adminInstruction.replace("{USER_PROFILE_INFO_BLOCK}", ""); // Remove placeholder if no profile info
      }
  } else if (adminInstruction) {
     finalInstruction = adminInstruction.replace("{USER_PROFILE_INFO_BLOCK}", ""); // Admin instruction exists, but no profile info in current newInstruction
  }
  // If just newInstruction (no admin, no placeholder)
  // finalInstruction is already newInstruction via instructionToUse


  if (finalInstruction !== currentSystemInstruction) {
    currentSystemInstruction = finalInstruction;
    chatSession = null; 
  }
};

const getChatSession = (): Chat => {
  if (!chatSession) {
    // Ensure we have the latest admin or default instruction
    const baseInstruction = localStorage.getItem('mikeAdminSystemInstruction') || SYSTEM_INSTRUCTION;
    // If currentSystemInstruction was set by App.tsx with profile, it should already be fine
    // otherwise, re-evaluate
    if (!currentSystemInstruction.startsWith(baseInstruction.substring(0,10)) && !currentSystemInstruction.includes(baseInstruction.substring(0,10))) {
        // this indicates currentSystemInstruction might be stale if admin changed it and profile wasn't updated yet.
        // Let updateChatSystemInstruction handle the merge logic if needed
        // For now, we trust currentSystemInstruction is correctly managed by updateChatSystemInstruction
    }


    chatSession = ai.chats.create({
      model: GEMINI_TEXT_MODEL,
      config: {
        systemInstruction: currentSystemInstruction, // This should be the merged one
      },
    });
  }
  return chatSession;
};

export const generateTextStream = async (
  prompt: string,
  onChunk: (textChunk: string, isFinal: boolean, groundingChunks?: LocalGroundingChunk[]) => void,
  onError: (error: string) => void
): Promise<void> => {
  if (!process.env.API_KEY || process.env.API_KEY === "MISSING_API_KEY") {
    onError("API Key not configured. Please contact the administrator.");
    onChunk("", true);
    return;
  }
  try {
    const currentChat = getChatSession();
    const result = await currentChat.sendMessageStream({ message: prompt });
    
    let accumulatedText = "";
    let finalGroundingChunks: LocalGroundingChunk[] | undefined;

    for await (const chunk of result) {
      const textPart = chunk.text;
      if (textPart) {
        accumulatedText += textPart;
        onChunk(textPart, false, chunk.candidates?.[0]?.groundingMetadata?.groundingChunks as LocalGroundingChunk[] | undefined);
      }
      if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        finalGroundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks as LocalGroundingChunk[];
      }
    }
    onChunk("", true, finalGroundingChunks);
  } catch (error) {
    console.error("Gemini API text generation error:", error);
    onError(`عفوًا، واجهتني مشكلة في معالجة طلبك. ${error instanceof Error ? error.message : String(error)}`);
    onChunk("", true);
  }
};


export const generateImage = async (prompt: string): Promise<{ imageUrl?: string; error?: string }> => {
  if (!process.env.API_KEY || process.env.API_KEY === "MISSING_API_KEY") {
    return { error: "API Key not configured. Please contact the administrator." };
  }
  try {
    const response = await ai.models.generateImages({
      model: GEMINI_IMAGE_MODEL,
      prompt: prompt,
      config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
      return { imageUrl: `data:image/jpeg;base64,${base64ImageBytes}` };
    }
    return { error: "لم أتمكن من إنشاء الصورة. حاول مرة أخرى بطلب مختلف." };
  } catch (error) {
    console.error("Gemini API image generation error:", error);
    return { error: `عفوًا، واجهتني مشكلة في إنشاء الصورة. ${error instanceof Error ? error.message : String(error)}` };
  }
};

export const resetChat = (newSystemInstructionFromApp?: string): void => {
  const adminInstruction = localStorage.getItem('mikeAdminSystemInstruction');
  let instructionToUse = adminInstruction || SYSTEM_INSTRUCTION.replace("{USER_PROFILE_INFO_BLOCK}", ""); // Base

  if (newSystemInstructionFromApp) {
      // newSystemInstructionFromApp is expected to have the profile block integrated
      if (adminInstruction) {
          // Admin instruction is the source of truth for personality, merge profile block from app
          const profileBlockPlaceholder = "{USER_PROFILE_INFO_BLOCK}";
          if (newSystemInstructionFromApp.includes(profileBlockPlaceholder)) { // App sent base instruction + profile
            const profilePartRegex = /^(.*?)(\{USER_PROFILE_INFO_BLOCK\})(.*?)$/s;
            const appMatch = newSystemInstructionFromApp.match(profilePartRegex);
            if (appMatch && appMatch[1].length > 0 && appMatch[1] !== SYSTEM_INSTRUCTION.substring(0, appMatch[1].length)) {
                 //The part before {USER_PROFILE_INFO_BLOCK} in newSystemInstructionFromApp contains actual profile info
                 instructionToUse = adminInstruction.replace(profileBlockPlaceholder, appMatch[1]);
            } else { // Profile info might be empty or newSystemInstructionFromApp structure is different
                 instructionToUse = adminInstruction.replace(profileBlockPlaceholder, ""); // Default to empty if can't extract
            }

          } else { // App sent just profile info block or something else
            // This case is tricky. Assume newSystemInstructionFromApp might be just the profile block.
            // A more robust solution is for App.tsx to *only* send the profile_block content.
            // For now, if adminInstruction exists, we prioritize it and try to fill its placeholder.
             instructionToUse = adminInstruction.replace("{USER_PROFILE_INFO_BLOCK}", newSystemInstructionFromApp.includes("---") ? newSystemInstructionFromApp.substring(0, newSystemInstructionFromApp.indexOf("---")+4) : "");

          }
      } else {
          // No admin instruction, use the one from app (which includes profile info)
          instructionToUse = newSystemInstructionFromApp;
      }
  } else if (adminInstruction) {
    instructionToUse = adminInstruction.replace("{USER_PROFILE_INFO_BLOCK}", ""); // Admin instruction exists, no new one from app
  }
  // If no adminInstruction and no newSystemInstructionFromApp, it defaults to SYSTEM_INSTRUCTION without profile block

  updateChatSystemInstruction(instructionToUse);
};

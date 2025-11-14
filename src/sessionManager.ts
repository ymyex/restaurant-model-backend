import { RawData, WebSocket } from "ws";
import functions, { setSessionId } from "./functionHandlers";
import { cartStorage, orderStorage } from "./dataStorage";
import { linkSessionToCallSid } from "./callContext";
import { getCurrentModel, getCurrentVoice } from "./aiConfig";
import { createAIProvider, AIProvider, AIProviderConfig } from "./aiProviders";

// Function to get current system prompt from server
let getCurrentSystemPrompt: () => string = () => "";
export function setCurrentSystemPromptGetter(getter: () => string) {
  getCurrentSystemPrompt = getter;
}

interface Session {
  twilioConn?: WebSocket;
  frontendConn?: WebSocket;
  aiProvider?: AIProvider;
  streamSid?: string;
  saved_config?: any;
  lastAssistantItem?: string;
  responseStartTimestamp?: number;
  latestMediaTimestamp?: number;
  apiKeys?: {
    openai?: string;
  };
}

let session: Session = {};

export function getCurrentSessionId(): string | undefined {
  return session.streamSid;
}

export function handleCallConnection(ws: WebSocket, apiKeys: { openai?: string }) {
  cleanupConnection(session.twilioConn);
  session.twilioConn = ws;
  session.apiKeys = apiKeys;

  ws.on("message", handleTwilioMessage);
  ws.on("error", ws.close);
  ws.on("close", () => {
    cleanupAIProvider();
    cleanupConnection(session.twilioConn);
    session.twilioConn = undefined;
    session.aiProvider = undefined;
    session.streamSid = undefined;
    session.lastAssistantItem = undefined;
    session.responseStartTimestamp = undefined;
    session.latestMediaTimestamp = undefined;
    if (!session.frontendConn) session = {};
  });
}

export function handleFrontendConnection(ws: WebSocket) {
  cleanupConnection(session.frontendConn);
  session.frontendConn = ws;

  ws.on("message", handleFrontendMessage);
  ws.on("close", () => {
    cleanupConnection(session.frontendConn);
    session.frontendConn = undefined;
    if (!session.twilioConn && !session.aiProvider) session = {};
  });
}

async function handleFunctionCall(item: { name: string; arguments: string }) {
  console.log("Handling function call:", item);
  const fnDef = functions.find((f) => f.schema.name === item.name);
  if (!fnDef) {
    throw new Error(`No handler found for function: ${item.name}`);
  }

  let args: unknown;
  try {
    args = JSON.parse(item.arguments);
  } catch {
    return JSON.stringify({
      error: "Invalid JSON arguments for function call.",
    });
  }

  try {
    console.log("Calling function:", fnDef.schema.name, args);
    const result = await fnDef.handler(args as any);
    return result;
  } catch (err: any) {
    console.error("Error running function:", err);
    return JSON.stringify({
      error: `Error running function ${item.name}: ${err.message}`,
    });
  }
}

function handleTwilioMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

  switch (msg.event) {
    case "start":
      session.streamSid = msg.start.streamSid;
      // Link this stream/session to its CallSid if available, for SMS fallbacks
      const startCallSid = msg.start?.callSid || msg.start?.call_sid;
      if (session.streamSid && startCallSid) {
        linkSessionToCallSid(session.streamSid, startCallSid);
      }
      session.latestMediaTimestamp = 0;
      session.lastAssistantItem = undefined;
      session.responseStartTimestamp = undefined;

      // Clear cart and order data for the new call session
      if (session.streamSid) {
        cartStorage.clearCart(session.streamSid);
        setSessionId(session.streamSid);
        console.log(`Cleared cart and order data for new call session: ${session.streamSid}`);
      }

      tryConnectAIProvider();
      break;
    case "media":
      session.latestMediaTimestamp = msg.media.timestamp;
      if (session.aiProvider && session.aiProvider.isConnected()) {
        session.aiProvider.sendAudio(msg.media.payload);
      }
      break;
    case "close":
      closeAllConnections();
      break;
  }
}

function handleFrontendMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

  // Frontend messages are passed through for OpenAI compatibility

  if (msg.type === "session.update") {
    session.saved_config = msg.session;
  }
}

function tryConnectAIProvider() {
  if (!session.twilioConn || !session.streamSid || !session.apiKeys) return;
  if (session.aiProvider && session.aiProvider.isConnected()) return;

  const currentModel = getCurrentModel();
  const apiKey = session.apiKeys.openai;

  if (!apiKey) {
    console.error(`❌ Missing API key for ${currentModel.provider} provider`);
    return;
  }

  const providerConfig: AIProviderConfig = {
    modelConfig: currentModel,
    apiKey,
    instructions: getCurrentSystemPrompt(),
    voice: getCurrentVoice()
  };

  try {
    session.aiProvider = createAIProvider(providerConfig);

    // Set up event handlers
    session.aiProvider.on('open', () => {
      console.log(`✅ AI Provider connected: ${currentModel.name}`);
    });

    session.aiProvider.on('audio', (audioData: string, itemId?: string) => {
      handleAIAudio(audioData, itemId);
    });

    session.aiProvider.on('functionCall', (data) => {
      handleFunctionCall(data)
        .then((output) => {
          if (session.aiProvider) {
            session.aiProvider.sendFunctionResponse({
              name: data.name,
              call_id: data.call_id,
              response: output
            });
          }
        })
        .catch((err) => {
          console.error("Error handling function call:", err);
        });
    });

    session.aiProvider.on('speechStarted', () => {
      handleTruncation();
    });

    session.aiProvider.on('error', (error) => {
      console.error(`❌ AI Provider error:`, error);
      cleanupAIProvider();
    });

    session.aiProvider.on('close', (code, reason) => {
      console.log(`🔌 AI Provider connection closed: ${code} ${reason}`);
      cleanupAIProvider();
    });

    // Connect to the provider
    session.aiProvider.connect().catch((error) => {
      console.error(`❌ Failed to connect to AI provider:`, error);
      cleanupAIProvider();
    });

  } catch (error) {
    console.error(`❌ Error creating AI provider:`, error);
  }
}

function handleAIAudio(audioData: string, itemId?: string): void {
  if (!session.twilioConn || !session.streamSid) return;

  // Track response timing for interruption handling
  if (session.responseStartTimestamp === undefined) {
    session.responseStartTimestamp = session.latestMediaTimestamp || 0;
  }
  
  if (itemId) {
    session.lastAssistantItem = itemId;
  }

  // Send audio to Twilio
  jsonSend(session.twilioConn, {
    event: "media",
    streamSid: session.streamSid,
    media: { payload: audioData },
  });

  // Send mark for timing
  jsonSend(session.twilioConn, {
    event: "mark",
    streamSid: session.streamSid,
  });
}

function handleTruncation() {
  if (
    !session.lastAssistantItem ||
    session.responseStartTimestamp === undefined
  )
    return;

  const elapsedMs =
    (session.latestMediaTimestamp || 0) - (session.responseStartTimestamp || 0);
  const audio_end_ms = elapsedMs > 0 ? elapsedMs : 0;

  // Interrupt the AI provider if supported
  if (session.aiProvider && session.aiProvider.isConnected()) {
    // Use truncation if available and we have an item to truncate
    if (session.aiProvider.truncate && session.lastAssistantItem) {
      session.aiProvider.truncate(session.lastAssistantItem, audio_end_ms);
    } else {
      // Fallback to generic interrupt
      session.aiProvider.interrupt();
    }
  }

  if (session.twilioConn && session.streamSid) {
    jsonSend(session.twilioConn, {
      event: "clear",
      streamSid: session.streamSid,
    });
  }

  session.lastAssistantItem = undefined;
  session.responseStartTimestamp = undefined;
}

function cleanupAIProvider() {
  if (session.aiProvider) {
    session.aiProvider.close();
    session.aiProvider = undefined;
  }
  if (!session.twilioConn && !session.frontendConn) session = {};
}

function closeAllConnections() {
  if (session.twilioConn) {
    session.twilioConn.close();
    session.twilioConn = undefined;
  }
  cleanupAIProvider();
  if (session.frontendConn) {
    session.frontendConn.close();
    session.frontendConn = undefined;
  }
  session.streamSid = undefined;
  session.lastAssistantItem = undefined;
  session.responseStartTimestamp = undefined;
  session.latestMediaTimestamp = undefined;
  session.saved_config = undefined;
}

function cleanupConnection(ws?: WebSocket) {
  if (isOpen(ws)) ws.close();
}

function parseMessage(data: RawData): any {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function jsonSend(ws: WebSocket | undefined, obj: unknown) {
  if (!isOpen(ws)) return;
  ws.send(JSON.stringify(obj));
}

function isOpen(ws?: WebSocket): ws is WebSocket {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

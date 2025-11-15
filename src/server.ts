import express, { Request, Response, RequestHandler } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import dotenv from "dotenv";
import http from "http";
import { readFileSync, mkdirSync, existsSync, createWriteStream } from "fs";
import https from "https";
import { join } from "path";
import cors from "cors";
import twilio from "twilio";
import {
  handleCallConnection,
  handleFrontendConnection,
  getCurrentSessionId,
  setCurrentSystemPromptGetter,
} from "./sessionManager";
import functions, { updateFunctionSchemaDefinition, resetFunctionSchemaDefinition } from "./functionHandlers";
import { cartStorage, orderStorage } from "./dataStorage";
import { setCallParticipantsForCallSid } from "./callContext";
import { createGoogleDriveStorage, GoogleDriveStorage } from "./googleDriveStorage";
import {
  getDefaultSessionConfig, 
  DEFAULT_SYSTEM_PROMPT, 
  getCurrentModel, 
  setCurrentModel, 
  getAvailableModels,
  getCurrentVoice,
  setCurrentVoice,
  AVAILABLE_VOICES,
  isVoiceRandomizationEnabled,
  setVoiceRandomizationEnabled,
  getVoiceRandomizationPool,
  getCurrentSpeed,
  setCurrentSpeed,
  DEFAULT_SPEED
} from "./aiConfig";
import {
  getMenuData,
  getDefaultMenuData,
  isValidMenuData,
  setMenuData,
  resetMenuData
} from "./menuData";
import { FunctionSchema } from "./types";

dotenv.config();

const PORT = parseInt(process.env.PORT || "8082", 10);
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// Google Drive configuration (optional)
const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required to run the OpenAI real-time assistant");
  process.exit(1);
}

// Log available AI providers
console.log("🤖 Available AI Providers:");
if (OPENAI_API_KEY) {
  console.log("  ✅ OpenAI (GPT-4o, GPT-4o Mini)");
} else {
  console.log("  ❌ OpenAI (no API key)");
}

// Initialize Twilio client if credentials are available
let twilioClient: twilio.Twilio | null = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log("✅ Twilio client initialized successfully");
  console.log(`📞 Account SID: ${TWILIO_ACCOUNT_SID.substring(0, 10)}...`);
  console.log("🎬 Call recording feature is ENABLED");
} else {
  console.warn("⚠️ Twilio credentials not found!");
  console.warn("❌ Call recording feature is DISABLED");
  console.warn("💡 Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables to enable recording");
}

// Initialize Google Drive storage (optional)
let googleDriveStorage: GoogleDriveStorage | null = null;
if (GOOGLE_DRIVE_CLIENT_EMAIL && GOOGLE_DRIVE_PRIVATE_KEY) {
  try {
    googleDriveStorage = createGoogleDriveStorage({
      clientEmail: GOOGLE_DRIVE_CLIENT_EMAIL,
      privateKey: GOOGLE_DRIVE_PRIVATE_KEY,
      folderId: GOOGLE_DRIVE_FOLDER_ID,
    });
    console.log("✅ Google Drive storage initialized successfully");
    console.log(`📁 Folder ID: ${GOOGLE_DRIVE_FOLDER_ID || 'Root directory'}`);
  } catch (error) {
    console.error("❌ Error initializing Google Drive storage:", error);
  }
} else {
  console.warn("⚠️ Google Drive credentials not found - recordings will only be stored locally");
  console.warn("💡 Set GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY to enable cloud storage");
}

// Ensure recordings directory exists
const recordingsDir = join(__dirname, "../recordings");
if (!existsSync(recordingsDir)) {
  mkdirSync(recordingsDir, { recursive: true });
  console.log("Created recordings directory:", recordingsDir);
}

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.urlencoded({ extended: false }));

// Store the current system prompt (can be updated via admin panel)
let currentSystemPrompt = DEFAULT_SYSTEM_PROMPT;

// Set up the system prompt getter for session manager
setCurrentSystemPromptGetter(() => currentSystemPrompt);

const twimlPath = join(__dirname, "twiml.xml");
const twimlTemplate = readFileSync(twimlPath, "utf-8");

// Track call participants to support features (e.g., order SMS fallback)

app.get("/public-url", (req, res) => {
  res.json({ publicUrl: PUBLIC_URL });
});

// Handle TwiML requests - GET for testing, POST for actual Twilio webhooks
app.get("/twiml", (req, res) => {
  console.log("🔍 GET request to /twiml (likely from webapp or testing)");

  const wsUrl = new URL(PUBLIC_URL);
  wsUrl.protocol = "wss:";
  wsUrl.pathname = `/call`;

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say("Connected. This call will be recorded.");

  const connect = twiml.connect();
  connect.stream({
    url: wsUrl.toString()
  });

  twiml.say("Call ended");

  res.type("text/xml").send(twiml.toString());
});

// Handle actual Twilio webhook calls (POST)
app.post("/twiml", (req, res) => {
  const wsUrl = new URL(PUBLIC_URL);
  wsUrl.protocol = "wss:";
  wsUrl.pathname = `/call`;

  const recordingStatusCallbackUrl = `${PUBLIC_URL}/recording-status`;
  const callSid = req.body.CallSid;
  const from = req.body.From;
  const to = req.body.To;

  console.log("📞 REAL Twilio webhook received:", {
    method: req.method,
    callSid: callSid,
    from: from,
    to: to,
    direction: req.body.Direction,
    callStatus: req.body.CallStatus
  });

  // Store caller/callee for later use (e.g., order confirmation SMS)
  if (callSid) setCallParticipantsForCallSid(callSid, from, to);

  // Generate TwiML response that starts streaming immediately
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say("Connected. This call will be recorded.");

  const connect = twiml.connect();
  connect.stream({
    url: wsUrl.toString()
  });

  twiml.say("Call ended");

  res.type("text/xml").send(twiml.toString());

  // IMMEDIATELY start recording via REST API
  if (callSid && twilioClient) {
    console.log("🎬 Starting recording for call:", callSid);
    // Use setTimeout to start recording after TwiML response is sent
    setTimeout(() => {
      startCallRecording(callSid, recordingStatusCallbackUrl);
    }, 1000); // 1 second delay to ensure call is established
  } else {
    console.error("❌ Cannot start recording:", {
      hasCallSid: !!callSid,
      hasTwilioClient: !!twilioClient,
      callSid: callSid || 'undefined'
    });
  }
});

// Admin Control Panel Routes
app.get("/", (req, res) => {
  const adminPanelHtml = readFileSync(join(__dirname, "adminPanel.html"), "utf-8");
  res.type('text/html').send(adminPanelHtml);
});

// Admin API Routes
app.get("/admin/config", (req, res) => {
  const currentModel = getCurrentModel();
  const availableModels = getAvailableModels();
  
  // Filter models based on available API keys
  const enabledModels = availableModels.filter(() => !!OPENAI_API_KEY);

  res.json({
    systemPrompt: currentSystemPrompt,
    functions: functions.map(f => f.schema),
    defaultConfig: getDefaultSessionConfig(),
    googleDriveEnabled: !!googleDriveStorage,
    twilioEnabled: !!twilioClient,
    voiceRandomizationEnabled: isVoiceRandomizationEnabled(),
    randomVoicePool: getVoiceRandomizationPool(),
    currentSpeed: getCurrentSpeed(),
    defaultSpeed: DEFAULT_SPEED,
    currentModel: {
      id: `${currentModel.provider}:${currentModel.model}`,
      ...currentModel
    },
    availableModels: enabledModels.map(model => ({
      id: `${model.provider}:${model.model}`,
      ...model
    })),
    currentVoice: getCurrentVoice(),
    availableVoices: AVAILABLE_VOICES,
    apiKeys: {
      openai: !!OPENAI_API_KEY
    }
  });
});

app.post("/admin/config/prompt", (req, res) => {
  const { systemPrompt } = req.body;
  if (typeof systemPrompt === 'string') {
    currentSystemPrompt = systemPrompt;
    console.log("🔧 System prompt updated via admin panel");
    res.json({ success: true, message: 'System prompt updated successfully' });
  } else {
    res.status(400).json({ error: 'Invalid system prompt' });
  }
});

app.post("/admin/config/model", (req, res) => {
  const { modelId } = req.body;
  if (typeof modelId === 'string') {
    const success = setCurrentModel(modelId);
    if (success) {
      const currentModel = getCurrentModel();
      console.log(`🔧 AI model updated via admin panel: ${currentModel.name}`);
      res.json({ 
        success: true, 
        message: `Model updated to ${currentModel.name}`,
        currentModel: {
          id: `${currentModel.provider}:${currentModel.model}`,
          ...currentModel
        }
      });
    } else {
      res.status(400).json({ error: 'Invalid model ID or model not supported' });
    }
  } else {
    res.status(400).json({ error: 'Invalid model ID' });
  }
});

app.post("/admin/config/voice", (req, res) => {
  const { voice, randomizeVoices, speed } = req.body as {
    voice?: string;
    randomizeVoices?: boolean;
    speed?: number;
  };

  if (randomizeVoices !== undefined && typeof randomizeVoices !== "boolean") {
    res.status(400).json({ error: "randomizeVoices must be a boolean" });
    return;
  }

  const desiredRandomization =
    typeof randomizeVoices === "boolean" ? randomizeVoices : isVoiceRandomizationEnabled();
  setVoiceRandomizationEnabled(desiredRandomization);

  if (!desiredRandomization) {
    if (typeof voice !== "string") {
      res.status(400).json({ error: "Voice selection is required when randomization is disabled" });
      return;
    }
    if (!setCurrentVoice(voice)) {
      res.status(400).json({ error: "Voice not supported" });
      return;
    }
  } else if (typeof voice === "string" && voice.length > 0) {
    // Allow storing a preferred voice for when randomization is disabled later
    if (!setCurrentVoice(voice)) {
      res.status(400).json({ error: "Voice not supported" });
      return;
    }
  }

  if (speed !== undefined) {
    const numericSpeed = Number(speed);
    if (!setCurrentSpeed(numericSpeed)) {
      res.status(400).json({ error: "Invalid speed value" });
      return;
    }
  }

  const responseVoice = getCurrentVoice();
  const speedValue = getCurrentSpeed();
  const message = desiredRandomization
    ? "Voice randomization enabled"
    : `Voice updated to ${responseVoice}`;

  res.json({
    success: true,
    message,
    voice: responseVoice,
    randomizeVoices: isVoiceRandomizationEnabled(),
    randomVoicePool: getVoiceRandomizationPool(),
    speed: speedValue
  });
});

app.put("/admin/functions/:name", (req, res) => {
  const functionName = req.params.name;
  if (!functionName) {
    res.status(400).json({ error: "Function name is required" });
    return;
  }

  const { description, parameters } = req.body as {
    description?: string;
    parameters?: FunctionSchema["parameters"];
  };

  const updates: Partial<FunctionSchema> = {};

  if (description !== undefined) {
    if (typeof description !== "string") {
      res.status(400).json({ error: "Description must be a string" });
      return;
    }
    updates.description = description;
  }

  if (parameters !== undefined) {
    if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
      res.status(400).json({ error: "Parameters must be an object" });
      return;
    }
    updates.parameters = parameters;
  }

  if (updates.description === undefined && updates.parameters === undefined) {
    res.status(400).json({ error: "No updates provided" });
    return;
  }

  const updated = updateFunctionSchemaDefinition(functionName, {
    description: updates.description,
    parameters: updates.parameters,
  });

  if (!updated) {
    res.status(404).json({ error: "Function not found" });
    return;
  }

  res.json({ success: true, function: updated });
});

app.delete("/admin/functions/:name", (req, res) => {
  const functionName = req.params.name;
  if (!functionName) {
    res.status(400).json({ error: "Function name is required" });
    return;
  }

  const reset = resetFunctionSchemaDefinition(functionName);
  if (!reset) {
    res.status(404).json({ error: "Function not found" });
    return;
  }

  res.json({ success: true, function: reset });
});

// Admin menu data routes
app.get("/admin/menu", (req, res) => {
  res.json({
    success: true,
    menu: getMenuData(),
    defaultMenu: getDefaultMenuData()
  });
});

app.post("/admin/menu", (req, res) => {
  const { menu } = req.body ?? {};
  if (!menu || !isValidMenuData(menu)) {
    res.status(400).json({ error: "Menu payload must include pizzas, appetizers, drinks, desserts, and toppings" });
    return;
  }

  const updated = setMenuData(menu);
  console.log("?? Menu data updated via admin panel");
  res.json({ success: true, menu: updated });
});

app.delete("/admin/menu", (req, res) => {
  const reset = resetMenuData();
  console.log("?? Menu data reset to default via admin panel");
  res.json({ success: true, menu: reset });
});

// New endpoint to list available tools (schemas)
app.get("/tools", (req, res) => {
  res.json(functions.map((f) => f.schema));
});

// Serve recordings web interface
app.get("/recordings", async (req, res) => {
  const acceptHeader = req.get('Accept') || '';
  
  // If requesting JSON (API call), return JSON data
  if (acceptHeader.includes('application/json') || req.query.format === 'json') {
    try {
      let recordings: any[] = [];

      // Try to get recordings from Google Drive first
      if (googleDriveStorage) {
        try {
          console.log("📋 Fetching recordings from Google Drive...");
          const driveFiles = await googleDriveStorage.listRecordings();
          recordings = driveFiles.map((file: any) => ({
            filename: file.name,
            fileId: file.id,
            path: `googledrive://${file.id}`, // Special path indicator
            size: parseInt(file.size) || 0,
            created: new Date(file.createdTime),
            source: 'googledrive',
            webViewLink: file.webViewLink,
            webContentLink: file.webContentLink
          }));
          console.log(`✅ Found ${recordings.length} recordings in Google Drive`);
        } catch (driveError) {
          console.error("⚠️ Error fetching from Google Drive, falling back to local:", driveError);
        }
      }

      // Fallback to local files if Google Drive not available or no recordings found
      if (recordings.length === 0) {
        console.log("📁 Fetching recordings from local storage...");
        const fs = require('fs');
        const files = fs.readdirSync(recordingsDir);
        recordings = files
          .filter((file: string) => file.endsWith('.wav'))
          .map((file: string) => ({
            filename: file,
            path: join(recordingsDir, file),
            size: fs.statSync(join(recordingsDir, file)).size,
            created: fs.statSync(join(recordingsDir, file)).birthtime,
            source: 'local'
          }))
          .sort((a: any, b: any) => b.created - a.created);
        console.log(`✅ Found ${recordings.length} local recordings`);
      }

      res.json(recordings);
    } catch (error) {
      console.error("❌ Error listing recordings:", error);
      res.status(500).json({ error: "Failed to list recordings" });
    }
  } else {
    // Serve HTML interface
    try {
      const htmlPath = join(__dirname, "recordingsTemplate.html");
      const html = readFileSync(htmlPath, "utf-8");
      res.type('text/html').send(html);
    } catch (error) {
      console.error("Error serving recordings page:", error);
      res.status(500).send("Error loading recordings page");
    }
  }
});

// Serve individual recording files
const serveRecordingHandler: RequestHandler = async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    
    // Check if this is a Google Drive file ID (starts with googledrive://)
    if (filename.startsWith('googledrive://')) {
      const fileId = filename.replace('googledrive://', '');
      
      if (googleDriveStorage) {
        try {
          console.log(`📡 Streaming from Google Drive: ${fileId}`);
          const downloadUrl = await googleDriveStorage.getDownloadUrl(fileId);
          
          if (!downloadUrl) {
            res.status(404).json({ error: "Google Drive file not found" });
            return;
          }
          
          // Redirect to Google Drive download URL
          res.redirect(downloadUrl);
          return;
        } catch (driveError) {
          console.error("Error accessing Google Drive file:", driveError);
          res.status(500).json({ error: "Failed to access Google Drive file" });
          return;
        }
      }
    }
    
    // Handle local files (fallback)
    // Security check: ensure filename only contains safe characters
    if (!/^[a-zA-Z0-9_-]+\.wav$/.test(filename)) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }
    
    const filePath = join(recordingsDir, filename);
    const fs = require('fs');
    
    // Check if file exists locally
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Recording not found" });
      return;
    }
    
    // Set appropriate headers for audio file
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Stream the local file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    
    stream.on('error', (err: any) => {
      console.error("Error streaming recording:", err);
      res.status(500).json({ error: "Error streaming recording" });
    });
    
  } catch (error) {
    console.error("Error serving recording file:", error);
    res.status(500).json({ error: "Failed to serve recording" });
  }
};

app.get("/recordings/:filename", serveRecordingHandler);

// Recording status webhook endpoint
app.post("/recording-status", async (req, res) => {
  try {
    const { RecordingUrl, RecordingSid, CallSid, RecordingStatus, RecordingDuration } = req.body;

    console.log("📨 Recording status webhook received:", {
      RecordingSid,
      CallSid,
      RecordingStatus,
      RecordingDuration,
      RecordingUrl: RecordingUrl ? "✅ Present" : "❌ Missing",
      timestamp: new Date().toISOString()
    });

    if (RecordingStatus === "completed" && RecordingUrl) {
      console.log("💾 Recording completed, starting download...");
      // Download and save the recording
      await downloadRecording(RecordingUrl, RecordingSid, CallSid);

      // No post-call test SMS anymore
    } else if (RecordingStatus === "in-progress") {
      console.log("⏳ Recording in progress...");
    } else if (RecordingStatus === "failed") {
      console.error("❌ Recording failed for call:", CallSid);
    } else {
      console.log(`📝 Recording status: ${RecordingStatus}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error handling recording status:", error);
    res.sendStatus(500);
  }
});

// Function to start call recording via REST API
async function startCallRecording(callSid: string, recordingStatusCallbackUrl: string): Promise<void> {
  if (!twilioClient) {
    console.error("Twilio client not configured - missing credentials");
    return;
  }

  try {
    console.log(`🎬 Starting recording for call: ${callSid}`);
    console.log(`📞 Recording webhook URL: ${recordingStatusCallbackUrl}`);

    const recording = await twilioClient.calls(callSid).recordings.create({
      recordingStatusCallback: recordingStatusCallbackUrl,
      recordingStatusCallbackMethod: 'POST'
    });

    console.log(`✅ Recording started successfully with SID: ${recording.sid}`);
  } catch (error: any) {
    console.error("❌ Error starting call recording:", {
      message: error.message,
      code: error.code,
      moreInfo: error.moreInfo,
      callSid: callSid
    });
  }
}

// Function to download and save recordings
async function downloadRecording(recordingUrl: string, recordingSid: string, callSid: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!twilioClient || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      const error = "Twilio client not configured - missing credentials";
      console.error("❌", error);
      reject(new Error(error));
      return;
    }

    // Add .wav extension to the URL for audio format
    const audioUrl = `${recordingUrl}.wav`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording_${callSid}_${recordingSid}_${timestamp}.wav`;
    const filePath = join(recordingsDir, filename);

    console.log(`⬇️ Downloading recording from: ${audioUrl}`);
    console.log(`💾 Saving to: ${filePath}`);

    // Use Twilio's authenticated request to download the recording
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const options = {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    };

    const file = createWriteStream(filePath);

    https.get(audioUrl, options, (response) => {
      console.log(`📡 HTTP Response Status: ${response.statusCode}`);

      if (response.statusCode !== 200) {
        const error = `Failed to download recording: HTTP ${response.statusCode}`;
        console.error("❌", error);
        reject(new Error(error));
        return;
      }

      response.pipe(file);

      file.on('finish', async () => {
        file.close();
        console.log(`✅ Recording saved successfully: ${filename}`);
        
        // Also upload to Google Drive if configured
        if (googleDriveStorage) {
          try {
            const driveFileId = await googleDriveStorage.uploadRecording(filePath, filename);
            if (driveFileId) {
              console.log(`☁️ Recording uploaded to Google Drive: ${driveFileId}`);
              
              // Delete local file after successful upload to save space
              try {
                const fs = require('fs');
                fs.unlinkSync(filePath);
                console.log(`🗑️ Local file deleted: ${filename} (now stored in Google Drive)`);
              } catch (deleteError) {
                console.warn(`⚠️ Could not delete local file ${filename}:`, deleteError);
              }
            }
          } catch (driveError) {
            console.error(`⚠️ Failed to upload to Google Drive (keeping local copy):`, driveError);
          }
        } else {
          console.log(`💾 Recording saved locally: ${filename} (Google Drive not configured)`);
        }
        
        resolve();
      });

      file.on('error', (err) => {
        console.error(`❌ Error saving recording file:`, err);
        reject(err);
      });
    }).on('error', (err) => {
      console.error(`❌ Error downloading recording:`, err);
      reject(err);
    });
  });
}

// API endpoints for cart and order data
const getCartHandler: RequestHandler = (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const cart = cartStorage.getCart(sessionId as string);

  if (!cart || cart.items.length === 0) {
    res.json({
      empty: true,
      message: "Your cart is empty",
      items: [],
      total: 0,
      itemCount: 0
    });
    return;
  }

  res.json({
    items: cart.items,
    total: cart.total,
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    empty: false
  });
};

const getOrdersHandler: RequestHandler = (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const orders = orderStorage.getOrdersBySession(sessionId as string);

  res.json(orders);
};

const getSessionHandler: RequestHandler = (req: Request, res: Response) => {
  const currentSessionId = getCurrentSessionId();
  res.json({ sessionId: currentSessionId || "default_session" });
};

app.get("/api/cart/:sessionId", getCartHandler);
app.get("/api/orders/:sessionId", getOrdersHandler);
app.get("/api/session", getSessionHandler);

let currentCall: WebSocket | null = null;
let currentLogs: WebSocket | null = null;

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length < 1) {
    ws.close();
    return;
  }

  const type = parts[0];

  if (type === "call") {
    if (currentCall) currentCall.close();
    currentCall = ws;
    console.log("📞 Call connection established - backend ready to handle calls independently");
    handleCallConnection(currentCall, { 
      openai: OPENAI_API_KEY 
    });
  } else if (type === "logs") {
    if (currentLogs) currentLogs.close();
    currentLogs = ws;
    console.log("🖥️ Frontend logs connection established (optional for monitoring)");
    handleFrontendConnection(currentLogs);
  } else {
    ws.close();
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 AI Assistant configured with ${functions.length} restaurant functions`);
  console.log(`🤖 Backend is self-contained and ready to handle calls independently`);
  console.log(`📱 Frontend connection is optional for monitoring purposes only`);
  console.log(`🔗 Twilio webhook URL: ${PUBLIC_URL}/twiml`);
});

import { EventEmitter } from "events";
import { WebSocket } from "ws";
import { ModelConfig } from "./modelConfig";
import functions from "./functionHandlers";

export interface AIProviderConfig {
  modelConfig: ModelConfig;
  apiKey: string;
  instructions: string;
  voice?: string;
}

export interface FunctionCallData {
  name: string;
  arguments: string;
  call_id: string;
}

export abstract class AIProvider extends EventEmitter {
  protected config: AIProviderConfig;
  protected connected = false;

  constructor(config: AIProviderConfig) {
    super();
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract sendAudio(audioData: string): void;
  abstract sendFunctionResponse(response: { name: string; call_id: string; response: any }): void;
  abstract interrupt(): void;
  abstract close(): void;
  abstract isConnected(): boolean;
  
  // Optional truncation method (only implemented by providers that support it)
  truncate?(itemId: string, audioEndMs: number): void;

  // Common events that all providers should emit:
  // - 'open': Connection established
  // - 'audio': Audio data received (audioData: string)
  // - 'functionCall': Function call requested (data: FunctionCallData)
  // - 'error': Error occurred (error: Error)
  // - 'close': Connection closed (code?: number, reason?: string)
}

export class OpenAIProvider extends AIProvider {
  private ws?: WebSocket;

  async connect(): Promise<void> {
    try {
      this.ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${this.config.modelConfig.model}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "OpenAI-Beta": "realtime=v1",
          },
        }
      );

      this.ws.on("open", () => {
        console.log(`[OpenAI] ${this.config.modelConfig.name} connection opened`);
        this.connected = true;
        this.sendSessionUpdate();
        this.emit('open');
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (error) => {
        console.error(`[OpenAI] WebSocket error:`, error);
        this.emit('error', error);
      });

      this.ws.on("close", (code, reason) => {
        console.log(`[OpenAI] connection closed: ${code} ${reason}`);
        this.connected = false;
        this.emit('close', code, reason.toString());
      });

    } catch (error) {
      console.error('[OpenAI] Failed to establish realtime connection:', error);
      throw error;
    }
  }

  private sendSessionUpdate(): void {
    if (!this.ws || !this.connected) return;

    const sessionConfig = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        turn_detection: { type: "server_vad" },
        voice: this.config.voice || "ash",
        input_audio_transcription: { model: "whisper-1" },
        input_audio_format: this.config.modelConfig.audioFormat.input,
        output_audio_format: this.config.modelConfig.audioFormat.output,
        instructions: this.config.instructions,
        tools: functions.map(f => f.schema),
      }
    };

    this.sendMessage(sessionConfig);
  }

  private handleMessage(data: any): void {
    try {
      const event = JSON.parse(data.toString());

      switch (event.type) {
        case "response.audio.delta":
          this.emit('audio', event.delta, event.item_id);
          break;

        case "response.output_item.done":
          const { item } = event;
          if (item.type === "function_call") {
            this.emit('functionCall', {
              name: item.name,
              arguments: item.arguments,
              call_id: item.call_id
            });
          }
          break;

        case "input_audio_buffer.speech_started":
          this.emit('speechStarted');
          break;

        default:
          // Emit all events for debugging
          this.emit('rawMessage', event);
          break;
      }
    } catch (error) {
      console.error('[OpenAI] Error parsing realtime message:', error);
    }
  }

  sendAudio(audioData: string): void {
    if (!this.connected || !this.ws) return;

    const message = {
      type: "input_audio_buffer.append",
      audio: audioData,
    };

    this.sendMessage(message);
  }

  sendFunctionResponse(response: { name: string; call_id: string; response: any }): void {
    if (!this.connected || !this.ws) return;

    this.sendMessage({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: response.call_id,
        output: JSON.stringify(response.response),
      },
    });

    this.sendMessage({ type: "response.create" });
  }

  interrupt(): void {
    // OpenAI uses conversation.item.truncate for interruption
    // This is handled by the session manager when needed
  }

  private sendMessage(message: any): void {
    if (!this.ws || !this.connected) return;

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[OpenAI] Error sending realtime payload:', error);
    }
  }

  // Handle truncation for OpenAI (called by session manager)
  truncate(itemId: string, audioEndMs: number): void {
    if (!this.connected || !this.ws) return;

    this.sendMessage({
      type: "conversation.item.truncate",
      item_id: itemId,
      content_index: 0,
      audio_end_ms: audioEndMs,
    });
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Factory function to create the appropriate provider
export function createAIProvider(config: AIProviderConfig): AIProvider {
  if (config.modelConfig.provider !== 'openai') {
    throw new Error(`Unsupported AI provider: ${config.modelConfig.provider}`);
  }
  return new OpenAIProvider(config);
}

import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_MESSAGING_FROM = process.env.TWILIO_MESSAGING_FROM || "";
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || "";

let twilioClient: twilio.Twilio | null = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

export async function sendSms(
    to: string,
    body: string,
    options?: { from?: string }
): Promise<string | null> {
    if (!twilioClient) {
        console.warn("⚠️ Cannot send SMS: Twilio client not configured");
        return null;
    }

    const messageOptions: any = {
        to,
        body,
    };

    if (TWILIO_MESSAGING_SERVICE_SID) {
        messageOptions.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
    } else if (TWILIO_MESSAGING_FROM) {
        messageOptions.from = TWILIO_MESSAGING_FROM;
    } else if (options?.from) {
        messageOptions.from = options.from;
    } else {
        console.warn("⚠️ Cannot send SMS: No 'from' number or Messaging Service SID configured");
        return null;
    }

    const message = await twilioClient.messages.create(messageOptions);
    return message.sid;
}





// Centralized store to relate CallSid, session (streamSid), and phone numbers

type Participants = { from?: string; to?: string };

const participantsByCallSid = new Map<string, Participants>();
const callSidBySessionId = new Map<string, string>();

export function setCallParticipantsForCallSid(callSid: string, from?: string, to?: string) {
    if (!callSid) return;
    participantsByCallSid.set(callSid, { from, to });
}

export function linkSessionToCallSid(sessionId: string | undefined, callSid?: string) {
    if (!sessionId || !callSid) return;
    callSidBySessionId.set(sessionId, callSid);
}

export function getCallerForSession(sessionId: string): string | undefined {
    const callSid = callSidBySessionId.get(sessionId);
    if (!callSid) return undefined;
    return participantsByCallSid.get(callSid)?.from;
}

export function getTwilioNumberForSession(sessionId: string): string | undefined {
    const callSid = callSidBySessionId.get(sessionId);
    if (!callSid) return undefined;
    return participantsByCallSid.get(callSid)?.to;
}

export function clearSession(sessionId: string) {
    const callSid = callSidBySessionId.get(sessionId);
    if (callSid) participantsByCallSid.delete(callSid);
    callSidBySessionId.delete(sessionId);
}




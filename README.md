## Quick Setup

1. Run Ngrok

```shell
ngrok http 8082
```

2. Run webapp.

```shell
cd webapp
npm install
npm run dev
```
3. Run websocket server.

```shell
cd websocket-server
npm install
npm run dev
```

## Call Recording

This demo now includes automatic call recording functionality:

### Features
- **Automatic Recording**: All incoming calls are recorded from start to finish
- **Local Storage**: Recordings are saved as WAV files in `websocket-server/recordings/`
- **API Access**: View recordings list via `GET /recordings` endpoint
- **Webhook Integration**: Automatic download when recordings are ready

### Configuration
Make sure your `.env` file in `websocket-server/` includes:

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
PUBLIC_URL=your_ngrok_url
OPENAI_API_KEY=your_openai_key
```

### Recording Access
- Recordings are saved to: `websocket-server/recordings/`
- List recordings: `curl http://localhost:8082/recordings`
- Files are named: `recording_{CallSid}_{RecordingSid}_{timestamp}.wav`
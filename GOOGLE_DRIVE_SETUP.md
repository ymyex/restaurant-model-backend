# Google Drive Integration Setup

This guide shows you how to set up automatic upload of call recordings to Google Drive.

## Prerequisites

- Google Account with Drive access
- Google Cloud Platform (GCP) project (free)

## Step-by-Step Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Name it something like "Pizza Restaurant Recordings"

### 2. Enable Google Drive API

1. In the GCP Console, go to **APIs & Services > Library**
2. Search for "Google Drive API"
3. Click on it and press **Enable**

### 3. Create Service Account

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > Service Account**
3. Fill in details:
   - **Name**: `pizza-recordings-service`
   - **Description**: `Service account for uploading call recordings`
4. Click **Create and Continue**
5. Skip role assignment (click **Continue**)
6. Skip user access (click **Done**)

### 4. Generate Service Account Key

1. Find your service account in the list
2. Click on it to edit
3. Go to **Keys** tab
4. Click **Add Key > Create New Key**
5. Choose **JSON** format
6. Download the JSON file (keep it secure!)

### 5. Share Google Drive Folder (Optional)

1. Create a folder in Google Drive for recordings
2. Right-click the folder > **Share**
3. Add the service account email (from the JSON file) with **Editor** access
4. Copy the folder ID from the URL (e.g., `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`)

### 6. Set Environment Variables

Add these to your Heroku app or `.env` file:

```bash
# Required for Google Drive
GOOGLE_DRIVE_CLIENT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----"

# Optional: specific folder ID (if not set, uploads to root)
GOOGLE_DRIVE_FOLDER_ID="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
```

**Important**: The private key must include `\n` for line breaks!

### 7. Deploy to Heroku

```bash
# Set the environment variables
heroku config:set GOOGLE_DRIVE_CLIENT_EMAIL="service-account@project.iam.gserviceaccount.com" -a your-app-name
heroku config:set GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----" -a your-app-name
heroku config:set GOOGLE_DRIVE_FOLDER_ID="your-folder-id" -a your-app-name

# Deploy the updated code
git push heroku master
```

## Features

✅ **Automatic Upload**: Every recording is automatically uploaded to Google Drive  
✅ **Dual Storage**: Keeps local copy + cloud backup  
✅ **Organized**: Uploads to specific folder if configured  
✅ **Error Handling**: Local copy preserved if upload fails  
✅ **Logging**: Detailed logs for troubleshooting  

## File Naming

Recordings are saved with descriptive names:
```
recording_[CallSid]_[RecordingSid]_[Timestamp].wav
```

Example: `recording_CA123abc_RE456def_2025-08-11T14-30-45-123Z.wav`

## Security Notes

- Service account has minimal permissions (only Drive file access)
- Private key is encrypted in Heroku environment
- Files are uploaded to your personal Google Drive
- You control sharing and access permissions

## Troubleshooting

**Common Issues:**

1. **"Invalid credentials"**: Check client email and private key format
2. **"Folder not found"**: Verify folder ID and service account has access  
3. **"Permission denied"**: Ensure service account is shared on the folder

**Check Logs:**
```bash
heroku logs --tail -a your-app-name
```

Look for messages like:
- `✅ Google Drive storage initialized successfully`
- `☁️ Recording also uploaded to Google Drive: [fileId]`
- `❌ Error uploading to Google Drive: [error]`

## Cost

- Google Drive API: **Free** (generous quotas)
- Google Drive Storage: **15 GB free**, then paid plans available
- Each recording is typically 1-5 MB depending on length

## Advanced Features

The system also supports:
- Listing recordings from Google Drive
- Downloading recordings via API
- Making recordings publicly accessible
- Automatic folder creation
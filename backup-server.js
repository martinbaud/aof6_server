import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { google } from 'googleapis';
import { Rcon } from 'rcon-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.BACKUP_PORT || 3000;
const WORLD_PATH = process.env.WORLD_PATH || '/server/world';
const BACKUP_SECRET = process.env.BACKUP_SECRET || '';

// Google Drive config
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// RCON config (localhost since we're on the same server)
const RCON_HOST = 'localhost';
const RCON_PORT = parseInt(process.env.RCON_PORT || '25575');
const RCON_PASSWORD = process.env.RCON_PASSWORD;

let isBackupRunning = false;

async function executeRcon(command) {
  if (!RCON_PASSWORD) {
    console.log('RCON not configured, skipping:', command);
    return null;
  }

  try {
    const rcon = await Rcon.connect({
      host: RCON_HOST,
      port: RCON_PORT,
      password: RCON_PASSWORD,
      timeout: 5000,
    });
    const response = await rcon.send(command);
    rcon.end();
    return response;
  } catch (error) {
    console.error('RCON error:', error.message);
    return null;
  }
}

function createArchive(sourcePath, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    // Level 9 = maximum compression
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(archive.pointer()));
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourcePath, false);
    archive.finalize();
  });
}

async function uploadToDrive(filePath, fileName) {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || !GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('Google Drive not configured');
  }

  let credentials;
  try {
    const decoded = Buffer.from(GOOGLE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf-8');
    credentials = JSON.parse(decoded);
  } catch (e) {
    try {
      credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (e2) {
      throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON format');
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = {
    name: fileName,
    parents: [GOOGLE_DRIVE_FOLDER_ID],
  };

  const media = {
    mimeType: 'application/zip',
    body: fs.createReadStream(filePath),
  };

  const response = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: 'id, name, webViewLink, size',
  });

  return response.data;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function runBackup() {
  if (isBackupRunning) {
    return { success: false, error: 'Backup already in progress' };
  }

  isBackupRunning = true;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `aof6-backup-${timestamp}.zip`;
  const tempPath = `/tmp/${fileName}`;

  try {
    console.log('Starting backup...');

    // Step 1: Save and disable autosave
    console.log('Saving world...');
    await executeRcon('save-all');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await executeRcon('save-off');

    // Step 2: Create archive with max compression
    console.log('Creating archive...');
    if (!fs.existsSync(WORLD_PATH)) {
      throw new Error(`World path not found: ${WORLD_PATH}`);
    }
    const archiveSize = await createArchive(WORLD_PATH, tempPath);
    console.log(`Archive created: ${formatBytes(archiveSize)}`);

    // Step 3: Re-enable autosave
    await executeRcon('save-on');

    // Step 4: Upload to Google Drive
    console.log('Uploading to Google Drive...');
    const driveResult = await uploadToDrive(tempPath, fileName);
    console.log('Upload complete:', driveResult.webViewLink);

    // Step 5: Cleanup
    fs.unlinkSync(tempPath);

    isBackupRunning = false;
    return {
      success: true,
      fileName,
      fileSize: formatBytes(archiveSize),
      driveLink: driveResult.webViewLink,
      driveId: driveResult.id,
    };
  } catch (error) {
    console.error('Backup error:', error);

    // Cleanup on error
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    // Try to re-enable autosave
    await executeRcon('save-on');

    isBackupRunning = false;
    return {
      success: false,
      error: error.message,
    };
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Content-Type', 'application/json');

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', backupRunning: isBackupRunning }));
    return;
  }

  // Backup endpoint
  if (req.method === 'POST' && req.url === '/backup') {
    // Check secret if configured
    const authHeader = req.headers['authorization'];
    if (BACKUP_SECRET && authHeader !== `Bearer ${BACKUP_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return;
    }

    const result = await runBackup();
    res.writeHead(result.success ? 200 : 500);
    res.end(JSON.stringify(result));
    return;
  }

  // Status endpoint
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      backupRunning: isBackupRunning,
      worldPath: WORLD_PATH,
      worldExists: fs.existsSync(WORLD_PATH),
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Backup server running on port ${PORT}`);
  console.log(`World path: ${WORLD_PATH}`);
  console.log(`Google Drive configured: ${!!GOOGLE_SERVICE_ACCOUNT_JSON && !!GOOGLE_DRIVE_FOLDER_ID}`);
});

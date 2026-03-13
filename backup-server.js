import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { google } from 'googleapis';
import { Rcon } from 'rcon-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.BACKUP_PORT || 3000;
const WORLD_PATH = process.env.WORLD_PATH || '/server/world';
const BACKUP_SECRET = process.env.BACKUP_SECRET || '';

// Google Drive OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// RCON config (localhost since we're on the same server)
const RCON_HOST = 'localhost';
const RCON_PORT = parseInt(process.env.RCON_PORT || '25575');
const RCON_PASSWORD = process.env.RCON_PASSWORD;

let isBackupRunning = false;
let isRestoreRunning = false;

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
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('Google Drive OAuth not configured');
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );

  // Set credentials with refresh token
  oauth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

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

async function listBackups(limit = 10) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GOOGLE_DRIVE_FOLDER_ID) {
    throw new Error('Google Drive OAuth not configured');
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // List files in the backup folder, sorted by date (newest first)
  const response = await drive.files.list({
    q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType='application/zip' and trashed=false`,
    fields: 'files(id, name, size, createdTime, webViewLink)',
    orderBy: 'createdTime desc',
    pageSize: limit,
  });

  return response.data.files.map((file, index) => ({
    index: index + 1,
    id: file.id,
    name: file.name,
    size: formatBytes(parseInt(file.size || 0)),
    createdAt: file.createdTime,
    link: file.webViewLink,
  }));
}

async function downloadFromDrive(fileId, destPath) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google Drive OAuth not configured');
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    response.data
      .on('error', reject)
      .pipe(dest)
      .on('error', reject)
      .on('finish', resolve);
  });
}

function extractBackup(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    // Remove existing world folder first
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true });
    }
    fs.mkdirSync(destPath, { recursive: true });

    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: destPath }))
      .on('error', reject)
      .on('close', resolve);
  });
}

async function runRestore(backupId) {
  if (isRestoreRunning) {
    return { success: false, error: 'Restore already in progress' };
  }

  if (isBackupRunning) {
    return { success: false, error: 'Cannot restore while backup is running' };
  }

  isRestoreRunning = true;
  const tempPath = `/tmp/restore-${Date.now()}.zip`;

  try {
    console.log('Starting restore...');

    // Step 1: Download backup from Google Drive
    console.log('Downloading backup from Google Drive...');
    await downloadFromDrive(backupId, tempPath);
    console.log('Download complete');

    // Step 2: Disable autosave and save current state (just in case)
    console.log('Preparing server...');
    await executeRcon('save-off');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Extract backup to world folder (replaces current world)
    console.log('Extracting backup...');
    await extractBackup(tempPath, WORLD_PATH);
    console.log('Extraction complete');

    // Step 4: Cleanup temp file
    fs.unlinkSync(tempPath);

    // Step 5: Stop the server (Docker will auto-restart it)
    console.log('Restarting server...');
    await executeRcon('stop');

    isRestoreRunning = false;
    return {
      success: true,
      message: 'Backup restored, server restarting',
    };
  } catch (error) {
    console.error('Restore error:', error);

    // Cleanup on error
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    // Try to re-enable autosave
    await executeRcon('save-on');

    isRestoreRunning = false;
    return {
      success: false,
      error: error.message,
    };
  }
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

  // List backups endpoint
  if (req.method === 'GET' && req.url === '/list') {
    // Check secret if configured
    const authHeader = req.headers['authorization'];
    if (BACKUP_SECRET && authHeader !== `Bearer ${BACKUP_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return;
    }

    try {
      const backups = await listBackups(10);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, backups }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Restore backup endpoint
  if (req.method === 'POST' && req.url === '/restore') {
    // Check secret if configured
    const authHeader = req.headers['authorization'];
    if (BACKUP_SECRET && authHeader !== `Bearer ${BACKUP_SECRET}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return;
    }

    // Parse request body
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        if (!data.backupId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'backupId is required' }));
          return;
        }

        const result = await runRestore(data.backupId);
        res.writeHead(result.success ? 200 : 500);
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Backup server running on port ${PORT}`);
  console.log(`World path: ${WORLD_PATH}`);
  console.log(`Google Drive OAuth configured: ${!!GOOGLE_CLIENT_ID && !!GOOGLE_REFRESH_TOKEN && !!GOOGLE_DRIVE_FOLDER_ID}`);
});

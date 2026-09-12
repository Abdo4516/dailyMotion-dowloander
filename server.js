const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname)));

const jobs = new Map();
const DOWNLOAD_DIR = path.join('/tmp', 'dailymotion-downloads');
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function cleanupJob(id) {
  const job = jobs.get(id);
  if (!job) return;

  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);

  if (job.filePath && fs.existsSync(job.filePath)) {
    try { fs.unlinkSync(job.filePath); } catch (_) {}
  }

  jobs.delete(id);
}

function scheduleCleanup(id, delay = 10 * 60 * 1000) {
  const job = jobs.get(id);
  if (!job) return;

  job.cleanupTimer = setTimeout(() => cleanupJob(id), delay);
}

app.post('/download', (req, res) => {
  const videoUrl = String(req.body?.url || '').trim();

  if (!videoUrl) {
    return res.status(400).json({ error: 'URL missing' });
  }

  let parsed;
  try {
    parsed = new URL(videoUrl);
  } catch (_) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Invalid URL protocol' });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const outputTemplate = path.join(DOWNLOAD_DIR, `${id}.%(ext)s`);

  const job = {
    id,
    status: 'starting',
    progress: 0,
    error: null,
    filePath: null,
    title: 'video',
    startedAt: Date.now()
  };

  jobs.set(id, job);

  // Use spawn instead of exec: no shell command injection and no stdout buffer limit.
  // Prefer separate video/audio streams, then let ffmpeg merge them into MP4.
  const args = [
    '--no-playlist',
    '--no-check-certificates',
    '--retries', '10',
    '--fragment-retries', '10',
    '--retry-sleep', '2',
    '--socket-timeout', '30',
    '--concurrent-fragments', '4',
    '-f', 'bv*+ba/b',
    '--merge-output-format', 'mp4',
    '--newline',
    '--progress',
    '--print', 'after_move:filepath',
    '-o', outputTemplate,
    videoUrl
  ];

  const child = spawn('yt-dlp', args, {
    cwd: DOWNLOAD_DIR,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  job.process = child;
  job.status = 'downloading';

  const handleOutput = (chunk) => {
    const text = chunk.toString();

    // yt-dlp progress lines usually contain: [download]  42.3%
    const match = text.match(/(\d+(?:\.\d+)?)%/);
    if (match) job.progress = Math.max(0, Math.min(100, Number(match[1])));

    // The final filepath printed by --print after_move:filepath.
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.includes(DOWNLOAD_DIR) && fs.existsSync(line)) {
        job.filePath = line;
      }
    }
  };

  child.stdout.on('data', handleOutput);
  child.stderr.on('data', handleOutput);

  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message || 'yt-dlp could not start';
    scheduleCleanup(id, 60 * 1000);
  });

  child.on('close', (code) => {
    if (code !== 0) {
      job.status = 'error';
      job.error = job.error || 'Download failed. Check the Render logs.';
      scheduleCleanup(id, 60 * 1000);
      return;
    }

    // Fallback: locate the generated file if the printed path was not captured.
    if (!job.filePath) {
      const candidates = fs.readdirSync(DOWNLOAD_DIR)
        .filter(name => name.startsWith(id + '.') && !name.endsWith('.part'));

      if (candidates.length) {
        job.filePath = path.join(DOWNLOAD_DIR, candidates[0]);
      }
    }

    if (!job.filePath || !fs.existsSync(job.filePath)) {
      job.status = 'error';
      job.error = 'Download finished but the output file was not found.';
      scheduleCleanup(id, 60 * 1000);
      return;
    }

    job.progress = 100;
    job.status = 'ready';
    scheduleCleanup(id);
  });

  res.json({
    id,
    status: job.status,
    statusUrl: `/status/${id}`,
    fileUrl: `/file/${id}`
  });
});

app.get('/status/:id', (req, res) => {
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired' });
  }

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error
  });
});

app.get('/file/:id', (req, res) => {
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).send('Job not found or expired');
  }

  if (job.status !== 'ready' || !job.filePath || !fs.existsSync(job.filePath)) {
    return res.status(409).send('File is not ready yet');
  }

  const stat = fs.statSync(job.filePath);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(job.filePath);

  stream.on('error', () => {
    if (!res.headersSent) res.status(500);
    res.end();
  });

  stream.pipe(res);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

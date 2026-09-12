const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const app = express();

app.use(cors());
app.use(express.json());

// عرض صفحة index.html فـ الرابط الرئيسي
app.use(express.static(path.join(__dirname)));

const TMP_DIR = path.join(os.tmpdir(), 'yt-downloads');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

app.post('/download', (req, res) => {
  const { url: videoUrl, quality } = req.body;
  if (!videoUrl) return res.status(400).send('URL missing');

  const targetQuality = quality || '480';
  
  // صيغة مرنة تضمن عدم الحصول على ملف فارغ
  const formatOption = `best[height<=${targetQuality}]/bestvideo[height<=${targetQuality}]+bestaudio/best`;

  const jobId = crypto.randomBytes(8).toString('hex');
  const outputTemplate = path.join(TMP_DIR, `${jobId}.%(ext)s`);

  // حاسوب الويندوز المحلي يستعمل ffmpeg.exe، بينما Linux يستعمل النظام التلقائي
  const args = [
    '-f', formatOption,
    '--no-playlist',
    '-o', outputTemplate,
    videoUrl
  ];

  if (process.platform === 'win32' && fs.existsSync(path.join(__dirname, 'ffmpeg.exe'))) {
    args.unshift(path.join(__dirname, 'ffmpeg.exe'));
    args.unshift('--ffmpeg-location');
  }

  const ytDlp = spawn('yt-dlp', args);

  let stderrLog = '';
  ytDlp.stderr.on('data', (data) => {
    stderrLog += data.toString();
    console.error(`yt-dlp log: ${data}`);
  });

  ytDlp.on('error', (err) => {
    console.error('Failed to start yt-dlp:', err);
    if (!res.headersSent) res.status(500).send('Failed to start download process');
  });

  ytDlp.on('close', (code) => {
    console.log(`Process exited with code ${code}`);

    let outputFile = null;
    try {
      const files = fs.readdirSync(TMP_DIR).filter(f => f.startsWith(jobId));
      if (files.length) outputFile = path.join(TMP_DIR, files[0]);
    } catch (e) {
      console.error('Error reading temp dir:', e);
    }

    if (code !== 0 || !outputFile || !fs.existsSync(outputFile)) {
      console.error(`Download failed. stderr tail:\n${stderrLog.slice(-800)}`);
      if (!res.headersSent) {
        return res.status(500).send('فشل التحميل: ' + stderrLog.slice(-300));
      }
      return;
    }

    const stats = fs.statSync(outputFile);
    if (stats.size === 0) {
      console.error('Output file is empty (0 bytes)');
      fs.unlink(outputFile, () => {});
      if (!res.headersSent) return res.status(500).send('التحميل رجع ملف فارغ');
      return;
    }

    res.download(outputFile, `video_${targetQuality}p.mp4`, (err) => {
      if (err) console.error('Error sending file to client:', err);
      fs.unlink(outputFile, () => {});
    });
  });

  req.on('close', () => {
    if (!res.headersSent) {
      ytDlp.kill('SIGKILL');
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
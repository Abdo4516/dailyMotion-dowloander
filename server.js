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
app.use(express.static(path.join(__dirname)));

const TMP_DIR = path.join(os.tmpdir(), 'yt-downloads');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

app.post('/download', (req, res) => {
  const { url: videoUrl, quality } = req.body;
  if (!videoUrl) return res.status(400).send('URL missing');

  const targetQuality = quality || '480';
  const formatOption = `best[height<=${targetQuality}]/bestvideo[height<=${targetQuality}]+bestaudio/best`;

  // معرّف فريد لكل تحميل باش ما يتصادمش مع تحميلات أخرى
  const jobId = crypto.randomBytes(8).toString('hex');
  const outputTemplate = path.join(TMP_DIR, `${jobId}.%(ext)s`);

  const ytDlp = spawn('yt-dlp', [
    '-f', formatOption,
    '--no-playlist',
    '--merge-output-format', 'mp4', // يضمن الناتج النهائي mp4 حتى بعد الدمج
    '-o', outputTemplate,
    videoUrl
  ]);

  let stderrLog = '';
  ytDlp.stderr.on('data', (data) => {
    stderrLog += data.toString();
    console.error(`yt-dlp: ${data}`);
  });

  ytDlp.on('error', (err) => {
    console.error('Failed to start yt-dlp:', err);
    if (!res.headersSent) res.status(500).send('Failed to start download process');
  });

  ytDlp.on('close', (code) => {
    // نبحث على الملف الناتج (الامتداد قد يختلف حسب merge)
    const files = fs.readdirSync(TMP_DIR).filter(f => f.startsWith(jobId));
    const outputFile = files.length ? path.join(TMP_DIR, files[0]) : null;

    if (code !== 0 || !outputFile || !fs.existsSync(outputFile)) {
      console.error(`Download failed (exit ${code}). stderr:\n${stderrLog}`);
      if (!res.headersSent) {
        return res.status(500).send('Download failed: ' + stderrLog.slice(-500));
      }
      return;
    }

    const stats = fs.statSync(outputFile);
    if (stats.size === 0) {
      console.error('Output file is empty');
      fs.unlinkSync(outputFile);
      if (!res.headersSent) return res.status(500).send('Download produced an empty file');
      return;
    }

    // الملف جاهز وسليم -> نبعتوه دابا
    res.download(outputFile, `video_${targetQuality}p.mp4`, (err) => {
      if (err) console.error('Error sending file:', err);
      // تنظيف الملف المؤقت بعد الإرسال
      fs.unlink(outputFile, () => {});
    });
  });

  // إلغاء العملية إذا سد المستخدم الاتصال قبل ما يكمل
  req.on('close', () => {
    if (!res.headersSent) {
      ytDlp.kill('SIGKILL');
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

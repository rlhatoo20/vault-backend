// ✅ Step 1: Load environment variables and check OpenAI key
require("dotenv").config();
console.log("✅ OPENAI_API_KEY loaded:", !!process.env.OPENAI_API_KEY);

const express = require("express");
const { fetchYouTubeTranscript, summarizeTranscript } = require("./transcribeAndSummarize");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});

app.use(express.json());

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ✅ Define schema + model
const videoSchema = new mongoose.Schema({
  videoId: String,
  title: String,
  url: String,
  channel: String,
  timestamp: Date,
  summary: String,
  tldr: String
});

const Video = mongoose.model("Video", videoSchema);

// ✅ POST /api/track
app.post("/api/track", async (req, res) => {
  const { videoId, title, url, channel, timestamp } = req.body;
  console.log("✅ /api/track was hit");

  try {
    const newVideo = await Video.create({
      videoId,
      title,
      url,
      channel,
      timestamp
    });
    console.log("Video saved:", title);

    const transcriptXml = await fetchYouTubeTranscript(videoId);

    if (transcriptXml) {
      const { fullSummary, tldr } = await summarizeTranscript(transcriptXml);

      await Video.updateOne({ videoId }, {
        $set: { summary: fullSummary, tldr }
      });

      console.log("✅ Summary added for:", title);

      return res.status(200).json({
        message: "Video saved and summarized.",
        videoId,
        summary: fullSummary,
        tldr
      });
    } else {
      console.warn("⚠️ No transcript available for:", title);
      return res.status(200).json({
        message: "Video saved, but transcript not available.",
        videoId
      });
    }
  } catch (err) {
    console.error("❌ Error handling /api/track:", err);
    res.status(500).json({ error: "Failed to process video." });
  }
});

// ✅ GET /api/videos
app.get("/api/videos", async (req, res) => {
  try {
    const allVideos = await Video.find({});
    res.json(allVideos);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

app.listen(PORT, () => {
  console.log(`Vault backend is running at http://localhost:${PORT}`);
});

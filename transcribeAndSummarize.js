const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { OpenAI } = require("openai");

// 🔑 Load your API key from environment variable or config
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === Fetch transcript with yt-dlp ===
async function fetchTranscriptWithYTDLP(videoId) {
  const tempDir = "./transcripts";
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  try {
    const cmd = `yt-dlp --write-auto-sub --sub-lang en --skip-download --output "${tempDir}/%(id)s.%(ext)s" https://www.youtube.com/watch?v=${videoId}`;
    execSync(cmd, { stdio: "ignore" });

    const vttFile = fs.readdirSync(tempDir).find(f => f.startsWith(videoId) && f.endsWith(".en.vtt"));
    if (!vttFile) throw new Error("No .vtt file found");

    const raw = fs.readFileSync(path.join(tempDir, vttFile), "utf-8");
    const lines = raw
      .split("\n")
      .filter(line => line && !line.startsWith("WEBVTT") && !line.match(/^\d{2}:\d{2}/))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    console.log("🧾 yt-dlp transcript length:", lines.length);
    return lines;
  } catch (err) {
    console.error("❌ yt-dlp failed to fetch transcript:", err.message);
    return null;
  }
}

// === Fetch transcript wrapper (yt-dlp only) ===
async function fetchYouTubeTranscript(videoId) {
  return await fetchTranscriptWithYTDLP(videoId);
}

// === Summarize with OpenAI ===
async function summarizeText(text) {
  try {
    const prompt = `Summarize the following transcript in key bullet points with a focus on actionable insights:\n\n${text}`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
    });

    return completion.choices[0].message.content;
  } catch (err) {
    console.error("❌ Failed to summarize:", err.message);
    return null;
  }
}

// === Orchestration ===
async function transcribeAndSummarize(videoId) {
  console.log(`🔍 Processing video: ${videoId}`);

  const transcript = await fetchYouTubeTranscript(videoId);
  if (!transcript) {
    console.error("🚫 Failed to fetch transcript.");
    return null;
  }

  const summary = await summarizeText(transcript);
  if (!summary) {
    console.error("🚫 Failed to summarize transcript.");
    return null;
  }

  return { transcript, summary };
}

async function summarizeTranscript(transcript, chunkSize = 1000) {
  const chunks = splitIntoChunks(transcript, chunkSize);
  const summaries = [];

  for (const [i, chunk] of chunks.entries()) {
    try {
      console.log(`🧠 Summarizing chunk ${i + 1}/${chunks.length}...`);
      const prompt = `Summarize the following YouTube transcript into key bullet points:\n\n${chunk}`;
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5
      });

      summaries.push(completion.choices[0].message.content);

      // Optional pause to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`❌ Failed on chunk ${i + 1}:`, err.message);
    }
  }

  // 🔥 Generate TL;DR summary from all summaries
  const finalPrompt = `Summarize the following into 5 key bullet points:\n\n${summaries.join("\n\n")}`;
  const finalCompletion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: finalPrompt }],
    temperature: 0.5
  });
  const tldr = finalCompletion.choices[0].message.content;

  return {
    fullSummary: summaries.join("\n\n"),
    tldr
  };
}

function splitIntoChunks(text, wordsPerChunk = 1000) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }
  return chunks;
}

module.exports = {
  fetchYouTubeTranscript,
  summarizeTranscript
};

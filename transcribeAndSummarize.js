const { OpenAI } = require("openai");
const { YoutubeTranscript } = require("youtube-transcript");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === Primary transcript fetch using youtube-transcript ===
async function fetchYouTubeTranscript(videoId) {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
    if (!segments || segments.length === 0) throw new Error("No segments found");

    const transcript = segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
    console.log("📜 Transcript length:", transcript.length);
    return transcript;
  } catch (err) {
    console.warn("❌ Failed to fetch transcript:", err.message);
    return null;
  }
}

// === Summarize a transcript using OpenAI ===
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

// === Orchestration function for 1-step summarization ===
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

// === Multi-chunk summarization (optional) ===
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
        temperature: 0.5,
      });
      summaries.push(completion.choices[0].message.content);
      await new Promise(resolve => setTimeout(resolve, 1000)); // optional delay
    } catch (err) {
      console.error(`❌ Failed on chunk ${i + 1}:`, err.message);
    }
  }

  const finalPrompt = `Summarize the following into 5 key bullet points:\n\n${summaries.join("\n\n")}`;
  const finalCompletion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: finalPrompt }],
    temperature: 0.5,
  });
  const tldr = finalCompletion.choices[0].message.content;

  return {
    fullSummary: summaries.join("\n\n"),
    tldr,
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
  summarizeTranscript,
};

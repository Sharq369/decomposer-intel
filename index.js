const express = require('express');
const cors = require('cors');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- 1. STACK INTELLIGENCE ---
const STACK_DATA = {
  supabase: {
    alerts: "Check RLS policies. Use auth.uid() for row security. Warn if on Free Tier (500MB limit).",
    bestPractice: "Sync Clerk users to public.profiles via webhooks."
  },
  clerk: {
    alerts: "Use Middleware for route protection. Do not store passwords in DB.",
    bestPractice: "Use <SignIn /> components for auth flow."
  },
  vercel: {
    alerts: "10s execution limit on Serverless functions. 1M Edge invocations limit.",
    bestPractice: "Use Edge functions for geo-routing or auth redirects."
  }
};

// --- 2. DOCUMENT PARSING ENGINE ---
async function parseFile(base64Data, mimeType) {
  // We use the built-in Buffer instead of the failed 'base64-to-tensor' package
  const buffer = Buffer.from(base64Data, 'base64');
  
  try {
    if (mimeType === 'application/pdf') {
      const data = await pdf(buffer);
      return data.text;
    } 
    if (mimeType.includes('officedocument.wordprocessingml')) {
      const data = await mammoth.extractRawText({ buffer });
      return data.value;
    }
    if (mimeType.includes('spreadsheetml')) {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      return workbook.SheetNames.map(n => xlsx.utils.sheet_to_csv(workbook.Sheets[n])).join('\n');
    }
    return buffer.toString('utf-8');
  } catch (e) {
    return `[Error parsing ${mimeType}]`;
  }
}

// --- 3. THE ORCHESTRATION ENDPOINT ---
app.post('/orchestrate', async (req, res) => {
  try {
    const { stacks = [], files = [] } = req.body;

    let stackContext = "### STACK ENFORCEMENT RULES\n";
    stacks.forEach(s => {
      const data = STACK_DATA[s.toLowerCase()];
      if (data) stackContext += `- [${s.toUpperCase()}]: ${data.alerts} (Best Practice: ${data.bestPractice})\n`;
    });

    let fileContent = "\n### DOCUMENT DATA\n";
    for (const file of files) {
      const text = await parseFile(file.base64, file.type);
      fileContent += `\n--- Source: ${file.name} ---\n${text}\n`;
    }

    res.json({ enrichedContext: stackContext + fileContent });
  } catch (err) {
    res.status(500).json({ error: "Orchestration failed", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Decomposer-Intel live on port ${PORT}`));

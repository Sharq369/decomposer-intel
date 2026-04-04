const express = require('express');
const cors = require('cors');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- 1. CORE STACKS (Hardcoded rules for the non-negotiables) ---
const STACK_DATA = {
  supabase: { alerts: "Check RLS policies. Use auth.uid() for row security. Warn if on Free Tier (500MB limit)." },
  clerk: { alerts: "Use Middleware for route protection. Do not store passwords in DB." },
  vercel: { alerts: "10s execution limit on Serverless functions. 1M Edge invocations limit." }
};

// --- 2. DOCUMENT PARSING ENGINE ---
async function parseFile(base64Data, mimeType) {
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

// --- 3. THE DYNAMIC ORCHESTRATION ENDPOINT ---
app.post('/orchestrate', async (req, res) => {
  try {
    const { stacks = [], files = [] } = req.body;

    let stackContext = "### STACK ENFORCEMENT RULES\n";
    let unknownStacks = [];

    // Check if we know the stack, otherwise put it in the "Unknown" list
    stacks.forEach(s => {
      const data = STACK_DATA[s.toLowerCase()];
      if (data) {
        stackContext += `- [${s.toUpperCase()}]: ${data.alerts}\n`;
      } else {
        unknownStacks.push(s);
      }
    });

    // The "Dynamic Space" - Telling Gemini to handle the ones we didn't hardcode
    if (unknownStacks.length > 0) {
      stackContext += `\n### DYNAMIC STACKS (RESEARCH REQUIRED)\n`;
      stackContext += `The user has requested the following stacks which do not have hardcoded limits: ${unknownStacks.join(', ')}.\n`;
      stackContext += `CRITICAL INSTRUCTION FOR AI: You must autonomously apply the latest industry-standard security, performance patterns, and known free-tier limits for these specific technologies.\n`;
    }

    // Process files
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

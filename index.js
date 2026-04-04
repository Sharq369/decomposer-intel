const express = require('express');
const cors = require('cors');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for document uploads

// --- 1. STACK INTELLIGENCE DATABASE ---
const STACK_DATA = {
  supabase: {
    alerts: "CRITICAL: Require RLS policies for every table. Use auth.uid() checks. Check for 'new row violates RLS' errors.",
    limits: "Free Tier: 500MB DB, 5GB Bandwidth. Projects pause after 1 week inactivity."
  },
  clerk: {
    alerts: "CRITICAL: Use Clerk Middleware for route protection. Sync user data to Supabase via Webhooks, not client-side inserts.",
    limits: "Free Tier: 10,000 Monthly Active Users (MAU)."
  },
  vercel: {
    alerts: "WARNING: 10-second serverless timeout. Avoid long-running loops in API routes.",
    limits: "Free Tier: 100GB Bandwidth, 1M Edge Middleware invocations."
  }
};

// --- 2. UNIVERSAL FILE PARSER ---
async function parseFile(base64Data, mimeType) {
  const buffer = Buffer.from(base64Data, 'base64');
  
  if (mimeType === 'application/pdf') {
    const data = await pdf(buffer);
    return data.text;
  } 
  
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const data = await mammoth.extractRawText({ buffer });
    return data.value;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    let text = "";
    workbook.SheetNames.forEach(name => {
      text += `\nSheet: ${name}\n` + xlsx.utils.sheet_to_csv(workbook.Sheets[name]);
    });
    return text;
  }

  return buffer.toString('utf-8'); // Fallback for TXT/MD
}

// --- 3. THE UNIFIED API ENDPOINT ---
app.post('/orchestrate', async (req, res) => {
  try {
    const { stacks = [], files = [] } = req.body;

    // A. Gather Stack Rules
    let context = "### ARCHITECTURAL CONSTRAINTS\n";
    stacks.forEach(s => {
      const key = s.toLowerCase();
      if (STACK_DATA[key]) {
        context += `\n[${s.toUpperCase()}]:\n- Rules: ${STACK_DATA[key].alerts}\n- Limits: ${STACK_DATA[key].limits}\n`;
      }
    });

    // B. Parse Uploaded Documents
    let documentText = "\n### EXTRACTED BUSINESS LOGIC FROM DOCUMENTS\n";
    for (const file of files) {
      const content = await parseFile(file.base64, file.type);
      documentText += `\n--- Source: ${file.name} ---\n${content}\n`;
    }

    res.json({ 
      enrichedContext: context + documentText 
    });

  } catch (error) {
    console.error("Orchestration Error:", error);
    res.status(500).json({ error: "Failed to process architecture context." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Orchestrator active on port ${PORT}`));

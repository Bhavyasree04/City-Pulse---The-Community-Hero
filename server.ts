import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));

// Lazy initialize Google Gen AI to prevent server crashes on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in AI Studio Secrets.");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

// REST API for severity and department analysis
app.post("/api/analyze-issue", async (req, res) => {
  const { issueType, description } = req.body;

  if (!description) {
    return res.status(400).json({ error: "Description is required" });
  }

  try {
    const ai = getAiClient();
    const prompt = `
You are an expert civic analyst for "Community Hero", a smart civic issue reporting platform.
Analyze this citizen-submitted complaint and predict its severity, recommend a department, and write a concise summary.

Issue Category: "${issueType || 'Unspecified'}"
Citizen's Description: "${description}"

Respond ONLY with a valid JSON object. Do not include markdown code blocks, backticks, or other text.
The JSON object must strictly match this TypeScript type structure:
{
  "predictedSeverity": "Low" | "Medium" | "Critical",
  "recommendedDepartment": string,
  "summary": string
}

Guidelines for severity:
- "Critical": Structural collapse, dangerous electrical/gas hazard, severe water/sewage flooding, major public safety hazard (e.g., open manhole, fallen electrical line, road accident blocking flow).
- "Medium": Impeding civic normal operations but not immediately life-threatening (e.g., large potholes, broken streetlights, garbage pileups, drainage blockage).
- "Low": Minor cosmetic issues, public bench broken, illegal parking, park maintenance.

The summary should be 1 or 2 polite and informative sentences summarizing the exact civic issue.
The department should be a professional, real-world department (e.g., "Roads & Highways Department", "Electricity & Power Board", "Water Supply & Sewerage Board", "Sanitation Department", "Traffic Police Department", "Horticulture & Parks Division").
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text || "";
    const data = JSON.parse(responseText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Gemini analysis failed:", error);
    // Provide robust, safe fallback defaults if the API key is missing or calls fail
    res.json({
      predictedSeverity: "Medium",
      recommendedDepartment: "Municipal Administration Department",
      summary: description.slice(0, 100) + (description.length > 100 ? "..." : "")
    });
  }
});

// Configure Vite or Static Files depending on node environment
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

setupVite().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("🚀 Community Hero is running at:");
console.log("http://localhost:3000");
  });
}).catch(err => {
  console.error("Vite server initialization failed:", err);
});

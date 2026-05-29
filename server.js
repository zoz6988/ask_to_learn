import http from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const uploadDir = path.join(__dirname, ".uploads");
const generatedDir = path.join(publicDir, "generated");
const port = Number(process.env.PORT || 4173);
const bundledPython = "C:\\Users\\91453\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const bundledPdfjs = "C:\\Users\\91453\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\pdfjs-dist\\legacy\\build\\pdf.mjs";
const bundledPdfjsRoot = "C:\\Users\\91453\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\pdfjs-dist";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readRequestBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getBoundary(contentType = "") {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] || match?.[2] || "";
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(delimiter);
  while (start !== -1) {
    start += delimiter.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const next = buffer.indexOf(delimiter, start);
    if (next === -1) break;
    const part = buffer.subarray(start, next - 2);
    const split = part.indexOf(Buffer.from("\r\n\r\n"));
    if (split !== -1) {
      const rawHeaders = part.subarray(0, split).toString("utf8");
      const content = part.subarray(split + 4);
      const name = rawHeaders.match(/name="([^"]+)"/)?.[1] || "";
      const filename = rawHeaders.match(/filename="([^"]*)"/)?.[1] || "";
      parts.push({ name, filename, content });
    }
    start = next;
  }
  return parts;
}

async function extractPdfText(fileBuffer, originalName) {
  await mkdir(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${originalName.replace(/[^a-z0-9._-]/gi, "_")}`;
  const pdfPath = path.join(uploadDir, safeName);
  await writeFile(pdfPath, fileBuffer);
  try {
    try {
      return await extractPdfTextWithPdfjs(pdfPath);
    } catch (pdfjsError) {
      try {
        return await extractPdfTextWithPython(pdfPath);
      } catch (pythonError) {
        try {
          return await extractPdfTextWithPdftotext(pdfPath);
        } catch (pdftotextError) {
          throw new Error(
            [
              "PDF 文本提取失败。",
              `pdfjs: ${pdfjsError.message}`,
              `Python: ${pythonError.message}`,
              `pdftotext: ${pdftotextError.message}`,
              "如果这是扫描版或图片型 PDF，请先用 OCR 转成可复制文本，或把正文复制到资料正文框。"
            ].join("；")
          );
        }
      }
    }
  } finally {
    await rm(pdfPath, { force: true });
  }
}

function ensurePdfjsDomPolyfills() {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.e = 0;
        this.f = 0;
      }
      multiplySelf() { return this; }
      translateSelf() { return this; }
      scaleSelf() { return this; }
      rotateSelf() { return this; }
      invertSelf() { return this; }
      transformPoint(point) { return point; }
    };
  }
  if (!globalThis.ImageData) globalThis.ImageData = class ImageData {};
  if (!globalThis.Path2D) globalThis.Path2D = class Path2D {};
}

async function extractPdfTextWithPdfjs(pdfPath) {
  ensurePdfjsDomPolyfills();
  const pdfjs = await import(pathToFileURL(bundledPdfjs).href);
  const data = new Uint8Array(await readFile(pdfPath));
  const documentTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    cMapUrl: pathToFileURL(path.join(bundledPdfjsRoot, "cmaps")).href + "/",
    cMapPacked: true,
    standardFontDataUrl: pathToFileURL(path.join(bundledPdfjsRoot, "standard_fonts")).href + "/"
  });
  const document = await documentTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => item.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(text);
  }
  const extracted = pages.join("\n\n").trim();
  if (!extracted) throw new Error("pdfjs 没有提取到文本。");
  return extracted;
}

function extractPdfTextWithPython(pdfPath) {
  const script = [
    "import sys",
    "from pypdf import PdfReader",
    "reader = PdfReader(sys.argv[1])",
    "parts = []",
    "for page in reader.pages:",
    "    parts.append(page.extract_text() or '')",
    "text = '\\n\\n'.join(parts).strip()",
    "sys.stdout.buffer.write(text.encode('utf-8', errors='replace'))"
  ].join("\n");

  return new Promise((resolve, reject) => {
    const child = spawn(bundledPython, ["-c", script, pdfPath], { windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const text = Buffer.concat(stdout).toString("utf8").trim();
      if (code === 0 && text) {
        resolve(text);
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || "pypdf 没有提取到文本。"));
    });
  });
}

function extractPdfTextWithPdftotext(pdfPath) {
  return new Promise((resolve, reject) => {
      const child = spawn("pdftotext", [pdfPath, "-"], { windowsHide: true });
      const stdout = [];
      const stderr = [];
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        const text = Buffer.concat(stdout).toString("utf8").trim();
        if (code === 0 && text) {
          resolve(text);
          return;
        }
        reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || "pdftotext 没有提取到文本。"));
      });
    });
}

function buildSystemPrompt() {
  return [
    "你是一个提问式精读学习系统，角色是苏格拉底式导师。",
    "你要围绕用户提供的资料帮助学习：先建立知识结构，再通过提问、诊断、纠错、追问推进掌握。",
    "必须遵守：少讲多问；每次优先只提出一个主问题；反馈要指出正确点、遗漏点、误解点和下一步追问。",
    "学习的终极目标是理解原理和思路，而不是记忆数据。不要围绕样本量、具体分数、表格数值、实验指标的小数点或数据细节提问，除非这些数据直接服务于解释核心原理。",
    "优先提问：为什么这样设计、机制如何运作、概念之间如何关联、作者思路如何迁移、这个原理有什么边界和局限。",
    "掌握标准包括：能用自己的话解释、能举例、能区分相近概念、能迁移应用、能指出局限、能放回整体结构。",
    "输出必须是中文。需要结构化数据时，只输出合法 JSON，不要 Markdown 代码围栏。"
  ].join("\n");
}

function buildUserPrompt(mode, payload) {
  if (mode === "analyze") {
    return [
      "请解析下面学习资料，建立可用于提问学习的结构。",
      "输出 JSON，字段为：title, summary, learningGoals, units。",
      "units 每项包含 id, title, importance, prerequisites, keyIdeas, commonMisunderstandings, masteryCriteria, questions。",
      "questions 每项包含 id, type, difficulty, prompt, purpose, expectedAnswer。",
      "问题要由浅入深，覆盖原理识别、概念理解、机制关系、思路应用、局限反思五类。",
      "不要生成关于数据细节的问题，例如具体准确率、样本数量、表格数值、年份、页码、作者机构等记忆型问题。",
      "如果资料中有实验或数据，只把它们作为支撑证据处理，问题应追问它证明了什么原理、为什么能支持作者思路、有什么限制。",
      "每个知识单元的问题都应帮助用户理解该单元背后的方法论、因果逻辑或可迁移思路。",
      `资料标题或文件名：${payload.title || "未命名资料"}`,
      `资料正文：\n${payload.text}`
    ].join("\n\n");
  }

  if (mode === "feedback") {
    return [
      "请根据资料结构、当前问题和用户回答进行诊断反馈。",
      "输出 JSON，字段为：score, status, correctParts, missingParts, misconceptions, improvedAnswer, advice, followUpQuestion, masteryDelta。",
      "score 为 0-100；status 只能是 retry, pass, mastered 之一。",
      "如果用户明显未掌握，status=retry 并给一个更聚焦的追问；如果基本掌握，status=pass；如果能解释、迁移或批判，status=mastered。",
      "反馈重点评价用户是否理解原理、机制、思路和可迁移性。不要因为用户没有记住具体数据而扣分，除非数据是核心定义的一部分。",
      "followUpQuestion 必须继续追问原理理解、关系推理、应用迁移或局限反思，不要追问数据细节。",
      `资料结构：${JSON.stringify(payload.course)}`,
      `当前知识单元：${JSON.stringify(payload.unit)}`,
      `当前问题：${JSON.stringify(payload.question)}`,
      `用户回答：${payload.answer}`
    ].join("\n\n");
  }

  if (mode === "map") {
    return [
      "请基于资料结构和学习记录，生成最终学习逻辑图。",
      "输出 JSON，字段为：knowledgeTree, learningPath, argumentMap, weakPoints, mermaid。",
      "knowledgeTree 用层级文本数组表达；learningPath 用步骤数组表达；argumentMap 用因果链数组表达；weakPoints 给出仍需复习的点；mermaid 输出 mindmap 或 flowchart 文本。",
      "逻辑图要突出原理、机制、概念关系、论证思路和应用迁移，不要把数据表格或指标细节作为主干。",
      `资料结构：${JSON.stringify(payload.course)}`,
      `学习记录：${JSON.stringify(payload.history)}`
    ].join("\n\n");
  }

  return JSON.stringify(payload);
}

function parseModelJson(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(cleaned);
}

function renderLogicMapImage(payload) {
  return new Promise(async (resolve, reject) => {
    await mkdir(generatedDir, { recursive: true });
    const filename = `logic-map-${Date.now()}.png`;
    const outputPath = path.join(generatedDir, filename);
    const scriptPath = path.join(__dirname, "tools", "render_logic_map.py");
    const child = spawn(bundledPython, [scriptPath], { windowsHide: true });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(`/generated/${filename}`);
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || "逻辑图图片生成失败。"));
    });
    child.stdin.end(JSON.stringify({ ...payload, output: outputPath }));
  });
}

function normalizeApiError(message = "") {
  const lower = message.toLowerCase();
  if (lower.includes("insufficient balance")) {
    return "API 账户余额不足。请到 DeepSeek 控制台充值，或更换一个有余额的 API Key。";
  }
  if (lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("authentication")) {
    return "API Key 无效或没有权限。请检查 Key 是否复制完整，或更换新的 API Key。";
  }
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("invalid"))) {
    return "模型名称不可用。请尝试 deepseek-chat 或 deepseek-reasoner。";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "请求过于频繁，已触发接口限速。请稍后再试。";
  }
  return message || "API 请求失败。";
}

async function callOpenAI({ mode, payload, apiKey, baseUrl, model }) {
  const key = apiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("缺少 API Key。请在页面中填写，或设置 DEEPSEEK_API_KEY 环境变量。");
  }

  const apiBaseUrl = (baseUrl || process.env.OPENAI_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: model || process.env.OPENAI_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(mode, payload) }
      ],
      temperature: mode === "feedback" ? 0.2 : 0.35
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(normalizeApiError(data.error?.message));
  }
  const text = data.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("OpenAI 返回为空。");
  return parseModelJson(text);
}

async function handleApi(req, res) {
  try {
    if (req.url === "/api/extract" && req.method === "POST") {
      const boundary = getBoundary(req.headers["content-type"]);
      if (!boundary) return sendJson(res, 400, { error: "缺少 multipart boundary。" });
      const body = await readRequestBody(req);
      const file = parseMultipart(body, boundary).find((part) => part.name === "file");
      if (!file?.content?.length) return sendJson(res, 400, { error: "没有收到文件。" });
      const ext = path.extname(file.filename).toLowerCase();
      let text = "";
      if (ext === ".pdf") {
        text = await extractPdfText(file.content, file.filename);
      } else {
        text = file.content.toString("utf8");
      }
      return sendJson(res, 200, { filename: file.filename, text });
    }

    if (req.url === "/api/openai" && req.method === "POST") {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body.toString("utf8"));
      const result = await callOpenAI(payload);
      return sendJson(res, 200, { result });
    }

    if (req.url === "/api/render-map" && req.method === "POST") {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body.toString("utf8"));
      const imageUrl = await renderLogicMapImage(payload);
      return sendJson(res, 200, { imageUrl });
    }

    sendJson(res, 404, { error: "API not found." });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  const filePath = requestPath === "/" ? path.join(publicDir, "index.html") : path.join(publicDir, requestPath);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(normalized);
    res.writeHead(200, { "content-type": mimeTypes[path.extname(normalized)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Ask-to-Learn is running at http://localhost:${port}`);
});

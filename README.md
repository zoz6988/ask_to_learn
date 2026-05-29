# Ask-to-Learn

Ask-to-Learn is a local web app for question-driven deep reading. It helps a learner study textbooks, papers, notes, and other long-form materials through an active loop:

```text
Upload or paste material
-> AI extracts a principle-centered knowledge structure
-> AI asks one question at a time
-> User answers in their own words
-> AI diagnoses understanding and corrects misconceptions
-> Progress is updated by knowledge unit
-> AI generates a structured learning logic map
-> Python renders the map as a PNG image
```

The design goal is not to quiz users on data details. The app is tuned to help users understand principles, mechanisms, reasoning paths, transferable ideas, and limitations.

## Features

- Upload PDF, TXT, Markdown, CSV, or JSON files.
- Paste learning material directly into the source text area.
- Extract PDF text with `pdfjs-dist`, then fallback to `pypdf`, then fallback to `pdftotext`.
- Call a Chat Completions-compatible API, defaulting to DeepSeek.
- Generate principle-focused learning units and questions.
- Diagnose user answers with score, correct parts, missing parts, misconceptions, improved answer, advice, and follow-up question.
- Show visible progress bars for file reading, AI analysis, answer diagnosis, and map generation.
- Track mastery progress by knowledge unit.
- Generate a structured learning logic map.
- Render a polished PNG logic map with Python and Pillow.

## Project Structure

```text
askmeanything/
├── package.json
├── server.js
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── generated/
├── tools/
│   └── render_logic_map.py
├── article/
└── docs/
    └── workflows/
```

## Requirements

This project is intentionally dependency-light. It uses local bundled runtimes in the Codex environment:

- Node.js:

```cmd
C:\Users\91453\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
```

- Python:

```cmd
C:\Users\91453\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
```

The Python rendering script uses Pillow from the bundled runtime.

## Run

From the project root:

```cmd
"C:\Users\91453\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

Then open:

```text
http://localhost:4173
```

If you use a normal Node.js installation, this also works:

```cmd
node server.js
```

## API Configuration

The app defaults to:

```text
https://api.deepseek.com/chat/completions
```

In the page, fill in:

- API Key
- API address, for example `https://api.deepseek.com`
- Model, for example `deepseek-chat`

You can also set environment variables:

```cmd
set DEEPSEEK_API_KEY=your-key
set OPENAI_BASE_URL=https://api.deepseek.com
set OPENAI_MODEL=deepseek-chat
```

Then run the server in the same terminal.

## Learning Philosophy

The question generator is guided by these rules:

- Prefer questions about principles, mechanisms, conceptual relationships, applications, and limitations.
- Avoid questions about raw data details such as exact scores, sample sizes, page numbers, table values, or author affiliations.
- Treat experiments and numbers as supporting evidence, not as the center of learning.
- Ask one main question at a time.
- Use feedback to expose misunderstandings and guide the next question.

## Troubleshooting

### The page has no reaction

Check whether the server is still listening:

```cmd
netstat -ano | findstr :4173
```

Check the process:

```cmd
tasklist /FI "PID eq YOUR_PID"
```

Open browser DevTools and inspect:

- Console for JavaScript errors.
- Network for `/api/extract`, `/api/openai`, or `/api/render-map` requests.

### PDF extraction fails

The app tries multiple extractors. If all fail, the PDF is likely scanned or image-only. Use OCR first, or copy the text into the source text area manually.

### API says insufficient balance

This comes from the API provider. Recharge the account or use another key with available balance.

### Generated logic map image does not appear

Check whether Python can run:

```cmd
"C:\Users\91453\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" tools\render_logic_map.py
```

The script expects JSON on stdin, so direct execution without input will error; this only verifies that Python starts.

## Main Files

- `server.js`: local server, API proxy, PDF extraction, Python image rendering endpoint.
- `public/app.js`: frontend learning flow, progress display, API calls.
- `public/index.html`: app layout.
- `public/styles.css`: visual design.
- `tools/render_logic_map.py`: PNG rendering for the final learning logic map.

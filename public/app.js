const state = {
  course: null,
  unitIndex: 0,
  questionIndex: 0,
  progress: {},
  history: [],
  lastFeedback: null
};

const els = {
  apiKey: document.querySelector("#apiKey"),
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  model: document.querySelector("#model"),
  fileInput: document.querySelector("#fileInput"),
  fileStatus: document.querySelector("#fileStatus"),
  sourceText: document.querySelector("#sourceText"),
  textCount: document.querySelector("#textCount"),
  analyzeBtn: document.querySelector("#analyzeBtn"),
  progressPanel: document.querySelector("#progressPanel"),
  progressTitle: document.querySelector("#progressTitle"),
  progressPercent: document.querySelector("#progressPercent"),
  progressBar: document.querySelector("#progressBar"),
  progressDetail: document.querySelector("#progressDetail"),
  courseTitle: document.querySelector("#courseTitle"),
  statusPill: document.querySelector("#statusPill"),
  unitTitle: document.querySelector("#unitTitle"),
  questionMeta: document.querySelector("#questionMeta"),
  questionBox: document.querySelector("#questionBox"),
  answerInput: document.querySelector("#answerInput"),
  submitAnswerBtn: document.querySelector("#submitAnswerBtn"),
  nextQuestionBtn: document.querySelector("#nextQuestionBtn"),
  mapBtn: document.querySelector("#mapBtn"),
  feedbackBox: document.querySelector("#feedbackBox"),
  unitList: document.querySelector("#unitList"),
  mapOutput: document.querySelector("#mapOutput")
};

let isExtracting = false;
let progressTimer = null;

function setProgress(title, percent, detail, busy = false) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  els.progressTitle.textContent = title;
  els.progressPercent.textContent = `${value}%`;
  els.progressBar.style.width = `${value}%`;
  els.progressDetail.textContent = detail;
  els.progressPanel.classList.toggle("busy", busy);
}

function startEstimatedProgress(title, start, cap, detail) {
  stopEstimatedProgress();
  setProgress(title, start, detail, true);
  let value = start;
  progressTimer = window.setInterval(() => {
    const remaining = cap - value;
    value += Math.max(1, remaining * 0.08);
    if (value >= cap) value = cap;
    setProgress(title, value, detail, true);
  }, 900);
}

function stopEstimatedProgress(title = "完成", detail = "准备好了。") {
  if (progressTimer) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
  if (title) setProgress(title, 100, detail, false);
}

function setBusy(message) {
  els.statusPill.textContent = message;
  els.analyzeBtn.disabled = true;
  els.submitAnswerBtn.disabled = true;
  els.nextQuestionBtn.disabled = true;
  els.mapBtn.disabled = true;
}

function clearBusy() {
  els.analyzeBtn.disabled = false;
  els.submitAnswerBtn.disabled = !state.course;
  els.nextQuestionBtn.disabled = !state.course;
  els.mapBtn.disabled = !state.course;
  els.statusPill.textContent = state.course ? "学习中" : "未开始";
}

function updateTextCount() {
  els.textCount.textContent = `${els.sourceText.value.trim().length} 字`;
}

function getCurrentUnit() {
  return state.course?.units?.[state.unitIndex];
}

function getCurrentQuestion() {
  return getCurrentUnit()?.questions?.[state.questionIndex];
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function callOpenAI(mode, payload) {
  const { result } = await postJson("/api/openai", {
    mode,
    payload,
    apiKey: els.apiKey.value.trim(),
    baseUrl: els.apiBaseUrl.value.trim(),
    model: els.model.value
  });
  return result;
}

async function renderMapImage(map) {
  const data = await postJson("/api/render-map", {
    title: state.course?.title || "学习逻辑图",
    map
  });
  return data.imageUrl;
}

function renderCourse() {
  if (!state.course) return;
  els.courseTitle.textContent = state.course.title || "未命名资料";
  const unit = getCurrentUnit();
  const question = getCurrentQuestion();
  els.unitTitle.textContent = unit?.title || "知识单元";
  els.questionBox.textContent = question?.prompt || "这个单元暂时没有问题。";
  els.questionMeta.textContent = question ? `${question.type || "问题"} · ${question.difficulty || "难度未标注"}` : "-";
  els.answerInput.value = "";
  els.feedbackBox.className = "feedback-box empty";
  els.feedbackBox.textContent = "回答后，这里会显示诊断、更正和追问。";
  renderUnits();
}

function renderUnits() {
  els.unitList.innerHTML = "";
  state.course.units.forEach((unit, index) => {
    const progress = state.progress[unit.id] || 0;
    const item = document.createElement("button");
    item.className = `unit-item${index === state.unitIndex ? " active" : ""}`;
    item.innerHTML = `
      <strong>${escapeHtml(unit.title)}</strong>
      <div class="progress"><span style="width:${Math.min(progress, 100)}%"></span></div>
      <div class="unit-meta"><span>${unit.importance || "核心知识"}</span><span>${progress}%</span></div>
    `;
    item.addEventListener("click", () => {
      state.unitIndex = index;
      state.questionIndex = 0;
      renderCourse();
    });
    els.unitList.appendChild(item);
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderFeedback(feedback) {
  els.feedbackBox.className = "feedback-box";
  els.feedbackBox.innerHTML = `
    <strong>评分：${feedback.score ?? "-"} / 100 · ${statusText(feedback.status)}</strong>
    <p><b>正确部分：</b>${escapeHtml((feedback.correctParts || []).join("；") || "暂无")}</p>
    <p><b>遗漏部分：</b>${escapeHtml((feedback.missingParts || []).join("；") || "暂无")}</p>
    <p><b>需要更正：</b>${escapeHtml((feedback.misconceptions || []).join("；") || "暂无")}</p>
    <p><b>更准确的理解：</b>${escapeHtml(feedback.improvedAnswer || "")}</p>
    <p><b>建议：</b>${escapeHtml(feedback.advice || "")}</p>
    <p><b>追问：</b>${escapeHtml(feedback.followUpQuestion || "")}</p>
  `;
}

function statusText(status) {
  return {
    retry: "继续追问",
    pass: "基本掌握",
    mastered: "已掌握"
  }[status] || "已反馈";
}

function advanceQuestion() {
  const unit = getCurrentUnit();
  if (!unit) return;
  if (state.questionIndex < unit.questions.length - 1) {
    state.questionIndex += 1;
  } else if (state.unitIndex < state.course.units.length - 1) {
    state.unitIndex += 1;
    state.questionIndex = 0;
  }
  renderCourse();
}

function updateProgress(unit, feedback) {
  const previous = state.progress[unit.id] || 0;
  const delta = Number(feedback.masteryDelta ?? 0);
  const scoreDelta = feedback.status === "mastered" ? 28 : feedback.status === "pass" ? 18 : 6;
  state.progress[unit.id] = Math.max(previous, Math.min(100, previous + Math.max(delta, scoreDelta)));
}

async function extractFile(file) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/extract", { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "文件解析失败");
  return data;
}

async function readSelectedFile() {
  const file = els.fileInput.files?.[0];
  if (!file) return "";

  isExtracting = true;
  els.fileStatus.textContent = `正在读取：${file.name}`;
  startEstimatedProgress("读取资料", 8, 88, "正在从文件中提取可学习文本。");
  try {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      const text = await file.text();
      els.sourceText.value = text;
      updateTextCount();
      els.fileStatus.textContent = `已读取：${file.name}，约 ${text.trim().length} 字`;
      stopEstimatedProgress("资料已读取", `已提取约 ${text.trim().length} 字。`);
      return text;
    }

    const { filename, text } = await extractFile(file);
    els.sourceText.value = text;
    updateTextCount();
    els.fileStatus.textContent = `已读取：${filename}，约 ${text.trim().length} 字`;
    stopEstimatedProgress("资料已读取", `已提取约 ${text.trim().length} 字。`);
    return text;
  } finally {
    isExtracting = false;
  }
}

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files?.[0];
  if (!file) return;
  try {
    setBusy("解析文件");
    await readSelectedFile();
    els.statusPill.textContent = "文件已读取";
  } catch (error) {
    stopEstimatedProgress("读取失败", error.message);
    els.fileStatus.textContent = `读取失败：${error.message}`;
    alert(error.message);
  } finally {
    clearBusy();
  }
});

els.analyzeBtn.addEventListener("click", async () => {
  if (isExtracting) {
    alert("文件还在读取中，请稍等几秒后再解析。");
    return;
  }

  let text = els.sourceText.value.trim();
  if (text.length < 200 && els.fileInput.files?.[0]) {
    try {
      setBusy("重新读取文件");
      text = (await readSelectedFile()).trim();
    } catch (error) {
      stopEstimatedProgress("读取失败", error.message);
      els.fileStatus.textContent = `读取失败：${error.message}`;
      alert(`文件读取失败：${error.message}`);
      clearBusy();
      return;
    }
  }

  if (text.length < 200) {
    alert(`资料正文太短，目前只有 ${text.length} 字。请确认 PDF 能被提取，或把正文复制到左侧资料正文框。`);
    clearBusy();
    return;
  }
  try {
    setBusy("AI 建立知识结构");
    startEstimatedProgress("AI 解析资料", 35, 94, "正在识别核心原理、机制关系和可迁移思路。通常需要几十秒。");
    const course = await callOpenAI("analyze", {
      title: els.fileInput.files?.[0]?.name || "学习资料",
      text: text.slice(0, 90000)
    });
    state.course = course;
    state.unitIndex = 0;
    state.questionIndex = 0;
    state.progress = Object.fromEntries((course.units || []).map((unit) => [unit.id, 0]));
    state.history = [];
    renderCourse();
    stopEstimatedProgress("学习路径已生成", "可以开始回答第一个原理理解问题。");
  } catch (error) {
    stopEstimatedProgress("解析失败", error.message);
    alert(error.message);
  } finally {
    clearBusy();
  }
});

els.sourceText.addEventListener("input", updateTextCount);

els.submitAnswerBtn.addEventListener("click", async () => {
  const answer = els.answerInput.value.trim();
  if (!answer) {
    alert("请先写下你的回答。");
    return;
  }
  const unit = getCurrentUnit();
  const question = getCurrentQuestion();
  try {
    setBusy("AI 诊断回答");
    startEstimatedProgress("AI 诊断回答", 18, 92, "正在判断你的原理理解、遗漏点和可追问方向。");
    const feedback = await callOpenAI("feedback", {
      course: state.course,
      unit,
      question,
      answer
    });
    state.lastFeedback = feedback;
    state.history.push({
      unitId: unit.id,
      unitTitle: unit.title,
      question: question.prompt,
      answer,
      feedback
    });
    updateProgress(unit, feedback);
    renderFeedback(feedback);
    renderUnits();
    stopEstimatedProgress("诊断完成", "已给出更正、建议和追问。");
  } catch (error) {
    stopEstimatedProgress("诊断失败", error.message);
    alert(error.message);
  } finally {
    clearBusy();
  }
});

els.nextQuestionBtn.addEventListener("click", advanceQuestion);

els.mapBtn.addEventListener("click", async () => {
  if (!state.course) return;
  try {
    setBusy("生成逻辑图");
    startEstimatedProgress("生成逻辑图", 20, 93, "正在把资料整理成原理链路、学习路径和知识结构。");
    const map = await callOpenAI("map", {
      course: state.course,
      history: state.history
    });
    setProgress("渲染图片", 82, "正在用 Python 生成可保存的 PNG 知识图。", true);
    const imageUrl = await renderMapImage(map);
    els.mapOutput.innerHTML = `
      <div class="map-section">
        <h4>知识图图片</h4>
        <img class="logic-map-image" src="${escapeHtml(imageUrl)}" alt="学习逻辑图" />
        <p><a href="${escapeHtml(imageUrl)}" download="learning-logic-map.png">下载 PNG 图片</a></p>
      </div>
      ${renderMapSection("知识树", map.knowledgeTree)}
      ${renderMapSection("学习路径", map.learningPath)}
      ${renderMapSection("论证链", map.argumentMap)}
      ${renderMapSection("薄弱点", map.weakPoints)}
      <div class="map-section"><h4>Mermaid</h4><pre>${escapeHtml(map.mermaid || "")}</pre></div>
    `;
    stopEstimatedProgress("逻辑图完成", "知识体系已经生成。");
  } catch (error) {
    stopEstimatedProgress("生成失败", error.message);
    alert(error.message);
  } finally {
    clearBusy();
  }
});

function renderMapSection(title, value) {
  const items = Array.isArray(value) ? value : [value].filter(Boolean);
  return `
    <div class="map-section">
      <h4>${escapeHtml(title)}</h4>
      <ul>${items.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : JSON.stringify(item))}</li>`).join("")}</ul>
    </div>
  `;
}

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRequire = createRequire(import.meta.url);
const { chromium } = repoRequire('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const casesPath = path.join(here, 'cases.json');
const spec = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const requestedAgent = getArg('agent', 'all');
const requestedCase = getArg('case', null);
const runId = getArg('run-id', `battery-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const root = path.resolve('C:/temp/evals', runId);
const terminal = new Set(['completed', 'failed', 'cancelled']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const agents = {
  opencode: { label: 'OpenCode / Sisyphus - ultraworker', assistantId: 'bare:53861a53', agentId: '53861a53' },
  gemini: { label: 'Gemini CLI / default', assistantId: 'bare:cc126dd5', agentId: 'cc126dd5' },
  hermes: { label: 'Hermes / default', assistantId: 'bare:55f3ed1c', agentId: '55f3ed1c' },
};

if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
const selectedAgents = requestedAgent === 'all' ? Object.keys(agents) : [requestedAgent];
for (const key of selectedAgents) {
  if (!agents[key]) throw new Error(`Unknown agent: ${key}`);
}

const replaceWorkspace = (value, workspace) => value.replaceAll('{workspace}', workspace.replaceAll('\\', '/'));
const jsonOutput = (value) => JSON.stringify(value);
const countToolCallObjects = (value) => {
  let count = 0;
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const type = node.type ?? node.message_type ?? node.kind;
    if (typeof type === 'string' && /(^|_)(tool_call|tool_use|acp_tool)($|_)/i.test(type)) count += 1;
    Object.values(node).forEach(visit);
  };
  visit(value);
  return count;
};

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => candidate.url().includes('localhost:5173')) || context.pages()[0];
if (!page) throw new Error('Renderer page not found');
const backendPort = await page.evaluate(() => window.__backendPort);
const getBackendJson = async (urlPath) => {
  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}${urlPath}`);
    if (!response.ok) return { status: response.status, body: null };
    return { status: response.status, body: await response.json() };
  } catch (error) {
    return { status: 0, body: null, error: String(error) };
  }
};
const createTask = (mission, workspace, assistantId) =>
  page.evaluate(
    ({ mission: value, workspace: ws, assistantId: id }) =>
      window.taskAPI.create(value, { workspace: ws, assistant_id: id }),
    { mission, workspace, assistantId }
  );
const getTask = (id) => page.evaluate((taskId) => window.taskAPI.get(taskId), id);
const cancelTask = (id) => page.evaluate((taskId) => window.taskAPI.cancel(taskId), id);

const runSetup = (command, workspace) => {
  const result = spawnSync(process.execPath, ['evals/setup.mjs', command, workspace], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(`setup failed: ${result.stderr || result.stdout}`);
};
const runVerifier = (command, workspace) => {
  const result = spawnSync(process.execPath, [`evals/verifiers/${command}.mjs`, workspace], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  };
};

async function waitForTerminal(taskId, timeoutMs, cancelAtMs = null) {
  const started = Date.now();
  let cancelApplied = false;
  let current = await getTask(taskId);
  while (Date.now() - started < timeoutMs && !terminal.has(current.status)) {
    if (cancelAtMs !== null && !cancelApplied && Date.now() - started >= cancelAtMs) {
      await cancelTask(taskId);
      cancelApplied = true;
    }
    await sleep(2000);
    current = await getTask(taskId);
  }
  if (!terminal.has(current.status)) {
    await cancelTask(taskId).catch(() => undefined);
    return { task: current, durationMs: Date.now() - started, timedOut: true, cancelApplied };
  }
  return { task: current, durationMs: Date.now() - started, timedOut: false, cancelApplied };
}

async function runTask(agentKey, testCase, runNumber) {
  const agent = agents[agentKey];
  const workspace = path.join(root, agentKey, testCase.id, `run-${runNumber}`);
  fs.mkdirSync(workspace, { recursive: true });
  runSetup(testCase.id, workspace);
  const startedAt = Date.now();
  const initialTask = await createTask(
    replaceWorkspace(testCase.prompt, workspace),
    workspace.replaceAll('\\', '/'),
    agent.assistantId
  );
  const initial = await waitForTerminal(
    initialTask.id,
    testCase.timeoutMs,
    testCase.requiresCancel ? testCase.cancelAfterMs : null
  );
  let finalTask = initial.task;
  let resume = null;

  if (testCase.requiresCancel) {
    if (initial.task.status === 'cancelled' && testCase.resumePrompt) {
      const resumeTask = await createTask(
        replaceWorkspace(testCase.resumePrompt, workspace),
        workspace.replaceAll('\\', '/'),
        agent.assistantId
      );
      resume = await waitForTerminal(resumeTask.id, testCase.timeoutMs, null);
      finalTask = resume.task;
    } else {
      resume = { skipped: true, reason: `initial task ended as ${initial.task.status}, not cancelled` };
    }
  }

  let conversation = null;
  let messages = null;
  if (finalTask.agent_id) {
    conversation = await getBackendJson(`/api/conversations/${finalTask.agent_id}`);
    messages = await getBackendJson(`/api/conversations/${finalTask.agent_id}/messages`);
  }
  const conversationBody = conversation?.body?.data || conversation?.body || null;
  const messagesBody = messages?.body?.data || messages?.body || null;
  const lastTokenUsage = conversationBody?.extra?.last_token_usage || conversationBody?.last_token_usage || null;
  const toolCalls = messagesBody ? countToolCallObjects(messagesBody) : null;
  const verification = testCase.testable
    ? runVerifier(testCase.id, workspace)
    : {
        exitCode: 2,
        stdout: '',
        stderr: testCase.notTestableReason || 'not testable',
      };
  const result = {
    runId,
    agentKey,
    agent: agent.label,
    agentId: agent.agentId,
    caseId: testCase.id,
    runNumber,
    workspace,
    initialTaskId: initialTask.id,
    finalTaskId: finalTask.id,
    status: finalTask.status,
    error: finalTask.error ?? null,
    resultPreview: typeof finalTask.result === 'string' ? finalTask.result.slice(0, 1000) : (finalTask.result ?? null),
    durationMs: Date.now() - startedAt,
    timedOut: initial.timedOut || Boolean(resume?.timedOut),
    harnessCancelApplied: initial.cancelApplied,
    resume: resume
      ? {
          taskId: resume.task?.id ?? null,
          status: resume.task?.status ?? null,
          skipped: resume.skipped ?? false,
          reason: resume.reason ?? null,
        }
      : null,
    toolCalls,
    lastTokenUsage,
    humanInterventions: testCase.id === '07-aprovacao-destrutiva' ? 1 : 0,
    verification,
    conversationId: finalTask.agent_id ?? null,
  };
  await page.screenshot({ path: path.join(workspace, 'task-screen.png') }).catch(() => undefined);
  fs.writeFileSync(path.join(workspace, 'run.json'), JSON.stringify(result, null, 2));
  console.log(
    jsonOutput({
      agent: agentKey,
      case: testCase.id,
      run: runNumber,
      status: result.status,
      verification: verification.exitCode,
      durationMs: result.durationMs,
    })
  );
  return result;
}

const results = [];
for (const agentKey of selectedAgents) {
  for (const testCase of spec.cases) {
    if (requestedCase && testCase.id !== requestedCase) continue;
    if (!testCase.testable) {
      results.push({ agentKey, caseId: testCase.id, status: 'not_testable', reason: testCase.notTestableReason });
      console.log(jsonOutput({ agent: agentKey, case: testCase.id, status: 'not_testable' }));
      continue;
    }
    for (let runNumber = 1; runNumber <= spec.runsPerAgent; runNumber += 1) {
      try {
        results.push(await runTask(agentKey, testCase, runNumber));
      } catch (error) {
        const failure = { agentKey, caseId: testCase.id, runNumber, status: 'harness_error', error: String(error) };
        results.push(failure);
        console.log(jsonOutput(failure));
      }
    }
  }
}

const outputPath = path.join(root, 'results.json');
fs.writeFileSync(outputPath, JSON.stringify({ runId, backendPort, agents: selectedAgents, results }, null, 2));
console.log(jsonOutput({ completed: true, outputPath, resultCount: results.length }));
process.exit(0);

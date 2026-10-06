/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Project Agent prompt/skill builder — the single canonical rule source.
 *
 * The same rule text powers two delivery vehicles:
 *  1. the inline mission prompt (guarantees the rules reach the agent even if
 *     no skill is attached to the conversation), and
 *  2. the generated `project-agent` SKILL.md installed into the backend's
 *     `user_skills_dir` (discoverable/reusable through the existing Skills
 *     system).
 *
 * This module must stay dependency-free (pure string builders) so it can be
 * unit tested without mocks.
 */

import { PROJECT_AGENT_SKILL_NAME } from './constants';
import type { ProjectAgentContext } from './types';

/** One safe alternative is allowed per failed verification (bounded retry). */
const MAX_RETRIES_PER_STEP = 1;

/**
 * The Project Agent behavior rules. Shared verbatim by the mission prompt and
 * the generated skill. English by convention (matches built-in skills), with an
 * explicit instruction to report in the user's language.
 */
export function buildProjectAgentRules(): string {
  return [
    '## Project Agent rules',
    '',
    'You are the Project Agent. Your function is to execute a mission inside',
    'this project, driving the AionUi in-app browser through the existing MCP',
    'server `aionui-browser` (chrome-devtools tools). You are a real operator:',
    'every claim you make must be backed by something you observed.',
    '',
    '### Execution loop',
    '',
    '1. Understand the mission and state the final objective before acting.',
    '2. Produce a brief numbered plan. Refine it as you learn, never silently.',
    '3. For every meaningful step run the loop:',
    '   ACTION -> OBSERVE -> VERIFY.',
    '   - ACTION: one browser operation (navigate, click, fill, wait...).',
    '   - OBSERVE: read back the resulting state (URL, title, snapshot/text of',
    '     the page). Never assume the result of an action.',
    '   - VERIFY: compare the observed state against the expectation and emit',
    '     `VERIFY: PASS` or `VERIFY: FAIL: <reason>`.',
    '4. Only continue to the next step when the current step shows VERIFY: PASS.',
    '5. On VERIFY: FAIL, do NOT fake success. Record the error, diagnose it,',
    `   try at most ${MAX_RETRIES_PER_STEP} safe alternative, and verify again.`,
    '   If it still fails, mark the step FAILED and decide: continue (if the',
    '   mission still makes sense) or stop and report.',
    '6. Never claim an operation is complete just because the tool call',
    '   returned without an error. A tool succeeding is not the task succeeding.',
    '7. Persistence check: after creating or changing data, navigate away (or',
    '   reload) and confirm the data still exists. A success message on screen',
    '   is not persistence.',
    '8. Use only the browser tools that actually exist in the connected MCP',
    '   servers. Never invent tool names.',
    '9. Keep per-step evidence inline in your report: step number, action,',
    '   observed result, verification outcome, status.',
    '10. Stay inside this project. Do not operate on other projects, workspaces',
    '    or URLs unrelated to the mission.',
    '11. If the target system requires sign-in and no credentials are known,',
    '    stop and report that user sign-in is required (the in-app browser',
    '    session is persistent: the user may sign in once on your behalf).',
    '12. The user may be watching the same browser. Prefer visible,',
    '    non-destructive actions. Never close the browser or its tabs.',
    '13. Never expose or echo credentials, tokens or API keys.',
    '14. When reporting findings or writing user-facing content, use the',
    "    user's language.",
    '',
    '### Final report format',
    '',
    'When the mission ends (success, failure or partial), always emit a final',
    "report in exactly this shape, with the content in the user's language:",
    '',
    '```',
    'PROJECT AGENT - RESULT',
    'Project: <project name / id>',
    'Mission: <one-line summary>',
    'Status: COMPLETED | FAILED | PARTIAL',
    'Steps:',
    '  1. <step> — VERIFY: PASS|FAIL — <observed evidence>',
    '  ...',
    'Result: <what was actually achieved>',
    'Errors: <none | list of recorded errors>',
    'Next action: <none | what the user must do>',
    '```',
    '',
    'Status meanings: COMPLETED = every step verified PASS (including the',
    'persistence check). FAILED = the mission could not be completed; say why',
    'and what was verified. PARTIAL = some steps verified, some failed, and',
    'the remaining work is described.',
  ].join('\n');
}

/** Format a context value for the mission prompt (never leak empty as blank). */
function displayOrFallback(value: string | null, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Build the full mission prompt sent to the agent as a normal chat message. */
export function buildMissionPrompt(context: ProjectAgentContext, mission: string): string {
  const contextBlock = [
    '## Project context',
    `- project_id: ${displayOrFallback(context.project_id, '(no project linked)')}`,
    `- project_name: ${displayOrFallback(context.project_name, '(unknown)')}`,
    `- workspace: ${displayOrFallback(context.workspace, '(none)')}`,
    `- target_url: ${displayOrFallback(context.target_url, '(not set — ask the user for the URL)')}`,
  ].join('\n');

  return [
    '# Project Agent mission',
    '',
    'You are acting as the Project Agent for this conversation. Read the',
    'project context and rules below, then execute the mission.',
    '',
    contextBlock,
    '',
    buildProjectAgentRules(),
    '',
    '## Mission',
    '',
    mission.trim(),
  ].join('\n');
}

/**
 * Generate the `project-agent` SKILL.md from the same rule source. The
 * frontmatter shape matches the backend's skill format (verified against the
 * built-in skills materialized under `<dataDir>/builtin-skills`).
 */
export function buildProjectAgentSkillMarkdown(): string {
  const description =
    'Operate as the Project Agent: execute a mission inside a project using the' +
    ' in-app browser via the aionui-browser MCP server, with a strict' +
    ' ACTION -> OBSERVE -> VERIFY loop, persistence checks, and a structured' +
    ' final report. Use when the user asks the agent to autonomously perform and' +
    ' verify end-to-end flows in a target web system for the current project.';
  return [
    '---',
    `name: ${PROJECT_AGENT_SKILL_NAME}`,
    'description: >-',
    `  ${description}`,
    '---',
    '',
    buildProjectAgentRules(),
    '',
  ].join('\n');
}

/** True when the string parses as a navigable http(s) URL. */
export function isValidTargetUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parse `project-agent.json` content into the target URL. Tolerant by design:
 * missing/invalid file or JSON yields '' (the modal then lets the user set it),
 * and unknown extra keys are ignored.
 */
export function parseTargetUrlFromJson(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return '';
    const targetUrl = (parsed as Record<string, unknown>).target_url;
    if (typeof targetUrl !== 'string') return '';
    const trimmed = targetUrl.trim();
    return isValidTargetUrl(trimmed) ? trimmed : '';
  } catch {
    return '';
  }
}

/** Serialize the project-agent config file (target URL only). */
export function serializeTargetUrlJson(targetUrl: string): string {
  return `${JSON.stringify({ target_url: targetUrl.trim() }, null, 2)}\n`;
}

/** Build the initial `state.json` for a new mission.
 *  The `plan` starts empty — it is populated ONLY from ACP
 *  PlanUpdate events emitted by the agent at runtime.
 *  Never synthesize steps from the objective. */
export function buildMissionStateJson(params: {
  objective: string;
  workspace: string;
  project: { id: string | null; name: string | null };
  targetUrl: string;
}): {
  objective: string;
  plan: { step: string; status: string }[];
  turn_id: string | null;
  workspace: string;
  project: { id: string | null; name: string | null };
  target_url: string;
  evidence: Record<string, string>;
  result: string | null;
} {
  return {
    objective: params.objective,
    plan: [],
    turn_id: null,
    workspace: params.workspace,
    project: params.project,
    target_url: params.targetUrl,
    evidence: {},
    result: null,
  };
}

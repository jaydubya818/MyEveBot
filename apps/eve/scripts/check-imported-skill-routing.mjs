import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The deterministic routing method is adapted from addyosmani/agent-skills at
// the revision pinned in agent/skill-sources.json. That project is MIT licensed.
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogPath = join(appRoot, "lib", "installed-skills.generated.json");
const sourcesPath = join(appRoot, "agent", "skill-sources.json");
const MIN_POSITIVE = 3;
const MIN_NEGATIVE = 2;
const MIN_BEHAVIORAL = 1;
const MIN_RANK_ONE_PERCENT = 85;
const COLLISION_ERROR = 0.75;

const STOP_WORDS = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "before", "by", "for",
  "from", "help", "i", "in", "into", "is", "it", "its", "me", "my", "need",
  "needs", "of", "on", "or", "our", "so", "that", "the", "them", "this", "to",
  "use", "want", "we", "when", "with", "you", "your",
]);

function stem(token) {
  let value = token;
  for (const suffix of ["ally", "ing", "ed", "es", "al"]) {
    if (value.length > suffix.length + 3 && value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }
  if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss")) {
    value = value.slice(0, -1);
  }
  if (value.length > 4 && value.endsWith("e")) value = value.slice(0, -1);
  if (
    value.length > 4 &&
    value.at(-1) === value.at(-2) &&
    !"aeiou".includes(value.at(-1))
  ) {
    value = value.slice(0, -1);
  }
  if (value.length > 3 && value.endsWith("y")) value = `${value.slice(0, -1)}i`;
  return value;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .map(stem);
}

function termFrequency(tokens) {
  const frequency = new Map();
  for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  return frequency;
}

function buildCorpus(skills) {
  const documents = new Map();
  for (const skill of skills) {
    const nameTokens = tokenize(skill.name.replaceAll("-", " "));
    documents.set(
      skill.name,
      termFrequency([...nameTokens, ...nameTokens, ...tokenize(skill.description)]),
    );
  }
  const documentFrequency = new Map();
  for (const frequency of documents.values()) {
    for (const term of frequency.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const count = documents.size;
  return {
    documents,
    inverseDocumentFrequency: (term) =>
      Math.log(1 + count / (1 + (documentFrequency.get(term) ?? 0))),
  };
}

function vector(frequency, inverseDocumentFrequency) {
  return new Map(
    [...frequency].map(([term, count]) => [term, count * inverseDocumentFrequency(term)]),
  );
}

function cosine(left, right) {
  let dotProduct = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const [term, weight] of left) {
    leftNorm += weight * weight;
    const rightWeight = right.get(term);
    if (rightWeight !== undefined) dotProduct += weight * rightWeight;
  }
  for (const weight of right.values()) rightNorm += weight * weight;
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dotProduct / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function rankSkills(prompt, corpus) {
  const promptVector = vector(
    termFrequency(tokenize(prompt)),
    corpus.inverseDocumentFrequency,
  );
  return [...corpus.documents].map(([name, frequency]) => ({
    name,
    score: cosine(
      promptVector,
      vector(frequency, corpus.inverseDocumentFrequency),
    ),
  })).sort((left, right) => right.score - left.score);
}

function isPromptCase(value) {
  return value !== null && typeof value === "object" && typeof value.prompt === "string";
}

export async function checkImportedSkillRouting() {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
  const importedSources = (sources.imports ?? []).filter(
    (source) => typeof source.evalPath === "string",
  );
  const knownSkills = new Set(catalog.map((skill) => skill.name));
  const corpus = buildCorpus(catalog);
  const messages = [];
  let checks = 0;
  let positiveCount = 0;
  let rankOneCount = 0;

  for (const source of importedSources) {
    for (const skillName of source.skills ?? []) {
      if (!knownSkills.has(skillName)) {
        messages.push(`Missing imported skill: ${skillName}`);
        continue;
      }
      const casePath = join(appRoot, source.evalPath, `${skillName}.json`);
      const evalCase = JSON.parse(await readFile(casePath, "utf8"));
      const positive = evalCase.trigger?.positive ?? [];
      const negative = evalCase.trigger?.negative ?? [];
      const behavioral = evalCase.evals ?? [];
      if (evalCase.skill_name !== skillName) {
        messages.push(`${skillName}: source eval declares ${evalCase.skill_name ?? "no skill"}`);
      }
      if (positive.length < MIN_POSITIVE || !positive.every(isPromptCase)) {
        messages.push(`${skillName}: needs at least ${MIN_POSITIVE} positive routing prompts`);
      }
      if (negative.length < MIN_NEGATIVE || !negative.every(isPromptCase)) {
        messages.push(`${skillName}: needs at least ${MIN_NEGATIVE} negative routing prompts`);
      }
      if (behavioral.length < MIN_BEHAVIORAL) {
        messages.push(`${skillName}: needs at least ${MIN_BEHAVIORAL} behavioral eval`);
      }

      for (const item of positive) {
        positiveCount++;
        const ranking = rankSkills(item.prompt, corpus);
        const index = ranking.findIndex((candidate) => candidate.name === skillName);
        const topK = Number.isInteger(item.top_k) ? item.top_k : 3;
        if (index === 0 && ranking[index]?.score > 0) rankOneCount++;
        if (index < 0 || index >= topK || ranking[index].score === 0) {
          const leaders = ranking.slice(0, 3).map((candidate) => candidate.name).join(", ");
          messages.push(`${skillName}: positive prompt ranked ${index + 1}; leaders: ${leaders}`);
        } else {
          checks++;
        }
      }

      for (const item of negative) {
        const ranking = rankSkills(item.prompt, corpus);
        const candidate = ranking.find((ranked) => ranked.name === skillName);
        if (ranking[0]?.name === skillName && ranking[0].score > 0) {
          messages.push(`${skillName}: ranked first for negative prompt "${item.prompt}"`);
          continue;
        }
        if (typeof item.owner === "string" && knownSkills.has(item.owner)) {
          const owner = ranking.find((ranked) => ranked.name === item.owner);
          if (owner === undefined || candidate === undefined || owner.score <= candidate.score) {
            messages.push(`${skillName}: negative prompt owner ${item.owner} did not outrank it`);
            continue;
          }
        }
        checks++;
      }
    }
  }

  const rankOnePercent = positiveCount === 0 ? 0 : (rankOneCount / positiveCount) * 100;
  if (rankOnePercent < MIN_RANK_ONE_PERCENT) {
    messages.push(
      `Combined rank-one routing ${rankOnePercent.toFixed(1)}% is below ${MIN_RANK_ONE_PERCENT}%`,
    );
  }

  for (const source of importedSources) {
    for (const skillName of source.skills ?? []) {
      const imported = catalog.find((skill) => skill.name === skillName);
      if (imported === undefined) continue;
      const importedVector = vector(
        termFrequency(tokenize(imported.description)),
        corpus.inverseDocumentFrequency,
      );
      for (const other of catalog) {
        if (other.name === skillName) continue;
        const similarity = cosine(
          importedVector,
          vector(
            termFrequency(tokenize(other.description)),
            corpus.inverseDocumentFrequency,
          ),
        );
        if (similarity >= COLLISION_ERROR) {
          messages.push(
            `${skillName}: description collides ${(similarity * 100).toFixed(0)}% with ${other.name}`,
          );
        }
      }
    }
  }

  return {
    checks,
    errors: messages.length,
    messages,
    positiveCount,
    rankOneCount,
    rankOnePercent,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await checkImportedSkillRouting();
  for (const message of result.messages) console.error(`- ${message}`);
  console.log(
    `Imported routing: ${result.checks} checks, ${result.rankOneCount}/${result.positiveCount} rank one (${result.rankOnePercent.toFixed(1)}%).`,
  );
  if (result.errors > 0) process.exitCode = 1;
}

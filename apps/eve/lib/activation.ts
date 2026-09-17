export interface StarterJob {
  title: string;
  summary: string;
  access: string;
  boundary: string;
  finishLine: string;
  prompt: string;
}

/** Five bounded first jobs, adapted only by access discovered at runtime. */
export function getStarterJobs(connectedNames: string[], browserReady: boolean): StarterJob[] {
  const connected = connectedNames.length > 0 ? connectedNames.join(", ") : "No connected account required";
  return [
    {
      title: "Research one decision",
      summary: "Compare credible public sources and turn them into a short recommendation.",
      access: browserReady ? "Public web" : "Web search",
      boundary: "Read-only; do not sign in, submit forms, or contact anyone.",
      finishLine: "A recommendation with source links, uncertainties, and one next decision.",
      prompt: "Help me research one decision. First ask for the decision and constraints. Use public, current sources only; do not sign in, submit forms, or contact anyone. Finish with a concise recommendation, source links, uncertainties, and the one decision I need to make next.",
    },
    {
      title: "Turn an objective into a plan",
      summary: "Convert one outcome into milestones, dependencies, and the next action.",
      access: "Goals",
      boundary: "Draft first; ask before creating or changing durable records.",
      finishLine: "A reviewable plan with an owner, due date, risks, and first next action.",
      prompt: "Help me turn one objective into a practical plan. Ask for the outcome, timeframe, constraints, and what is already true. Draft milestones, dependencies, risks, and the first next action. Do not create or change a Goal until I approve the draft. The finish line is a reviewable plan with an owner and due date.",
    },
    {
      title: "Find today’s real priority",
      summary: "Review current Goals and identify the most important constraint.",
      access: "Goals and recent Results",
      boundary: "Read-only analysis; do not reorder or edit work.",
      finishLine: "One recommended priority, the evidence behind it, and what can wait.",
      prompt: "Review my current Goals, tasks, and recent Results without changing anything. Identify the most important constraint today. Finish with one recommended priority, the evidence behind it, the risk of delay, and what can wait.",
    },
    {
      title: connectedNames.length > 0 ? "Inspect connected work" : "Map the account I should connect",
      summary: connectedNames.length > 0
        ? `Discover useful read-only work available through ${connectedNames.slice(0, 2).join(" and ")}.`
        : "Choose the first account connection based on a real job, not a feature list.",
      access: connected,
      boundary: connectedNames.length > 0
        ? "Read-only discovery; do not send, edit, delete, or share anything."
        : "Do not request credentials or connect an account without approval.",
      finishLine: connectedNames.length > 0
        ? "Three useful jobs supported by evidence from the connected account."
        : "One recommended connection, the exact access it needs, and the first safe job.",
      prompt: connectedNames.length > 0
        ? `Inspect what useful read-only work is available through my connected accounts (${connectedNames.join(", ")}). Do not send, edit, delete, or share anything. Finish with three concrete jobs, the evidence each would use, and where owner approval would be required.`
        : "Help me choose the first account to connect. Ask what recurring work costs me the most time, then recommend one connection only. Explain the exact access needed, the safest first read-only job, and where approval would be required. Do not request credentials or initiate a connection.",
    },
    {
      title: "Design a quiet routine",
      summary: "Specify one recurring brief without turning it on yet.",
      access: "Briefs and notifications",
      boundary: "Draft only; do not schedule or notify until I approve cadence and channel.",
      finishLine: "A routine proposal with trigger, inputs, output, cadence, and stop condition.",
      prompt: "Help me design one useful recurring brief. Ask for the decision it supports, source inputs, cadence, timezone, delivery channel, quiet hours, and stop condition. Draft the routine only; do not schedule or notify until I explicitly approve. The finish line is a complete routine proposal I can accept or revise.",
    },
  ];
}

import { askQuestion } from "eve/tools/ask_question";

// Eve 0.66 makes structured questions opt-in; retain the existing chat flow.
export default askQuestion();

import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionKnowledge,
  validConfidence,
  validateRelationshipPredicate,
} from "../lib/knowledge-types.ts";

test("knowledge confidence accepts only the closed zero-to-one interval", () => {
  assert.equal(validConfidence(0), true);
  assert.equal(validConfidence(0.72), true);
  assert.equal(validConfidence(1), true);
  assert.equal(validConfidence(-0.01), false);
  assert.equal(validConfidence(1.01), false);
  assert.equal(validConfidence(Number.NaN), false);
});

test("knowledge lifecycle preserves terminal promotion and supersession history", () => {
  assert.equal(canTransitionKnowledge("fact", "active", "contradicted"), true);
  assert.equal(canTransitionKnowledge("fact", "superseded", "active"), false);
  assert.equal(canTransitionKnowledge("observation", "active", "promoted"), true);
  assert.equal(canTransitionKnowledge("observation", "promoted", "active"), false);
  assert.equal(canTransitionKnowledge("hypothesis", "open", "supported"), true);
  assert.equal(canTransitionKnowledge("decision", "active", "reopened"), true);
  assert.equal(canTransitionKnowledge("decision", "superseded", "reopened"), false);
  assert.equal(canTransitionKnowledge("commitment", "open", "fulfilled"), true);
  assert.equal(canTransitionKnowledge("commitment", "fulfilled", "open"), false);
  assert.equal(canTransitionKnowledge("preference", "inactive", "active"), true);
});

test("relationship predicates use a controlled extensible vocabulary", () => {
  assert.equal(validateRelationshipPredicate("works_at"), true);
  assert.equal(validateRelationshipPredicate("affects"), true);
  assert.equal(validateRelationshipPredicate("Works At"), false);
  assert.equal(validateRelationshipPredicate("has-dash"), false);
  assert.equal(validateRelationshipPredicate(`a${"x".repeat(64)}`), false);
});

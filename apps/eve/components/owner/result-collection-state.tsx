import { Empty } from "./primitives";

/** An empty collection is authoritative only after a successful read. */
export function ResultCollectionState({ confirmed }: { confirmed: boolean }) {
  if (!confirmed) {
    return (
      <p role="status">
        Results could not be refreshed. Their saved state is unknown. Try again
        to check the latest state.
      </p>
    );
  }
  return (
    <Empty title="No retained Results">
      Verified outputs and their evidence will appear here.
    </Empty>
  );
}

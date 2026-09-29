import { WorkCanvas } from "@/components/owner/work-canvas";
import {
  canvasJourneys,
  type JourneyId,
} from "@/components/owner/work-canvas-model";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ journey?: string }>;
}) {
  const { journey } = await searchParams;
  const id: JourneyId =
    journey && Object.hasOwn(canvasJourneys, journey)
      ? (journey as JourneyId)
      : "engineering";
  return <WorkCanvas key={id} journeyId={id} />;
}

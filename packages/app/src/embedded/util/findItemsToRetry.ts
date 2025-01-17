import { EmbeddedHostState, ReviewItem } from "@withorbit/embedded-support";

export function findItemsToRetry(
  sessionItems: ReviewItem[],
  hostState: EmbeddedHostState,
): ReviewItem[] {
  // We use the orderedScreenRecords structure in hostState to determine which screen section each item belongs to, but we use the updated promptState values from sessionItems to determine whether an item should be included in the retry queue.
  const outputItems: ReviewItem[] = [];
  let baseSessionItemOffset = 0;
  for (
    let screenRecordIndex = 0;
    screenRecordIndex < hostState.orderedScreenRecords.length;
    screenRecordIndex++
  ) {
    const record = hostState.orderedScreenRecords[screenRecordIndex];
    if (record) {
      // We only retry prompts from other review areas, unless this is the final embedded screen.
      if (
        screenRecordIndex !== hostState.receiverIndex ||
        screenRecordIndex === hostState.orderedScreenRecords.length - 1
      ) {
        outputItems.push(
          ...sessionItems
            .slice(
              baseSessionItemOffset,
              baseSessionItemOffset + record.reviewItems.length,
            )
            .filter((item) => item.promptState?.needsRetry ?? false),
        );
      }
      baseSessionItemOffset += record.reviewItems.length;
    }
  }
  return outputItems;
}

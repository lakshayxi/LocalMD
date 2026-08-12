/** The update action must never be offered over unsaved work. */
export function shouldOfferUpdate(needRefresh: boolean, dirty: boolean, dismissed: boolean) {
  return needRefresh && !dirty && !dismissed;
}

/** Only the clean tab that accepted an update may reload automatically. */
export function shouldReloadAfterControllerChange(updateRequested: boolean, dirty: boolean) {
  return updateRequested && !dirty;
}
